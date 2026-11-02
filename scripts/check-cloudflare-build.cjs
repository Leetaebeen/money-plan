require('./check-web-build.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(__dirname, '../apps/web/dist');
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const raw = fs.readFileSync(path.join(out, '_headers'), 'utf8');
assert.ok(raw.startsWith('/*\n'), 'Headers must cover every static response');
const headers = Object.fromEntries(raw.trim().split('\n').slice(1).map(line => {
  const match = /^  ([A-Za-z-]+): (.+)$/.exec(line);
  assert.ok(match, 'Invalid Cloudflare header line');
  return [match[1].toLowerCase(), match[2]];
}));
for (const [name, value] of Object.entries({
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
})) assert.equal(headers[name], value);
const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]?.replace(/&#39;/g, "'");
assert.ok(meta);
assert.equal(headers['content-security-policy'], `${meta}; frame-ancestors 'none'`);
const urls = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]).filter(url => url.startsWith('/'));
assert.ok(urls.length);
for (const url of urls) {
  assert.ok(!url.startsWith('/money-plan/'), 'Cloudflare build must use root asset paths');
  assert.ok(fs.existsSync(path.join(out, decodeURIComponent(url.slice(1).split(/[?#]/)[0]))));
}
const notFound = fs.readFileSync(path.join(out, '404.html'), 'utf8');
assert.match(notFound, /href="\/"/);
assert.doesNotMatch(notFound, /<script|http-equiv="refresh"/i);
console.log('Cloudflare header configuration, root paths and explicit 404 passed (not a deployed-header check).');
