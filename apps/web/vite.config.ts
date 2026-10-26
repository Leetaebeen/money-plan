import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; upgrade-insecure-requests";
const headers = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
export default defineConfig({
  build: { rollupOptions: { input: { app: "index.html" } } },
  server: { host: "127.0.0.1", headers },
  preview: { host: "127.0.0.1", headers: { ...headers, "Content-Security-Policy": `${policy}; frame-ancestors 'none'` } },
  plugins: [react(), {
    name: "production-security-policy",
    apply: "build",
    transformIndexHtml: { order: "post", handler() {
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    } },
  }],
});
