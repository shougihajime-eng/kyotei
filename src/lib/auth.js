/**
 * Auth — email + password (Round 51-A 修正版)
 *
 * Round 45 では「ユーザー名 + パスワード」 の擬似 email 方式だったが、
 * Supabase の email 確認設定との相性が悪く、登録/ログインが正常動作しないケースがあった。
 * Round 51-A で標準的な「email + password + 確認用パスワード」 に戻す。
 *
 * セキュリティ:
 * ・email は Supabase に保存されるが、用途は認証のみ (個人特定はしない)
 * ・パスワードは Supabase が bcrypt でサーバー側ハッシュ
 * ・クライアントはパスワードを保持しない
 * ・確認メール送信を OFF にする設定を Supabase 側で必須 (docs/supabase-setup.md 参照)
 */
import { getSupabase, cloudEnabled, getCloudConfig } from "./supabaseClient.js";

/* === バリデーション === */
export function validateEmail(email) {
  if (!email) return "メールアドレスを入力してください";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "有効なメールアドレスを入力してください";
  if (email.length > 100) return "メールアドレスが長すぎます";
  return null;
}

export function validatePassword(password) {
  if (!password) return "パスワードを入力してください";
  if (password.length < 8) return "パスワードは 8 文字以上で設定してください";
  if (password.length > 100) return "パスワードが長すぎます";
  return null;
}

export function validatePasswordConfirm(password, confirm) {
  if (!confirm) return "確認用パスワードを入力してください";
  if (password !== confirm) return "パスワードが一致しません";
  return null;
}

/* === 診断: 設定が正しいか === */
export function diagnoseAuth() {
  const config = getCloudConfig();
  const issues = [];
  if (!config.enabled) {
    issues.push({
      severity: "error",
      message: "Supabase 環境変数が未設定",
      detail: "VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を Vercel に設定 + Redeploy が必要",
      action: "docs/supabase-setup.md を参照",
    });
  } else {
    issues.push({
      severity: "ok",
      message: "Supabase URL 設定済",
      detail: config.urlPreview,
    });
  }
  return { ok: issues.every(i => i.severity !== "error"), issues, config };
}

/* === Round 92: 詳細診断 (実通信ベース) ===
   Supabase の Auth エンドポイントに ping 相当のリクエストを送り、
   どこで失敗するかを段階的に検出する */
export async function diagnoseAuthLive() {
  const result = {
    envSet: false,
    clientCreated: false,
    canReachSupabase: false,
    canReadSession: false,
    error: null,
    detail: null,
  };
  try {
    // Step 1: 環境変数
    const config = getCloudConfig();
    result.envSet = config.enabled;
    if (!config.enabled) {
      result.error = "環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定";
      result.detail = "Vercel Settings → Environment Variables に追加 + Redeploy";
      return result;
    }
    // Step 2: クライアント生成
    const supabase = getSupabase();
    result.clientCreated = !!supabase;
    if (!supabase) {
      result.error = "Supabase client 生成失敗";
      return result;
    }
    // Step 3: Auth エンドポイントへの到達性
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        result.error = `getSession 失敗: ${error.message}`;
        result.detail = "ネットワーク / RLS / Supabase project paused 等の可能性";
        return result;
      }
      result.canReachSupabase = true;
      result.canReadSession = true;
      result.session = data?.session ? { hasUser: !!data.session.user, expiresAt: data.session.expires_at } : null;
    } catch (e) {
      result.error = `Supabase 通信失敗: ${String(e?.message || e)}`;
      result.detail = "CORS / ネットワーク / 環境変数の値が不正の可能性";
      return result;
    }
  } catch (e) {
    result.error = `診断中の例外: ${String(e?.message || e)}`;
  }
  return result;
}

/* === サインアップ === */
export async function signUp(email, password, confirmPassword) {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase が未設定です",
      detail: "Vercel の環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を確認してください",
    };
  }
  const errE = validateEmail(email);
  if (errE) return { ok: false, error: errE };
  const errP = validatePassword(password);
  if (errP) return { ok: false, error: errP };
  if (confirmPassword != null) {
    const errC = validatePasswordConfirm(password, confirmPassword);
    if (errC) return { ok: false, error: errC };
  }
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });
    if (error) {
      console.error("[auth.signUp] error:", error);
      if (/already registered|already exists|user already registered/i.test(error.message)) {
        return { ok: false, error: "このメールアドレスは既に登録されています", detail: "ログインタブから入ってください" };
      }
      if (/rate limit|too many/i.test(error.message)) {
        return { ok: false, error: "登録試行が多すぎます", detail: "数分待ってから再試行してください" };
      }
      if (/invalid email/i.test(error.message)) {
        return { ok: false, error: "メールアドレスの形式が不正", detail: error.message };
      }
      if (/password/i.test(error.message)) {
        return { ok: false, error: "パスワードが要件を満たしていません", detail: error.message };
      }
      return { ok: false, error: "登録失敗", detail: error.message };
    }
    // email 確認 OFF の場合は session が即発行される
    // email 確認 ON の場合は session=null (確認メール送信される)
    if (!data.session) {
      return {
        ok: false,
        error: "Supabase の email 確認が ON のままです",
        detail: "Authentication → Providers → Email → 'Confirm email' を OFF にしてください (docs/supabase-setup.md 3 番)",
      };
    }
    return {
      ok: true,
      user: data.user,
      session: data.session,
      email: normalizedEmail,
      displayName: normalizedEmail.split("@")[0],
    };
  } catch (e) {
    console.error("[auth.signUp] exception:", e);
    return { ok: false, error: "通信エラー", detail: String(e?.message || e) };
  }
}

/* === ログイン === */
export async function signIn(email, password) {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase が未設定です",
      detail: "Vercel の環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を確認してください",
    };
  }
  const errE = validateEmail(email);
  if (errE) return { ok: false, error: errE };
  const errP = validatePassword(password);
  if (errP) return { ok: false, error: errP };
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) {
      console.error("[auth.signIn] error:", error);
      if (/invalid|credentials/i.test(error.message)) {
        return { ok: false, error: "メールアドレスまたはパスワードが違います" };
      }
      if (/email not confirmed/i.test(error.message)) {
        return {
          ok: false,
          error: "メール確認が必要です",
          detail: "Supabase の 'Confirm email' を OFF にするか、登録したメールから確認リンクをクリックしてください",
        };
      }
      if (/rate limit|too many/i.test(error.message)) {
        return { ok: false, error: "ログイン試行が多すぎます", detail: "数分待ってから再試行" };
      }
      return { ok: false, error: "ログイン失敗", detail: error.message };
    }
    return {
      ok: true,
      user: data.user,
      session: data.session,
      email: normalizedEmail,
      displayName: normalizedEmail.split("@")[0],
    };
  } catch (e) {
    console.error("[auth.signIn] exception:", e);
    return { ok: false, error: "通信エラー", detail: String(e?.message || e) };
  }
}

/* === ログアウト === */
export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Supabase 未設定" };
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === 現在のユーザー === */
export async function getCurrentUser() {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    const email = data.user.email || "";
    return {
      id: data.user.id,
      email,
      username: email.split("@")[0] || "?", // 後方互換 (UI で username 表示)
      displayName: email.split("@")[0] || "?",
    };
  } catch {
    return null;
  }
}

/* === セッション変更購読 === */
export function onAuthChange(callback) {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      const email = session.user.email || "";
      callback({
        id: session.user.id,
        email,
        username: email.split("@")[0] || "?",
        displayName: email.split("@")[0] || "?",
      });
    } else {
      callback(null);
    }
  });
  return () => subscription.unsubscribe();
}

/* === 後方互換: 旧 username 系 API は signUp/signIn に転送 (deprecated) ===
   旧コード (LoginModal の古い版) で validateUsername 等を呼んでいた箇所は、
   新規エラーを出さないために stubs を残す。 */
export function validateUsername(_) { return null; }
