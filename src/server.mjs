import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PulseStore } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URI = "ui://antigravity-pulse/app.html";
const APP_MIME = "text/html;profile=mcp-app";

const store = new PulseStore();

function readAppHtml() {
  const override = process.env.PULSE_APP_HTML;
  const candidates = [
    override,
    path.join(__dirname, "app.html"),
    path.resolve(__dirname, "..", "dist", "app.html"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8");
    }
  }
  return `<!doctype html><html><body><p>Antigravity Pulse UI bundle not found. Run npm run build.</p></body></html>`;
}

function formatShortTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function summarizeSnapshotText(snap) {
  const k = snap.kpi;
  const s = snap.subscription;
  const cny = (k.costUsd * (snap.settings?.usdToCny || 6.67)).toFixed(0);
  const parts = [
    `Antigravity Pulse (${snap.range}):`,
    `Tokens ${formatShortTokens(k.totalTokens)} (缓存命中 ${k.cacheHitRate}%)`,
    `折合费用 $${k.costUsd.toFixed(2)} (≈ ¥${cny})`,
    `请求 ${k.requests} 次 (成功率 ${k.successRate}%)`,
  ];
  if (s?.enabled) {
    parts.push(`${s.planName} ($${s.monthlyUsd}) 已回本 ${s.roiMultiplier}x`);
  }
  return parts.join(" | ");
}

const server = new McpServer({
  name: "antigravity-pulse",
  version: "1.0.0",
});

// 1. Register the single-file interactive MCP App UI resource
server.registerResource(
  "antigravity_pulse_app",
  APP_URI,
  {
    title: "Antigravity Pulse UI",
    description: "Interactive live monitor and full usage dashboard for Antigravity.",
    mimeType: APP_MIME,
    _meta: {
      ui: {
        prefersBorder: false,
      },
    },
  },
  async () => ({
    contents: [
      {
        uri: APP_URI,
        mimeType: APP_MIME,
        text: readAppHtml(),
        _meta: {
          ui: {
            prefersBorder: false,
          },
        },
      },
    ],
  })
);

// 2. Full-page Global Dashboard Entrypoint (Left Sidebar -> Plugins)
server.registerTool(
  "open_pulse_dashboard",
  {
    title: "Antigravity Pulse",
    description:
      "Open the full-page Antigravity Pulse analytics dashboard (KPI trends, 53-week heatmap, model health timeline, token/cost donuts, task/swarm tree, request/error explorer, pricing & ROI).",
    inputSchema: {
      range: z.enum(["today", "7d", "30d", "cycle", "all"]).optional().describe("Initial time range filter."),
      model: z.string().optional().describe("Optional canonical model key filter."),
    },
    _meta: {
      ui: { resourceUri: APP_URI },
      "com.google.antigravity/ui": {
        entrypoints: [{ type: "global", title: "Antigravity Pulse" }],
      },
    },
  },
  async (args = {}) => {
    const snap = store.getOverviewSnapshot({
      range: args.range || "all",
      model: args.model || "all",
    });
    return {
      content: [{ type: "text", text: summarizeSnapshotText(snap) }],
      structuredContent: {
        surface: "dashboard",
        snapshot: snap,
      },
    };
  }
);

// 3. Right Side Auxiliary Pane Live Monitor Entrypoint (Side Pane "+" menu & agent-callable)
server.registerTool(
  "open_pulse_monitor",
  {
    title: "Pulse 实时监控",
    description:
      "Open the live Antigravity Pulse monitor in the right auxiliary pane (real-time speed/latency/step cost, 10-category context window breakdown, rolling 5h/7d windows, and subscription ROI).",
    inputSchema: {
      conversationId: z.string().optional().describe("Optional conversation UUID to inspect."),
      range: z.enum(["today", "7d", "30d", "cycle", "all"]).optional().describe("Summary time range."),
    },
    _meta: {
      ui: { resourceUri: APP_URI },
      "com.google.antigravity/ui": {
        entrypoints: [{ type: "aux_pane", title: "Pulse 实时监控" }],
      },
    },
  },
  async (args = {}) => {
    const snap = store.getOverviewSnapshot({
      range: args.range || "all",
      conversationId: args.conversationId || undefined,
    });
    return {
      content: [{ type: "text", text: summarizeSnapshotText(snap) }],
      structuredContent: {
        surface: "monitor",
        snapshot: snap,
      },
    };
  }
);

// 4. App-only high-speed snapshot / heartbeat poll tool (hidden from model)
server.registerTool(
  "pulse_get_snapshot",
  {
    title: "Pulse Snapshot",
    description: "Fetch incremental usage overview snapshot for the UI.",
    inputSchema: {
      range: z.enum(["today", "7d", "30d", "cycle", "all"]).optional(),
      model: z.string().optional(),
      conversationId: z.string().optional(),
      sinceRevision: z.string().optional(),
    },
    _meta: {
      ui: { visibility: ["app"] },
    },
  },
  async (args = {}) => {
    const snap = store.getOverviewSnapshot({
      range: args.range || "all",
      model: args.model || "all",
      conversationId: args.conversationId || undefined,
      sinceRevision: args.sinceRevision || undefined,
    });
    return {
      content: [{ type: "text", text: snap.unchanged ? "unchanged" : "ok" }],
      structuredContent: snap,
    };
  }
);

// 5. App-only conversation 10-category context breakdown tool
server.registerTool(
  "pulse_get_context",
  {
    title: "Pulse Context Breakdown",
    description: "Analyze 10-category context window breakdown for a specific conversation.",
    inputSchema: {
      conversationId: z.string().optional(),
    },
    _meta: {
      ui: { visibility: ["app"] },
    },
  },
  async (args = {}) => {
    const ctx = store.getContextBreakdown(args.conversationId);
    return {
      content: [{ type: "text", text: ctx ? "ok" : "empty" }],
      structuredContent: { context: ctx },
    };
  }
);

// 6. App-only tasks & swarm hierarchy tool
server.registerTool(
  "pulse_get_tasks",
  {
    title: "Pulse Tasks & Swarm Tree",
    description: "Fetch root tasks with nested subagent/swarm trees and flat session list.",
    inputSchema: {
      range: z.enum(["today", "7d", "30d", "cycle", "all"]).optional(),
    },
    _meta: {
      ui: { visibility: ["app"] },
    },
  },
  async (args = {}) => {
    const data = store.getTasksSnapshot({ range: args.range || "all" });
    return {
      content: [{ type: "text", text: "ok" }],
      structuredContent: data,
    };
  }
);

// 7. App-only paginated requests & anomalies tool
server.registerTool(
  "pulse_get_requests",
  {
    title: "Pulse Request Events",
    description: "Fetch paginated request events, errors, and cache drop anomalies.",
    inputSchema: {
      range: z.enum(["today", "7d", "30d", "cycle", "all"]).optional(),
      model: z.string().optional(),
      conversationId: z.string().optional(),
      filter: z.enum(["all", "error", "anomaly", "checkpoint"]).optional(),
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(10).max(100).optional(),
    },
    _meta: {
      ui: { visibility: ["app"] },
    },
  },
  async (args = {}) => {
    const data = store.getRequestsPage(args);
    return {
      content: [{ type: "text", text: "ok" }],
      structuredContent: data,
    };
  }
);

// 8. App-only settings & index maintenance tool
server.registerTool(
  "pulse_update_settings",
  {
    title: "Pulse Update Settings",
    description: "Persist user preferences, subscription plan, custom pricing, or rebuild cache.",
    inputSchema: {
      action: z.enum(["save", "resetPricing", "rebuildCache"]).optional(),
      settings: z.record(z.string(), z.any()).optional(),
    },
    _meta: {
      ui: { visibility: ["app"] },
    },
  },
  async (args = {}) => {
    if (args.action === "rebuildCache") {
      const info = store.resetCache();
      const snap = store.getOverviewSnapshot({ range: "all" });
      return {
        content: [{ type: "text", text: "rebuilt" }],
        structuredContent: { ok: true, info, snapshot: snap },
      };
    }
    if (args.action === "resetPricing") {
      const next = store.saveSettings({ customPricing: {} });
      const snap = store.getOverviewSnapshot({ range: "all" });
      return {
        content: [{ type: "text", text: "reset" }],
        structuredContent: { ok: true, settings: next, snapshot: snap },
      };
    }
    const next = store.saveSettings(args.settings || {});
    const snap = store.getOverviewSnapshot({ range: "all" });
    return {
      content: [{ type: "text", text: "saved" }],
      structuredContent: { ok: true, settings: next, snapshot: snap },
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("beforeExit", () => {
  store.flushIndexNow();
});
