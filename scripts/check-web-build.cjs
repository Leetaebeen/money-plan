const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve(__dirname, "../apps/web/dist");
const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
assert.match(html, /lang="ko"/);
assert.match(html, /name="viewport"/);
assert.doesNotMatch(html, /rel="manifest"/);
for (const removed of ["calculator/index.html", "manifest.webmanifest", "data/financial-products.json"]) {
  assert.equal(fs.existsSync(path.join(out, removed)), false, `Removed output still exists: ${removed}`);
}
const worker = fs.readFileSync(path.join(out, "sw.js"), "utf8");
assert.match(worker, /registration\.unregister/);
assert.doesNotMatch(worker, /addEventListener\(["']fetch|precacheAndRoute/);
const scripts = fs.readdirSync(path.join(out, "assets")).filter(name => name.endsWith(".js"));
const bundles = scripts.map(name => fs.readFileSync(path.join(out, "assets", name), "utf8")).join("\n");
for (const removed of ["이전 월급 계산기", "오프라인 실행 준비", "financial-products.json", "serviceWorker.register("]) {
  assert.equal(bundles.includes(removed), false, `Retired feature bundled: ${removed}`);
}
console.log("Web build and offline retirement checks passed.");

assert.match(html, /http-equiv="Content-Security-Policy"/);
assert.match(html, /name="referrer" content="no-referrer"/);
const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]?.replace(/&#39;/g, "'");
assert.ok(policy);
for (const directive of ["default-src 'none'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"]) assert.ok(policy.includes(directive));
assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
