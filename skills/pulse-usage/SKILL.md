---
name: pulse-usage
description: >-
  Open the Antigravity Pulse live monitor or full analytics dashboard, or query
  Antigravity token usage, estimated API costs, cache hit rates, subscription
  ROI, and conversation context window breakdowns.
---

# Antigravity Pulse

Use the `antigravity-pulse_pulse` MCP App tools when the user asks to inspect
Antigravity token usage, estimated API costs, context window breakdowns, model
speed/health, or to open the interactive visualization dashboard:

- Call `open_pulse_monitor` to open or refresh the live right-side auxiliary
  panel (current session context breakdown, step speed & cost, rolling 5h/7d
  usage windows, and subscription ROI).
- Call `open_pulse_dashboard` to open the full-page overview dashboard (KPI
  trends, 53-week usage heatmap, model health timeline, token/cost donut charts,
  model table, task/swarm tree, and request/anomaly logs).

Pass empty arguments `{}` by default unless the user specifies a range
(`today`, `7d`, `30d`, `all`) or a specific conversation ID. Keep your textual
reply concise since the interactive UI renders full charts directly.
