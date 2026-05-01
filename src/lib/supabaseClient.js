/**
 * Supabase クライアント (lazy init + 設定なしフォールバック)
 *
 * Round 45: クラウド同期を任意機能として実装。
 * 環境変数 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) が未設定なら
 * cloudEnabled() === false。 アプリはローカル保存のみで通常動作する。
 *
 * セキュリティ:
 * ・anon key は公開されても問題ない (Supabase の設計上)
 * ・データ保護は Supabase RLS (Row Level Security) ポリシーで実施
 * ・パスワードは Supabase Auth が bcrypt でサーバー側ハッシュ
 * ・このアプリはパスワードを localStorage や cookie に保存しない
 *   (Supabase SDK が独自の安全な session token を localStorage に置くだけ)
 */
import { createClient } from "@supabase/supabase-js";

// Node.js (テスト) と Vite 両方で動くよう防御的にアクセス
const _env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : (typeof process !== "undefined" ? process.env : {});
const SUPABASE_URL = _env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = _env.VITE_SUPABASE_ANON_KEY || "";

let _client = null;

export function cloudEnabled() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!cloudEnabled()) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Username-only flow なので email 確認は使わない
        // (signUp の email は username@kyotei.local の擬似形)
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

/* デバッグ表示用: 設定されているか + URL の一部 */
export function getCloudConfig() {
  return {
    enabled: cloudEnabled(),
    urlPreview: SUPABASE_URL ? SUPABASE_URL.slice(0, 30) + "…" : null,
  };
}
