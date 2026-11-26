import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";

// ---------------- Crisp Vector Icon Set (Zero Emoji) ----------------

const ICONS = {
  pulse: `<polyline points="2 12 6 12 9 4 13 20 16 10 18 12 22 12"/>`,
  zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>`,
  activity: `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`,
  coins: `<circle cx="9" cy="9" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>`,
  arrows: `<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>`,
  layers: `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/>`,
  receipt: `<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>`,
  sparkles: `<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>`,
  refresh: `<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M8 16H3v5"/>`,
  chevronRight: `<polyline points="9 18 15 12 9 6"/>`,
  chevronDown: `<polyline points="6 9 12 15 18 9"/>`,
  subBranch: `<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>`,
  checkCircle: `<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>`,
  layoutPanel: `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>`,
  gauge: `<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  database: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>`,
  arrowUp: `<path d="m18 15-6-6-6 6"/>`,
  arrowDown: `<path d="m6 9 6 6 6-6"/>`,
  arrowRight: `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
  arrowLeft: `<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>`,
  shieldCheck: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>`,
};

function icon(name, cls = "") {
  const body = ICONS[name] || "";
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// ---------------- Formatters ----------------

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getUnitFormat(settings) {
  return (settings || state.snapshot?.settings)?.unitFormat || "zh";
}

function fmtTokens(n, digits = 2, settings = null) {
  const v = Number(n || 0);
  const unit = getUnitFormat(settings);
  if (unit === "zh") {
    if (v >= 1e8) return `${(v / 1e8).toFixed(digits)}亿`;
    if (v >= 1e4) {
      const w = v / 1e4;
      return w >= 100 ? `${w.toFixed(1)}万` : `${w.toFixed(Math.min(2, digits))}万`;
    }
    return v.toLocaleString("zh-CN");
  }
  if (v >= 1e9) return `${(v / 1e9).toFixed(digits)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(digits)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US");
}

function fmtCtx(n, settings = null) {
  const v = Number(n || 0);
  const unit = getUnitFormat(settings);
  if (unit === "zh") {
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
    return v.toLocaleString("zh-CN");
  }
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
  tab: "overview",
  range: "all",
  modelFilter: "all",
  selectedCid: null,
  heatmapMetric: "tokens",
  heatmapPinnedRight: true,
  heatmapScrollLeft: null,
  modelSort: { key: "tokens", dir: "desc" },
  taskMode: "roots",
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
  isNarrow: window.innerWidth < 680,
  lastToastTimer: null,
  connected: false,
  isRefreshing: false,
  hasRenderedOnce: false,
  sliderState: new Map(), // containerKey -> { x, w }
};

const app = new App({ name: "Antigravity Pulse", version: "1.0.0" }, {});

// ---------------- Toast & Tooltip ----------------

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(state.lastToastTimer);
  state.lastToastTimer = setTimeout(() => el.classList.remove("is-visible"), 2400);
}

function initTooltip() {
  const tip = document.getElementById("tooltip");
  if (!tip) return;
  document.addEventListener("mousemove", (ev) => {
    const target = ev.target?.closest?.("[data-tip]");
    if (!target) {
      tip.classList.remove("is-visible");
      return;
    }
    const raw = target.getAttribute("data-tip");
    if (!raw) {
      tip.classList.remove("is-visible");
      return;
    }
    if (tip.innerHTML !== raw) tip.innerHTML = raw;
    tip.classList.add("is-visible");
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
  document.addEventListener("mouseleave", () => tip.classList.remove("is-visible"));
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

async function fetchSnapshot(force = false, animate = false) {
  if (state.pollingInFlight) return;
  state.pollingInFlight = true;
  if (force) {
    state.isRefreshing = true;
    document.querySelector('[data-action="refresh"]')?.classList.add("is-spinning");
  }
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
    const isBackgroundUpdate = !force && state.hasRenderedOnce;
    state.snapshot = data;
    state.revision = data.revision;
    if (!state.selectedCid && data.latestSession?.cid) {
      state.selectedCid = data.latestSession.cid;
    }
    if (!force && (state.tab === "pricing" || state.tab === "settings")) {
      updateLiveBadge(data.inflightCount || 0, true);
      return;
    }
    render({ animate: animate || !state.hasRenderedOnce, flashUpdate: isBackgroundUpdate });
    if (state.tab === "tasks") fetchTasks(false);
    if (state.tab === "requests") fetchRequests(false);
    if (state.tab === "errors") fetchErrors(false);
  } catch (err) {
    if (force) showToast(`刷新失败: ${err?.message || err}`);
  } finally {
    state.pollingInFlight = false;
    state.isRefreshing = false;
    document.querySelector('[data-action="refresh"]')?.classList.remove("is-spinning");
  }
}

async function fetchTasks(animate = true) {
  try {
    const data = await callTool("pulse_get_tasks", { range: state.range });
    if (data) {
      state.tasksData = data;
      if (state.expandedRoots.size === 0 && data.roots?.[0]) {
        state.expandedRoots.add(data.roots[0].rootId);
      }
      render({ animate });
    }
  } catch {}
}

async function fetchRequests(animate = true) {
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
      render({ animate });
    }
  } catch {}
}

async function fetchErrors(animate = true) {
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
    render({ animate });
  } catch {}
}

async function saveSettings(patch, toastMsg = "设置已保存并重新计算") {
  try {
    const res = await callTool("pulse_update_settings", { action: "save", settings: patch });
    if (res?.snapshot) {
      state.snapshot = res.snapshot;
      state.revision = res.snapshot.revision;
      restartPollTimer();
      render({ animate: false });
    }
    showToast(toastMsg);
  } catch (err) {
    showToast(`保存失败: ${err?.message || err}`);
  }
}

function updateLiveBadge(inflightCount, flash = false) {
  const dot = document.querySelector(".brand-dot");
  const chip = document.querySelector(".status-chip");
  if (dot) {
    dot.classList.toggle("live", state.liveEnabled);
    dot.classList.toggle("idle", !state.liveEnabled);
  }
  if (chip) {
    chip.classList.toggle("running", inflightCount > 0);
    chip.textContent = inflightCount > 0 ? `${inflightCount} 运行中` : "实时就绪";
    if (flash) {
      chip.classList.remove("just-updated");
      void chip.offsetWidth;
      chip.classList.add("just-updated");
    }
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
  const h = 28;
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
      `<strong>${d.date}</strong><br/>Token: ${fmtTokens(d.tokens, 2, settings)}<br/>请求: ${fmtInt(d.requests)} 次<br/>缓存命中: ${d.cacheHitRate}%<br/>费用: ${fmtCost(d.cost, settings)}`
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
    <div class="heatmap-wrap" id="heatmap-scroll">
      <svg class="heatmap-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="53周用量热力图">
        ${rects}
        ${monthLabels}
      </svg>
    </div>
    <div class="heatmap-legend">
      <span>过去 53 周按日分布（右侧为最新日期）</span>
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
  const r = 60;
  const cx = 82;
  const cy = 82;
  const circ = 2 * Math.PI * r;
  const total = models.reduce((s, m) => s + Number(m[valueKey] || 0), 0);

  let segs = "";
  if (total <= 0) {
    segs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-elevated)" stroke-width="19"></circle>`;
  } else {
    let offset = 0;
    for (const m of models) {
      const val = Number(m[valueKey] || 0);
      if (val <= 0) continue;
      const frac = val / total;
      const dash = Math.max(2, frac * circ);
      const pct = (frac * 100).toFixed(1);
      const valStr = valueKey === "costUsd" ? fmtCost(val, settings) : fmtTokens(val, 2, settings);
      const tip = esc(`<strong>${m.label}</strong><br/>${valStr} (${pct}%)`);
      segs += `<circle class="donut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${m.color}" stroke-width="19" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" data-tip="${tip}"></circle>`;
      offset += frac * circ;
    }
  }

  return `
    <div class="donut-box">
      <svg class="donut-svg" viewBox="0 0 164 164" role="img" aria-label="${esc(centerLabel)}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-elevated)" stroke-width="19"></circle>
        <g class="donut-ring">${segs}</g>
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-center-val num">${esc(centerVal)}</text>
        <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="donut-center-lbl">${esc(centerLabel)}</text>
      </svg>
    </div>
  `;
}

// ---------------- Section Renderers ----------------

function renderSessionSwitcher(snap, showDashboardSwitch) {
  const ls = snap.latestSession;
  const s = snap.settings;
  const sessionOptions = (snap.recentSessions || [])
    .map((item) => {
      const sel = item.cid === ls?.cid ? "selected" : "";
      const prefix = item.isRunning ? "[运行中] " : item.depth > 0 ? "└ " : "";
      const label = `${prefix}${item.title.slice(0, 26)} (${fmtTokens(item.tokens, 1, s)})`;
      return `<option value="${esc(item.cid)}" ${sel}>${esc(label)}</option>`;
    })
    .join("");

  return `
    <div class="filter-bar">
      <select class="select-pill" data-action="select-session" style="flex:1 1 160px;width:100%">
        ${sessionOptions || `<option value="">暂无会话</option>`}
      </select>
      ${
        showDashboardSwitch
          ? `<button class="btn primary sm" data-action="switch-surface" data-val="dashboard">
              <span>完整看板</span>${icon("arrowRight", "sm")}
            </button>`
          : ""
      }
    </div>
  `;
}

function renderMonitorContent(snap, compactMode) {
  const ls = snap.latestSession;
  const ctx = ls?.context;
  const k = snap.kpi;
  const s = snap.settings;
  const sub = snap.subscription;
  const rw = snap.rollingWindows;

  const latestTpsStr = ls?.lastStepTps ? `${ls.lastStepTps} tok/s` : k.avgTps ? `${k.avgTps} tok/s` : "待采样";
  const latestModelShort = ctx?.modelShort || ls?.cid?.slice(0, 8) || "--";
  const durStr = ls?.lastStepDurationMs ? fmtDuration(ls.lastStepDurationMs) : fmtDuration(k.avgDurationMs);
  const avgDurStr = ls?.avgDurationMs
    ? `均值 ${fmtDuration(ls.avgDurationMs)}`
    : k.timedCount > 0
      ? `全局均值 ${fmtDuration(k.avgDurationMs)}`
      : "由 Hooks 自动采集";
  const avgTpsStr = ls?.avgTps ? `${ls.avgTps} tok/s` : k.avgTps ? `${k.avgTps} tok/s` : "--";
  const avgTpsSub =
    ls?.timedSteps > 0
      ? `有效 ${ls.timedSteps}/${ls.steps} 步`
      : k.timedCount > 0
        ? `全局有效 ${k.timedCount} 步`
        : "等待新调用采样";

  const stepCostStr = ls ? fmtCost(ls.lastStepCostUsd, s, 3) : "--";
  const cumCostSub = ls
    ? `本会话 ${fmtCost(ls.sessionCostUsd, s)} · 总 ${fmtCost(k.allTimeCostUsd, s)}`
    : `总计 ${fmtCost(k.allTimeCostUsd, s)}`;

  const kpiCardsHtml = `
    <div class="monitor-grid">
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>输出速度</span>${icon("zap", "sm muted")}</div>
        <div class="mini-kpi-val cyan num">${esc(latestTpsStr)}</div>
        <div class="mini-kpi-sub">${esc(latestModelShort)}</div>
      </div>
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>请求耗时</span>${icon("clock", "sm muted")}</div>
        <div class="mini-kpi-val num">${esc(durStr)}</div>
        <div class="mini-kpi-sub">${esc(avgDurStr)}</div>
      </div>
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>平均速度</span>${icon("activity", "sm muted")}</div>
        <div class="mini-kpi-val green num">${esc(avgTpsStr)}</div>
        <div class="mini-kpi-sub">${esc(avgTpsSub)}</div>
      </div>
      <div class="mini-kpi">
        <div class="mini-kpi-top"><span>本次费用</span>${icon("coins", "sm muted")}</div>
        <div class="mini-kpi-val num">${esc(stepCostStr)}</div>
        <div class="mini-kpi-sub">${esc(cumCostSub)}</div>
      </div>
    </div>
  `;

  let ctxCardHtml = `<div class="card"><div class="empty-state">暂无可分析的对话上下文</div></div>`;
  if (ctx) {
    const barSegs = ctx.categories
      .filter((c) => c.tokens > 0)
      .map((c) => {
        const wPct = ctx.contextTokens > 0 ? (c.tokens / ctx.contextTokens) * 100 : 0;
        const tip = esc(`<strong>${c.label}</strong><br/>${fmtTokens(c.tokens, 2, s)} (${fmtInt(c.tokens)} tokens · ${c.percent}%)`);
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
          <span class="ctx-item-val num">${esc(fmtCtx(c.tokens, s))}</span>
        </div>
      `
      )
      .join("");

    const pctBadgeCls = ctx.usagePercent >= 85 ? "err" : ctx.usagePercent >= 65 ? "warn" : "info";
    ctxCardHtml = `
      <div class="card">
        <div class="card-head">
          <div class="card-title">
            ${icon("layers", "sm muted")}
            <span>上下文窗口</span>
            <span class="badge ${pctBadgeCls} num">${ctx.usagePercent}%</span>
            <span class="badge ok num">缓存 ${ctx.cacheHitRate}%</span>
            ${ctx.checkpointCount > 0 ? `<span class="badge neutral num">压缩 ${ctx.checkpointCount}次</span>` : ""}
          </div>
          <div class="card-sub num">${fmtCtx(ctx.contextTokens, s)} / ${fmtCtx(ctx.windowLimit, s)}</div>
        </div>
        <div class="ctx-bar">${barSegs}</div>
        <div class="ctx-list">${catItems}</div>
        <div class="note-box">
          总上下文 (${fmtInt(ctx.contextTokens)} tokens) 为 API 实测精确值；各分类基于本地 ${ctx.usedFullTranscript ? "完整对话日志" : "精简日志"} 占比归一化拆解。
        </div>
      </div>
    `;
  }

  const renderWindowRow = (title, w, isClaude = false) => {
    const fillCls =
      w.pct >= 90 ? "danger" : w.pct >= 70 ? "warn" : isClaude ? "claude" : "";
    const metricText = `${fmtTokens(w.tokens, 1, s)} (${fmtCost(w.costUsd, s)})`;
    const rightText = `${fmtResetIn(w.resetInMs)} · 占预算 ${w.pct}%`;
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
              `<span class="badge warn" style="margin-left:4px;margin-top:4px">${esc(q.modelLabel)} 剩余 ${q.remainingPct}% (${esc(fmtTimeShort(Date.parse(q.resetsAt)))} 重置)</span>`
          )
          .join("")}
      </div>`
    : "";

  const roiHtml = sub?.enabled
    ? `
      <div class="roi-banner">
        <div style="min-width:0">
          <div style="font-size:12px;color:var(--fg-secondary);font-weight:500">${esc(sub.planName)} (${fmtUsd(sub.monthlyUsd, 0)}/月) 回本进度</div>
          <div style="font-size:11.5px;color:var(--fg-muted);margin-top:2px">
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
        <div class="card-title">${icon("gauge", "sm muted")}<span>本地滚动消耗 & 订阅回本</span></div>
        <div class="card-sub">${esc(sub?.tierBadge || "Local")}</div>
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
        进度条基于本地实际消耗相对自定义参考预算（可在「设置」调整），官方未向本地插件开放服务端实时剩余百分比接口。
      </div>
    </div>
  `;

  if (compactMode) {
    return `${kpiCardsHtml}${ctxCardHtml}${quotaCardHtml}`;
  }
  return `
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
  const perUnitLabel = s.unitFormat === "zh" ? "每百万 Token" : "1M Tokens";

  const kpiHtml = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div>
          <div class="kpi-label"><span>请求次数</span>${icon("arrows", "sm muted")}</div>
          <div class="kpi-value-row">
            <span class="kpi-value num">${fmtInt(k.requests)}</span>
          </div>
          <div class="kpi-meta">
            <span class="kpi-stat-item"><i class="dot ok"></i>${fmtInt(k.successCount)} 成功</span>
            <span class="kpi-stat-item"><i class="dot err"></i>${fmtInt(k.errorCount)} 错误</span>
            ${k.anomalyCount > 0 ? `<span class="kpi-stat-item"><i class="dot warn"></i>${fmtInt(k.anomalyCount)} 掉缓存</span>` : ""}
          </div>
        </div>
        <div class="spark-wrap">${renderSparkline(snap.sparklines.requests, "var(--accent)")}</div>
      </div>

      <div class="kpi-card">
        <div>
          <div class="kpi-label"><span>累计 Token</span>${icon("layers", "sm muted")}</div>
          <div class="kpi-value-row">
            <span class="kpi-value num">${fmtTokens(k.totalTokens, 2, s)}</span>
          </div>
          <div class="kpi-meta">
            <span>${fmtTokens(k.inputTokens + k.cacheReadTokens, 2, s)} 输入 / ${fmtTokens(k.outputTokens, 2, s)} 输出</span>
            <span class="${hitClass(k.cacheHitRate)}">命中 ${k.cacheHitRate}%</span>
          </div>
        </div>
        <div class="spark-wrap">${renderSparkline(snap.sparklines.tokens, "var(--cyan)")}</div>
      </div>

      <div class="kpi-card">
        <div>
          <div class="kpi-label"><span>折合 API 费用</span>${icon("receipt", "sm muted")}</div>
          <div class="kpi-value-row">
            <span class="kpi-value num">${esc(fmtCost(k.costUsd, s))}</span>
            ${fmtCostSub(k.costUsd, s) ? `<span class="kpi-sub-val num">${esc(fmtCostSub(k.costUsd, s))}</span>` : ""}
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
            ${icon(sub?.enabled ? "sparkles" : "zap", "sm muted")}
          </div>
          ${
            sub?.enabled
              ? `
                <div class="kpi-value-row">
                  <span class="kpi-value num" style="color:var(--green)">${sub.roiMultiplier}x</span>
                  <span class="kpi-sub-val num">${esc(fmtUsd(sub.monthlyUsd, 0))}/月</span>
                </div>
                <div class="kpi-meta">
                  <span>净省 ${esc(fmtCost(Math.max(0, sub.netSavedUsd), s, 0))}</span>
                  <span>约 ${((sub.effectiveDiscountPct || 0) / 10).toFixed(1)} 折</span>
                </div>
              `
              : `
                <div class="kpi-value-row">
                  <span class="kpi-value num">${k.avgTps ? `${k.avgTps}` : "--"}</span>
                  <span class="kpi-sub-val">tok/s</span>
                </div>
                <div class="kpi-meta"><span>峰值 ${k.peakTps ? `${k.peakTps} tok/s` : "--"} · 采样 ${k.timedCount} 步</span></div>
              `
          }
        </div>
        <div style="margin-top:8px">
          <div class="bar-track">
            <div class="bar-fill roi" style="width:${Math.min(100, Math.round((sub?.roiMultiplier || 0) * 20))}%"></div>
          </div>
          <div style="font-size:11px;color:var(--fg-muted);margin-top:4px">
            折合实际均价 ${fmtUsd(sub?.actualPerMillionUsd || 0, 3)} / ${perUnitLabel}
          </div>
        </div>
      </div>
    </div>
  `;

  const heatmapCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">用量热力图</div>
        <div class="seg-switch" data-slider-key="heatmap-metric">
          <button class="seg-btn ${state.heatmapMetric === "tokens" ? "active" : ""}" data-action="heat-metric" data-val="tokens">Token</button>
          <button class="seg-btn ${state.heatmapMetric === "requests" ? "active" : ""}" data-action="heat-metric" data-val="requests">请求</button>
          <button class="seg-btn ${state.heatmapMetric === "cost" ? "active" : ""}" data-action="heat-metric" data-val="cost">费用</button>
        </div>
      </div>
      ${renderHeatmap(snap.heatmap, state.heatmapMetric, s)}
    </div>
  `;

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
        <div class="card-sub num">${k.successRate}% 成功${k.anomalyCount > 0 ? ` · ${k.anomalyCount} 次掉缓存` : ""}</div>
      </div>
      <div class="health-rows">
        ${healthRows || `<div class="empty-state">当前范围内无请求记录</div>`}
      </div>
    </div>
  `;

  const donutCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">用量分布</div>
        <div class="card-sub">${models.length} 个模型</div>
      </div>
      <div class="donuts-row">
        ${renderDonut(models, "tokens", fmtTokens(k.totalTokens, 2, s), "Token", s)}
        ${renderDonut(models, "costUsd", fmtCost(k.costUsd, s), s.currency === "cny" ? "费用 (CNY)" : "费用 (USD)", s)}
      </div>
      <div class="table-wrap">
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
                    <span class="model-dot" style="background:${m.color};margin-right:6px"></span>
                    <strong>${esc(m.label)}</strong>
                  </td>
                  <td class="r num">${fmtTokens(m.tokens, 2, s)}</td>
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
    </div>
  `;

  const sortKey = state.modelSort.key;
  const sortDir = state.modelSort.dir === "asc" ? 1 : -1;
  const sortedModels = [...models].sort((a, b) => ((a[sortKey] ?? -1) - (b[sortKey] ?? -1)) * sortDir);
  const thArrow = (key) =>
    sortKey === key ? icon(state.modelSort.dir === "asc" ? "arrowUp" : "arrowDown", "sm") : "";

  const modelTableCard = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">模型数据</div>
        <div class="card-sub">点击列头排序 · 速度由 Hooks 采集</div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>模型</th>
              <th class="r sortable" data-action="sort-model" data-val="requests">请求次数 ${thArrow("requests")}</th>
              <th class="r sortable" data-action="sort-model" data-val="tokens">Token ${thArrow("tokens")}</th>
              <th class="r sortable" data-action="sort-model" data-val="inputTokens">新增输入 ${thArrow("inputTokens")}</th>
              <th class="r sortable" data-action="sort-model" data-val="cacheHitRate">缓存命中 ${thArrow("cacheHitRate")}</th>
              <th class="r sortable" data-action="sort-model" data-val="costUsd">费用 ${thArrow("costUsd")}</th>
              <th class="r sortable" data-action="sort-model" data-val="avgTps">平均速度 ${thArrow("avgTps")}</th>
              <th class="r sortable" data-action="sort-model" data-val="peakTps">峰值速度 ${thArrow("peakTps")}</th>
            </tr>
          </thead>
          <tbody>
            ${
              sortedModels
                .map(
                  (m) => `
                <tr>
                  <td>
                    <span class="model-dot" style="background:${m.color};margin-right:6px"></span>
                    <strong>${esc(m.label)}</strong>
                  </td>
                  <td class="r num">${fmtInt(m.requests)}</td>
                  <td class="r num">${fmtTokens(m.tokens, 2, s)}</td>
                  <td class="r num" style="color:var(--fg-secondary)">${fmtTokens(m.inputTokens, 2, s)}</td>
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
      <div class="seg-switch" data-slider-key="task-mode">
        <button class="seg-btn ${state.taskMode === "roots" ? "active" : ""}" data-action="task-mode" data-val="roots">按主任务 (${data.roots.length})</button>
        <button class="seg-btn ${state.taskMode === "sessions" ? "active" : ""}" data-action="task-mode" data-val="sessions">全部会话 (${data.sessions.length})</button>
      </div>
    </div>
  `;

  if (state.taskMode === "roots") {
    const cards = data.roots
      .map((r) => {
        const open = state.expandedRoots.has(r.rootId);
        const childHtml = `
          <div class="task-collapse">
            <div class="task-collapse-inner">
              <div class="task-children">
                ${r.children
                  .map(
                    (c) => `
                    <div class="child-row">
                      <div class="task-title-col">
                        <span class="model-dot" style="background:${c.primaryModelColor}"></span>
                        ${c.depth > 0 ? icon("subBranch", "sm muted") : icon("sparkles", "sm muted")}
                        <span style="color:var(--fg-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px" title="${esc(c.displayTitle)}">${esc(c.displayTitle)}</span>
                        <span class="badge neutral">${esc(c.primaryModel)}</span>
                        ${c.anomalies > 0 ? `<span class="badge warn">${c.anomalies} 掉缓存</span>` : ""}
                      </div>
                      <div class="task-stats num">
                        <span>${fmtInt(c.steps)} 步</span>
                        <span>${fmtTokens(c.tokens, 2, s)}</span>
                        <span class="${hitClass(c.cacheHitRate)}">${c.cacheHitRate}%</span>
                        <strong>${esc(fmtCost(c.costUsd, s))}</strong>
                        <button class="btn sm" data-action="inspect-context" data-val="${esc(c.cid)}">上下文</button>
                      </div>
                    </div>
                  `
                  )
                  .join("")}
              </div>
            </div>
          </div>`;

        return `
          <div class="task-card ${open ? "is-open" : ""}" data-root-card="${esc(r.rootId)}">
            <div class="task-header" data-action="toggle-root" data-val="${esc(r.rootId)}">
              <div class="task-title-col">
                ${icon("chevronRight", "sm muted task-chevron")}
                <span class="task-title" title="${esc(r.title)}">${esc(r.title)}</span>
                ${r.sessionCount > 1 ? `<span class="badge info num">${r.sessionCount} 会话</span>` : ""}
                <span style="font-size:11px;color:var(--fg-muted)">${fmtTimeShort(r.firstTs)} ~ ${fmtTimeShort(r.lastTs)}</span>
              </div>
              <div class="task-stats num">
                <span>${fmtInt(r.steps)} 步</span>
                <span>${fmtTokens(r.tokens, 2, s)}</span>
                <span class="${hitClass(r.cacheHitRate)}">命中 ${r.cacheHitRate}%</span>
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

  const rows = data.sessions
    .map(
      (c) => `
      <tr>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${esc(c.displayTitle)}">
          ${c.depth > 0 ? `${icon("subBranch", "sm muted")} ` : ""}
          <strong>${esc(c.displayTitle)}</strong>
        </td>
        <td><span class="model-dot" style="background:${c.primaryModelColor};margin-right:6px"></span>${esc(c.primaryModel)}</td>
        <td class="r num">${fmtInt(c.steps)}</td>
        <td class="r num">${fmtTokens(c.tokens, 2, s)}</td>
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
    <div class="filter-bar" style="margin-bottom:10px">
      <div class="seg-switch" data-slider-key="req-filter">
        <button class="seg-btn ${q.filter === "all" ? "active" : ""}" data-action="req-filter" data-val="all">全部</button>
        <button class="seg-btn ${q.filter === "anomaly" ? "active" : ""}" data-action="req-filter" data-val="anomaly">短间隔掉缓存</button>
        <button class="seg-btn ${q.filter === "checkpoint" ? "active" : ""}" data-action="req-filter" data-val="checkpoint">压缩</button>
        <button class="seg-btn ${q.filter === "error" ? "active" : ""}" data-action="req-filter" data-val="error">错误</button>
      </div>
      <div class="filter-group" style="flex:1 1 180px;justify-content:flex-end">
        <input class="text-input" id="req-search" type="search" placeholder="搜索会话 / 模型..." value="${esc(q.search)}" style="max-width:200px" />
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
          <td style="max-width:170px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.title)}">${esc(r.title)}</td>
          <td><span class="model-dot" style="background:${r.modelColor};margin-right:6px"></span>${esc(r.modelShort)}</td>
          <td class="r num">${fmtTokens(r.inputTokens, 1, s)}</td>
          <td class="r num" style="color:var(--fg-secondary)">${fmtTokens(r.cacheReadTokens, 1, s)}</td>
          <td class="r num">${fmtTokens(r.outputTokens, 1, s)}</td>
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
        <span class="num">共 ${fmtInt(data.total)} 条 · 第 ${data.page} / ${data.totalPages} 页</span>
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
        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;color:var(--fg-secondary)">${esc(r.error || "执行中断或模型返回错误")}</td>
      </tr>
    `
    )
    .join("");

  const anomRows = data.anomalies
    .map(
      (r) => `
      <tr>
        <td class="num" style="color:var(--fg-muted)">${fmtTime(r.tsMs)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</td>
        <td>${esc(r.modelShort)}</td>
        <td class="r num">${fmtTokens(r.prevContextTokens, 1, s)}</td>
        <td class="r num" style="color:var(--red)">${fmtTokens(r.inputTokens, 1, s)}</td>
        <td class="r num">${fmtTokens(r.cacheReadTokens, 1, s)}</td>
        <td class="r num">${esc(fmtCost(r.costUsd, s, 4))}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div class="card">
      <div class="card-head">
        <div class="card-title">错误事件 (${data.errors.length + data.stopErrors.length})</div>
        <button class="btn sm" data-action="copy-diagnostics">${icon("copy", "sm")}<span>复制诊断摘要</span></button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>时间</th><th>会话</th><th>模型</th><th>状态</th><th>错误信息</th></tr></thead>
          <tbody>${errRows || `<tr><td colspan="5"><div class="empty-state">${icon("checkCircle", "lg")}<span>当前范围内未发现报错请求</span></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">短间隔异常掉缓存 (${data.anomalies.length})</div>
        <div class="card-sub">排除冷启动与压缩，捕获 4 分钟内缓存突降 &gt;50% 的调用</div>
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
          <tbody>${anomRows || `<tr><td colspan="7"><div class="empty-state">${icon("shieldCheck", "lg")}<span>未检测到异常掉缓存记录</span></div></td></tr>`}</tbody>
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
            <span class="model-dot" style="background:${m.color};margin-right:6px"></span>
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
            <option value="1.25" ${Number(s.claudeCacheWriteMultiplier) === 1.25 ? "selected" : ""}>1.25x (5分钟缓存写)</option>
            <option value="1" ${Number(s.claudeCacheWriteMultiplier) === 1 ? "selected" : ""}>1.0x (基础输入价)</option>
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
          <button class="btn sm" data-action="reset-pricing">恢复默认</button>
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
        内置时间分段定价：Gemini 4 Carbon / Argon 在 2026-12-01 前自动按推广价 ($2 / $0.10 / $10) 计费，之后按正式价 ($4 / $0.20 / $20) 计费。
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
          <label>Token 计量单位</label>
          <select class="select-pill" id="cfg-unit">
            <option value="zh" ${(s.unitFormat || "zh") === "zh" ? "selected" : ""}>中文单位（万 / 亿）</option>
            <option value="en" ${s.unitFormat === "en" ? "selected" : ""}>英文单位（K / M / B）</option>
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
          <label>实时增量轮询间隔</label>
          <select class="select-pill" id="cfg-poll">
            <option value="2500" ${s.pollIntervalMs === 2500 ? "selected" : ""}>2.5 秒（极速实时）</option>
            <option value="5000" ${s.pollIntervalMs === 5000 ? "selected" : ""}>5 秒（均衡）</option>
            <option value="15000" ${s.pollIntervalMs === 15000 ? "selected" : ""}>15 秒（低频）</option>
            <option value="0" ${s.pollIntervalMs === 0 ? "selected" : ""}>关闭自动刷新</option>
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
        <div class="card-sub">Hooks 采样 ${snap.kpi.timedCount} 步</div>
      </div>
      <div class="filter-group">
        <button class="btn" data-action="copy-markdown">${icon("copy", "sm")}<span>复制 Markdown 战报</span></button>
        <button class="btn danger" data-action="rebuild-cache">${icon("database", "sm")}<span>重建本地增量索引</span></button>
      </div>
      <div class="note-box">
        本插件采用字节级增量读取技术，仅扫描发生变化的活跃会话新增字节，零外部网络请求、不修改任何 Antigravity 客户端文件。
      </div>
    </div>
  `;
}

// ---------------- Root Render (Fixed Header + Preserved Scroll) ----------------

function bindHeatmapScrollAndPin() {
  const wrap = document.getElementById("heatmap-scroll");
  if (!wrap) return;
  const applyPos = () => {
    if (state.heatmapPinnedRight || state.heatmapScrollLeft === null) {
      wrap.scrollLeft = wrap.scrollWidth;
    } else {
      wrap.scrollLeft = state.heatmapScrollLeft;
    }
  };
  applyPos();
  requestAnimationFrame(applyPos);
  wrap.addEventListener(
    "scroll",
    () => {
      const distToRight = wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft;
      state.heatmapPinnedRight = distToRight <= 16;
      state.heatmapScrollLeft = wrap.scrollLeft;
    },
    { passive: true }
  );
}

function animatePillSliders() {
  document.querySelectorAll("[data-slider-key]").forEach((container) => {
    const key = container.getAttribute("data-slider-key");
    const activeEl = container.querySelector(".active");
    if (!activeEl) return;

    const isNav = container.classList.contains("nav-pills");
    const slider = document.createElement("span");
    slider.className = isNav ? "nav-slider" : "seg-slider";
    container.classList.add("has-slider");
    container.prepend(slider);

    const targetX = activeEl.offsetLeft;
    const targetW = activeEl.offsetWidth;
    const prev = state.sliderState.get(key);

    if (prev && (prev.x !== targetX || prev.w !== targetW)) {
      slider.style.transition = "none";
      slider.style.width = `${prev.w}px`;
      slider.style.transform = `translateX(${prev.x}px)`;
      void slider.offsetWidth;
      slider.style.transition = "";
      requestAnimationFrame(() => {
        slider.style.width = `${targetW}px`;
        slider.style.transform = `translateX(${targetX}px)`;
      });
    } else {
      slider.style.transition = "none";
      slider.style.width = `${targetW}px`;
      slider.style.transform = `translateX(${targetX}px)`;
    }
    state.sliderState.set(key, { x: targetX, w: targetW });
  });
}

function render(opts = {}) {
  const { animate = false, flashUpdate = false } = opts;
  const root = document.getElementById("app");
  if (!root) return;
  const snap = state.snapshot;
  if (!snap) return;

  const shouldAnimate = animate || !state.hasRenderedOnce;
  state.hasRenderedOnce = true;

  // Preserve current vertical scroll position of main pane across live updates
  const prevMain = document.getElementById("main-scroll");
  const prevScrollTop = prevMain ? prevMain.scrollTop : 0;
  const prevNav = document.getElementById("nav-scroll");
  const prevNavLeft = prevNav ? prevNav.scrollLeft : 0;

  const compactMode = state.surface === "monitor" || (state.isNarrow && !state.surfaceLockedByUser);
  root.classList.toggle("is-compact", compactMode);
  root.classList.toggle("is-narrow", state.isNarrow);

  const s = snap.settings;
  const inflightCount = snap.inflightCount || 0;
  const unitLabel = getUnitFormat(s) === "zh" ? "万/亿" : "K/M";
  const curLabel = s.currency === "dual" ? "$/¥" : s.currency === "cny" ? "¥" : "$";
  const enterCls = shouldAnimate ? "is-entering" : "";
  const flashCls = flashUpdate ? "just-updated" : "";

  if (compactMode) {
    root.innerHTML = `
      <header class="app-header">
        <div class="app-header-inner">
          <div class="topbar">
            <div class="brand">
              <span class="brand-dot ${state.liveEnabled ? "live" : "idle"}"></span>
              <span class="brand-title">Pulse</span>
              <span class="status-chip ${inflightCount > 0 ? "running" : ""} ${flashCls}">${inflightCount > 0 ? `${inflightCount} 运行中` : "实时就绪"}</span>
            </div>
            <div class="topbar-actions">
              <button class="icon-btn" data-action="toggle-unit" title="切换中文/英文计量单位">${unitLabel}</button>
              <button class="icon-btn" data-action="cycle-currency" title="切换币种">${curLabel}</button>
              <button class="icon-btn ${state.liveEnabled ? "active" : ""}" data-action="toggle-live" title="切换实时自动刷新">${state.liveEnabled ? "实时" : "暂停"}</button>
              <button class="icon-btn square ${state.isRefreshing ? "is-spinning" : ""}" data-action="refresh" title="立即刷新">${icon("refresh", "sm")}</button>
            </div>
          </div>
          ${renderSessionSwitcher(snap, true)}
        </div>
      </header>
      <div class="app-main" id="main-scroll">
        <div class="app-main-inner ${enterCls}">
          ${renderMonitorContent(snap, true)}
        </div>
      </div>
    `;
    const nextMain = document.getElementById("main-scroll");
    if (nextMain) nextMain.scrollTop = prevScrollTop;
    return;
  }

  // Full Dashboard Mode (Fixed Topbar + Nav + Filter Bar; Scrollable Main)
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

  let subHeaderHtml = "";
  if (state.tab === "monitor") {
    subHeaderHtml = renderSessionSwitcher(snap, false);
  } else if (!["pricing", "settings"].includes(state.tab)) {
    subHeaderHtml = `
      <div class="filter-bar">
        <div class="filter-group">
          <select class="select-pill" data-action="set-range">
            ${Object.entries(rangeLabels)
              .map(([k, l]) => `<option value="${k}" ${state.range === k ? "selected" : ""}>${l}</option>`)
              .join("")}
          </select>
          <select class="select-pill" data-action="set-model">${modelOpts}</select>
        </div>
        <div class="filter-meta num">
          ${fmtInt(snap.kpi.conversationsCount)} 会话 · 更新于 ${fmtTime(snap.generatedAt)}
        </div>
      </div>
    `;
  }

  root.innerHTML = `
    <header class="app-header">
      <div class="app-header-inner">
        <div class="topbar">
          <div class="brand">
            <span class="brand-dot ${state.liveEnabled ? "live" : "idle"}"></span>
            <span class="brand-title">${state.isNarrow ? "Pulse" : "Antigravity Pulse"}</span>
            <span class="status-chip ${inflightCount > 0 ? "running" : ""} ${flashCls}">${inflightCount > 0 ? `${inflightCount} 运行中` : "实时就绪"}</span>
          </div>
          <div class="topbar-actions">
            ${
              state.isNarrow
                ? `<button class="icon-btn" data-action="switch-surface" data-val="monitor" title="切回紧凑监控面板">${icon("arrowLeft", "sm")}<span>紧凑</span></button>`
                : ""
            }
            <button class="icon-btn" data-action="toggle-unit" title="切换中文/英文计量单位">${unitLabel}</button>
            <button class="icon-btn" data-action="cycle-currency" title="切换美元/人民币显示">${curLabel}</button>
            <button class="icon-btn ${state.liveEnabled ? "active" : ""}" data-action="toggle-live" title="切换自动增量刷新">
              <i class="dot ${state.liveEnabled ? "ok" : "muted"}"></i><span>${state.liveEnabled ? "实时" : "暂停"}</span>
            </button>
            <button class="icon-btn square ${state.isRefreshing ? "is-spinning" : ""}" data-action="refresh" title="立即刷新">${icon("refresh", "sm")}</button>
          </div>
        </div>
        <div class="nav-scroll" id="nav-scroll">
          <nav class="nav-pills" data-slider-key="main-nav" aria-label="主导航">${navHtml}</nav>
        </div>
        ${subHeaderHtml}
      </div>
    </header>

    <main class="app-main" id="main-scroll">
      <div class="app-main-inner ${enterCls}">
        ${bodyHtml}
      </div>
    </main>
  `;

  const nextMain = document.getElementById("main-scroll");
  if (nextMain) nextMain.scrollTop = prevScrollTop;
  const nextNav = document.getElementById("nav-scroll");
  if (nextNav) nextNav.scrollLeft = prevNavLeft;

  animatePillSliders();
  bindHeatmapScrollAndPin();
}

// ---------------- Event Delegation ----------------

function buildMarkdownReport(snap) {
  const k = snap.kpi;
  const s = snap.settings;
  const sub = snap.subscription;
  const lines = [
    `# Antigravity Pulse 用量报告 (${snap.range})`,
    ``,
    `- **总 Tokens**: ${fmtInt(k.totalTokens)} (${fmtTokens(k.totalTokens, 2, s)})`,
    `- **新增输入 / 缓存读 / 输出**: ${fmtTokens(k.inputTokens, 2, s)} / ${fmtTokens(k.cacheReadTokens, 2, s)} (命中 ${k.cacheHitRate}%) / ${fmtTokens(k.outputTokens, 2, s)}`,
    `- **折合 API 费用**: ${fmtUsd(k.costUsd, 2)} (≈ ${fmtCny(k.costUsd, s.usdToCny, 0)}) · 缓存节省 ${fmtUsd(k.cacheSavedUsd, 2)}`,
    `- **请求次数**: ${fmtInt(k.requests)} (成功率 ${k.successRate}%)`,
  ];
  if (sub?.enabled) {
    lines.push(
      `- **订阅回本**: ${sub.planName} ($${sub.monthlyUsd}) 已回本 **${sub.roiMultiplier}x** (净省 ${fmtUsd(Math.max(0, sub.netSavedUsd), 2)})`
    );
  }
  lines.push(``, `| 模型 | 请求 | Tokens | 缓存命中 | 折合费用 |`, `| :--- | ---: | ---: | ---: | ---: |`);
  for (const m of snap.models || []) {
    lines.push(`| ${m.label} | ${m.requests} | ${fmtTokens(m.tokens, 2, s)} | ${m.cacheHitRate}% | ${fmtUsd(m.costUsd, 2)} |`);
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
      if (state.tab === val) return;
      state.tab = val;
      const m = document.getElementById("main-scroll");
      if (m) m.scrollTop = 0;
      render({ animate: true });
      if (val === "tasks") fetchTasks(true);
      if (val === "requests") fetchRequests(true);
      if (val === "errors") fetchErrors(true);
    } else if (action === "switch-surface") {
      state.surface = val;
      state.surfaceLockedByUser = true;
      render({ animate: true });
    } else if (action === "refresh") {
      await fetchSnapshot(true, false);
      showToast("已刷新最新数据");
    } else if (action === "toggle-live") {
      state.liveEnabled = !state.liveEnabled;
      restartPollTimer();
      render({ animate: false });
      showToast(state.liveEnabled ? "已开启实时增量刷新" : "已暂停自动刷新");
    } else if (action === "toggle-unit") {
      const cur = getUnitFormat(state.snapshot?.settings);
      const next = cur === "zh" ? "en" : "zh";
      await saveSettings(
        { unitFormat: next },
        next === "zh" ? "已切换为中文单位（万 / 亿）" : "已切换为英文单位（K / M / B）"
      );
    } else if (action === "cycle-currency") {
      const order = ["dual", "usd", "cny"];
      const cur = state.snapshot?.settings?.currency || "dual";
      const next = order[(order.indexOf(cur) + 1) % order.length];
      const labels = { dual: "双显 ($ / ¥)", usd: "仅美元 (USD)", cny: "仅人民币 (CNY)" };
      await saveSettings({ currency: next }, `币种切换为 ${labels[next]}`);
    } else if (action === "heat-metric") {
      state.heatmapMetric = val;
      render({ animate: false });
    } else if (action === "sort-model") {
      if (state.modelSort.key === val) {
        state.modelSort.dir = state.modelSort.dir === "desc" ? "asc" : "desc";
      } else {
        state.modelSort = { key: val, dir: "desc" };
      }
      render({ animate: false });
    } else if (action === "task-mode") {
      state.taskMode = val;
      render({ animate: true });
    } else if (action === "toggle-root") {
      if (state.expandedRoots.has(val)) state.expandedRoots.delete(val);
      else state.expandedRoots.add(val);
      // In-place toggle for butter-smooth CSS grid accordion transition
      const card = el.closest(".task-card");
      if (card) {
        card.classList.toggle("is-open", state.expandedRoots.has(val));
      } else {
        render({ animate: false });
      }
    } else if (action === "inspect-context") {
      state.selectedCid = val;
      state.tab = "monitor";
      const m = document.getElementById("main-scroll");
      if (m) m.scrollTop = 0;
      await fetchSnapshot(true, true);
    } else if (action === "req-filter") {
      state.reqQuery.filter = val;
      state.reqQuery.page = 1;
      fetchRequests(true);
    } else if (action === "req-search-go") {
      const inp = document.getElementById("req-search");
      state.reqQuery.search = inp?.value || "";
      state.reqQuery.page = 1;
      fetchRequests(true);
    } else if (action === "req-page") {
      state.reqQuery.page = Number(val) || 1;
      const m = document.getElementById("main-scroll");
      if (m) m.scrollTop = 0;
      fetchRequests(true);
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
        unitFormat: document.getElementById("cfg-unit")?.value || "zh",
        currency: document.getElementById("cfg-currency")?.value || "dual",
        pollIntervalMs: Number(document.getElementById("cfg-poll")?.value ?? 2500),
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
      await fetchSnapshot(true, true);
    } else if (action === "set-model") {
      state.modelFilter = el.value;
      state.reqQuery.page = 1;
      await fetchSnapshot(true, true);
    } else if (action === "select-session") {
      state.selectedCid = el.value || null;
      await fetchSnapshot(true, true);
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
    const nextNarrow = window.innerWidth < 680;
    if (nextNarrow !== state.isNarrow) {
      state.isNarrow = nextNarrow;
      render();
    } else if (state.heatmapPinnedRight) {
      const wrap = document.getElementById("heatmap-scroll");
      if (wrap) wrap.scrollLeft = wrap.scrollWidth;
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
