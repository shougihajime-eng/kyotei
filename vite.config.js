import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel デプロイ:
//   - フロントは Vite が `dist/` にビルド (vercel.json で設定済み)
//   - /api/*.js はそのまま Vercel Serverless Function として動く
//
// Round 126: モバイル体感速度の改善
//   ・manualChunks で react / supabase を分離 → 初回ロード分散 + ブラウザキャッシュ効率↑
//   ・recharts は既に lazy load (Stats タブを開いた時のみ)、 cheerio は api/ でのみ使用 (bundle 対象外)
//   ・chunkSizeWarningLimit を 600KB → 800KB に緩和
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // React / ReactDOM を独立チャンク化 → 一度キャッシュされると更新時もダウンロード不要
          "react-vendor": ["react", "react-dom"],
          // Supabase クライアント (90KB) を分離 → 未ログイン時はロード不要にできる将来余地
          "supabase-vendor": ["@supabase/supabase-js"],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
