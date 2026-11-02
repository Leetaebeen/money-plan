import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; upgrade-insecure-requests";
const headers = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
let rootBuild = false;
const responseHeaders = { ...headers, "Content-Security-Policy": `${policy}; frame-ancestors 'none'` };
export default defineConfig({
  build: { rollupOptions: { input: { app: "index.html" } } },
  server: { host: "127.0.0.1", headers },
  preview: { host: "127.0.0.1", headers: responseHeaders },
  plugins: [react(), {
    name: "production-security-policy",
    apply: "build",
    configResolved(config) { rootBuild = config.base === "/"; },
    generateBundle() {
      if (!rootBuild) return;
      this.emitFile({ type: "asset", fileName: "_headers", source:
        "/*\n" + Object.entries(responseHeaders).map(([name, value]) => `  ${name}: ${value}`).join("\n") + "\n" });
      // A real 404 avoids Cloudflare Pages' implicit SPA fallback for removed URLs.
      this.emitFile({ type: "asset", fileName: "404.html", source:
        '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>페이지를 찾을 수 없어요 · 머니플랜</title></head><body><h1>페이지를 찾을 수 없어요</h1><p>주소를 확인하거나 홈으로 이동해 주세요.</p><a href="/">머니플랜 홈</a></body></html>' });
    },
    transformIndexHtml: { order: "post", handler() {
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    } },
  }],
});
