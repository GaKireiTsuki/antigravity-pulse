import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getModelInfo } from "./pricing.mjs";

const analysisCache = new Map(); // cid -> { mtimeMs, size, result }

const CATEGORY_META = [
  { id: "tool_results", label: "工具结果", color: "#34D399" },
  { id: "assistant_reply", label: "模型回复", color: "#60A5FA" },
  { id: "subagent_notice", label: "子代理通知", color: "#C084FC" },
  { id: "system_tools", label: "系统工具", color: "#FB923C" },
  { id: "system_prompt", label: "系统提示词", color: "#94A3B8" },
  { id: "compaction", label: "压缩摘要", color: "#FACC15" },
  { id: "user_messages", label: "用户消息", color: "#A855F7" },
  { id: "skills", label: "Skill", color: "#4ADE80" },
  { id: "user_rules", label: "用户规则", color: "#F87171" },
  { id: "mcp_tools", label: "MCP 工具", color: "#F472B6" },
];

/**
 * Rough tokenizer estimate for weighting content slices before scaling to
 * the exact API-reported context total. Handles CJK (~1.6 chars/tok) vs ASCII (~3.8 chars/tok).
 */
function estimateTextTokens(str) {
  if (!str || typeof str !== "string") return 0;
  let cjk = 0;
  const len = str.length;
  // Sample for very long strings to stay ultra-fast (< 1ms)
  if (len > 4000) {
    let sampledCjk = 0;
    const sampleStep = Math.max(1, Math.floor(len / 500));
    let samples = 0;
    for (let i = 0; i < len; i += sampleStep) {
      const code = str.charCodeAt(i);
      if (code >= 0x3000 && code <= 0x9fff) sampledCjk++;
      samples++;
    }
    cjk = Math.round((sampledCjk / Math.max(1, samples)) * len);
  } else {
    for (let i = 0; i < len; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0x3000 && code <= 0x9fff) cjk++;
    }
  }
  const other = len - cjk;
  return Math.max(1, Math.round(cjk / 1.65 + other / 3.8));
}

function estimatePayloadTokens(val) {
  if (!val) return 0;
  if (typeof val === "string") return estimateTextTokens(val);
  try {
    return estimateTextTokens(JSON.stringify(val));
  } catch {
    return 0;
  }
}

function getLocalRulesAndMcpBaseline() {
  let rulesChars = 0;
  const ruleCandidates = [
    path.join(os.homedir(), ".gemini", "GEMINI.md"),
    path.join(os.homedir(), ".gemini", "AGENTS.md"),
  ];
  for (const p of ruleCandidates) {
    try {
      if (fs.existsSync(p)) rulesChars += fs.statSync(p).size;
    } catch {}
  }

  let mcpToolFiles = 0;
  try {
    const mcpDir = path.join(os.homedir(), ".gemini", "antigravity", "mcp");
    if (fs.existsSync(mcpDir)) {
      for (const srv of fs.readdirSync(mcpDir)) {
        const sd = path.join(mcpDir, srv);
        if (fs.statSync(sd).isDirectory()) {
          mcpToolFiles += fs.readdirSync(sd).filter((f) => f.endsWith(".json")).length;
        }
      }
    }
  } catch {}

  let skillDirs = 0;
  try {
    const builtinSkills = path.join(os.homedir(), ".gemini", "antigravity", "builtin", "skills");
    if (fs.existsSync(builtinSkills)) skillDirs += fs.readdirSync(builtinSkills).length;
    const pluginsDir = path.join(os.homedir(), ".gemini", "config", "plugins");
    if (fs.existsSync(pluginsDir)) {
      for (const p of fs.readdirSync(pluginsDir)) {
        const sdir = path.join(pluginsDir, p, "skills");
        if (fs.existsSync(sdir)) skillDirs += fs.readdirSync(sdir).length;
      }
    }
  } catch {}

  return {
    rulesEst: Math.max(200, Math.round(rulesChars / 2.2)),
    mcpEst: Math.max(200, mcpToolFiles * 14), // lazy-loaded tool names + brief schema
    skillsCatalogEst: Math.max(800, skillDirs * 45),
  };
}

/**
 * Analyze a single conversation's active context window breakdown using
 * transcript_full.jsonl (falling back to transcript.jsonl).
 * Cached by file mtimeMs + size for sub-millisecond repeat calls.
 */
export function analyzeConversationContext(brainDir, cid, settings) {
  const fullPath = path.join(brainDir, cid, ".system_generated", "logs", "transcript_full.jsonl");
  const compactPath = path.join(brainDir, cid, ".system_generated", "logs", "transcript.jsonl");
  const targetPath = fs.existsSync(fullPath) ? fullPath : compactPath;

  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const stat = fs.statSync(targetPath);
  const cached = analysisCache.get(cid);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.result;
  }

  const raw = fs.readFileSync(targetPath, "utf8");
  const lines = raw.split("\n");

  const entries = [];
  let lastCheckpointIdx = -1;
  let checkpointCount = 0;
  let firstPlanner = null;
  let lastPlanner = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    entries.push(obj);
    if (obj.type === "CHECKPOINT") {
      checkpointCount++;
      lastCheckpointIdx = entries.length - 1;
    }
    if (obj.type === "PLANNER_RESPONSE" || obj.type === "CHECKPOINT") {
      if (!firstPlanner && obj.type === "PLANNER_RESPONSE") firstPlanner = obj;
      lastPlanner = obj;
    }
  }

  if (!lastPlanner) return null;

  const actualContext =
    Number(lastPlanner.input_tokens || 0) + Number(lastPlanner.cache_read_tokens || 0);
  const lastModel = lastPlanner.model || firstPlanner?.model || "unknown";
  const modelInfo = getModelInfo(lastModel, settings);
  const windowLimit = modelInfo.contextLimit || 512000;

  // Baseline overhead from initial turn (system prompt + system tools + skill index + user rules + MCP)
  const firstStepCtx = firstPlanner
    ? Number(firstPlanner.input_tokens || 0) + Number(firstPlanner.cache_read_tokens || 0)
    : 18000;

  let firstUserTokens = 0;
  for (const e of entries) {
    if (e.type === "USER_INPUT") {
      firstUserTokens = estimateTextTokens(e.content);
      break;
    }
    if (e.type === "PLANNER_RESPONSE") break;
  }

  const baseline = getLocalRulesAndMcpBaseline();
  const baseOverhead = Math.max(4000, Math.min(actualContext * 0.7, firstStepCtx - firstUserTokens));

  // Split base overhead across system_tools (~44%), system_prompt (~36%), skills (~11%), user_rules (~6%), mcp_tools (~3%)
  const rawBuckets = {
    tool_results: 0,
    assistant_reply: 0,
    subagent_notice: 0,
    system_tools: Math.round(baseOverhead * 0.43),
    system_prompt: Math.round(baseOverhead * 0.37),
    compaction: 0,
    user_messages: 0,
    skills: Math.min(Math.round(baseOverhead * 0.14), baseline.skillsCatalogEst),
    user_rules: Math.min(Math.round(baseOverhead * 0.08), baseline.rulesEst),
    mcp_tools: Math.min(Math.round(baseOverhead * 0.06), baseline.mcpEst),
  };

  // Walk active window starting from last CHECKPOINT (or 0 if no compaction yet)
  const startIdx = lastCheckpointIdx >= 0 ? lastCheckpointIdx : 0;
  for (let i = startIdx; i < entries.length; i++) {
    const e = entries[i];
    const t = e.type || "";
    if (t === "CHECKPOINT") {
      rawBuckets.compaction += estimateTextTokens(e.content);
    } else if (t === "USER_INPUT") {
      rawBuckets.user_messages += estimateTextTokens(e.content);
      if (Array.isArray(e.media) && e.media.length > 0) {
        rawBuckets.user_messages += e.media.length * 1024;
      }
    } else if (t === "SYSTEM_MESSAGE") {
      const txt = e.content || "";
      const est = estimateTextTokens(txt);
      if (
        txt.includes("[swarm]") ||
        txt.includes("[Message]") ||
        txt.includes("sender=") ||
        txt.includes("subagent") ||
        txt.includes("Task id")
      ) {
        rawBuckets.subagent_notice += est;
      } else {
        rawBuckets.system_prompt += est;
      }
    } else if (t === "PLANNER_RESPONSE") {
      // Do not include the very last turn's output as part of its own input context
      if (i < entries.length - 1) {
        const outTok = Number(e.output_tokens || 0);
        if (outTok > 0) {
          rawBuckets.assistant_reply += outTok;
        } else {
          rawBuckets.assistant_reply +=
            estimateTextTokens(e.content) +
            estimateTextTokens(e.thinking) +
            estimatePayloadTokens(e.tool_calls);
        }
      }
    } else if (t === "GENERIC") {
      const txt = e.content || "";
      const est = estimateTextTokens(txt);
      // Detect SKILL.md reads as skills context
      if (txt.includes("SKILL.md") || (txt.includes("---\nname:") && txt.includes("description:"))) {
        rawBuckets.skills += est;
      } else {
        rawBuckets.tool_results += est;
      }
    }
  }

  // Scale non-zero buckets smoothly so their sum matches the exact API-reported context total
  const rawSum = Object.values(rawBuckets).reduce((a, b) => a + b, 0);
  const scale = rawSum > 0 && actualContext > 0 ? actualContext / rawSum : 1;

  const categories = CATEGORY_META.map((meta) => {
    const tokens = Math.round((rawBuckets[meta.id] || 0) * scale);
    return {
      ...meta,
      tokens,
      percent: actualContext > 0 ? Number(((tokens / actualContext) * 100).toFixed(1)) : 0,
    };
  });

  // Reconcile rounding drift on the largest bucket
  const sumAfter = categories.reduce((a, c) => a + c.tokens, 0);
  if (actualContext > 0 && sumAfter !== actualContext) {
    const biggest = categories.reduce((a, b) => (b.tokens > a.tokens ? b : a), categories[0]);
    biggest.tokens = Math.max(0, biggest.tokens + (actualContext - sumAfter));
    biggest.percent = Number(((biggest.tokens / actualContext) * 100).toFixed(1));
  }

  const result = {
    conversationId: cid,
    model: lastModel,
    modelLabel: modelInfo.label,
    modelShort: modelInfo.short,
    contextTokens: actualContext,
    inputTokens: Number(lastPlanner.input_tokens || 0),
    cacheReadTokens: Number(lastPlanner.cache_read_tokens || 0),
    outputTokens: Number(lastPlanner.output_tokens || 0),
    cacheHitRate:
      actualContext > 0
        ? Number(((Number(lastPlanner.cache_read_tokens || 0) / actualContext) * 100).toFixed(1))
        : 0,
    windowLimit,
    usagePercent: Number(((actualContext / windowLimit) * 100).toFixed(1)),
    checkpointCount,
    lastUpdatedAt: lastPlanner.created_at || null,
    categories: categories.sort((a, b) => b.tokens - a.tokens),
    usedFullTranscript: targetPath === fullPath,
  };

  analysisCache.set(cid, { mtimeMs: stat.mtimeMs, size: stat.size, result });
  return result;
}
