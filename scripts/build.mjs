import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

fs.mkdirSync(distDir, { recursive: true });

// 1. Bundle UI JS + @modelcontextprotocol/ext-apps into a single self-contained JS string
const uiJsResult = await esbuild.build({
  entryPoints: [path.join(rootDir, "src", "ui", "app.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome120", "safari17", "es2022"],
  write: false,
  logLevel: "info",
});
const bundledUiJs = uiJsResult.outputFiles[0].text;

// 2. Minify CSS
const cssRaw = fs.readFileSync(path.join(rootDir, "src", "ui", "styles.css"), "utf8");
const cssMin = (
  await esbuild.transform(cssRaw, {
    loader: "css",
    minify: true,
  })
).code;

// 3. Inline CSS + JS into single-file MCP App HTML (100% CSP default-src 'none' compliant)
const htmlTemplate = fs.readFileSync(path.join(rootDir, "src", "ui", "index.html"), "utf8");
const finalHtml = htmlTemplate
  .replace("/*__INLINE_CSS__*/", () => cssMin)
  .replace("/*__INLINE_JS__*/", () => bundledUiJs);

const appHtmlPath = path.join(distDir, "app.html");
fs.writeFileSync(appHtmlPath, finalHtml, "utf8");

// 4. Bundle MCP server into a standalone zero-runtime-dependency ESM file
await esbuild.build({
  entryPoints: [path.join(rootDir, "src", "server.mjs")],
  outfile: path.join(distDir, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  banner: {
    js: `import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);`,
  },
  external: ["node:*"],
  logLevel: "info",
});

// Make hook executable
const hookPath = path.join(rootDir, "scripts", "telemetry-hook.mjs");
if (fs.existsSync(hookPath)) {
  fs.chmodSync(hookPath, 0o755);
}

const htmlKb = (Buffer.byteLength(finalHtml, "utf8") / 1024).toFixed(1);
const srvKb = (fs.statSync(path.join(distDir, "server.mjs")).size / 1024).toFixed(1);
console.log(`Built dist/app.html (${htmlKb} KB) and dist/server.mjs (${srvKb} KB)`);
