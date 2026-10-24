import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: { rollupOptions: { input: { app: "index.html" } } },
  plugins: [react()],
});
