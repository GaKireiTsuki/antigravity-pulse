#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="antigravity-pulse"
TARGET_DIR="${HOME}/.gemini/config/plugins/${PLUGIN_NAME}"

echo "Building ${PLUGIN_NAME}..."
(cd "${ROOT_DIR}" && npm run build)

echo "Installing to ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}/dist" "${TARGET_DIR}/assets" "${TARGET_DIR}/scripts" "${TARGET_DIR}/skills/pulse-usage"

cp "${ROOT_DIR}/plugin.json" "${TARGET_DIR}/plugin.json"
cp "${ROOT_DIR}/mcp_config.json" "${TARGET_DIR}/mcp_config.json"
cp "${ROOT_DIR}/hooks.json" "${TARGET_DIR}/hooks.json"
cp "${ROOT_DIR}/README.md" "${TARGET_DIR}/README.md"
cp "${ROOT_DIR}/assets/logo.svg" "${TARGET_DIR}/assets/logo.svg"
cp "${ROOT_DIR}/dist/server.mjs" "${TARGET_DIR}/dist/server.mjs"
cp "${ROOT_DIR}/dist/app.html" "${TARGET_DIR}/dist/app.html"
cp "${ROOT_DIR}/scripts/telemetry-hook.mjs" "${TARGET_DIR}/scripts/telemetry-hook.mjs"
cp "${ROOT_DIR}/skills/pulse-usage/SKILL.md" "${TARGET_DIR}/skills/pulse-usage/SKILL.md"
chmod +x "${TARGET_DIR}/scripts/telemetry-hook.mjs"

AGY_BIN="$(command -v agy || echo "${HOME}/.gemini/bin/agy")"
if [ -x "${AGY_BIN}" ]; then
  echo "Validating installed plugin with agy plugin validate --strict..."
  "${AGY_BIN}" plugin validate --strict "${TARGET_DIR}"
fi

echo "Done! Plugin installed at ${TARGET_DIR}"
