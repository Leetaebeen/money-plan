const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8");
for (const scope of ["https://example.com/money-plan/", "https://example.com/"]) {
  test(`retirement preserves unrelated caches and never navigates clients: ${scope}`, async () => {
    const events = new Map();
    const deleted = [];
    const calls = [];
    const own = `workbox-precache-v2-${scope}`;
    vm.runInNewContext(source, {
      self: {
        addEventListener: (name, fn) => events.set(name, fn),
        skipWaiting: async () => calls.push("skip"),
        registration: { scope, unregister: async () => calls.push("unregister") },
        clients: { claim: async () => calls.push("claim") },
      },
      caches: {
        keys: async () => [own, "workbox-precache-v2-https://example.com/other/", `unrelated-${scope}`],
        delete: async name => deleted.push(name),
      },
    });
    let pending;
    events.get("install")({ waitUntil: promise => { pending = promise; } });
    await pending;
    events.get("activate")({ waitUntil: promise => { pending = promise; } });
    await pending;
    assert.deepEqual(deleted, [own]);
    assert.deepEqual(calls, ["skip", "claim", "unregister"]);
    assert.equal(events.has("fetch"), false);
  });
}
