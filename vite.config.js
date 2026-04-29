import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel デプロイ:
//   - フロントは Vite が `dist/` にビルド (vercel.json で設定済み)
//   - /api/*.js はそのまま Vercel Serverless Function として動く
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
