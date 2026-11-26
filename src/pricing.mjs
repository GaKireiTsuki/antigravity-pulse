/**
 * Model pricing catalog, time-phased rate resolution, display metadata,
 * and subscription ROI / currency conversion helpers.
 */

export const DEFAULT_SETTINGS = {
  currency: "dual", // "usd" | "cny" | "dual"
  unitFormat: "zh", // "zh" (万/亿) | "en" (K/M/B)
  usdToCny: 6.67,
  claudeCacheWriteMultiplier: 1.25, // 1.25 for 5m cache write, 1.0 for base input
  subscription: {
    enabled: true,
    planName: "Google AI Ultra",
    tierBadge: "Ultra · 5x",
    monthlyUsd: 99,
    autoQuota: true, // automatically infer 5h / 7d / cycle quotas from usage & official [quota] notices
    cycleQuotaUsd: 1600, // used only when autoQuota is false
    billingDay: 1,
  },
  pollIntervalMs: 2500, // 0 = manual only
  budgets: {
    gemini5hUsd: 135,
    gemini7dUsd: 580,
    claude5hUsd: 15,
    claude7dUsd: 30,
  },
  quotaAnchors: {
    gemini5h: null, // { remainingPct, resetsAtMs, observedAtMs }
    gemini7d: null,
    claude5h: null,
    claude7d: null,
  },
  contextLimits: {
    default: 512000,
    "gemini-4-neon": 512000,
    "gemini-4-carbon": 512000,
    "gemini-4-argon": 512000,
    "gemini-4-hydrogen": 1000000,
    "claude-opus-5-5": 1000000,
    "claude-sonnet-5-5": 1000000,
  },
  customPricing: {}, // { [modelKey]: { input, cache, output } }
  includeIdeLogs: false,
};

/**
 * Color palette crafted to stay legible on both Antigravity light and dark surfaces.
 */
export const MODEL_COLORS = [
  "#5B9BFF", // Gemini 4 Neon — Azure Blue
  "#F5B73B", // Claude Opus — Warm Amber
  "#34D399", // Gemini 4 Carbon — Emerald
  "#A78BFA", // Claude Sonnet — Iris Violet
  "#22D3EE", // Gemini 4 Argon — Cyan
  "#FB7185", // Gemini 4 Hydrogen — Coral Rose
  "#FB923C", // Flash 3.x — Tangerine
  "#94A3B8", // Fallback Slate
];

/**
 * Canonical model catalog (prices in USD per 1M tokens).
 * Supports time-phased pricing (e.g. Gemini 4 Carbon/Argon Dec 1, 2026 adjustment).
 */
export const MODEL_CATALOG = {
  "gemini-4-neon": {
    label: "Gemini 4 Neon",
    short: "gemini-4-neon",
    family: "Gemini",
    pool: "gemini",
    color: "#5B9BFF",
    contextLimit: 512000,
    input: 3.0,
    cache: 0.15,
    output: 15.0,
  },
  "gemini-4-carbon": {
    label: "Gemini 4 Carbon",
    short: "gemini-4-carbon",
    family: "Gemini",
    pool: "gemini",
    color: "#34D399",
    contextLimit: 512000,
    input: 2.0,
    cache: 0.1,
    output: 10.0,
    phases: [
      { until: "2026-12-01T00:00:00Z", input: 2.0, cache: 0.1, output: 10.0, note: "11月推广价" },
      { from: "2026-12-01T00:00:00Z", input: 4.0, cache: 0.2, output: 20.0, note: "12月1日起正式价" },
    ],
  },
  "gemini-4-argon": {
    label: "Gemini 4 Argon",
    short: "gemini-4-argon",
    family: "Gemini",
    pool: "gemini",
    color: "#22D3EE",
    contextLimit: 512000,
    input: 2.0,
    cache: 0.1,
    output: 10.0,
    phases: [
      { until: "2026-12-01T00:00:00Z", input: 2.0, cache: 0.1, output: 10.0, note: "11月推广价" },
      { from: "2026-12-01T00:00:00Z", input: 4.0, cache: 0.2, output: 20.0, note: "12月1日起正式价" },
    ],
  },
  "gemini-4-hydrogen": {
    label: "Gemini 4 Hydrogen",
    short: "gemini-4-hydrogen",
    family: "Gemini",
    pool: "gemini",
    color: "#FB7185",
    contextLimit: 1000000,
    input: 1.5,
    cache: 0.075,
    output: 7.5,
  },
  "gemini-4-helix": {
    label: "Gemini 4 Helix",
    short: "gemini-4-helix",
    family: "Gemini",
    pool: "gemini",
    color: "#38BDF8",
    contextLimit: 1000000,
    input: 0.3,
    cache: 0.015,
    output: 2.5,
  },
  "claude-opus-5-5": {
    label: "Claude Opus 5.5",
    short: "claude-opus-5-5",
    family: "Claude",
    pool: "claude",
    color: "#F5B73B",
    contextLimit: 1000000,
    input: 4.0,
    cache: 0.2,
    output: 20.0,
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    short: "claude-sonnet-5-5",
    family: "Claude",
    pool: "claude",
    color: "#A78BFA",
    contextLimit: 1000000,
    input: 2.0,
    cache: 0.1,
    output: 10.0,
  },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    short: "claude-haiku-5-5",
    family: "Claude",
    pool: "claude",
    color: "#C084FC",
    contextLimit: 200000,
    input: 0.1,
    cache: 0.01,
    output: 0.5,
  },
  "claude-fable-5-2": {
    label: "Claude Fable 5.2",
    short: "claude-fable-5-2",
    family: "Claude",
    pool: "claude",
    color: "#F97316",
    contextLimit: 1000000,
    input: 8.0,
    cache: 0.2,
    output: 40.0,
  },
  "claude-opus-4-6": {
    label: "Claude Opus 4.6",
    short: "claude-opus-4-6",
    family: "Claude",
    pool: "claude",
    color: "#EAB308",
    contextLimit: 200000,
    input: 5.0,
    cache: 0.5,
    output: 25.0,
  },
  "claude-sonnet-4-6": {
    label: "Claude Sonnet 4.6",
    short: "claude-sonnet-4-6",
    family: "Claude",
    pool: "claude",
    color: "#8B5CF6",
    contextLimit: 200000,
    input: 3.0,
    cache: 0.3,
    output: 15.0,
  },
  "gpt-oss-120b": {
    label: "GPT-OSS 120B",
    short: "gpt-oss-120b",
    family: "GPT",
    pool: "claude",
    color: "#14B8A6",
    contextLimit: 128000,
    input: 0.5,
    cache: 0.05,
    output: 2.0,
  },
  "gemini-3.8-flash": {
    label: "Gemini 3.8 Flash",
    short: "gemini-3.8-flash",
    family: "Gemini",
    pool: "gemini",
    color: "#FB923C",
    contextLimit: 1000000,
    input: 0.75,
    cache: 0.075,
    output: 3.75,
    phases: [
      { until: "2027-01-01T00:00:00Z", input: 0.75, cache: 0.075, output: 3.75, note: "2026推广价" },
      { from: "2027-01-01T00:00:00Z", input: 1.5, cache: 0.15, output: 7.5, note: "2027正式价" },
    ],
  },
  "gemini-3.6-flash": {
    label: "Gemini 3.6 Flash",
    short: "gemini-3.6-flash",
    family: "Gemini",
    pool: "gemini",
    color: "#F97316",
    contextLimit: 1000000,
    input: 0.75,
    cache: 0.075,
    output: 3.75,
    phases: [
      { until: "2027-01-01T00:00:00Z", input: 0.75, cache: 0.075, output: 3.75 },
      { from: "2027-01-01T00:00:00Z", input: 1.5, cache: 0.15, output: 7.5 },
    ],
  },
  "gemini-3.5-flash": {
    label: "Gemini 3.5 Flash",
    short: "gemini-3.5-flash",
    family: "Gemini",
    pool: "gemini",
    color: "#FBBF24",
    contextLimit: 1000000,
    input: 1.5,
    cache: 0.15,
    output: 9.0,
  },
  "gemini-3.1-pro": {
    label: "Gemini 3.1 Pro",
    short: "gemini-3.1-pro",
    family: "Gemini",
    pool: "gemini",
    color: "#60A5FA",
    contextLimit: 1000000,
    input: 2.0,
    cache: 0.2,
    output: 12.0,
  },
  "gemini-2.5-pro": {
    label: "Gemini 2.5 Pro",
    short: "gemini-2.5-pro",
    family: "Gemini",
    pool: "gemini",
    color: "#3B82F6",
    contextLimit: 1000000,
    input: 1.25,
    cache: 0.125,
    output: 10.0,
  },
  "gemini-2.5-flash": {
    label: "Gemini 2.5 Flash",
    short: "gemini-2.5-flash",
    family: "Gemini",
    pool: "gemini",
    color: "#2DD4BF",
    contextLimit: 1000000,
    input: 0.3,
    cache: 0.03,
    output: 2.5,
  },
};

/**
 * Normalize a raw Antigravity model string (e.g. "gemini-4-neon-xhigh",
 * "gemini-4-hydrogen-tiered-high", "claude-opus-5-5-high") into a canonical model key.
 */
export function normalizeModelKey(rawModel) {
  if (!rawModel || typeof rawModel !== "string") return "unknown";
  const m = rawModel.toLowerCase().trim();

  if (m.includes("neon")) return "gemini-4-neon";
  if (m.includes("carbon") || m === "gemini-pro-orchestrator") return "gemini-4-carbon";
  if (m.includes("argon")) return "gemini-4-argon";
  if (m.includes("hydrogen") || m.includes("flash-worker")) return "gemini-4-hydrogen";
  if (m.includes("helix")) return "gemini-4-helix";

  if (m.includes("opus-5-5") || m.includes("opus-5.5")) return "claude-opus-5-5";
  if (m.includes("sonnet-5-5") || m.includes("sonnet-5.5")) return "claude-sonnet-5-5";
  if (m.includes("haiku-5-5") || m.includes("haiku-5.5")) return "claude-haiku-5-5";
  if (m.includes("fable-5-2") || m.includes("fable-5.2")) return "claude-fable-5-2";
  if (m.includes("opus-4-6") || m.includes("opus-4-5") || m.includes("opus-4-8")) return "claude-opus-4-6";
  if (m.includes("sonnet-4-6") || m.includes("sonnet-4-5")) return "claude-sonnet-4-6";
  if (m.includes("gpt-oss") || m.includes("gpt-")) return "gpt-oss-120b";

  if (m.includes("3.8-flash") || m.includes("3.7-flash")) return "gemini-3.8-flash";
  if (m.includes("3.6-flash")) return "gemini-3.6-flash";
  if (m.includes("3.5-flash")) return "gemini-3.5-flash";
  if (m.includes("3.1-pro") || m.includes("gemini-pro")) return "gemini-3.1-pro";
  if (m.includes("2.5-pro")) return "gemini-2.5-pro";
  if (m.includes("2.5-flash")) return "gemini-2.5-flash";

  return m;
}

export function getModelInfo(rawModel, settings = DEFAULT_SETTINGS) {
  const key = normalizeModelKey(rawModel);
  const catalog = MODEL_CATALOG[key];
  const custom = settings?.customPricing?.[key];
  const ctxLimit =
    settings?.contextLimits?.[key] ||
    catalog?.contextLimit ||
    settings?.contextLimits?.default ||
    512000;

  if (catalog) {
    return {
      key,
      raw: rawModel || key,
      label: catalog.label,
      short: catalog.short,
      family: catalog.family,
      pool: catalog.pool,
      color: catalog.color,
      contextLimit: ctxLimit,
      baseInput: custom?.input ?? catalog.input,
      baseCache: custom?.cache ?? catalog.cache,
      baseOutput: custom?.output ?? catalog.output,
      phases: custom ? null : catalog.phases || null,
      isCustom: Boolean(custom),
    };
  }

  const isClaudeOrGpt = key.includes("claude") || key.includes("gpt");
  const hash = [...key].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    key,
    raw: rawModel || "unknown",
    label: rawModel || "Unknown Model",
    short: key,
    family: key.includes("gpt") ? "GPT" : isClaudeOrGpt ? "Claude" : "Gemini",
    pool: isClaudeOrGpt ? "claude" : "gemini",
    color: MODEL_COLORS[hash % MODEL_COLORS.length],
    contextLimit: ctxLimit,
    baseInput: custom?.input ?? 2.0,
    baseCache: custom?.cache ?? 0.1,
    baseOutput: custom?.output ?? 10.0,
    phases: null,
    isCustom: Boolean(custom),
  };
}

/**
 * Resolve effective per-1M rates at a given ISO timestamp or epoch ms.
 */
export function resolveRatesAt(rawModel, timestampMs, settings = DEFAULT_SETTINGS) {
  const info = getModelInfo(rawModel, settings);
  let input = info.baseInput;
  let cache = info.baseCache;
  let output = info.baseOutput;

  if (info.phases && timestampMs) {
    for (const ph of info.phases) {
      const afterFrom = !ph.from || timestampMs >= Date.parse(ph.from);
      const beforeUntil = !ph.until || timestampMs < Date.parse(ph.until);
      if (afterFrom && beforeUntil) {
        input = ph.input;
        cache = ph.cache;
        output = ph.output;
        break;
      }
    }
  }

  // Claude uncached inputs in Antigravity transcripts are predominantly 5m prompt cache writes
  const claudeMult =
    info.family === "Claude" ? Number(settings?.claudeCacheWriteMultiplier ?? 1.25) : 1.0;

  return {
    ...info,
    effectiveInput: input * claudeMult,
    baseInputRate: input,
    cacheRate: cache,
    outputRate: output,
    claudeMult,
  };
}

export function computeStepCost(step, settings = DEFAULT_SETTINGS) {
  const r = resolveRatesAt(step.model, step.tsMs, settings);
  const inputCost = (step.inputTokens / 1e6) * r.effectiveInput;
  const cacheCost = (step.cacheReadTokens / 1e6) * r.cacheRate;
  const outputCost = (step.outputTokens / 1e6) * r.outputRate;
  const totalCost = inputCost + cacheCost + outputCost;
  const noCacheCost =
    ((step.inputTokens + step.cacheReadTokens) / 1e6) * r.baseInputRate + outputCost;
  const cacheSaved = Math.max(0, noCacheCost - totalCost);
  return {
    modelKey: r.key,
    pool: r.pool,
    inputCost,
    cacheCost,
    outputCost,
    totalCost,
    noCacheCost,
    cacheSaved,
    rates: r,
  };
}

export function getCatalogList(settings = DEFAULT_SETTINGS) {
  const now = Date.now();
  return Object.entries(MODEL_CATALOG).map(([key, entry]) => {
    const active = resolveRatesAt(key, now, settings);
    return {
      key,
      label: entry.label,
      family: entry.family,
      pool: entry.pool,
      color: entry.color,
      contextLimit: settings?.contextLimits?.[key] || entry.contextLimit,
      input: active.baseInputRate,
      effectiveInput: active.effectiveInput,
      cache: active.cacheRate,
      output: active.outputRate,
      defaultInput: entry.input,
      defaultCache: entry.cache,
      defaultOutput: entry.output,
      isCustom: active.isCustom,
      phases: entry.phases || [],
    };
  });
}
