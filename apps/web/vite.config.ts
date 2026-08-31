import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        calculator: "calculator/index.html",
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["money-plan-icon.svg"],
      manifest: {
        name: "머니플랜",
        short_name: "머니플랜",
        description: "월급과 여윳돈을 직접 선택한 기준에 따라 나눠보는 예산 도구",
        theme_color: "#173f36",
        background_color: "#f5f3ed",
        display: "standalone",
        id: "./",
        start_url: "./",
        scope: "./",
        lang: "ko-KR",
        categories: ["finance", "productivity"],
        icons: [
          {
            src: "money-plan-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,json,svg,webmanifest}"],
      },
    }),
  ],
});
