#!/usr/bin/env node
/**
 * Antigravity Pulse — Ultra-fast lifecycle telemetry hook (<15ms).
 * Captures real PreInvocation / PostInvocation timing (for tok/s & latency)
 * and Stop error diagnostics using only Node.js built-ins.
 * Never blocks or alters the conversation trajectory.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const eventName = process.argv[2] || "Unknown";
const dataDir =
  process.env.PULSE_DATA_DIR ||
  path.join(os.homedir(), ".gemini", "antigravity", "plugin_data", "antigravity-pulse");
const inflightDir = path.join(dataDir, "inflight");
const timingLog = path.join(dataDir, "timing.jsonl");

function readLastPlannerStep(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    const stat = fs.statSync(transcriptPath);
    const readSize = Math.min(stat.size, 65536);
    const buf = Buffer.alloc(readSize);
    const fd = fs.openSync(transcriptPath, "r");
    try {
      fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    } finally {
      fs.closeSync(fd);
    }
    const lines = buf.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith("{")) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === "PLANNER_RESPONSE" || obj.type === "CHECKPOINT") {
          return {
            stepIndex: obj.step_index,
            model: obj.model || null,
            inputTokens: Number(obj.input_tokens || 0),
            cacheReadTokens: Number(obj.cache_read_tokens || 0),
            outputTokens: Number(obj.output_tokens || 0),
            status: obj.status || "DONE",
            createdAt: obj.created_at || null,
          };
        }
      } catch {
        // ignore truncated first line in tail slice
      }
    }
  } catch {
    // non-fatal
  }
  return null;
}

function safeWriteOutput(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    safeWriteOutput(eventName === "Stop" ? { decision: "allow" } : {});
    return;
  }

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    safeWriteOutput(eventName === "Stop" ? { decision: "allow" } : {});
    return;
  }

  const now = Date.now();
  const cid = payload.conversationId || "unknown";
  const model = payload.modelName || null;
  const invocationNum = payload.invocationNum ?? null;
  const safeCid = cid.replace(/[^a-zA-Z0-9_-]/g, "_");
  const inflightFile = path.join(inflightDir, `${safeCid}.json`);

  try {
    fs.mkdirSync(inflightDir, { recursive: true });

    if (eventName === "PreInvocation") {
      fs.writeFileSync(
        inflightFile,
        JSON.stringify({
          ts: now,
          cid,
          model,
          invocationNum,
          initialNumSteps: payload.initialNumSteps ?? null,
        })
      );
    } else if (eventName === "PostInvocation") {
      let startTs = null;
      let startModel = model;
      if (fs.existsSync(inflightFile)) {
        try {
          const prev = JSON.parse(fs.readFileSync(inflightFile, "utf8"));
          startTs = prev.ts;
          startModel = prev.model || model;
          fs.unlinkSync(inflightFile);
        } catch {}
      }
      const durationMs = startTs && now >= startTs ? now - startTs : null;
      const lastStep = readLastPlannerStep(payload.transcriptPath);
      const outputTokens = lastStep?.outputTokens || 0;
      const tps =
        durationMs && durationMs >= 150 && outputTokens > 0
          ? Number(((outputTokens / durationMs) * 1000).toFixed(2))
          : null;

      const record = {
        event: "invocation",
        ts: now,
        cid,
        model: lastStep?.model || startModel || "unknown",
        stepIndex: lastStep?.stepIndex ?? null,
        invocationNum,
        durationMs,
        outputTokens,
        tps,
        status: lastStep?.status || "DONE",
      };
      fs.appendFileSync(timingLog, JSON.stringify(record) + "\n");
    } else if (eventName === "Stop") {
      if (fs.existsSync(inflightFile)) {
        try {
          fs.unlinkSync(inflightFile);
        } catch {}
      }
      if (payload.error || payload.terminationReason === "error") {
        const errRec = {
          event: "stop_error",
          ts: now,
          cid,
          model: model || "unknown",
          reason: payload.terminationReason || "error",
          error: payload.error || "Unknown error",
        };
        fs.appendFileSync(timingLog, JSON.stringify(errRec) + "\n");
      }
    }
  } catch {
    // Telemetry must never break agent execution
  }

  if (eventName === "Stop") {
    safeWriteOutput({ decision: "allow" });
  } else {
    safeWriteOutput({});
  }
}

main();
