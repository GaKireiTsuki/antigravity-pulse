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

test("auto quota inference derives 5h pool from [quota] anchor, resets after boundary, and hides expired alerts", () => {
  const { tmp, agyDir, dataDir } = makeTempEnv();
  try {
    const cid = "22222222-2222-2222-2222-222222222222";
    const now = Date.now();
    // Previous 5h window ended 30 minutes ago; inside it we spent $100 and got a 20% remaining notice => inferred 5h cap = $125
    const resetMs = now - 30 * 60 * 1000;
    const stepBeforeReset = resetMs - 60 * 60 * 1000;
    const anchorTs = resetMs - 10 * 60 * 1000;
    const stepAfterReset = now - 5 * 60 * 1000;

    // Gemini 4 Neon: input $3/M, output $15/M => 20M input ($60) + ~2.667M output ($40) = $100
    writeTranscript(agyDir, cid, [
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "gemini-4-neon-xhigh",
        input_tokens: 20_000_000,
        cache_read_tokens: 0,
        output_tokens: 2_666_667,
        created_at: new Date(stepBeforeReset).toISOString(),
      },
      {
        step_index: 2,
        type: "SYSTEM_MESSAGE",
        content: `[quota] model gemini-4-neon-xhigh is low on quota (20% remaining, resets at ${new Date(resetMs).toISOString()})`,
        created_at: new Date(anchorTs).toISOString(),
      },
      // New step AFTER 5h reset: $3 input + $0 output = $3
      {
        step_index: 3,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "gemini-4-neon-xhigh",
        input_tokens: 1_000_000,
        cache_read_tokens: 0,
        output_tokens: 0,
        created_at: new Date(stepAfterReset).toISOString(),
      },
    ]);

    const store = new PulseStore({ antigravityDir: agyDir, dataDir });
    const snap = store.getOverviewSnapshot({ range: "all" });

    // Expired low-quota warning must NOT show in active alerts
    assert.equal(snap.quotaHints.length, 0);
    // 5h pool inferred from $100 / 0.80 = $125
    assert.equal(snap.rollingWindows.gemini5h.source, "anchor");
    assert.equal(snap.rollingWindows.gemini5h.budgetUsd, 125);
    // Only post-reset $3 spend counted in current 5h window (not pre-reset $100!)
    assert.equal(snap.rollingWindows.gemini5h.costUsd, 3);
    assert.equal(snap.rollingWindows.gemini5h.remainingUsd, 122);
    assert.ok(snap.rollingWindows.gemini5h.remainingPct > 97);
    // Cycle quota auto-derived from inferred weekly quota
    assert.equal(snap.subscription.cycleQuotaSource, "anchor");
    assert.ok(snap.subscription.cycleQuotaUsd > 1000);
    // Strict pool isolation: Gemini models stay in gemini pool, Claude/GPT stay in claude pool
    assert.ok(snap.quotaPools.gemini.modelEstimates.every((m) => m.pool === "gemini"));
    assert.ok(snap.quotaPools.claude.modelEstimates.every((m) => m.pool === "claude"));
    // Gemini spend must NOT affect Claude & GPT pool remaining
    assert.equal(snap.quotaPools.claude.win5h.costUsd, 0);
    assert.equal(snap.quotaPools.claude.win5h.remainingPct, 100);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("View Usage manual calibration anchors infer independent Gemini and Claude/GPT pools and deduct post-anchor usage", () => {
  const { tmp, agyDir, dataDir } = makeTempEnv();
  try {
    const cid = "33333333-3333-3333-3333-333333333333";
    const now = Date.now();
    const obsMs = now - 10 * 60 * 1000;
    const beforeObs = obsMs - 30 * 60 * 1000;
    const afterObs = now - 2 * 60 * 1000;

    // Before calibration:
    //   Gemini 4 Neon ($3/M in): 100M input = $300 -> calibrated at 50% left => inferred weekly cap = $600
    //   Claude Opus 5.5 ($4/M * 1.25 cache write = $5/M in): 3M input = $15 -> calibrated at 50% left => inferred weekly cap = $30
    // After calibration:
    //   Claude Opus 5.5: 0.6M input = $3 -> should deduct 10% (50% -> 40%) from Claude pool ONLY, Gemini stays 50%!
    writeTranscript(agyDir, cid, [
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "gemini-4-neon-xhigh",
        input_tokens: 100_000_000,
        cache_read_tokens: 0,
        output_tokens: 0,
        created_at: new Date(beforeObs).toISOString(),
      },
      {
        step_index: 2,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "claude-opus-5-5-high",
        input_tokens: 3_000_000,
        cache_read_tokens: 0,
        output_tokens: 0,
        created_at: new Date(beforeObs + 1000).toISOString(),
      },
      {
        step_index: 3,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        model: "claude-opus-5-5-high",
        input_tokens: 600_000,
        cache_read_tokens: 0,
        output_tokens: 0,
        created_at: new Date(afterObs).toISOString(),
      },
    ]);

    const store = new PulseStore({ antigravityDir: agyDir, dataDir });
    store.saveSettings({
      quotaAnchors: {
        gemini7d: { remainingPct: 50, resetsAtMs: obsMs + 6 * 86400000, observedAtMs: obsMs },
        claude7d: { remainingPct: 50, resetsAtMs: obsMs + 6 * 86400000, observedAtMs: obsMs },
      },
    });

    const snap = store.getOverviewSnapshot({ range: "all" });
    assert.equal(snap.quotaPools.gemini.win7d.source, "calibrated");
    assert.equal(snap.quotaPools.gemini.win7d.budgetUsd, 600);
    assert.equal(snap.quotaPools.gemini.win7d.remainingPct, 50);
    assert.equal(snap.quotaPools.gemini.win7d.remainingUsd, 300);

    assert.equal(snap.quotaPools.claude.win7d.source, "calibrated");
    assert.equal(snap.quotaPools.claude.win7d.budgetUsd, 30);
    assert.equal(snap.quotaPools.claude.win7d.remainingPct, 40);
    assert.equal(snap.quotaPools.claude.win7d.remainingUsd, 12);
    assert.equal(snap.quotaPools.claude.win7d.exceededUsd, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
