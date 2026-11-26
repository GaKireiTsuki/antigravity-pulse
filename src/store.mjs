import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_SETTINGS,
  computeStepCost,
  getCatalogList,
  getModelInfo,
  normalizeModelKey,
  resolveRatesAt,
} from "./pricing.mjs";
import { analyzeConversationContext } from "./context-analyzer.mjs";

const INDEX_VERSION = 2;
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_ANOMALY_WINDOW_MS = 4 * 60 * 1000;
const CACHE_ANOMALY_MIN_PREV_CTX = 30000;

function deepMerge(target, patch) {
  if (!patch || typeof patch !== "object") return structuredClone(target);
  const out = structuredClone(target);
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object") {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function toLocalDayKey(tsMs) {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(tsMs) {
  const d = new Date(tsMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getBillingCycleBounds(nowMs, billingDay = 1) {
  const clamped = Math.max(1, Math.min(28, Number(billingDay) || 1));
  const start = new Date(nowMs);
  if (start.getDate() >= clamped) {
    start.setDate(clamped);
  } else {
    start.setMonth(start.getMonth() - 1);
    start.setDate(clamped);
  }
  start.setHours(0, 0, 0, 0);

  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + 1);
  end.setDate(clamped);
  end.setHours(0, 0, 0, 0);

  return { startMs: start.getTime(), endMs: end.getTime() };
}

function startOfBillingCycle(nowMs, billingDay = 1) {
  return getBillingCycleBounds(nowMs, billingDay).startMs;
}

function parseQuotaNotice(text, tsMs) {
  if (!text || !text.includes("[quota]")) return null;
  const m = text.match(/model\s+([^\s]+)\s+is\s+low\s+on\s+quota\s*\((\d+)%\s+remaining,\s+resets\s+at\s+([^)]+)\)/i);
  if (!m) return null;
  const resetsAt = m[3].trim();
  const resetsAtMs = Date.parse(resetsAt);
  if (!Number.isFinite(resetsAtMs)) return null;
  const leadMs = resetsAtMs - tsMs;
  const kind = leadMs <= 5.5 * 3600000 ? "5h" : "7d";
  const modelKey = normalizeModelKey(m[1]);
  const pool = modelKey.startsWith("claude") ? "claude" : "gemini";
  return {
    model: m[1],
    modelKey,
    pool,
    kind,
    remainingPct: Number(m[2]),
    resetsAt,
    resetsAtMs,
    tsMs,
  };
}

function median(nums) {
  if (!nums || nums.length === 0) return null;
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function roundNiceUsd(val) {
  if (!Number.isFinite(val) || val <= 0) return 0;
  if (val < 50) return Math.ceil(val / 5) * 5;
  if (val < 300) return Math.round(val / 5) * 5;
  return Math.round(val / 10) * 10;
}

export class PulseStore {
  constructor(options = {}) {
    this.antigravityDir =
      options.antigravityDir ||
      process.env.PULSE_ANTIGRAVITY_DIR ||
      path.join(os.homedir(), ".gemini", "antigravity");
    this.ideDir =
      options.ideDir ||
      path.join(path.dirname(this.antigravityDir), "antigravity-ide");
    this.dataDir =
      options.dataDir ||
      process.env.PULSE_DATA_DIR ||
      path.join(this.antigravityDir, "plugin_data", "antigravity-pulse");

    this.settingsPath = path.join(this.dataDir, "settings.json");
    this.indexPath = path.join(this.dataDir, "index-v1.json");
    this.timingPath = path.join(this.dataDir, "timing.jsonl");
    this.inflightDir = path.join(this.dataDir, "inflight");

    this.settings = this._loadSettings();
    this.convCache = new Map(); // cid -> { path, mtimeMs, size, byteOffset, lastModel, steps, quotaHints }
    this.metaCache = { sig: "", summaries: new Map(), parents: new Map() };
    this.timingCache = { byteOffset: 0, size: 0, mtimeMs: 0, byKey: new Map(), byCidTs: new Map(), stopErrors: [] };

    this.revision = 0;
    this._dirtyIndex = false;
    this._persistTimer = null;
    this._lastSyncMs = 0;

    this._loadDiskIndex();
  }

  getBrainDir() {
    return path.join(this.antigravityDir, "brain");
  }

  _ensureDataDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
        return deepMerge(DEFAULT_SETTINGS, parsed);
      }
    } catch {}
    return structuredClone(DEFAULT_SETTINGS);
  }

  saveSettings(patch) {
    this.settings = deepMerge(this.settings, patch);
    this._ensureDataDir();
    const tmp = `${this.settingsPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.settings, null, 2));
    fs.renameSync(tmp, this.settingsPath);
    this.revision++;
    return this.settings;
  }

  resetCache() {
    this.convCache.clear();
    this.metaCache = { sig: "", summaries: new Map(), parents: new Map() };
    this.timingCache = { byteOffset: 0, size: 0, mtimeMs: 0, byKey: new Map(), byCidTs: new Map(), stopErrors: [] };
    try {
      if (fs.existsSync(this.indexPath)) fs.unlinkSync(this.indexPath);
    } catch {}
    this.revision++;
    this.sync(true);
    return { ok: true, revision: this.revision, conversations: this.convCache.size };
  }

  _loadDiskIndex() {
    try {
      if (!fs.existsSync(this.indexPath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, "utf8"));
      if (parsed?.version !== INDEX_VERSION || !parsed.convs) return;
      for (const [cid, entry] of Object.entries(parsed.convs)) {
        this.convCache.set(cid, entry);
      }
    } catch {
      this.convCache.clear();
    }
  }

  _schedulePersistIndex() {
    this._dirtyIndex = true;
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this.flushIndexNow();
    }, 1200);
    if (typeof this._persistTimer.unref === "function") {
      this._persistTimer.unref();
    }
  }

  flushIndexNow() {
    if (!this._dirtyIndex) return;
    this._dirtyIndex = false;
    try {
      this._ensureDataDir();
      const payload = {
        version: INDEX_VERSION,
        savedAt: Date.now(),
        convs: Object.fromEntries(this.convCache.entries()),
      };
      const tmp = `${this.indexPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload));
      fs.renameSync(tmp, this.indexPath);
    } catch {
      // non-fatal
    }
  }

  _syncMetadataDb() {
    const dbPath = path.join(this.antigravityDir, "conversation_summaries.db");
    if (!fs.existsSync(dbPath)) return false;
    let sig = "";
    try {
      const st = fs.statSync(dbPath);
      sig = `${st.mtimeMs}:${st.size}`;
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        const wst = fs.statSync(walPath);
        sig += `|${wst.mtimeMs}:${wst.size}`;
      }
    } catch {
      return false;
    }
    if (sig === this.metaCache.sig) return false;

    const summaries = new Map();
    const parents = new Map();
    let db = null;
    try {
      try {
        db = new DatabaseSync(dbPath, { readOnly: true });
      } catch {
        db = new DatabaseSync(`file:${dbPath}?mode=ro&immutable=1`, { readOnly: true });
      }
      const rows = db
        .prepare(
          `SELECT conversation_id, title, workspace_uris, parent_conversation_id,
                  nesting_depth, agent_name, step_count, last_modified_time
           FROM conversation_summaries`
        )
        .all();
      for (const r of rows) {
        summaries.set(r.conversation_id, {
          title: r.title || "",
          workspaceUris: r.workspace_uris || "",
          parent: r.parent_conversation_id || "",
          depth: Number(r.nesting_depth || 0),
          agentName: r.agent_name || "",
          stepCount: Number(r.step_count || 0),
          lastModified: r.last_modified_time || "",
        });
      }
      try {
        const pRows = db.prepare(`SELECT conversation_id, parent_id FROM conversation_parents`).all();
        for (const p of pRows) {
          if (p.parent_id) parents.set(p.conversation_id, p.parent_id);
        }
      } catch {}
    } catch {
      return false;
    } finally {
      try {
        db?.close();
      } catch {}
    }

    this.metaCache = { sig, summaries, parents };
    return true;
  }

  _syncTimingLog() {
    if (!fs.existsSync(this.timingPath)) return false;
    let st;
    try {
      st = fs.statSync(this.timingPath);
    } catch {
      return false;
    }
    if (st.size === this.timingCache.size && st.mtimeMs === this.timingCache.mtimeMs) {
      return false;
    }
    if (st.size < this.timingCache.byteOffset) {
      this.timingCache = {
        byteOffset: 0,
        size: 0,
        mtimeMs: 0,
        byKey: new Map(),
        byCidTs: new Map(),
        stopErrors: [],
      };
    }

    const toRead = st.size - this.timingCache.byteOffset;
    if (toRead <= 0) {
      this.timingCache.mtimeMs = st.mtimeMs;
      return false;
    }

    const buf = Buffer.alloc(toRead);
    const fd = fs.openSync(this.timingPath, "r");
    try {
      fs.readSync(fd, buf, 0, toRead, this.timingCache.byteOffset);
    } finally {
      fs.closeSync(fd);
    }

    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl < 0) return false;

    const text = buf.subarray(0, lastNl).toString("utf8");
    const lines = text.split("\n");
    let changed = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (rec.event === "invocation") {
        changed = true;
        if (rec.cid && rec.stepIndex !== null && rec.stepIndex !== undefined) {
          this.timingCache.byKey.set(`${rec.cid}:${rec.stepIndex}`, {
            durationMs: rec.durationMs,
            tps: rec.tps,
            ts: rec.ts,
          });
        }
        if (rec.cid) {
          let arr = this.timingCache.byCidTs.get(rec.cid);
          if (!arr) {
            arr = [];
            this.timingCache.byCidTs.set(rec.cid, arr);
          }
          arr.push({ ts: rec.ts, durationMs: rec.durationMs, tps: rec.tps, stepIndex: rec.stepIndex });
        }
      } else if (rec.event === "stop_error") {
        changed = true;
        this.timingCache.stopErrors.push(rec);
        if (this.timingCache.stopErrors.length > 500) {
          this.timingCache.stopErrors.shift();
        }
      }
    }

    this.timingCache.byteOffset += lastNl + 1;
    this.timingCache.size = st.size;
    this.timingCache.mtimeMs = st.mtimeMs;
    return changed;
  }

  _collectBrainTranscripts() {
    const found = new Map(); // cid -> { transcriptPath, source }
    const scanRoot = (rootDir, source) => {
      const bdir = path.join(rootDir, "brain");
      if (!fs.existsSync(bdir)) return;
      let entries;
      try {
        entries = fs.readdirSync(bdir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const cid = ent.name;
        if (cid === "tempmediaStorage" || cid.startsWith(".")) continue;
        if (found.has(cid)) continue;
        const tf = path.join(bdir, cid, ".system_generated", "logs", "transcript.jsonl");
        if (fs.existsSync(tf)) {
          found.set(cid, { transcriptPath: tf, source });
        }
      }
    };

    scanRoot(this.antigravityDir, "app");
    if (this.settings.includeIdeLogs) {
      scanRoot(this.ideDir, "ide");
    }
    return found;
  }

  _syncOneTranscript(cid, transcriptPath, source) {
    let st;
    try {
      st = fs.statSync(transcriptPath);
    } catch {
      return false;
    }

    let entry = this.convCache.get(cid);
    if (entry && entry.size === st.size && entry.mtimeMs === st.mtimeMs && entry.path === transcriptPath) {
      return false;
    }

    if (!entry || entry.path !== transcriptPath || st.size < entry.byteOffset) {
      entry = {
        path: transcriptPath,
        source,
        mtimeMs: 0,
        size: 0,
        byteOffset: 0,
        lastModel: "gemini-4-neon-xhigh",
        steps: [],
        quotaHints: [],
      };
      this.convCache.set(cid, entry);
    }

    const delta = st.size - entry.byteOffset;
    if (delta <= 0) {
      entry.mtimeMs = st.mtimeMs;
      return false;
    }

    const buf = Buffer.alloc(delta);
    const fd = fs.openSync(transcriptPath, "r");
    try {
      fs.readSync(fd, buf, 0, delta, entry.byteOffset);
    } finally {
      fs.closeSync(fd);
    }

    // Only parse complete newline-terminated lines so concurrent writes never drop partial JSON
    const lastNl = buf.lastIndexOf(0x0a);
    let consumedBytes = 0;
    let text = "";
    if (lastNl >= 0) {
      consumedBytes = lastNl + 1;
      text = buf.subarray(0, lastNl).toString("utf8");
    } else {
      // Single-line file without trailing newline: try parsing if valid JSON
      const maybe = buf.toString("utf8").trim();
      if (maybe.endsWith("}")) {
        consumedBytes = delta;
        text = maybe;
      } else {
        return false;
      }
    }

    let added = false;
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const tsMs = obj.created_at ? Date.parse(obj.created_at) : st.mtimeMs;
      if (obj.type === "SYSTEM_MESSAGE" && typeof obj.content === "string") {
        const q = parseQuotaNotice(obj.content, tsMs);
        if (q) {
          entry.quotaHints.push(q);
          if (entry.quotaHints.length > 60) entry.quotaHints.shift();
          added = true;
        }
        continue;
      }

      if (
        obj.input_tokens === undefined &&
        obj.output_tokens === undefined &&
        obj.cache_read_tokens === undefined
      ) {
        continue;
      }

      const type = obj.type || "PLANNER_RESPONSE";
      const isCheckpoint = type === "CHECKPOINT" || !obj.model;
      const model = isCheckpoint ? entry.lastModel : obj.model;
      if (!isCheckpoint && obj.model) {
        entry.lastModel = obj.model;
      }

      const inp = Number(obj.input_tokens || 0);
      const cr = Number(obj.cache_read_tokens || 0);
      const out = Number(obj.output_tokens || 0);
      const ctx = inp + cr;
      const status = obj.status || "DONE";

      // Detect short-interval unexpected cache drop relative to immediately preceding step
      const prev = entry.steps.length > 0 ? entry.steps[entry.steps.length - 1] : null;
      let cacheAnomaly = false;
      let prevCtx = 0;
      if (
        prev &&
        !isCheckpoint &&
        prev.type !== "CHECKPOINT" &&
        normalizeModelKey(prev.model) === normalizeModelKey(model) &&
        tsMs >= prev.tsMs &&
        tsMs - prev.tsMs <= CACHE_ANOMALY_WINDOW_MS
      ) {
        prevCtx = prev.inputTokens + prev.cacheReadTokens;
        if (prevCtx >= CACHE_ANOMALY_MIN_PREV_CTX && cr < prevCtx * 0.5 && inp >= prevCtx * 0.4) {
          cacheAnomaly = true;
        }
      }

      entry.steps.push({
        cid,
        stepIndex: Number(obj.step_index ?? entry.steps.length),
        tsMs,
        dayKey: toLocalDayKey(tsMs),
        type,
        status,
        model,
        inputTokens: inp,
        cacheReadTokens: cr,
        outputTokens: out,
        contextTokens: ctx,
        cacheAnomaly,
        prevContextTokens: cacheAnomaly ? prevCtx : 0,
        error: typeof obj.error === "string" ? obj.error.slice(0, 300) : obj.error ? String(obj.error).slice(0, 300) : null,
      });
      added = true;
    }

    entry.byteOffset += consumedBytes;
    entry.size = st.size;
    entry.mtimeMs = st.mtimeMs;
    return added;
  }

  /**
   * Incrementally sync transcripts, SQLite metadata, and telemetry timing log.
   * Typically takes < 3ms on warm calls.
   */
  sync(force = false) {
    const now = Date.now();
    if (!force && now - this._lastSyncMs < 400) {
      return false;
    }
    this._lastSyncMs = now;

    let changed = false;
    if (this._syncMetadataDb()) changed = true;
    if (this._syncTimingLog()) changed = true;

    const currentConvs = this._collectBrainTranscripts();
    for (const [cid, info] of currentConvs.entries()) {
      if (this._syncOneTranscript(cid, info.transcriptPath, info.source)) {
        changed = true;
      }
    }

    // Remove conversations whose files were deleted
    for (const cid of [...this.convCache.keys()]) {
      if (!currentConvs.has(cid)) {
        this.convCache.delete(cid);
        changed = true;
      }
    }

    if (changed) {
      this.revision++;
      this._schedulePersistIndex();
    }
    return changed;
  }

  getRootConversationId(cid) {
    const seen = new Set();
    let cur = cid;
    while (!seen.has(cur)) {
      seen.add(cur);
      const p =
        this.metaCache.parents.get(cur) ||
        this.metaCache.summaries.get(cur)?.parent ||
        "";
      if (!p) return cur;
      cur = p;
    }
    return cur;
  }

  getConversationMeta(cid) {
    const s = this.metaCache.summaries.get(cid);
    const parent = this.metaCache.parents.get(cid) || s?.parent || "";
    return {
      cid,
      title: s?.title || "",
      agentName: s?.agentName || "",
      parent,
      rootId: this.getRootConversationId(cid),
      depth: s?.depth ?? (parent ? 1 : 0),
      workspaceUris: s?.workspaceUris || "",
    };
  }

  getInflightConversations() {
    const active = [];
    const now = Date.now();
    try {
      if (!fs.existsSync(this.inflightDir)) return active;
      for (const f of fs.readdirSync(this.inflightDir)) {
        if (!f.endsWith(".json")) continue;
        const fp = path.join(this.inflightDir, f);
        try {
          const obj = JSON.parse(fs.readFileSync(fp, "utf8"));
          if (obj.ts && now - obj.ts < 10 * 60 * 1000) {
            active.push({
              cid: obj.cid,
              model: obj.model,
              startedAt: obj.ts,
              elapsedMs: now - obj.ts,
            });
          }
        } catch {}
      }
    } catch {}
    return active;
  }

  _lookupTiming(step) {
    const exact = this.timingCache.byKey.get(`${step.cid}:${step.stepIndex}`);
    if (exact) return exact;
    const arr = this.timingCache.byCidTs.get(step.cid);
    if (!arr || arr.length === 0) return null;
    // Match closest timing record within ±15s
    for (let i = arr.length - 1; i >= 0; i--) {
      const rec = arr[i];
      if (Math.abs(rec.ts - step.tsMs) <= 15000) {
        return rec;
      }
    }
    return null;
  }

  _getRangeStartMs(range, nowMs) {
    switch (range) {
      case "today":
        return startOfLocalDay(nowMs);
      case "7d":
        return nowMs - SEVEN_DAYS_MS;
      case "30d":
        return nowMs - 30 * 24 * 60 * 60 * 1000;
      case "cycle":
        return startOfBillingCycle(nowMs, this.settings.subscription?.billingDay || 1);
      case "all":
      default:
        return 0;
    }
  }

  _getAllEnrichedSteps() {
    const all = [];
    const allQuotaHints = [];
    for (const entry of this.convCache.values()) {
      for (const s of entry.steps) {
        const timing = this._lookupTiming(s);
        const costInfo = computeStepCost(s, this.settings);
        all.push({
          ...s,
          modelKey: costInfo.modelKey,
          pool: costInfo.pool,
          costUsd: costInfo.totalCost,
          inputCostUsd: costInfo.inputCost,
          cacheCostUsd: costInfo.cacheCost,
          outputCostUsd: costInfo.outputCost,
          cacheSavedUsd: costInfo.cacheSaved,
          durationMs: timing?.durationMs ?? null,
          tps: timing?.tps ?? null,
        });
      }
      for (const q of entry.quotaHints || []) {
        allQuotaHints.push(q);
      }
    }
    all.sort((a, b) => a.tsMs - b.tsMs || a.stepIndex - b.stepIndex);
    allQuotaHints.sort((a, b) => b.tsMs - a.tsMs);
    return { all, allQuotaHints };
  }

  /**
   * Automatically infer 5h and 7d pool capacities & current active window bounds
   * from historical official [quota] notices and observed usage patterns.
   */
  _inferPoolQuotas(allSteps, rawQuotaHints, nowMs) {
    // Normalize older cached quota hints that may lack pool/kind/resetsAtMs
    const hints = [];
    for (const q of rawQuotaHints || []) {
      const rMs = Number.isFinite(q.resetsAtMs) ? q.resetsAtMs : Date.parse(q.resetsAt || "");
      if (!Number.isFinite(rMs)) continue;
      const mk = q.modelKey || normalizeModelKey(q.model);
      const pool = q.pool || (mk.startsWith("claude") ? "claude" : "gemini");
      const kind = q.kind || (rMs - q.tsMs <= 5.5 * 3600000 ? "5h" : "7d");
      hints.push({ ...q, modelKey: mk, pool, kind, resetsAtMs: rMs });
    }

    const byPoolSteps = {
      gemini: allSteps.filter((s) => s.pool !== "claude"),
      claude: allSteps.filter((s) => s.pool === "claude"),
    };

    const sumPoolBetween = (pool, startMs, endMs) => {
      let cost = 0;
      let tokens = 0;
      let requests = 0;
      let firstTs = null;
      for (const s of byPoolSteps[pool]) {
        if (s.tsMs < startMs) continue;
        if (s.tsMs > endMs) break;
        cost += s.costUsd;
        tokens += s.inputTokens + s.cacheReadTokens + s.outputTokens;
        requests++;
        if (firstTs === null) firstTs = s.tsMs;
      }
      return { cost, tokens, requests, firstTs };
    };

    // Peak rolling 7d observed spend per pool (using two-pointer O(N) scan)
    const peakRollingCost = (pool, winMs) => {
      const list = byPoolSteps[pool];
      let left = 0;
      let cur = 0;
      let peak = 0;
      for (let right = 0; right < list.length; right++) {
        cur += list[right].costUsd;
        while (left < right && list[right].tsMs - list[left].tsMs > winMs) {
          cur -= list[left].costUsd;
          left++;
        }
        if (cur > peak) peak = cur;
      }
      return peak;
    };

    const inferForPool = (pool) => {
      const poolHints = hints.filter((h) => h.pool === pool);
      const hints5h = poolHints.filter((h) => h.kind === "5h");
      const hints7d = poolHints.filter((h) => h.kind === "7d");

      // 1. Infer 5h capacity from [quota] anchors (grouped by reset timestamp minute)
      const samples5h = [];
      const seen5h = new Set();
      for (const h of hints5h) {
        const dedupKey = `${Math.round(h.resetsAtMs / 60000)}:${h.remainingPct}`;
        if (seen5h.has(dedupKey)) continue;
        seen5h.add(dedupKey);
        const usedPct = 100 - h.remainingPct;
        if (usedPct < 20) continue;
        const winStart = h.resetsAtMs - FIVE_HOURS_MS;
        const agg = sumPoolBetween(pool, winStart, h.tsMs);
        if (agg.cost >= 1) {
          samples5h.push(agg.cost / (usedPct / 100));
        }
      }

      // 2. Infer 7d capacity from weekly [quota] anchors if any exist
      const samples7d = [];
      const seen7d = new Set();
      for (const h of hints7d) {
        const dedupKey = `${Math.round(h.resetsAtMs / 60000)}:${h.remainingPct}`;
        if (seen7d.has(dedupKey)) continue;
        seen7d.add(dedupKey);
        const usedPct = 100 - h.remainingPct;
        if (usedPct < 15) continue;
        const winStart = h.resetsAtMs - SEVEN_DAYS_MS;
        const agg = sumPoolBetween(pool, winStart, h.tsMs);
        if (agg.cost >= 5) {
          samples7d.push(agg.cost / (usedPct / 100));
        }
      }

      const peak5h = peakRollingCost(pool, FIVE_HOURS_MS);
      const peak7d = peakRollingCost(pool, SEVEN_DAYS_MS);
      const cfg5h = pool === "claude" ? this.settings.budgets.claude5hUsd : this.settings.budgets.gemini5hUsd;
      const cfg7d = pool === "claude" ? this.settings.budgets.claude7dUsd : this.settings.budgets.gemini7dUsd;
      const autoMode = this.settings.subscription?.autoQuota !== false;

      // Resolve 5h full pool USD & source
      let cap5hUsd = cfg5h;
      let cap5hSource = "manual";
      const med5h = median(samples5h);
      if (autoMode) {
        if (med5h && med5h >= 5) {
          cap5hUsd = roundNiceUsd(med5h);
          cap5hSource = "anchor";
        } else if (peak5h > 0) {
          // Never triggered low-quota warning (<=20% remaining), so capacity is at least peak / 0.78
          cap5hUsd = roundNiceUsd(Math.max(cfg5h, peak5h / 0.78));
          cap5hSource = "estimated";
        } else {
          cap5hSource = "default";
        }
      }

      // Resolve 7d full pool USD & source
      let cap7dUsd = cfg7d;
      let cap7dSource = "manual";
      const med7d = median(samples7d);
      if (autoMode) {
        if (med7d && med7d >= 20) {
          cap7dUsd = roundNiceUsd(med7d);
          cap7dSource = "anchor";
        } else {
          // Weekly pool is typically ~6x the 5h burst pool, and must exceed observed 7d peak if no weekly low-quota fired
          const from5h = med5h ? med5h * 6 : cfg7d;
          const fromPeak = peak7d > 0 ? peak7d / 0.78 : 0;
          cap7dUsd = roundNiceUsd(Math.max(from5h, fromPeak, cfg7d));
          cap7dSource = med5h || peak7d > 0 ? "estimated" : "default";
        }
      }

      // 3. Determine CURRENT active 5h window aligned with official reset boundary!
      const latest5hHint = hints5h.length ? hints5h.reduce((a, b) => (b.tsMs > a.tsMs ? b : a)) : null;
      let active5hStart = nowMs - FIVE_HOURS_MS;
      let active5hResetAt = null;
      let active5hAnchor = null;
      let lastResetAt = null;

      if (latest5hHint) {
        if (nowMs < latest5hHint.resetsAtMs) {
          // Currently inside an officially anchored 5h window
          active5hStart = latest5hHint.resetsAtMs - FIVE_HOURS_MS;
          active5hResetAt = latest5hHint.resetsAtMs;
          active5hAnchor = latest5hHint;
        } else {
          // Previous 5h window ALREADY reset! Only count usage AFTER its reset timestamp.
          lastResetAt = latest5hHint.resetsAtMs;
          const afterReset = sumPoolBetween(pool, Math.max(lastResetAt, nowMs - FIVE_HOURS_MS), nowMs);
          if (afterReset.firstTs !== null) {
            active5hStart = afterReset.firstTs;
            active5hResetAt = afterReset.firstTs + FIVE_HOURS_MS;
          } else {
            active5hStart = lastResetAt;
            active5hResetAt = null;
          }
        }
      } else {
        const rolling = sumPoolBetween(pool, nowMs - FIVE_HOURS_MS, nowMs);
        if (rolling.firstTs !== null) {
          active5hStart = rolling.firstTs;
          active5hResetAt = rolling.firstTs + FIVE_HOURS_MS;
        }
      }

      const cur5h = sumPoolBetween(pool, active5hStart, nowMs);
      let rem5hPct;
      let rem5hUsd;
      if (active5hAnchor) {
        // Project directly from latest live official anchor minus delta spend since anchor
        const deltaSinceAnchor = sumPoolBetween(pool, active5hAnchor.tsMs + 1, nowMs).cost;
        const deltaPct = cap5hUsd > 0 ? (deltaSinceAnchor / cap5hUsd) * 100 : 0;
        rem5hPct = Math.max(0, Number((active5hAnchor.remainingPct - deltaPct).toFixed(1)));
        rem5hUsd = Number(((rem5hPct / 100) * cap5hUsd).toFixed(2));
      } else {
        rem5hUsd = Math.max(0, Number((cap5hUsd - cur5h.cost).toFixed(2)));
        rem5hPct = cap5hUsd > 0 ? Math.max(0, Number((100 - (cur5h.cost / cap5hUsd) * 100).toFixed(1))) : 0;
      }

      // 4. Current 7d window (aligned with official weekly anchor if active, else rolling 7d)
      const latest7dHint = hints7d.length ? hints7d.reduce((a, b) => (b.tsMs > a.tsMs ? b : a)) : null;
      let active7dStart = nowMs - SEVEN_DAYS_MS;
      let active7dResetAt = null;
      let active7dAnchor = null;

      if (latest7dHint && nowMs < latest7dHint.resetsAtMs) {
        active7dStart = latest7dHint.resetsAtMs - SEVEN_DAYS_MS;
        active7dResetAt = latest7dHint.resetsAtMs;
        active7dAnchor = latest7dHint;
      } else {
        const rolling7 = sumPoolBetween(pool, nowMs - SEVEN_DAYS_MS, nowMs);
        if (rolling7.firstTs !== null) {
          active7dStart = rolling7.firstTs;
          active7dResetAt = rolling7.firstTs + SEVEN_DAYS_MS;
        }
      }

      const cur7d = sumPoolBetween(pool, active7dStart, nowMs);
      let rem7dPct;
      let rem7dUsd;
      if (active7dAnchor) {
        const deltaSinceAnchor = sumPoolBetween(pool, active7dAnchor.tsMs + 1, nowMs).cost;
        const deltaPct = cap7dUsd > 0 ? (deltaSinceAnchor / cap7dUsd) * 100 : 0;
        rem7dPct = Math.max(0, Number((active7dAnchor.remainingPct - deltaPct).toFixed(1)));
        rem7dUsd = Number(((rem7dPct / 100) * cap7dUsd).toFixed(2));
      } else {
        rem7dUsd = Math.max(0, Number((cap7dUsd - cur7d.cost).toFixed(2)));
        rem7dPct = cap7dUsd > 0 ? Math.max(0, Number((100 - (cur7d.cost / cap7dUsd) * 100).toFixed(1))) : 0;
      }

      const buildWin = (cur, capUsd, remUsd, remPct, resetAt, source, anchorCount, lastReset) => {
        const exceededUsd = Math.max(0, Number((cur.cost - capUsd).toFixed(2)));
        const usedPct = capUsd > 0 ? Math.min(100, Number(((cur.cost / capUsd) * 100).toFixed(1))) : 0;
        return {
          tokens: cur.tokens,
          costUsd: Number(cur.cost.toFixed(2)),
          requests: cur.requests,
          budgetUsd: capUsd,
          pct: usedPct,
          remainingUsd: remUsd,
          remainingPct: remPct,
          exceededUsd,
          resetAt,
          resetInMs: resetAt ? Math.max(0, resetAt - nowMs) : null,
          source, // "anchor" | "estimated" | "manual" | "default"
          anchorCount,
          lastResetAt: lastReset || null,
        };
      };

      return {
        win5h: buildWin(cur5h, cap5hUsd, rem5hUsd, rem5hPct, active5hResetAt, cap5hSource, hints5h.length, lastResetAt),
        win7d: buildWin(cur7d, cap7dUsd, rem7dUsd, rem7dPct, active7dResetAt, cap7dSource, hints7d.length, null),
        totalAnchors: poolHints.length,
        lastResetAt,
      };
    };

    const gemini = inferForPool("gemini");
    const claude = inferForPool("claude");

    // Only keep CURRENTLY ACTIVE (unexpired) official low-quota warnings for alert banners
    const activeHintsMap = new Map();
    for (const h of hints) {
      if (h.resetsAtMs <= nowMs) continue; // already reset!
      if (!activeHintsMap.has(h.modelKey) || h.tsMs > activeHintsMap.get(h.modelKey).observedAt) {
        const info = getModelInfo(h.model, this.settings);
        activeHintsMap.set(h.modelKey, {
          modelKey: h.modelKey,
          modelLabel: info.label,
          kind: h.kind,
          remainingPct: h.remainingPct,
          resetsAt: h.resetsAt,
          resetsAtMs: h.resetsAtMs,
          observedAt: h.tsMs,
        });
      }
    }

    return {
      rollingWindows: {
        gemini5h: gemini.win5h,
        gemini7d: gemini.win7d,
        claude5h: claude.win5h,
        claude7d: claude.win7d,
      },
      activeQuotaHints: [...activeHintsMap.values()],
      calibration: {
        totalAnchors: gemini.totalAnchors + claude.totalAnchors,
        gemini5hCapUsd: gemini.win5h.budgetUsd,
        gemini5hSource: gemini.win5h.source,
        gemini7dCapUsd: gemini.win7d.budgetUsd,
        gemini7dSource: gemini.win7d.source,
        claude5hCapUsd: claude.win5h.budgetUsd,
        claude7dCapUsd: claude.win7d.budgetUsd,
        lastGeminiResetAt: gemini.lastResetAt,
      },
    };
  }

  getOverviewSnapshot(params = {}) {
    this.sync();
    const range = params.range || "all";
    const modelFilter = params.model || "all";
    const selectedCid = params.conversationId || null;
    const inflight = this.getInflightConversations();

    const sig = `${this.revision}:${range}:${modelFilter}:${selectedCid || "auto"}:${inflight.length}`;
    if (params.sinceRevision && params.sinceRevision === sig) {
      return {
        unchanged: true,
        revision: sig,
        generatedAt: Date.now(),
        inflightCount: inflight.length,
        inflight,
      };
    }

    const nowMs = Date.now();
    const rangeStartMs = this._getRangeStartMs(range, nowMs);
    const cycleBounds = getBillingCycleBounds(nowMs, this.settings.subscription?.billingDay || 1);
    const cycleStartMs = cycleBounds.startMs;
    const cycleEndMs = cycleBounds.endMs;
    const { all, allQuotaHints } = this._getAllEnrichedSteps();

    // 1. Heatmap (always full 53-week history across all models or selected model)
    const todayStart = startOfLocalDay(nowMs);
    const todayDate = new Date(todayStart);
    const endDow = todayDate.getDay(); // 0 = Sun
    const totalDays = 52 * 7 + endDow + 1;
    const heatmapStart = todayStart - (totalDays - 1) * 86400000;
    const dayMap = new Map();

    // 2. Auto-calibrated rolling 5h / 7d windows (reset-boundary aligned + anchor inferred)
    const quotaInference = this._inferPoolQuotas(all, allQuotaHints, nowMs);

    let cycleCostUsd = 0;
    let cycleTokens = 0;
    let cycleActiveDays = new Set();
    let allTimeCostUsd = 0;
    let allTimeInput = 0;
    let allTimeCache = 0;
    let allTimeOutput = 0;
    const allTimeByModel = new Map();
    const cycleByModel = new Map();
    const convTotals = new Map();

    // 3. Filtered metrics
    const filtered = [];
    for (const s of all) {
      const tok = s.inputTokens + s.cacheReadTokens + s.outputTokens;
      allTimeCostUsd += s.costUsd;
      allTimeInput += s.inputTokens;
      allTimeCache += s.cacheReadTokens;
      allTimeOutput += s.outputTokens;

      let atm = allTimeByModel.get(s.modelKey);
      if (!atm) {
        atm = { tokens: 0, costUsd: 0, steps: 0 };
        allTimeByModel.set(s.modelKey, atm);
      }
      atm.tokens += tok;
      atm.costUsd += s.costUsd;
      atm.steps++;

      if (s.tsMs >= cycleStartMs && s.tsMs < cycleEndMs) {
        cycleCostUsd += s.costUsd;
        cycleTokens += tok;
        cycleActiveDays.add(s.dayKey);
        let cm = cycleByModel.get(s.modelKey);
        if (!cm) {
          cm = { tokens: 0, costUsd: 0, steps: 0 };
          cycleByModel.set(s.modelKey, cm);
        }
        cm.tokens += tok;
        cm.costUsd += s.costUsd;
        cm.steps++;
      }

      // Track per-conversation totals for switcher & latest session detection
      let ct = convTotals.get(s.cid);
      if (!ct) {
        ct = {
          cid: s.cid,
          steps: 0,
          tokens: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          lastTs: 0,
          firstTs: s.tsMs,
          lastModel: s.model,
          lastModelKey: s.modelKey,
          lastStep: s,
          tpsSum: 0,
          tpsCount: 0,
          durSum: 0,
          durCount: 0,
          errors: 0,
          anomalies: 0,
        };
        convTotals.set(s.cid, ct);
      }
      ct.steps++;
      ct.tokens += tok;
      ct.inputTokens += s.inputTokens;
      ct.cacheReadTokens += s.cacheReadTokens;
      ct.outputTokens += s.outputTokens;
      ct.costUsd += s.costUsd;
      if (s.tsMs >= ct.lastTs) {
        ct.lastTs = s.tsMs;
        ct.lastModel = s.model;
        ct.lastModelKey = s.modelKey;
        ct.lastStep = s;
      }
      if (s.tps) {
        ct.tpsSum += s.tps;
        ct.tpsCount++;
      }
      if (s.durationMs) {
        ct.durSum += s.durationMs;
        ct.durCount++;
      }
      if (s.status !== "DONE") ct.errors++;
      if (s.cacheAnomaly) ct.anomalies++;

      // Heatmap aggregation (honors modelFilter)
      if (modelFilter === "all" || s.modelKey === modelFilter) {
        if (s.tsMs >= heatmapStart) {
          let dm = dayMap.get(s.dayKey);
          if (!dm) {
            dm = { date: s.dayKey, tokens: 0, requests: 0, cost: 0, input: 0, cache: 0 };
            dayMap.set(s.dayKey, dm);
          }
          dm.tokens += tok;
          dm.requests++;
          dm.cost += s.costUsd;
          dm.input += s.inputTokens;
          dm.cache += s.cacheReadTokens;
        }
      }

      if (s.tsMs >= rangeStartMs && (modelFilter === "all" || s.modelKey === modelFilter)) {
        filtered.push(s);
      }
    }

    // Build 53-week dense heatmap array
    const heatmap = [];
    for (let i = 0; i < totalDays; i++) {
      const ts = heatmapStart + i * 86400000;
      const key = toLocalDayKey(ts);
      const dm = dayMap.get(key);
      if (dm) {
        const totIn = dm.input + dm.cache;
        heatmap.push({
          date: key,
          tokens: dm.tokens,
          requests: dm.requests,
          cost: Number(dm.cost.toFixed(4)),
          cacheHitRate: totIn > 0 ? Number(((dm.cache / totIn) * 100).toFixed(1)) : 0,
        });
      } else {
        heatmap.push({ date: key, tokens: 0, requests: 0, cost: 0, cacheHitRate: 0 });
      }
    }

    // Aggregate filtered KPIs, models, sparklines, health timeline
    let totalInput = 0;
    let totalCache = 0;
    let totalOutput = 0;
    let totalCostUsd = 0;
    let totalSavedUsd = 0;
    let errorCount = 0;
    let anomalyCount = 0;
    let checkpointCount = 0;
    let tpsSum = 0;
    let tpsCount = 0;
    let peakTps = 0;
    let durSum = 0;
    let durCount = 0;

    const modelAgg = new Map();

    for (const s of filtered) {
      totalInput += s.inputTokens;
      totalCache += s.cacheReadTokens;
      totalOutput += s.outputTokens;
      totalCostUsd += s.costUsd;
      totalSavedUsd += s.cacheSavedUsd;
      if (s.status !== "DONE") errorCount++;
      if (s.cacheAnomaly) anomalyCount++;
      if (s.type === "CHECKPOINT") checkpointCount++;
      if (s.tps) {
        tpsSum += s.tps;
        tpsCount++;
        if (s.tps > peakTps) peakTps = s.tps;
      }
      if (s.durationMs) {
        durSum += s.durationMs;
        durCount++;
      }

      let ma = modelAgg.get(s.modelKey);
      if (!ma) {
        const info = getModelInfo(s.model, this.settings);
        ma = {
          key: info.key,
          label: info.label,
          short: info.short,
          family: info.family,
          pool: info.pool,
          color: info.color,
          requests: 0,
          errors: 0,
          anomalies: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          tokens: 0,
          costUsd: 0,
          tpsSum: 0,
          tpsCount: 0,
          peakTps: 0,
          durSum: 0,
          durCount: 0,
          stepsList: [],
        };
        modelAgg.set(s.modelKey, ma);
      }
      ma.requests++;
      if (s.status !== "DONE") ma.errors++;
      if (s.cacheAnomaly) ma.anomalies++;
      ma.inputTokens += s.inputTokens;
      ma.cacheReadTokens += s.cacheReadTokens;
      ma.outputTokens += s.outputTokens;
      ma.tokens += s.inputTokens + s.cacheReadTokens + s.outputTokens;
      ma.costUsd += s.costUsd;
      if (s.tps) {
        ma.tpsSum += s.tps;
        ma.tpsCount++;
        if (s.tps > ma.peakTps) ma.peakTps = s.tps;
      }
      if (s.durationMs) {
        ma.durSum += s.durationMs;
        ma.durCount++;
      }
      ma.stepsList.push(s);
    }

    const totalTokens = totalInput + totalCache + totalOutput;
    const totalPrompt = totalInput + totalCache;
    const cacheHitRate = totalPrompt > 0 ? Number(((totalCache / totalPrompt) * 100).toFixed(1)) : 0;

    // Sparklines (24 buckets across filtered span, or 24 hours for "today")
    const sparkCount = 24;
    const sparkReq = new Array(sparkCount).fill(0);
    const sparkTok = new Array(sparkCount).fill(0);
    const sparkCost = new Array(sparkCount).fill(0);
    const sparkLabels = new Array(sparkCount).fill("");

    if (filtered.length > 0) {
      const spanStart = range === "today" ? todayStart : filtered[0].tsMs;
      const spanEnd = Math.max(spanStart + 60000, range === "today" ? todayStart + 86400000 : filtered[filtered.length - 1].tsMs + 1);
      const bucketMs = (spanEnd - spanStart) / sparkCount;
      for (let i = 0; i < sparkCount; i++) {
        const d = new Date(spanStart + i * bucketMs);
        sparkLabels[i] =
          range === "today"
            ? `${String(d.getHours()).padStart(2, "0")}:00`
            : `${d.getMonth() + 1}/${d.getDate()}`;
      }
      for (const s of filtered) {
        const idx = Math.min(sparkCount - 1, Math.max(0, Math.floor((s.tsMs - spanStart) / bucketMs)));
        sparkReq[idx]++;
        sparkTok[idx] += s.inputTokens + s.cacheReadTokens + s.outputTokens;
        sparkCost[idx] += s.costUsd;
      }
    }

    // Build models table & 40-slot health timeline
    const SLOT_COUNT = 36;
    const models = [...modelAgg.values()]
      .sort((a, b) => b.tokens - a.tokens)
      .map((m) => {
        const mPrompt = m.inputTokens + m.cacheReadTokens;
        const successRate =
          m.requests > 0 ? Number((((m.requests - m.errors) / m.requests) * 100).toFixed(1)) : 100;

        // Build health slots for this model
        const slots = [];
        const list = m.stepsList;
        if (list.length <= SLOT_COUNT) {
          const pad = SLOT_COUNT - list.length;
          for (let i = 0; i < pad; i++) slots.push({ state: "empty", count: 0, errors: 0, anomalies: 0 });
          for (const st of list) {
            slots.push({
              state: st.status !== "DONE" ? "error" : st.cacheAnomaly ? "warn" : "ok",
              count: 1,
              errors: st.status !== "DONE" ? 1 : 0,
              anomalies: st.cacheAnomaly ? 1 : 0,
              ts: st.tsMs,
            });
          }
        } else {
          const chunkSize = list.length / SLOT_COUNT;
          for (let i = 0; i < SLOT_COUNT; i++) {
            const aIdx = Math.floor(i * chunkSize);
            const bIdx = Math.max(aIdx + 1, Math.floor((i + 1) * chunkSize));
            let errs = 0;
            let anoms = 0;
            for (let j = aIdx; j < bIdx && j < list.length; j++) {
              if (list[j].status !== "DONE") errs++;
              if (list[j].cacheAnomaly) anoms++;
            }
            const cnt = Math.min(bIdx, list.length) - aIdx;
            slots.push({
              state: errs > 0 ? "error" : anoms > 0 ? "warn" : "ok",
              count: cnt,
              errors: errs,
              anomalies: anoms,
              ts: list[aIdx]?.tsMs || null,
            });
          }
        }

        return {
          key: m.key,
          label: m.label,
          short: m.short,
          family: m.family,
          pool: m.pool,
          color: m.color,
          requests: m.requests,
          errors: m.errors,
          anomalies: m.anomalies,
          inputTokens: m.inputTokens,
          cacheReadTokens: m.cacheReadTokens,
          outputTokens: m.outputTokens,
          tokens: m.tokens,
          cacheHitRate: mPrompt > 0 ? Number(((m.cacheReadTokens / mPrompt) * 100).toFixed(1)) : 0,
          costUsd: Number(m.costUsd.toFixed(4)),
          shareTokens: totalTokens > 0 ? Number(((m.tokens / totalTokens) * 100).toFixed(1)) : 0,
          shareCost: totalCostUsd > 0 ? Number(((m.costUsd / totalCostUsd) * 100).toFixed(1)) : 0,
          avgTps: m.tpsCount > 0 ? Number((m.tpsSum / m.tpsCount).toFixed(1)) : null,
          peakTps: m.peakTps > 0 ? Number(m.peakTps.toFixed(1)) : null,
          avgDurationMs: m.durCount > 0 ? Math.round(m.durSum / m.durCount) : null,
          timedCount: m.tpsCount,
          successRate,
          healthSlots: slots,
        };
      });

    // Subscription ROI & billing-cycle remaining quota metrics
    const subCfg = this.settings.subscription || DEFAULT_SETTINGS.subscription;
    const refCostUsd = range === "all" ? allTimeCostUsd : range === "cycle" ? cycleCostUsd : totalCostUsd;
    const monthlyUsd = Math.max(0.01, Number(subCfg.monthlyUsd || 99));
    const cycleTotalDays = Math.max(1, Math.round((cycleEndMs - cycleStartMs) / 86400000));
    const autoQuota = subCfg.autoQuota !== false;

    // Auto-derive cycle quota from inferred weekly pools (Gemini 7d + Claude 7d) scaled to billing cycle weeks
    const rw = quotaInference.rollingWindows;
    const inferredWeeklyTotalUsd = rw.gemini7d.budgetUsd + (rw.claude7d.tokens > 0 ? rw.claude7d.budgetUsd : 0);
    const autoCycleQuotaUsd = roundNiceUsd(
      Math.max(inferredWeeklyTotalUsd * (cycleTotalDays / 7), cycleCostUsd / 0.85)
    );
    const cycleQuotaUsd = autoQuota ? autoCycleQuotaUsd : Math.max(1, Number(subCfg.cycleQuotaUsd || 1600));
    const cycleQuotaSource = autoQuota
      ? quotaInference.calibration.totalAnchors > 0
        ? "anchor"
        : "estimated"
      : "manual";

    const roiMultiplier = Number((refCostUsd / monthlyUsd).toFixed(2));
    const netSavedUsd = Number((refCostUsd - monthlyUsd).toFixed(2));
    const effectiveDiscountPct = refCostUsd > 0 ? Number(((monthlyUsd / refCostUsd) * 100).toFixed(1)) : 100;
    const actualPerMillionUsd = totalTokens > 0 ? Number(((monthlyUsd / (totalTokens / 1e6))).toFixed(3)) : 0;

    const cycleRemainingUsd = Math.max(0, Number((cycleQuotaUsd - cycleCostUsd).toFixed(2)));
    const cycleExceededUsd = Math.max(0, Number((cycleCostUsd - cycleQuotaUsd).toFixed(2)));
    const cycleUsedPct = Math.min(100, Number(((cycleCostUsd / cycleQuotaUsd) * 100).toFixed(1)));
    const cycleRemainingPct = Math.max(0, Number((100 - (cycleCostUsd / cycleQuotaUsd) * 100).toFixed(1)));
    const cycleElapsedDays = Math.max(1, Math.min(cycleTotalDays, Math.ceil((nowMs - cycleStartMs) / 86400000)));
    const cycleRemainingDays = Math.max(0, Math.ceil((cycleEndMs - nowMs) / 86400000));
    const cycleTimePct = Math.min(100, Number((((nowMs - cycleStartMs) / Math.max(1, cycleEndMs - cycleStartMs)) * 100).toFixed(1)));
    const activeDayDenom = Math.max(1, cycleActiveDays.size);
    const dailyBurnUsd = Number((cycleCostUsd / activeDayDenom).toFixed(2));
    const runwayDays = dailyBurnUsd > 0 ? Number((cycleRemainingUsd / dailyBurnUsd).toFixed(1)) : null;

    // Estimate how many tokens the remaining subscription quota translates to per model,
    // using each model's observed blended $/1M (when >= 20 steps) or user's global token mix.
    const allTimeTokTotal = allTimeInput + allTimeCache + allTimeOutput;
    const mixIn = allTimeTokTotal > 0 ? allTimeInput / allTimeTokTotal : 0.05;
    const mixCache = allTimeTokTotal > 0 ? allTimeCache / allTimeTokTotal : 0.94;
    const mixOut = allTimeTokTotal > 0 ? allTimeOutput / allTimeTokTotal : 0.01;
    const noCacheIn = mixIn + mixCache;

    const featuredKeys = [
      "gemini-4-neon",
      "gemini-4-carbon",
      "gemini-4-hydrogen",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "gemini-3.8-flash",
    ];
    // Put models actually used by the user first (sorted by usage), then fill with core models
    const usedSortedKeys = [...allTimeByModel.entries()]
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .map(([k]) => k)
      .filter((k) => k !== "unknown");
    const estimateKeys = [];
    for (const k of [...usedSortedKeys, ...featuredKeys]) {
      if (!estimateKeys.includes(k)) estimateKeys.push(k);
      if (estimateKeys.length >= 6) break;
    }

    const modelEstimates = estimateKeys.map((key) => {
      const r = resolveRatesAt(key, nowMs, this.settings);
      const obs = allTimeByModel.get(key);
      const cyc = cycleByModel.get(key);
      const useObserved = obs && obs.steps >= 20 && obs.tokens > 0 && obs.costUsd > 0;
      const blendedPerMillionUsd = useObserved
        ? obs.costUsd / (obs.tokens / 1e6)
        : mixIn * r.effectiveInput + mixCache * r.cacheRate + mixOut * r.outputRate;
      const noCachePerMillionUsd = noCacheIn * r.baseInputRate + mixOut * r.outputRate;
      const estRemainingTokens =
        blendedPerMillionUsd > 0 ? Math.round((cycleRemainingUsd / blendedPerMillionUsd) * 1e6) : 0;
      const noCacheRemainingTokens =
        noCachePerMillionUsd > 0 ? Math.round((cycleRemainingUsd / noCachePerMillionUsd) * 1e6) : 0;

      return {
        key: r.key,
        label: r.label,
        short: r.short,
        color: r.color,
        pool: r.pool,
        estRemainingTokens,
        noCacheRemainingTokens,
        cycleUsedTokens: cyc?.tokens || 0,
        cycleUsedUsd: Number((cyc?.costUsd || 0).toFixed(2)),
        blendedPerMillionUsd: Number(blendedPerMillionUsd.toFixed(3)),
        basis: useObserved ? "observed" : "mix",
      };
    });

    // Recent sessions sorted by last activity
    const recentSessions = [...convTotals.values()]
      .sort((a, b) => b.lastTs - a.lastTs)
      .slice(0, 40)
      .map((c) => {
        const meta = this.getConversationMeta(c.cid);
        const mInfo = getModelInfo(c.lastModel, this.settings);
        return {
          cid: c.cid,
          title: meta.title || (meta.agentName ? `@${meta.agentName}` : c.cid.slice(0, 8)),
          agentName: meta.agentName,
          depth: meta.depth,
          rootId: meta.rootId,
          steps: c.steps,
          tokens: c.tokens,
          costUsd: Number(c.costUsd.toFixed(4)),
          lastTs: c.lastTs,
          modelLabel: mInfo.label,
          modelShort: mInfo.short,
          modelColor: mInfo.color,
          isRunning: inflight.some((x) => x.cid === c.cid),
        };
      });

    // Selected or latest active session for monitor card & context breakdown
    const targetCid =
      (selectedCid && convTotals.has(selectedCid) ? selectedCid : null) ||
      inflight[0]?.cid ||
      recentSessions[0]?.cid ||
      null;

    let latestSession = null;
    if (targetCid && convTotals.has(targetCid)) {
      const ct = convTotals.get(targetCid);
      const meta = this.getConversationMeta(targetCid);
      const ctxAnalysis = analyzeConversationContext(this.getBrainDir(), targetCid, this.settings);
      const lastStep = ct.lastStep;
      latestSession = {
        cid: targetCid,
        title: meta.title || (meta.agentName ? `@${meta.agentName}` : targetCid.slice(0, 8)),
        agentName: meta.agentName,
        depth: meta.depth,
        steps: ct.steps,
        tokens: ct.tokens,
        sessionCostUsd: Number(ct.costUsd.toFixed(4)),
        lastStepCostUsd: Number((lastStep?.costUsd || 0).toFixed(4)),
        lastStepTps: lastStep?.tps ?? null,
        lastStepDurationMs: lastStep?.durationMs ?? null,
        avgTps: ct.tpsCount > 0 ? Number((ct.tpsSum / ct.tpsCount).toFixed(1)) : null,
        avgDurationMs: ct.durCount > 0 ? Math.round(ct.durSum / ct.durCount) : null,
        timedSteps: ct.tpsCount,
        cacheHitRate:
          ct.inputTokens + ct.cacheReadTokens > 0
            ? Number(((ct.cacheReadTokens / (ct.inputTokens + ct.cacheReadTokens)) * 100).toFixed(1))
            : 0,
        lastTs: ct.lastTs,
        context: ctxAnalysis,
      };
    }

    return {
      unchanged: false,
      revision: sig,
      generatedAt: nowMs,
      range,
      modelFilter,
      inflightCount: inflight.length,
      inflight,
      kpi: {
        requests: filtered.length,
        successCount: filtered.length - errorCount,
        errorCount,
        successRate:
          filtered.length > 0
            ? Number((((filtered.length - errorCount) / filtered.length) * 100).toFixed(1))
            : 100,
        anomalyCount,
        checkpointCount,
        conversationsCount: new Set(filtered.map((s) => s.cid)).size,
        totalTokens,
        inputTokens: totalInput,
        cacheReadTokens: totalCache,
        outputTokens: totalOutput,
        cacheHitRate,
        costUsd: Number(totalCostUsd.toFixed(4)),
        avgStepCostUsd: filtered.length > 0 ? Number((totalCostUsd / filtered.length).toFixed(4)) : 0,
        cacheSavedUsd: Number(totalSavedUsd.toFixed(2)),
        avgTps: tpsCount > 0 ? Number((tpsSum / tpsCount).toFixed(1)) : null,
        peakTps: peakTps > 0 ? Number(peakTps.toFixed(1)) : null,
        avgDurationMs: durCount > 0 ? Math.round(durSum / durCount) : null,
        timedCount: tpsCount,
        allTimeCostUsd: Number(allTimeCostUsd.toFixed(2)),
        cycleCostUsd: Number(cycleCostUsd.toFixed(2)),
      },
      subscription: {
        ...subCfg,
        autoQuota,
        cycleQuotaUsd,
        cycleQuotaSource,
        cycleStartMs,
        cycleEndMs,
        cycleTotalDays,
        cycleElapsedDays,
        cycleRemainingDays,
        cycleTimePct,
        cycleUsedUsd: Number(cycleCostUsd.toFixed(2)),
        cycleUsedTokens: cycleTokens,
        cycleActiveDays: cycleActiveDays.size,
        cycleRemainingUsd,
        cycleExceededUsd,
        cycleUsedPct,
        cycleRemainingPct,
        dailyBurnUsd,
        runwayDays,
        modelEstimates,
        refCostUsd: Number(refCostUsd.toFixed(2)),
        roiMultiplier,
        netSavedUsd,
        effectiveDiscountPct,
        actualPerMillionUsd,
      },
      sparklines: {
        labels: sparkLabels,
        requests: sparkReq,
        tokens: sparkTok,
        cost: sparkCost.map((v) => Number(v.toFixed(4))),
      },
      heatmap,
      models,
      rollingWindows: quotaInference.rollingWindows,
      quotaHints: quotaInference.activeQuotaHints,
      quotaCalibration: quotaInference.calibration,
      latestSession,
      recentSessions,
      settings: this.settings,
      pricingCatalog: getCatalogList(this.settings),
      stopErrorCount: this.timingCache.stopErrors.length,
    };
  }

  getContextBreakdown(conversationId) {
    this.sync();
    let cid = conversationId;
    if (!cid || !this.convCache.has(cid)) {
      let latest = null;
      let latestTs = -1;
      for (const [k, v] of this.convCache.entries()) {
        if (v.mtimeMs > latestTs) {
          latestTs = v.mtimeMs;
          latest = k;
        }
      }
      cid = latest;
    }
    if (!cid) return null;
    const analysis = analyzeConversationContext(this.getBrainDir(), cid, this.settings);
    if (!analysis) return null;
    const meta = this.getConversationMeta(cid);
    return {
      ...analysis,
      title: meta.title || (meta.agentName ? `@${meta.agentName}` : cid.slice(0, 8)),
      agentName: meta.agentName,
      depth: meta.depth,
    };
  }

  getTasksSnapshot(params = {}) {
    this.sync();
    const range = params.range || "all";
    const nowMs = Date.now();
    const rangeStartMs = this._getRangeStartMs(range, nowMs);
    const { all } = this._getAllEnrichedSteps();

    const byConv = new Map();
    for (const s of all) {
      if (s.tsMs < rangeStartMs) continue;
      let c = byConv.get(s.cid);
      if (!c) {
        const meta = this.getConversationMeta(s.cid);
        c = {
          cid: s.cid,
          rootId: meta.rootId,
          parent: meta.parent,
          depth: meta.depth,
          title: meta.title,
          agentName: meta.agentName,
          steps: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          tokens: 0,
          costUsd: 0,
          errors: 0,
          anomalies: 0,
          firstTs: s.tsMs,
          lastTs: s.tsMs,
          models: {},
        };
        byConv.set(s.cid, c);
      }
      const tok = s.inputTokens + s.cacheReadTokens + s.outputTokens;
      c.steps++;
      c.inputTokens += s.inputTokens;
      c.cacheReadTokens += s.cacheReadTokens;
      c.outputTokens += s.outputTokens;
      c.tokens += tok;
      c.costUsd += s.costUsd;
      if (s.status !== "DONE") c.errors++;
      if (s.cacheAnomaly) c.anomalies++;
      if (s.tsMs < c.firstTs) c.firstTs = s.tsMs;
      if (s.tsMs > c.lastTs) c.lastTs = s.tsMs;
      c.models[s.modelKey] = (c.models[s.modelKey] || 0) + 1;
    }

    // Group into root task trees
    const rootsMap = new Map();
    const sessions = [];

    for (const c of byConv.values()) {
      const prompt = c.inputTokens + c.cacheReadTokens;
      const primaryModelKey =
        Object.entries(c.models).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
      const mInfo = getModelInfo(primaryModelKey, this.settings);
      const formatted = {
        ...c,
        displayTitle: c.title || (c.agentName ? `@${c.agentName}` : c.cid.slice(0, 8)),
        costUsd: Number(c.costUsd.toFixed(4)),
        cacheHitRate: prompt > 0 ? Number(((c.cacheReadTokens / prompt) * 100).toFixed(1)) : 0,
        primaryModel: mInfo.label,
        primaryModelColor: mInfo.color,
      };
      sessions.push(formatted);

      let root = rootsMap.get(c.rootId);
      if (!root) {
        const rMeta = this.getConversationMeta(c.rootId);
        root = {
          rootId: c.rootId,
          title: rMeta.title || formatted.displayTitle,
          sessionCount: 0,
          steps: 0,
          inputTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
          tokens: 0,
          costUsd: 0,
          errors: 0,
          anomalies: 0,
          firstTs: c.firstTs,
          lastTs: c.lastTs,
          children: [],
        };
        rootsMap.set(c.rootId, root);
      }
      root.sessionCount++;
      root.steps += c.steps;
      root.inputTokens += c.inputTokens;
      root.cacheReadTokens += c.cacheReadTokens;
      root.outputTokens += c.outputTokens;
      root.tokens += c.tokens;
      root.costUsd += c.costUsd;
      root.errors += c.errors;
      root.anomalies += c.anomalies;
      if (c.firstTs < root.firstTs) root.firstTs = c.firstTs;
      if (c.lastTs > root.lastTs) root.lastTs = c.lastTs;
      root.children.push(formatted);
    }

    const roots = [...rootsMap.values()]
      .map((r) => {
        const prompt = r.inputTokens + r.cacheReadTokens;
        r.children.sort((a, b) => b.tokens - a.tokens);
        return {
          ...r,
          costUsd: Number(r.costUsd.toFixed(4)),
          cacheHitRate: prompt > 0 ? Number(((r.cacheReadTokens / prompt) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);

    sessions.sort((a, b) => b.lastTs - a.lastTs);

    return {
      range,
      roots,
      sessions,
    };
  }

  getRequestsPage(params = {}) {
    this.sync();
    const range = params.range || "all";
    const modelFilter = params.model || "all";
    const cidFilter = params.conversationId || "all";
    const filter = params.filter || "all"; // all | error | anomaly | checkpoint
    const search = (params.search || "").trim().toLowerCase();
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(params.pageSize || 50)));

    const nowMs = Date.now();
    const rangeStartMs = this._getRangeStartMs(range, nowMs);
    const { all } = this._getAllEnrichedSteps();

    const matched = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      if (s.tsMs < rangeStartMs) continue;
      if (modelFilter !== "all" && s.modelKey !== modelFilter) continue;
      if (cidFilter !== "all" && s.cid !== cidFilter) continue;
      if (filter === "error" && s.status === "DONE") continue;
      if (filter === "anomaly" && !s.cacheAnomaly) continue;
      if (filter === "checkpoint" && s.type !== "CHECKPOINT") continue;

      const meta = this.getConversationMeta(s.cid);
      const title = meta.title || (meta.agentName ? `@${meta.agentName}` : s.cid.slice(0, 8));
      if (search) {
        const hay = `${title} ${s.cid} ${s.model} ${s.modelKey} ${s.error || ""}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }

      const info = getModelInfo(s.model, this.settings);
      const prompt = s.inputTokens + s.cacheReadTokens;
      matched.push({
        cid: s.cid,
        title,
        agentName: meta.agentName,
        stepIndex: s.stepIndex,
        tsMs: s.tsMs,
        type: s.type,
        status: s.status,
        modelKey: s.modelKey,
        modelLabel: info.label,
        modelShort: info.short,
        modelColor: info.color,
        inputTokens: s.inputTokens,
        cacheReadTokens: s.cacheReadTokens,
        outputTokens: s.outputTokens,
        tokens: s.inputTokens + s.cacheReadTokens + s.outputTokens,
        cacheHitRate: prompt > 0 ? Number(((s.cacheReadTokens / prompt) * 100).toFixed(1)) : 0,
        costUsd: Number(s.costUsd.toFixed(5)),
        durationMs: s.durationMs,
        tps: s.tps,
        cacheAnomaly: s.cacheAnomaly,
        prevContextTokens: s.prevContextTokens,
        error: s.error,
      });
    }

    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const items = matched.slice(start, start + pageSize);

    return {
      total,
      page,
      pageSize,
      totalPages,
      items,
      stopErrors: filter === "error" || filter === "all" ? this.timingCache.stopErrors.slice(-50).reverse() : [],
    };
  }
}
