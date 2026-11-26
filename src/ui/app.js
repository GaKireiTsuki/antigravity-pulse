import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";

// ---------------- Formatters ----------------

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtTokens(n, digits = 2) {
  const v = Number(n || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(digits)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(digits)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US");
}

function fmtCtx(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}

function fmtInt(n) {
  return Math.round(Number(n || 0)).toLocaleString("en-US");
}

function fmtUsd(v, digits = 2) {
  const n = Number(v || 0);
  if (n > 0 && n < 0.01 && digits === 2) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(digits)}`;
}

function fmtCny(usd, rate, digits = 0) {
  const n = Number(usd || 0) * Number(rate || 6.67);
  if (n > 0 && n < 1 && digits === 0) return `¥${n.toFixed(2)}`;
  return `¥${n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function fmtCost(usd, settings, digits = 2) {
  const mode = settings?.currency || "dual";
  const rate = settings?.usdToCny || 6.67;
  if (mode === "cny") return fmtCny(usd, rate, digits === 2 ? 2 : digits);
  return fmtUsd(usd, digits);
}

function fmtCostSub(usd, settings) {
  const mode = settings?.currency || "dual";
  const rate = settings?.usdToCny || 6.67;
  if (mode === "dual") return `≈ ${fmtCny(usd, rate, 0)}`;
  if (mode === "cny") return fmtUsd(usd, 2);
  return "";
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtResetIn(ms) {
  if (ms === null || ms === undefined) return "窗口空闲";
  if (ms <= 0) return "即将滑出";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}天 ${h}小时后滑出`;
  if (h > 0) return `${h}小时 ${m}分后滑出`;
  return `${Math.max(1, m)}分钟后滑出`;
}

function fmtTime(tsMs) {
  if (!tsMs) return "--";
  const d = new Date(tsMs);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${mo}-${da} ${hh}:${mm}:${ss}`;
}

function fmtTimeShort(tsMs) {
  if (!tsMs) return "--";
  const d = new Date(tsMs);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}-${da} ${hh}:${mm}`;
}

function hitClass(pct) {
  if (pct >= 85) return "hit-high";
  if (pct >= 50) return "hit-mid";
  return "hit-low";
}

// ---------------- App State ----------------

const state = {
  surface: "dashboard", // "dashboard" | "monitor"
  surfaceLockedByUser: false,
  tab: "overview", // overview | monitor | tasks | requests | errors | pricing | settings
  range: "all",
  modelFilter: "all",
  selectedCid: null,
  heatmapMetric: "tokens", // tokens | requests | cost
  modelSort: { key: "tokens", dir: "desc" },
  taskMode: "roots", // roots | sessions
  expandedRoots: new Set(),
  reqQuery: { filter: "all", search: "", page: 1 },
  liveEnabled: true,
  pollingInFlight: false,
  pollTimer: null,
  revision: null,
  snapshot: null,
  tasksData: null,
  requestsData: null,
  errorsData: null,
  isNarrow: window.innerWidth < 720,
  lastToastTimer: null,
  connected: false,
};

const app = new App({ name: "Antigravity Pulse", version: "1.0.0" }, {});

// ---------------- Toast & Tooltip ----------------

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(state.lastToastTimer);
  state.lastToastTimer = setTimeout(() => el.classList.add("hidden"), 2400);
}

function initTooltip() {
  const tip = document.getElementById("tooltip");
  if (!tip) return;
  document.addEventListener("mousemove", (ev) => {
    const target = ev.target?.closest?.("[data-tip]");
    if (!target) {
      tip.classList.add("hidden");
      return;
    }
    const raw = target.getAttribute("data-tip");
    if (!raw) {
      tip.classList.add("hidden");
      return;
    }
    tip.innerHTML = raw;
    tip.classList.remove("hidden");
    const pad = 12;
    const rect = tip.getBoundingClientRect();
    let x = ev.clientX + 14;
    let y = ev.clientY + 14;
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, ev.clientX - rect.width - 14);
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, ev.clientY - rect.height - 14);
    }
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  document.addEventListener("mouseleave", () => tip.classList.add("hidden"));
}

// ---------------- Theme Sync ----------------

function applyHostContext(ctx) {
  if (!ctx) return;
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.setAttribute("data-theme", ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
}

// ---------------- Server Calls (Single-Flight Safe) ----------------

async function callTool(name, args = {}) {
  const res = await app.callServerTool({ name, arguments: args });
  return res?.structuredContent ?? null;
}

async function fetchSnapshot(force = false) {
  if (state.pollingInFlight) return;
  state.pollingInFlight = true;
  try {
    const data = await callTool("pulse_get_snapshot", {
      range: state.range,
      model: state.modelFilter,
      conversationId: state.selectedCid || undefined,
      sinceRevision: force ? undefined : state.revision || undefined,
    });
    if (!data) return;
    if (data.unchanged) {
      updateLiveBadge(data.inflightCount || 0);
      return;
    }
    state.snapshot = data;
    state.revision = data.revision;
    if (!state.selectedCid && data.latestSession?.cid) {
      state.selectedCid = data.latestSession.cid;
    }
    // Avoid disrupting active text inputs on pricing/settings tabs during background poll
    if (!force && (state.tab === "pricing" || state.tab === "settings")) {
      updateLiveBadge(data.inflightCount || 0);
      return;
    }
    render();
    // Refresh secondary tab data if open
    if (state.tab === "tasks") fetchTasks();
    if (state.tab === "requests") fetchRequests();
    if (state.tab === "errors") fetchErrors();
  } catch (err) {
    if (force) showToast(`刷新失败: ${err?.message || err}`);
  } finally {
    state.pollingInFlight = false;
  }
}

async function fetchTasks() {
  try {
    const data = await callTool("pulse_get_tasks", { range: state.range });
    if (data) {
      state.tasksData = data;
      if (state.expandedRoots.size === 0 && data.roots?.[0]) {
        state.expandedRoots.add(data.roots[0].rootId);
      }
      render();
    }
  } catch {}
}

async function fetchRequests() {
  try {
    const data = await callTool("pulse_get_requests", {
      range: state.range,
      model: state.modelFilter,
      filter: state.reqQuery.filter,
      search: state.reqQuery.search || undefined,
      page: state.reqQuery.page,
      pageSize: 40,
    });
    if (data) {
      state.requestsData = data;
      render();
    }
  } catch {}
}

async function fetchErrors() {
  try {
    const [errPage, anomPage] = await Promise.all([
      callTool("pulse_get_requests", {
        range: state.range,
        model: state.modelFilter,
        filter: "error",
        page: 1,
        pageSize: 50,
      }),
      callTool("pulse_get_requests", {
        range: state.range,
        model: state.modelFilter,
        filter: "anomaly",
        page: 1,
        pageSize: 50,
      }),
    ]);
    state.errorsData = {
      errors: errPage?.items || [],
      stopErrors: errPage?.stopErrors || [],
      anomalies: anomPage?.items || [],
    };
    render();
  } catch {}
}

async function saveSettings(patch, toastMsg = "设置已保存并重新计算") {
  try {
    const res = await callTool("pulse_update_settings", { action: "save", settings: patch });
    if (res?.snapshot) {
      state.snapshot = res.snapshot;
      state.revision = res.snapshot.revision;
      restartPollTimer();
      render();
    }
    showToast(toastMsg);
  } catch (err) {
    showToast(`保存失败: ${err?.message || err}`);
  }
}

function updateLiveBadge(inflightCount) {
  const dot = document.querySelector(".brand-dot");
  const chip = document.querySelector(".status-chip");
  if (dot) {
    dot.classList.toggle("live", state.liveEnabled);
    dot.classList.toggle("idle", !state.liveEnabled);
  }
  if (chip) {
    chip.classList.toggle("running", inflightCount > 0);
    chip.textContent = inflightCount > 0 ? `${inflightCount} 运行中` : "实时就绪";
  }
}

function restartPollTimer() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  const interval = Number(state.snapshot?.settings?.pollIntervalMs ?? 2500);
  if (!state.liveEnabled || interval <= 0) return;
  state.pollTimer = setInterval(() => {
    if (document.visibilityState === "visible" && state.connected) {
      fetchSnapshot(false);
    }
  }, Math.max(1500, interval));
}

// ---------------- Pure SVG Chart Renderers ----------------

function renderSparkline(values, color = "var(--accent)") {
  if (!values || values.length < 2) return "";
  const w = 180;
  const h = 30;
  const max = Math.max(...values, 1e-6);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = h - 3 - (v / max) * (h - 7);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const areaD = `${lineD} L${w},${h} L0,${h} Z`;
  return `
    <svg class="spark-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${areaD}" fill="${color}" fill-opacity="0.12"></path>
      <path d="${lineD}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function renderHeatmap(days, metric, settings) {
  if (!days || days.length === 0) return `<div class="empty-state">暂无历史用量数据</div>`;

  const vals = days.map((d) => (metric === "cost" ? d.cost : metric === "requests" ? d.requests : d.tokens));
  const nonZero = vals.filter((v) => v > 0).sort((a, b) => a - b);
  const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 0;
  const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || 0;
  const q3 = nonZero[Math.floor(nonZero.length * 0.8)] || 0;

  const levelOf = (v) => {
    if (v <= 0) return 0;
    if (nonZero.length < 4) return v > 0 ? 4 : 0;
    if (v <= q1) return 1;
    if (v <= q2) return 2;
    if (v <= q3) return 3;
    return 4;
  };

  const cell = 11;
  const gap = 3;
  const pitch = cell + gap;
  const weeks = Math.ceil(days.length / 7);
  const width = weeks * pitch + 4;
  const height = 7 * pitch + 20;

  let rects = "";
  let monthLabels = "";
  let lastMonth = "";
  const labelPositions = [];

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const col = Math.floor(i / 7);
    const row = i % 7;
    const x = col * pitch + 2;
    const y = row * pitch + 2;
    const v = vals[i];
    const lvl = levelOf(v);

    const tip = esc(
      `<strong>${d.date}</strong><br/>Token: ${fmtTokens(d.tokens)}<br/>请求: ${fmtInt(d.requests)} 次<br/>缓存命中: ${d.cacheHitRate}%<br/>费用: ${fmtCost(d.cost, settings)}`
    );
    rects += `<rect class="heat-cell" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="var(--heat-${lvl})" data-tip="${tip}"></rect>`;

    if (row === 0) {
      const mKey = d.date.slice(0, 7);
      if (mKey !== lastMonth) {
        lastMonth = mKey;
        const shortM = `${d.date.slice(5, 7)}/${d.date.slice(8, 10)}`;
        if (labelPositions.length === 0 || x - labelPositions[labelPositions.length - 1] >= 44) {
          labelPositions.push(x);
          monthLabels += `<text x="${x}" y="${7 * pitch + 15}" fill="var(--fg-muted)" font-size="10">${shortM}</text>`;
        }
      }
    }
  }

  return `
    <div class="heatmap-wrap">
      <svg class="heatmap-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="53周用量热力图">
        ${rects}
        ${monthLabels}
      </svg>
    </div>
    <div class="heatmap-legend">
      <span>过去 53 周按日分布（本地时区）</span>
      <span class="heat-scale">
        <span>少</span>
        <i class="heat-swatch" style="background:var(--heat-0)"></i>
        <i class="heat-swatch" style="background:var(--heat-1)"></i>
        <i class="heat-swatch" style="background:var(--heat-2)"></i>
        <i class="heat-swatch" style="background:var(--heat-3)"></i>
        <i class="heat-swatch" style="background:var(--heat-4)"></i>
        <span>多</span>
      </span>
    </div>
  `;
}

function renderDonut(models, valueKey, centerVal, centerLabel, settings) {
  const r = 64;
  const cx = 88;
  const cy = 88;
  const circ = 2 * Math.PI * r;
  const total = models.reduce((s, m) => s + Number(m[valueKey] || 0), 0);

  let segs = "";
  if (total <= 0) {
    segs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-elevated)" stroke-width="20"></circle>`;
  } else {
    let offset = 0;
    for (const m of models) {
      const val = Number(m[valueKey] || 0);
      if (val <= 0) continue;
      const frac = val / total;
      const dash = Math.max(2, frac * circ);
      const pct = (frac * 100).toFixed(1);
      const valStr = valueKey === "costUsd" ? fmtCost(val, settings) : fmtTokens(val);
      const tip = esc(`<strong>${m.label}</strong><br/>${valStr} (${pct}%)`);
      segs += `<circle class="donut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${m.color}" stroke-width="20" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" data-tip="${tip}"></circle>`;
      offset += frac * circ;
    }
  }

  return `
    <div class="donut-box">
      <svg class="donut-svg" viewBox="0 0 176 176" role="img" aria-label="${esc(centerLabel)}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-elevated)" stroke-width="20"></circle>
        ${segs}
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-center-val num">${esc(centerVal)}</text>
        <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-center-lbl">${esc(centerLabel)}</text>
      </svg>
    </div>
  `;
}

// ---------------- Section Renderers ----------------

function renderMonitorContent(snap, compactMode) {
  const ls = snap.latestSession;
  const ctx = ls?.context;
  const k = snap.kpi;
  const s = snap.settings;
  const sub = snap.subscription;
  const rw = snap.rollingWindows;

  const sessionOptions = (snap.recentSessions || [])
    .map((item) => {
      const sel = item.cid === ls?.cid ? "selected" : "";
      const prefix = item.isRunning ? "● " : item.depth > 0 ? "↳ " : "";
      const label = `${prefix}${item.title.slice(0, 28)} (${fmtTokens(item.tokens, 1)})`;
      return `<option value="${esc(item.cid)}" ${sel}>${esc(label)}</option>`;
    })
    .join("");

  // 4 Mini KPI Cards (Figure 1 top)
  const latestTpsStr = ls?.lastStepTps ? `${ls.lastStepTps} tok/s` : k.avgTps ? `${k.avgTps} tok/s` : "待采样";
  const latestModelShort = ctx?.modelShort || ls?.cid?.slice(0, 8) || "--";
  const durStr = ls?.lastStepDurationMs ? fmtDuration(ls.lastStepDurationMs) : fmtDuration(k.avgDurationMs);
  const avgDurStr = ls?.avgDurationMs
    ? `均值 ${fmtDuration(ls.avgDurationMs)}`
    : k.timedCount > 0
      ? `全局均值 ${fmtDuration(k.avgDurationMs)}`
      : "新请求由 Hooks 自动记录";
  const avgTpsStr = ls?.avgTps ? `${ls.avgTps} tok/s` : k.avgTps ? `${k.avgTps} tok/s` : "--";
  const avgTpsSub =
    ls?.timedSteps > 0
      ? `有效 ${ls.timedSteps}/${ls.steps} 步`
      : k.timedCount > 0
        ? `全局有效 ${k.timedCount} 步`
        : "安装后新调用自动统计";

  const stepCostStr = ls ? fmtCost(ls.lastStepCostUsd, s, 3) : "--";
  const cumCostSub = ls
    ? `本会话 ${fmtCost(ls.sessionCostUsd, s)} · 总 ${fmtCost(k.allTimeCostUsd, s)}`
    : `总计 ${fmtCost(k.allTimeCostUsd, s)}`;

  const kpiCardsHtml = `
    <div class="monitor-grid">
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>输出速度</span><span>⚡</span></div>
        <div class="mini-kpi-val cyan num">${esc(latestTpsStr)}</div>
        <div class="mini-kpi-sub">${esc(latestModelShort)}</div>
      </div>
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>请求耗时</span><span>⏱</span></div>
        <div class="mini-kpi-val num">${esc(durStr)}</div>
        <div class="mini-kpi-sub">${esc(avgDurStr)}</div>
      </div>
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>平均速度</span><span>〰</span></div>
        <div class="mini-kpi-val green num">${esc(avgTpsStr)}</div>
        <div class="mini-kpi-sub">${esc(avgTpsSub)}</div>
      </div>
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>本次费用</span><span>✦</span></div>
        <div class="mini-kpi-val num">${esc(stepCostStr)}</div>
        <div class="mini-kpi-sub">${esc(cumCostSub)}</div>
      </div>
    </div>
  `;

  // Context Window Card (Figure 1 middle)
  let ctxCardHtml = `<div class="card"><div class="empty-state">暂无可分析的对话上下文</div></div>`;
  if (ctx) {
    const barSegs = ctx.categories
      .filter((c) => c.tokens > 0)
      .map((c) => {
        const wPct = ctx.contextTokens > 0 ? (c.tokens / ctx.contextTokens) * 100 : 0;
        const tip = esc(`<strong>${c.label}</strong><br/>${fmtInt(c.tokens)} tokens (${c.percent}%)`);
        return `<div class="ctx-seg" style="width:${wPct.toFixed(2)}%;background:${c.color}" data-tip="${tip}"></div>`;
      })
      .join("");

    const catItems = ctx.categories
      .map(
        (c) => `
        <div class="ctx-item">
          <div class="ctx-item-left">
            <span class="ctx-sq" style="background:${c.color}"></span>
            <span>${esc(c.label)}</span>
          </div>
          <span class="ctx-item-val num">${esc(fmtCtx(c.tokens))}</span>
        </div>
      `
      )
      .join("");

    const pctBadgeCls = ctx.usagePercent >= 85 ? "err" : ctx.usagePercent >= 65 ? "warn" : "info";
    ctxCardHtml = `
      <div class="card">
        <div class="card-head">
          <div class="card-title">
            <span>上下文窗口</span>
            <span class="badge ${pctBadgeCls} num">${ctx.usagePercent}%</span>
            <span class="badge ok num">缓存 ${ctx.cacheHitRate}%</span>
            ${ctx.checkpointCount > 0 ? `<span class="badge neutral num">压缩 ${ctx.checkpointCount}次</span>` : ""}
          </div>
          <div class="card-sub num">${fmtCtx(ctx.contextTokens)} / ${fmtCtx(ctx.windowLimit)}</div>
        </div>
        <div class="ctx-bar">${barSegs}</div>
        <div class="ctx-list">${catItems}</div>
        <div class="note-box">
          总上下文 (${fmtInt(ctx.contextTokens)}) 为 API 实测精确值；各分类基于本地 ${ctx.usedFullTranscript ? "完整对话日志" : "精简日志"} 占比归一化拆解。
        </div>
      </div>
    `;
  }

  // Rolling Windows + Subscription ROI Card (Figure 1 bottom)
  const renderWindowRow = (title, w, isClaude = false) => {
    const fillCls =
      w.pct >= 90 ? "danger" : w.pct >= 70 ? "warn" : isClaude ? "claude" : "";
    const metricText = `${fmtTokens(w.tokens, 1)} (${fmtCost(w.costUsd, s)})`;
    const rightText = `${fmtResetIn(w.resetInMs)} · 占参考预算 ${w.pct}%`;
    return `
      <div>
        <div class="window-row-head">
          <div>
            <span class="window-name">${esc(title)}</span>
            <span class="window-metric num">· ${esc(metricText)}</span>
          </div>
          <div class="window-right num">${esc(rightText)}</div>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${fillCls}" style="width:${Math.max(w.tokens > 0 ? 2 : 0, w.pct)}%"></div>
        </div>
      </div>
    `;
  };

  const quotaHintsHtml = (snap.quotaHints || []).length
    ? `<div class="note-box">
        <strong>日志捕获的近期官方配额提示：</strong>
        ${snap.quotaHints
          .map(
            (q) =>
              `<span class="badge warn" style="margin-left:6px">${esc(q.modelLabel)} 剩余 ${q.remainingPct}% (${esc(fmtTimeShort(Date.parse(q.resetsAt)))} 重置)</span>`
          )
          .join("")}
      </div>`
    : "";

  const roiHtml = sub?.enabled
    ? `
      <div class="roi-banner">
        <div>
          <div style="font-size:12px;color:var(--fg-secondary)">${esc(sub.planName)} (${fmtUsd(sub.monthlyUsd, 0)}/月) 回本进度</div>
          <div style="font-size:12px;color:var(--fg-muted);margin-top:2px">
            等价 API ${fmtCost(sub.refCostUsd, s)} ${fmtCostSub(sub.refCostUsd, s)} · 净省 ${fmtCost(Math.max(0, sub.netSavedUsd), s)} · 折合 ${((sub.effectiveDiscountPct || 0) / 10).toFixed(1)} 折
          </div>
        </div>
        <div class="roi-big num">${sub.roiMultiplier}x</div>
      </div>
    `
    : "";

  const quotaCardHtml = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">本地滚动消耗 & 订阅回本</div>
        <div class="card-sub">${esc(sub?.tierBadge || "Local Telemetry")}</div>
      </div>
      ${roiHtml}
      <div class="window-list">
        ${renderWindowRow("5h (Gemini)", rw.gemini5h, false)}
        ${renderWindowRow("7天 (Gemini)", rw.gemini7d, false)}
        ${renderWindowRow("5h (Claude)", rw.claude5h, true)}
        ${renderWindowRow("7天 (Claude)", rw.claude7d, true)}
      </div>
      ${quotaHintsHtml}
      <div class="note-box">
        注：进度条基于本地实际消耗相对自定义参考预算（可在「设置」调整），官方未向本地插件开放服务端实时剩余百分比接口。
      </div>
    </div>
  `;

  const switcherHtml = `
    <div class="filter-bar" style="margin-bottom:10px">
      <div class="filter-group" style="flex:1;min-width:0">
        <select class="select-pill" data-action="select-session" style="max-width:100%;flex:1">
          ${sessionOptions || `<option value="">暂无会话</option>`}
        </select>
      </div>
      ${
        compactMode
          ? `<button class="btn primary sm" data-action="switch-surface" data-val="dashboard">完整看板 →</button>`
          : ""
      }
    </div>
  `;

  if (compactMode) {
    return `${switcherHtml}${kpiCardsHtml}${ctxCardHtml}${quotaCardHtml}`;
  }
  return `
    ${switcherHtml}
    ${kpiCardsHtml}
    <div class="two-col">
      <div>${ctxCardHtml}</div>
      <div>${quotaCardHtml}</div>
    </div>
  `;
}

function renderOverviewTab(snap) {
  const k = snap.kpi;
  const s = snap.settings;
  const sub = snap.subscription;
  const models = snap.models || [];

  // Top 4 KPI cards with sparklines (Figure 2 upgraded with Ultra ROI)
  const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div>
          <div class="kpi-label"><span>请求次数</span><span>⇄</span></div>
          <div class="kpi-value num">${fmtInt(k.requests)}</div>
          <div class="kpi-meta">
            <span class="dot-ok">● ${fmtInt(k.successCount)} 成功</span>
            <span class="dot-err">● ${fmtInt(k.errorCount)} 错误</span>
            ${k.anomalyCount > 0 ? `<span class="dot-warn">● ${fmtInt(k.anomalyCount)} 掉缓存</span>` : ""}
          </div>
        </div>
        <div class="spark-wrap">${renderSparkline(snap.sparklines.requests, "var(--accent)")}</div>
      </div>

      <div class="kpi-card">
        <div>
          <div class="kpi-label"><span>累计 Token</span><span>◫</span></div>
          <div class="kpi-value num">${fmtTokens(k.totalTokens)}</div>
          <div class="kpi-meta">
            <span>${fmtTokens(k.inputTokens + k.cacheReadTokens)} 输入 / ${fmtTokens(k.outputTokens)} 输出</span>
            <span class="${hitClass(k.cacheHitRate)}">缓存命中 ${k.cacheHitRate}%</span>
          </div>
        </div>
        <div class="spark-wrap">${renderSparkline(snap.sparklines.tokens, "var(--cyan)")}</div>
      </div>

      <div class="kpi-card">
        <div>
          <div class="kpi-label"><span>折合 API 费用</span><span>🧾</span></div>
          <div class="kpi-value num">
            ${esc(fmtCost(k.costUsd, s))}
            ${fmtCostSub(k.costUsd, s) ? `<span class="sub-val">${esc(fmtCostSub(k.costUsd, s))}</span>` : ""}
          </div>
          <div class="kpi-meta">
            <span>单次均价 ${esc(fmtCost(k.avgStepCostUsd, s, 3))}</span>
            <span>缓存省 ${esc(fmtCost(k.cacheSavedUsd, s, 0))}</span>
          </div>
        </div>
        <div class="spark-wrap">${renderSparkline(snap.sparklines.cost, "var(--green)")}</div>
      </div>

      <div class="kpi-card">
        <div>
          <div class="kpi-label">
            <span>${esc(sub?.enabled ? `${sub.planName} 回本` : "生成速度")}</span>
            <span>${sub?.enabled ? "★" : "⚡"}</span>
          </div>
          ${
            sub?.enabled
              ? `
                <div class="kpi-value num" style="color:var(--green)">
                  ${sub.roiMultiplier}x
                  <span class="sub-val">${esc(fmtUsd(sub.monthlyUsd, 0))}/月</span>
                </div>
                <div class="kpi-meta">
                  <span>净省 ${esc(fmtCost(Math.max(0, sub.netSavedUsd), s, 0))}</span>
                  <span>相当于 ${((sub.effectiveDiscountPct || 0) / 10).toFixed(1)} 折</span>
                </div>
              `
              : `
                <div class="kpi-value num">${k.avgTps ? `${k.avgTps}` : "--"} <span class="sub-val">tok/s</span></div>
                <div class="kpi-meta"><span>峰值 ${k.peakTps ? `${k.peakTps} tok/s` : "--"} · 采样 ${k.timedCount} 步</span></div>
              `
          }
        </div>
        <div style="margin-top:10px">
          <div class="bar-track">
            <div class="bar-fill roi" style="width:${Math.min(100, Math.round((sub?.roiMultiplier || 0) * 20))}%"></div>
          </div>
          <div style="font-size:11px;color:var(--fg-muted);margin-top:4px">
            折合实际均价 ${fmtUsd(sub?.actualPerMillionUsd || 0, 3)} / 1M Tokens
          </div>
        </div>
      </div>
    </div>
  `;

  // Heatmap Card (Figure 2 middle)
  const heatmapCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">用量热力图</div>
        <div class="seg-switch">
          <button class="seg-btn ${state.heatmapMetric === "tokens" ? "active" : ""}" data-action="heat-metric" data-val="tokens">Token</button>
          <button class="seg-btn ${state.heatmapMetric === "requests" ? "active" : ""}" data-action="heat-metric" data-val="requests">请求</button>
          <button class="seg-btn ${state.heatmapMetric === "cost" ? "active" : ""}" data-action="heat-metric" data-val="cost">费用</button>
        </div>
      </div>
      ${renderHeatmap(snap.heatmap, state.heatmapMetric, s)}
    </div>
  `;

  // Health Timeline Card (Figure 2 bottom)
  const healthRows = models
    .slice(0, 8)
    .map((m) => {
      const slotsHtml = (m.healthSlots || [])
        .map((sl) => {
          const tip =
            sl.state === "empty"
              ? "无请求"
              : esc(
                  `<strong>${m.label}</strong><br/>请求: ${sl.count} 次<br/>错误: ${sl.errors} · 掉缓存: ${sl.anomalies}${sl.ts ? `<br/>${fmtTimeShort(sl.ts)}` : ""}`
                );
          return `<div class="health-slot ${sl.state}" data-tip="${tip}"></div>`;
        })
        .join("");
      return `
        <div class="health-row">
          <div class="health-model" title="${esc(m.label)}">
            <span class="model-dot" style="background:${m.color}"></span>
            <span>${esc(m.short)}</span>
          </div>
          <div class="health-slots">${slotsHtml}</div>
          <div class="health-pct num">${m.successRate}%</div>
        </div>
      `;
    })
    .join("");

  const healthCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">模型健康时间线</div>
        <div class="card-sub num">${k.successRate}% 成功${k.anomalyCount > 0 ? ` · ${k.anomalyCount} 次短间隔掉缓存(黄)` : ""}</div>
      </div>
      <div class="health-rows">
        ${healthRows || `<div class="empty-state">当前范围内无请求记录</div>`}
      </div>
    </div>
  `;

  // Dual Donut Distribution Card (Figure 3 top)
  const donutCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">用量分布</div>
        <div class="card-sub">${models.length} 个模型</div>
      </div>
      <div class="donuts-row">
        ${renderDonut(models, "tokens", fmtTokens(k.totalTokens), "Token", s)}
        ${renderDonut(models, "costUsd", fmtCost(k.costUsd, s), s.currency === "cny" ? "费用 (CNY)" : "费用 (USD)", s)}
      </div>
      <table class="legend-table">
        <thead>
          <tr>
            <th>模型</th>
            <th class="r">Token</th>
            <th class="r">占比</th>
            <th class="r">费用</th>
          </tr>
        </thead>
        <tbody>
          ${
            models
              .map(
                (m) => `
              <tr>
                <td>
                  <span class="model-dot" style="background:${m.color};margin-right:7px"></span>
                  <strong>${esc(m.label)}</strong>
                  <span style="color:var(--fg-muted);font-size:11px;margin-left:5px">${esc(m.short)}</span>
                </td>
                <td class="r num">${fmtTokens(m.tokens)}</td>
                <td class="r num" style="color:var(--fg-muted)">${m.shareTokens}%</td>
                <td class="r num">
                  ${esc(fmtCost(m.costUsd, s))}
                  ${s.currency === "dual" ? `<span style="color:var(--fg-muted);font-size:11px;margin-left:4px">(${fmtCny(m.costUsd, s.usdToCny, 0)})</span>` : ""}
                </td>
              </tr>
            `
              )
              .join("") || `<tr><td colspan="4" class="empty-state">暂无数据</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;

  // Sortable Model Table (Figure 3 bottom)
  const sortKey = state.modelSort.key;
  const sortDir = state.modelSort.dir === "asc" ? 1 : -1;
  const sortedModels = [...models].sort((a, b) => {
    const av = a[sortKey] ?? -1;
    const bv = b[sortKey] ?? -1;
    return (av - bv) * sortDir;
  });
  const thArrow = (key) => (sortKey === key ? (state.modelSort.dir === "asc" ? " ↑" : " ↓") : "");

  const modelTableCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">模型数据</div>
        <div class="card-sub">点击列头可排序 · 速度由 Hooks 自动采集</div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>模型</th>
              <th class="r sortable" data-action="sort-model" data-val="requests">请求次数${thArrow("requests")}</th>
              <th class="r sortable" data-action="sort-model" data-val="tokens">Token${thArrow("tokens")}</th>
              <th class="r sortable" data-action="sort-model" data-val="inputTokens">新增输入${thArrow("inputTokens")}</th>
              <th class="r sortable" data-action="sort-model" data-val="cacheHitRate">缓存命中${thArrow("cacheHitRate")}</th>
              <th class="r sortable" data-action="sort-model" data-val="costUsd">费用${thArrow("costUsd")}</th>
              <th class="r sortable" data-action="sort-model" data-val="avgTps">平均速度${thArrow("avgTps")}</th>
              <th class="r sortable" data-action="sort-model" data-val="peakTps">峰值速度${thArrow("peakTps")}</th>
            </tr>
          </thead>
          <tbody>
            ${
              sortedModels
                .map(
                  (m) => `
                <tr>
                  <td>
                    <span class="model-dot" style="background:${m.color};margin-right:7px"></span>
                    <strong>${esc(m.label)}</strong>
                  </td>
                  <td class="r num">${fmtInt(m.requests)}</td>
                  <td class="r num">${fmtTokens(m.tokens)}</td>
                  <td class="r num" style="color:var(--fg-secondary)">${fmtTokens(m.inputTokens)}</td>
                  <td class="r num ${hitClass(m.cacheHitRate)}">${m.cacheHitRate}%</td>
                  <td class="r num">${esc(fmtCost(m.costUsd, s))}</td>
                  <td class="r num">${m.avgTps ? `${m.avgTps} tok/s` : "--"}</td>
                  <td class="r num">${m.peakTps ? `${m.peakTps} tok/s` : "--"}</td>
                </tr>
              `
                )
                .join("") || `<tr><td colspan="8" class="empty-state">暂无模型调用记录</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  return `${kpiHtml}${heatmapCard}${healthCard}${donutCard}${modelTableCard}`;
}

function renderTasksTab(snap) {
  const s = snap.settings;
  const data = state.tasksData;
  if (!data) return `<div class="card"><div class="empty-state">正在加载任务与 Swarm 树...</div></div>`;

  const modeSwitch = `
    <div class="card-head">
      <div class="card-title">任务与 Swarm 消耗归并</div>
      <div class="seg-switch">
        <button class="seg-btn ${state.taskMode === "roots" ? "active" : ""}" data-action="task-mode" data-val="roots">按主任务归并 (${data.roots.length})</button>
        <button class="seg-btn ${state.taskMode === "sessions" ? "active" : ""}" data-action="task-mode" data-val="sessions">全部会话 (${data.sessions.length})</button>
      </div>
    </div>
  `;

  if (state.taskMode === "roots") {
    const cards = data.roots
      .map((r) => {
        const open = state.expandedRoots.has(r.rootId);
        const childHtml = open
          ? `<div class="task-children">
              ${r.children
                .map(
                  (c) => `
                  <div class="child-row">
                    <div class="task-title-col">
                      <span class="model-dot" style="background:${c.primaryModelColor}"></span>
                      <span style="color:var(--fg-secondary)">${c.depth > 0 ? "↳ " : "★ "}${esc(c.displayTitle)}</span>
                      <span class="badge neutral">${esc(c.primaryModel)}</span>
                      ${c.anomalies > 0 ? `<span class="badge warn">${c.anomalies} 掉缓存</span>` : ""}
                    </div>
                    <div class="task-stats num">
                      <span>${fmtInt(c.steps)} 步</span>
                      <span>${fmtTokens(c.tokens)}</span>
                      <span class="${hitClass(c.cacheHitRate)}">${c.cacheHitRate}%</span>
                      <strong>${esc(fmtCost(c.costUsd, s))}</strong>
                      <button class="btn sm" data-action="inspect-context" data-val="${esc(c.cid)}">上下文</button>
                    </div>
                  </div>
                `
                )
                .join("")}
            </div>`
          : "";

        return `
          <div class="task-card">
            <div class="task-header" data-action="toggle-root" data-val="${esc(r.rootId)}">
              <div class="task-title-col">
                <span style="color:var(--fg-muted);width:14px">${open ? "▾" : "▸"}</span>
                <span class="task-title" title="${esc(r.title)}">${esc(r.title)}</span>
                ${r.sessionCount > 1 ? `<span class="badge info num">${r.sessionCount} 会话 / Swarm</span>` : ""}
                <span style="font-size:11px;color:var(--fg-muted)">${fmtTimeShort(r.firstTs)} ~ ${fmtTimeShort(r.lastTs)}</span>
              </div>
              <div class="task-stats num">
                <span>${fmtInt(r.steps)} 步</span>
                <span>${fmtTokens(r.tokens)}</span>
                <span class="${hitClass(r.cacheHitRate)}">缓存 ${r.cacheHitRate}%</span>
                <strong>${esc(fmtCost(r.costUsd, s))}</strong>
              </div>
            </div>
            ${childHtml}
          </div>
        `;
      })
      .join("");
    return `<div class="card">${modeSwitch}${cards || `<div class="empty-state">暂无任务</div>`}</div>`;
  }

  // Flat sessions table
  const rows = data.sessions
    .map(
      (c) => `
      <tr>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${esc(c.displayTitle)}">
          ${c.depth > 0 ? `<span style="color:var(--fg-muted)">↳ </span>` : ""}
          <strong>${esc(c.displayTitle)}</strong>
        </td>
        <td><span class="model-dot" style="background:${c.primaryModelColor};margin-right:6px"></span>${esc(c.primaryModel)}</td>
        <td class="r num">${fmtInt(c.steps)}</td>
        <td class="r num">${fmtTokens(c.tokens)}</td>
        <td class="r num ${hitClass(c.cacheHitRate)}">${c.cacheHitRate}%</td>
        <td class="r num">${esc(fmtCost(c.costUsd, s))}</td>
        <td class="r num" style="color:var(--fg-muted)">${fmtTimeShort(c.lastTs)}</td>
        <td class="r"><button class="btn sm" data-action="inspect-context" data-val="${esc(c.cid)}">上下文</button></td>
      </tr>
    `
    )
    .join("");

  return `
    <div class="card">
      ${modeSwitch}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>会话</th>
              <th>主模型</th>
              <th class="r">步数</th>
              <th class="r">Token</th>
              <th class="r">缓存命中</th>
              <th class="r">费用</th>
              <th class="r">最后活跃</th>
              <th class="r">操作</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="8" class="empty-state">暂无会话</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRequestsTab(snap) {
  const s = snap.settings;
  const data = state.requestsData;
  const q = state.reqQuery;

  const toolbar = `
    <div class="filter-bar" style="margin-bottom:12px">
      <div class="seg-switch">
        <button class="seg-btn ${q.filter === "all" ? "active" : ""}" data-action="req-filter" data-val="all">全部</button>
        <button class="seg-btn ${q.filter === "anomaly" ? "active" : ""}" data-action="req-filter" data-val="anomaly">短间隔掉缓存</button>
        <button class="seg-btn ${q.filter === "checkpoint" ? "active" : ""}" data-action="req-filter" data-val="checkpoint">上下文压缩</button>
        <button class="seg-btn ${q.filter === "error" ? "active" : ""}" data-action="req-filter" data-val="error">错误</button>
      </div>
      <div class="filter-group">
        <input class="text-input" id="req-search" type="search" placeholder="搜索会话标题 / 模型..." value="${esc(q.search)}" style="width:200px" />
        <button class="btn sm" data-action="req-search-go">筛选</button>
      </div>
    </div>
  `;

  if (!data) return `<div class="card">${toolbar}<div class="empty-state">正在加载请求流水...</div></div>`;

  const rows = data.items
    .map((r) => {
      const tags = [];
      if (r.status !== "DONE") tags.push(`<span class="badge err">${esc(r.status)}</span>`);
      if (r.cacheAnomaly) tags.push(`<span class="badge err" title="短间隔缓存暴跌">掉缓存</span>`);
      if (r.type === "CHECKPOINT") tags.push(`<span class="badge warn">压缩</span>`);
      if (tags.length === 0) tags.push(`<span class="badge ok">正常</span>`);
      return `
        <tr>
          <td class="num" style="color:var(--fg-muted)">${fmtTime(r.tsMs)}</td>
          <td style="max-width:190px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.title)}">${esc(r.title)}</td>
          <td><span class="model-dot" style="background:${r.modelColor};margin-right:6px"></span>${esc(r.modelShort)}</td>
          <td class="r num">${fmtTokens(r.inputTokens, 1)}</td>
          <td class="r num" style="color:var(--fg-secondary)">${fmtTokens(r.cacheReadTokens, 1)}</td>
          <td class="r num">${fmtTokens(r.outputTokens, 1)}</td>
          <td class="r num ${hitClass(r.cacheHitRate)}">${r.cacheHitRate}%</td>
          <td class="r num">${esc(fmtCost(r.costUsd, s, 4))}</td>
          <td class="r num" style="color:var(--fg-secondary)">${r.tps ? `${r.tps} t/s` : r.durationMs ? fmtDuration(r.durationMs) : "--"}</td>
          <td>${tags.join(" ")}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="card">
      ${toolbar}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>会话</th>
              <th>模型</th>
              <th class="r">新增输入</th>
              <th class="r">缓存读</th>
              <th class="r">输出</th>
              <th class="r">命中率</th>
              <th class="r">费用</th>
              <th class="r">速度</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="10" class="empty-state">没有匹配的请求记录</td></tr>`}</tbody>
        </table>
      </div>
      <div class="pager">
        <span class="num">共 ${fmtInt(data.total)} 条记录 · 第 ${data.page} / ${data.totalPages} 页</span>
        <div class="filter-group">
          <button class="btn sm" data-action="req-page" data-val="${Math.max(1, data.page - 1)}" ${data.page <= 1 ? "disabled" : ""}>上一页</button>
          <button class="btn sm" data-action="req-page" data-val="${Math.min(data.totalPages, data.page + 1)}" ${data.page >= data.totalPages ? "disabled" : ""}>下一页</button>
        </div>
      </div>
    </div>
  `;
}

function renderErrorsTab(snap) {
  const s = snap.settings;
  const data = state.errorsData;
  if (!data) return `<div class="card"><div class="empty-state">正在加载异常诊断...</div></div>`;

  const errRows = data.errors
    .map(
      (r) => `
      <tr>
        <td class="num" style="color:var(--fg-muted)">${fmtTime(r.tsMs)}</td>
        <td>${esc(r.title)}</td>
        <td>${esc(r.modelLabel)}</td>
        <td><span class="badge err">${esc(r.status)}</span></td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;color:var(--fg-secondary)">${esc(r.error || "执行中断或模型返回错误")}</td>
      </tr>
    `
    )
    .join("");

  const anomRows = data.anomalies
    .map(
      (r) => `
      <tr>
        <td class="num" style="color:var(--fg-muted)">${fmtTime(r.tsMs)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</td>
        <td>${esc(r.modelShort)}</td>
        <td class="r num">${fmtTokens(r.prevContextTokens, 1)}</td>
        <td class="r num" style="color:var(--red)">${fmtTokens(r.inputTokens, 1)}</td>
        <td class="r num">${fmtTokens(r.cacheReadTokens, 1)}</td>
        <td class="r num">${esc(fmtCost(r.costUsd, s, 4))}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div class="card">
      <div class="card-head">
        <div class="card-title">错误事件 (${data.errors.length + data.stopErrors.length})</div>
        <button class="btn sm" data-action="copy-diagnostics">复制诊断摘要</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>时间</th><th>会话</th><th>模型</th><th>状态</th><th>错误信息</th></tr></thead>
          <tbody>${errRows || `<tr><td colspan="5" class="empty-state">当前范围内未发现报错请求 🎉</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">短间隔异常掉缓存 (${data.anomalies.length})</div>
        <div class="card-sub">排除冷启动与压缩，捕获 4 分钟内缓存命中突降 &gt;50% 的调用</div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>会话</th>
              <th>模型</th>
              <th class="r">上步上下文</th>
              <th class="r">本步重算输入</th>
              <th class="r">本步缓存读</th>
              <th class="r">本步费用</th>
            </tr>
          </thead>
          <tbody>${anomRows || `<tr><td colspan="7" class="empty-state">未检测到异常掉缓存记录</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPricingTab(snap) {
  const s = snap.settings;
  const sub = s.subscription || {};
  const catalog = snap.pricingCatalog || [];

  const rows = catalog
    .map((m) => {
      const phaseNote = m.phases?.length
        ? `<span class="badge info" style="margin-left:6px">含定时调价</span>`
        : m.isCustom
          ? `<span class="badge warn" style="margin-left:6px">已自定义</span>`
          : "";
      return `
        <tr data-model-price-row="${esc(m.key)}">
          <td>
            <span class="model-dot" style="background:${m.color};margin-right:7px"></span>
            <strong>${esc(m.label)}</strong>
            ${phaseNote}
          </td>
          <td style="color:var(--fg-muted)">${esc(m.family)}</td>
          <td class="r"><input class="num-input num" type="number" step="0.01" data-field="input" value="${m.input}" /></td>
          <td class="r"><input class="num-input num" type="number" step="0.005" data-field="cache" value="${m.cache}" /></td>
          <td class="r"><input class="num-input num" type="number" step="0.01" data-field="output" value="${m.output}" /></td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="card">
      <div class="card-head">
        <div class="card-title">订阅计划 & 汇率设置</div>
        <button class="btn solid sm" data-action="save-sub-pricing">保存并实时重算</button>
      </div>
      <div class="form-grid">
        <div class="field">
          <label>订阅名称</label>
          <input class="text-input" id="sub-plan-name" value="${esc(sub.planName || "Google AI Ultra")}" />
        </div>
        <div class="field">
          <label>档位徽章</label>
          <input class="text-input" id="sub-tier-badge" value="${esc(sub.tierBadge || "Ultra · 5x")}" />
        </div>
        <div class="field">
          <label>月费 (USD)</label>
          <input class="text-input num" id="sub-monthly-usd" type="number" step="1" value="${sub.monthlyUsd ?? 99}" />
        </div>
        <div class="field">
          <label>USD → CNY 参考汇率</label>
          <input class="text-input num" id="cfg-fx" type="number" step="0.01" value="${s.usdToCny ?? 6.67}" />
        </div>
        <div class="field">
          <label>Claude 缓存写倍率</label>
          <select class="select-pill" id="cfg-claude-mult">
            <option value="1.25" ${Number(s.claudeCacheWriteMultiplier) === 1.25 ? "selected" : ""}>1.25x (5分钟 Prompt Cache 写)</option>
            <option value="1" ${Number(s.claudeCacheWriteMultiplier) === 1 ? "selected" : ""}>1.0x (按基础输入价估算)</option>
          </select>
        </div>
        <div class="field">
          <label>每月账单日 (1-28)</label>
          <input class="text-input num" id="sub-billing-day" type="number" min="1" max="28" value="${sub.billingDay ?? 1}" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">模型参考单价（美元 / 百万 Tokens）</div>
        <div class="filter-group">
          <button class="btn sm" data-action="reset-pricing">恢复官方默认价</button>
          <button class="btn solid sm" data-action="save-sub-pricing">保存单价</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>模型</th>
              <th>系列</th>
              <th class="r">输入 ($/1M)</th>
              <th class="r">缓存读 ($/1M)</th>
              <th class="r">输出 ($/1M)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="note-box">
        内置时间分段定价：Gemini 4 Carbon / Argon 在 2026-12-01 前自动按推广价 ($2 / $0.10 / $10) 计费，之后按正式价 ($4 / $0.20 / $20) 计费；自定义修改将覆盖默认单价。
      </div>
    </div>
  `;
}

function renderSettingsTab(snap) {
  const s = snap.settings;
  const b = s.budgets || {};

  return `
    <div class="card">
      <div class="card-head">
        <div class="card-title">实时刷新与显示偏好</div>
        <button class="btn solid sm" data-action="save-general-settings">保存设置</button>
      </div>
      <div class="form-grid">
        <div class="field">
          <label>实时增量轮询间隔</label>
          <select class="select-pill" id="cfg-poll">
            <option value="2500" ${s.pollIntervalMs === 2500 ? "selected" : ""}>2.5 秒（极速实时，推荐）</option>
            <option value="5000" ${s.pollIntervalMs === 5000 ? "selected" : ""}>5 秒（均衡）</option>
            <option value="15000" ${s.pollIntervalMs === 15000 ? "selected" : ""}>15 秒（低频）</option>
            <option value="0" ${s.pollIntervalMs === 0 ? "selected" : ""}>关闭自动刷新（仅手动）</option>
          </select>
        </div>
        <div class="field">
          <label>默认币种显示</label>
          <select class="select-pill" id="cfg-currency">
            <option value="dual" ${s.currency === "dual" ? "selected" : ""}>双显（USD + 人民币）</option>
            <option value="usd" ${s.currency === "usd" ? "selected" : ""}>仅美元 (USD)</option>
            <option value="cny" ${s.currency === "cny" ? "selected" : ""}>仅人民币 (CNY)</option>
          </select>
        </div>
        <div class="field">
          <label>Gemini 5h 参考预算 (USD)</label>
          <input class="text-input num" id="b-g5" type="number" step="5" value="${b.gemini5hUsd ?? 80}" />
        </div>
        <div class="field">
          <label>Gemini 7天 参考预算 (USD)</label>
          <input class="text-input num" id="b-g7" type="number" step="10" value="${b.gemini7dUsd ?? 400}" />
        </div>
        <div class="field">
          <label>Claude 5h 参考预算 (USD)</label>
          <input class="text-input num" id="b-c5" type="number" step="5" value="${b.claude5hUsd ?? 30}" />
        </div>
        <div class="field">
          <label>Claude 7天 参考预算 (USD)</label>
          <input class="text-input num" id="b-c7" type="number" step="10" value="${b.claude7dUsd ?? 150}" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">数据索引与报告导出</div>
        <div class="card-sub">已索引 ${snap.recentSessions?.length || 0}+ 会话 · Hooks 采样 ${snap.kpi.timedCount} 步</div>
      </div>
      <div class="filter-group">
        <button class="btn" data-action="copy-markdown">复制 Markdown 用量战报</button>
        <button class="btn danger" data-action="rebuild-cache">重建本地增量索引</button>
      </div>
      <div class="note-box">
        本插件采用字节级增量读取技术，仅扫描发生变化的活跃会话新增字节，零外部网络请求、不修改任何 Antigravity 客户端文件。速度与耗时指标通过插件内置的 <code>PreInvocation</code> / <code>PostInvocation</code> 官方 Hooks 自动记录。
      </div>
    </div>
  `;
}

// ---------------- Root Render ----------------

function render() {
  const root = document.getElementById("app");
  if (!root) return;
  const snap = state.snapshot;
  if (!snap) return;

  const compactMode = state.surface === "monitor" || (state.isNarrow && !state.surfaceLockedByUser);
  root.classList.toggle("is-compact", compactMode);

  const s = snap.settings;
  const inflightCount = snap.inflightCount || 0;

  if (compactMode) {
    root.innerHTML = `
      <div class="topbar" style="margin-bottom:10px">
        <div class="brand" style="font-size:14.5px">
          <span class="brand-dot ${state.liveEnabled ? "live" : "idle"}"></span>
          <span>Pulse</span>
          <span class="status-chip ${inflightCount > 0 ? "running" : ""}">${inflightCount > 0 ? `${inflightCount} 运行中` : "实时就绪"}</span>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn ${state.liveEnabled ? "active" : ""}" data-action="toggle-live" title="切换实时刷新">${state.liveEnabled ? "实时" : "暂停"}</button>
          <button class="icon-btn" data-action="cycle-currency" title="切换币种">${s.currency === "cny" ? "¥" : s.currency === "usd" ? "$" : "$/¥"}</button>
          <button class="icon-btn" data-action="refresh" title="立即刷新">↻</button>
        </div>
      </div>
      ${renderMonitorContent(snap, true)}
    `;
    return;
  }

  // Full Dashboard Mode
  const tabs = [
    ["overview", "概览"],
    ["monitor", "实时监控"],
    ["tasks", "任务与 Swarm"],
    ["requests", "请求事件"],
    ["errors", `错误与异常${snap.kpi.errorCount + snap.kpi.anomalyCount > 0 ? ` (${snap.kpi.errorCount + snap.kpi.anomalyCount})` : ""}`],
    ["pricing", "价格与订阅"],
    ["settings", "设置"],
  ];

  const navHtml = tabs
    .map(
      ([id, label]) =>
        `<button class="nav-pill ${state.tab === id ? "active" : ""}" data-action="set-tab" data-val="${id}">${esc(label)}</button>`
    )
    .join("");

  const modelOpts = [
    `<option value="all" ${state.modelFilter === "all" ? "selected" : ""}>全部模型</option>`,
    ...(snap.models || []).map(
      (m) =>
        `<option value="${esc(m.key)}" ${state.modelFilter === m.key ? "selected" : ""}>${esc(m.label)}</option>`
    ),
  ].join("");

  const rangeLabels = {
    all: "全部时间",
    today: "今天",
    "7d": "近 7 天",
    "30d": "近 30 天",
    cycle: "本订阅周期",
  };

  let bodyHtml = "";
  if (state.tab === "overview") bodyHtml = renderOverviewTab(snap);
  else if (state.tab === "monitor") bodyHtml = renderMonitorContent(snap, false);
  else if (state.tab === "tasks") bodyHtml = renderTasksTab(snap);
  else if (state.tab === "requests") bodyHtml = renderRequestsTab(snap);
  else if (state.tab === "errors") bodyHtml = renderErrorsTab(snap);
  else if (state.tab === "pricing") bodyHtml = renderPricingTab(snap);
  else if (state.tab === "settings") bodyHtml = renderSettingsTab(snap);

  const showFilterBar = !["pricing", "settings", "monitor"].includes(state.tab);

  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <span class="brand-dot ${state.liveEnabled ? "live" : "idle"}"></span>
        <span>Antigravity Pulse</span>
        <span class="status-chip ${inflightCount > 0 ? "running" : ""}">${inflightCount > 0 ? `${inflightCount} 运行中` : "实时就绪"}</span>
      </div>
      <nav class="nav-pills" aria-label="主导航">${navHtml}</nav>
      <div class="topbar-actions">
        <button class="icon-btn ${state.liveEnabled ? "active" : ""}" data-action="toggle-live" title="自动增量刷新">
          ${state.liveEnabled ? "● 实时" : "○ 暂停"}
        </button>
        <button class="icon-btn" data-action="cycle-currency" title="切换美元/人民币显示">
          ${s.currency === "dual" ? "$ / ¥" : s.currency === "cny" ? "¥ CNY" : "$ USD"}
        </button>
        <button class="icon-btn" data-action="refresh" title="立即刷新">↻</button>
      </div>
    </div>

    ${
      showFilterBar
        ? `<div class="filter-bar">
            <div class="filter-group">
              <select class="select-pill" data-action="set-range">
                ${Object.entries(rangeLabels)
                  .map(([k, l]) => `<option value="${k}" ${state.range === k ? "selected" : ""}>${l}</option>`)
                  .join("")}
              </select>
              <select class="select-pill" data-action="set-model">${modelOpts}</select>
            </div>
            <div class="filter-meta num">
              ${rangeLabels[state.range] || ""} · ${fmtInt(snap.kpi.conversationsCount)} 会话 · 更新于 ${fmtTime(snap.generatedAt)}
            </div>
          </div>`
        : ""
    }

    <main>${bodyHtml}</main>
  `;
}

// ---------------- Event Delegation ----------------

function buildMarkdownReport(snap) {
  const k = snap.kpi;
  const s = snap.settings;
  const sub = snap.subscription;
  const lines = [
    `# Antigravity Pulse 用量报告 (${snap.range})`,
    ``,
    `- **总 Tokens**: ${fmtInt(k.totalTokens)} (${fmtTokens(k.totalTokens)})`,
    `- **新增输入 / 缓存读 / 输出**: ${fmtTokens(k.inputTokens)} / ${fmtTokens(k.cacheReadTokens)} (命中 ${k.cacheHitRate}%) / ${fmtTokens(k.outputTokens)}`,
    `- **折合 API 费用**: ${fmtUsd(k.costUsd, 2)} (≈ ${fmtCny(k.costUsd, s.usdToCny, 0)}) · 缓存节省 ${fmtUsd(k.cacheSavedUsd, 2)}`,
    `- **请求次数**: ${fmtInt(k.requests)} (成功率 ${k.successRate}%)`,
  ];
  if (sub?.enabled) {
    lines.push(`- **订阅回本**: ${sub.planName} ($${sub.monthlyUsd}) 已回本 **${sub.roiMultiplier}x** (净省 ${fmtUsd(Math.max(0, sub.netSavedUsd), 2)})`);
  }
  lines.push(``, `| 模型 | 请求 | Tokens | 缓存命中 | 折合费用 |`, `| :--- | ---: | ---: | ---: | ---: |`);
  for (const m of snap.models || []) {
    lines.push(`| ${m.label} | ${m.requests} | ${fmtTokens(m.tokens)} | ${m.cacheHitRate}% | ${fmtUsd(m.costUsd, 2)} |`);
  }
  return lines.join("\n");
}

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(msg);
  } catch {
    showToast("当前沙箱限制剪贴板访问");
  }
}

function initEvents() {
  const root = document.getElementById("app");
  if (!root) return;

  root.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const action = el.getAttribute("data-action");
    const val = el.getAttribute("data-val");

    if (action === "set-tab") {
      state.tab = val;
      render();
      if (val === "tasks") fetchTasks();
      if (val === "requests") fetchRequests();
      if (val === "errors") fetchErrors();
    } else if (action === "switch-surface") {
      state.surface = val;
      state.surfaceLockedByUser = true;
      render();
    } else if (action === "refresh") {
      await fetchSnapshot(true);
      showToast("已刷新最新数据");
    } else if (action === "toggle-live") {
      state.liveEnabled = !state.liveEnabled;
      restartPollTimer();
      render();
      showToast(state.liveEnabled ? "已开启实时增量刷新" : "已暂停自动刷新");
    } else if (action === "cycle-currency") {
      const order = ["dual", "usd", "cny"];
      const cur = state.snapshot?.settings?.currency || "dual";
      const next = order[(order.indexOf(cur) + 1) % order.length];
      await saveSettings({ currency: next }, `币种切换为 ${next.toUpperCase()}`);
    } else if (action === "heat-metric") {
      state.heatmapMetric = val;
      render();
    } else if (action === "sort-model") {
      if (state.modelSort.key === val) {
        state.modelSort.dir = state.modelSort.dir === "desc" ? "asc" : "desc";
      } else {
        state.modelSort = { key: val, dir: "desc" };
      }
      render();
    } else if (action === "task-mode") {
      state.taskMode = val;
      render();
    } else if (action === "toggle-root") {
      if (state.expandedRoots.has(val)) state.expandedRoots.delete(val);
      else state.expandedRoots.add(val);
      render();
    } else if (action === "inspect-context") {
      state.selectedCid = val;
      state.tab = "monitor";
      await fetchSnapshot(true);
    } else if (action === "req-filter") {
      state.reqQuery.filter = val;
      state.reqQuery.page = 1;
      fetchRequests();
    } else if (action === "req-search-go") {
      const inp = document.getElementById("req-search");
      state.reqQuery.search = inp?.value || "";
      state.reqQuery.page = 1;
      fetchRequests();
    } else if (action === "req-page") {
      state.reqQuery.page = Number(val) || 1;
      fetchRequests();
    } else if (action === "save-sub-pricing") {
      const customPricing = {};
      document.querySelectorAll("[data-model-price-row]").forEach((tr) => {
        const key = tr.getAttribute("data-model-price-row");
        const inp = Number(tr.querySelector('[data-field="input"]')?.value);
        const cache = Number(tr.querySelector('[data-field="cache"]')?.value);
        const out = Number(tr.querySelector('[data-field="output"]')?.value);
        const orig = state.snapshot?.pricingCatalog?.find((x) => x.key === key);
        if (
          orig &&
          Number.isFinite(inp) &&
          Number.isFinite(cache) &&
          Number.isFinite(out) &&
          (inp !== orig.defaultInput || cache !== orig.defaultCache || out !== orig.defaultOutput || orig.isCustom)
        ) {
          customPricing[key] = { input: inp, cache, output: out };
        }
      });
      await saveSettings({
        usdToCny: Number(document.getElementById("cfg-fx")?.value) || 6.67,
        claudeCacheWriteMultiplier: Number(document.getElementById("cfg-claude-mult")?.value) || 1.25,
        subscription: {
          planName: document.getElementById("sub-plan-name")?.value || "Google AI Ultra",
          tierBadge: document.getElementById("sub-tier-badge")?.value || "Ultra · 5x",
          monthlyUsd: Number(document.getElementById("sub-monthly-usd")?.value) || 99,
          billingDay: Number(document.getElementById("sub-billing-day")?.value) || 1,
        },
        customPricing,
      });
    } else if (action === "reset-pricing") {
      const res = await callTool("pulse_update_settings", { action: "resetPricing" });
      if (res?.snapshot) {
        state.snapshot = res.snapshot;
        state.revision = res.snapshot.revision;
        render();
      }
      showToast("已恢复官方默认单价");
    } else if (action === "save-general-settings") {
      await saveSettings({
        pollIntervalMs: Number(document.getElementById("cfg-poll")?.value ?? 2500),
        currency: document.getElementById("cfg-currency")?.value || "dual",
        budgets: {
          gemini5hUsd: Number(document.getElementById("b-g5")?.value) || 80,
          gemini7dUsd: Number(document.getElementById("b-g7")?.value) || 400,
          claude5hUsd: Number(document.getElementById("b-c5")?.value) || 30,
          claude7dUsd: Number(document.getElementById("b-c7")?.value) || 150,
        },
      });
    } else if (action === "rebuild-cache") {
      const res = await callTool("pulse_update_settings", { action: "rebuildCache" });
      if (res?.snapshot) {
        state.snapshot = res.snapshot;
        state.revision = res.snapshot.revision;
        render();
      }
      showToast("本地增量索引已重建完成");
    } else if (action === "copy-markdown") {
      if (state.snapshot) copyText(buildMarkdownReport(state.snapshot), "已复制 Markdown 用量战报");
    } else if (action === "copy-diagnostics") {
      const d = state.errorsData || { errors: [], anomalies: [] };
      const txt = JSON.stringify(
        { generatedAt: new Date().toISOString(), errors: d.errors.slice(0, 20), cacheAnomalies: d.anomalies.slice(0, 20) },
        null,
        2
      );
      copyText(txt, "已复制错误与掉缓存诊断 JSON");
    }
  });

  root.addEventListener("change", async (ev) => {
    const el = ev.target;
    const action = el.getAttribute?.("data-action");
    if (action === "set-range") {
      state.range = el.value;
      state.reqQuery.page = 1;
      await fetchSnapshot(true);
    } else if (action === "set-model") {
      state.modelFilter = el.value;
      state.reqQuery.page = 1;
      await fetchSnapshot(true);
    } else if (action === "select-session") {
      state.selectedCid = el.value || null;
      await fetchSnapshot(true);
    }
  });

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target?.id === "req-search") {
      state.reqQuery.search = ev.target.value || "";
      state.reqQuery.page = 1;
      fetchRequests();
    }
  });

  window.addEventListener("resize", () => {
    const nextNarrow = window.innerWidth < 720;
    if (nextNarrow !== state.isNarrow) {
      state.isNarrow = nextNarrow;
      render();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.liveEnabled && state.connected) {
      fetchSnapshot(false);
    }
  });
}

// ---------------- Bootstrap (MCP Apps Lifecycle) ----------------

initTooltip();
initEvents();

// Register handlers BEFORE connect() per MCP Apps specification
app.ontoolinput = () => {};

app.ontoolresult = (result) => {
  const sc = result?.structuredContent;
  if (!sc) return;
  if (sc.surface) {
    state.surface = sc.surface;
  }
  if (sc.snapshot) {
    state.snapshot = sc.snapshot;
    state.revision = sc.snapshot.revision;
    if (!state.selectedCid && sc.snapshot.latestSession?.cid) {
      state.selectedCid = sc.snapshot.latestSession.cid;
    }
    render();
    restartPollTimer();
  }
};

app.onhostcontextchanged = (ctx) => {
  applyHostContext(ctx);
};

async function start() {
  try {
    await app.connect();
    state.connected = true;
    applyHostContext(app.getHostContext());

    // Fallback pull in case the host mounts the view before delivering tool result
    setTimeout(() => {
      if (!state.snapshot) {
        fetchSnapshot(true).then(() => restartPollTimer());
      }
    }, 350);
  } catch (err) {
    const root = document.getElementById("app");
    if (root) {
      root.innerHTML = `<div class="empty-state">无法连接到 Antigravity MCP App 宿主：${esc(err?.message || err)}</div>`;
    }
  }
}

start();
