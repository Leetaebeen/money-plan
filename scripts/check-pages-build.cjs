require("./check-web-build.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve(__dirname, "../apps/web/dist");
const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
const urls = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(m => m[1]).filter(url => url.startsWith("/"));
assert.ok(urls.length);
for (const url of urls) {
  assert.ok(url.startsWith("/money-plan/"), `Invalid Pages path: ${url}`);
  assert.ok(fs.existsSync(path.join(out, decodeURIComponent(url.slice("/money-plan/".length).split(/[?#]/)[0]))));
}
console.log("GitHub Pages asset paths passed.");
