import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PulseStore } from "../src/store.mjs";
import { computeStepCost, normalizeModelKey, resolveRatesAt } from "../src/pricing.mjs";

function makeTempEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agy-pulse-test-"));
  const agyDir = path.join(tmp, "antigravity");
  const dataDir = path.join(tmp, "plugin_data");
  fs.mkdirSync(path.join(agyDir, "brain"), { recursive: true });
  return { tmp, agyDir, dataDir };
}

function writeTranscript(agyDir, cid, lines, full = false) {
  const logDir = path.join(agyDir, "brain", cid, ".system_generated", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, full ? "transcript_full.jsonl" : "transcript.jsonl");
  fs.writeFileSync(file, lines.map((x) => JSON.stringify(x)).join("\n") + "\n", "utf8");
  return file;
}

test("time-phased pricing resolves Nov promo vs Dec standard rates for Gemini 4 Carbon", () => {
  assert.equal(normalizeModelKey("gemini-4-neon-xhigh"), "gemini-4-neon");
  assert.equal(normalizeModelKey("gemini-4-carbon-high"), "gemini-4-carbon");
  assert.equal(normalizeModelKey("claude-opus-5-5-high"), "claude-opus-5-5");

  const nov = resolveRatesAt("gemini-4-carbon-high", Date.parse("2026-11-26T10:00:00Z"));
  assert.equal(nov.effectiveInput, 2.0);
  assert.equal(nov.cacheRate, 0.1);
  assert.equal(nov.outputRate, 10.0);

  const dec = resolveRatesAt("gemini-4-carbon-high", Date.parse("2026-12-02T10:00:00Z"));
  assert.equal(dec.effectiveInput, 4.0);
  assert.equal(dec.cacheRate, 0.2);
  assert.equal(dec.outputRate, 20.0);

  const stepCost = computeStepCost({
    model: "gemini-4-neon-xhigh",
    tsMs: Date.parse("2026-11-26T10:00:00Z"),
    inputTokens: 1_000_000,
    cacheReadTokens: 10_000_000,
    outputTokens: 1_000_000,
  });
  // $3.00 + $1.50 + $15.00 = $19.50
  assert.ok(Math.abs(stepCost.totalCost - 19.5) < 1e-6);
});

test("incremental byte-offset indexer, cache anomaly detection, and unchanged revision fast path", () => {
  const { tmp, agyDir, dataDir } = makeTempEnv();
  try {
    const cid = "11111111-1111-1111-1111-111111111111";
    const t0 = Date.now() - 120_000;
    const tf = writeTranscript(agyDir, cid, [
      { step_index: 0, type: "USER_INPUT", content: "Hello world", created_at: new Date(t0).toISOString() },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "gemini-4-neon-xhigh",
        input_tokens: 50000,
        cache_read_tokens: 0,
        output_tokens: 1000,
        created_at: new Date(t0 + 1000).toISOString(),
      },
      {
        step_index: 2,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "gemini-4-neon-xhigh",
        input_tokens: 5000,
        cache_read_tokens: 50000,
        output_tokens: 1200,
        created_at: new Date(t0 + 20000).toISOString(),
      },
      // Short-interval sudden cache drop (within 4 minutes, prev ctx 55000 -> cr=0, inp=58000)
      {
        step_index: 3,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "gemini-4-neon-xhigh",
        input_tokens: 58000,
        cache_read_tokens: 0,
        output_tokens: 800,
        created_at: new Date(t0 + 40000).toISOString(),
      },
    ]);

    const store = new PulseStore({ antigravityDir: agyDir, dataDir });
    const snap1 = store.getOverviewSnapshot({ range: "all" });
    assert.equal(snap1.unchanged, false);
    assert.equal(snap1.kpi.requests, 3);
    assert.equal(snap1.kpi.anomalyCount, 1);
    assert.equal(snap1.kpi.inputTokens, 113000);
    assert.equal(snap1.kpi.cacheReadTokens, 50000);
    assert.equal(snap1.kpi.outputTokens, 3000);
    assert.equal(snap1.heatmap.length >= 365, true);

    // Fast path unchanged check
    const snapUnchanged = store.getOverviewSnapshot({
      range: "all",
      sinceRevision: snap1.revision,
    });
    assert.equal(snapUnchanged.unchanged, true);

    // Append a new step incrementally
    fs.appendFileSync(
      tf,
      JSON.stringify({
        step_index: 4,
        type: "CHECKPOINT",
        status: "DONE",
        input_tokens: 2000,
        cache_read_tokens: 58000,
        output_tokens: 500,
        created_at: new Date(t0 + 60000).toISOString(),
      }) + "\n"
    );

    store.sync(true);
    const snap2 = store.getOverviewSnapshot({ range: "all", sinceRevision: snap1.revision });
    assert.equal(snap2.unchanged, false);
    assert.equal(snap2.kpi.requests, 4);
    assert.equal(snap2.kpi.checkpointCount, 1);

    // Context breakdown aligns exactly to API reported context total (60,000)
    const ctx = store.getContextBreakdown(cid);
    assert.ok(ctx);
    assert.equal(ctx.contextTokens, 60000);
    const sumCats = ctx.categories.reduce((acc, c) => acc + c.tokens, 0);
    assert.equal(sumCats, 60000);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
