/**
 * 簡易 Auth — username + password のみ (個人情報なし)
 *
 * Supabase Auth は標準で email/password を要求するが、
 * 「username + password だけ」 を実現するため、
 * email = `${username}@kyotei.local` という擬似 email を生成する。
 *
 * セキュリティ:
 * ・username は 3-32 文字 (英数字 + アンダースコア + ハイフン)
 * ・パスワードは 8 文字以上 (Supabase の最小値)
 * ・パスワードは Supabase が bcrypt でサーバー側ハッシュ
 * ・クライアントはパスワードを保持しない (送信後すぐ破棄)
 */
import { getSupabase } from "./supabaseClient.js";

const FAKE_DOMAIN = "kyotei.local";
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

export function validateUsername(username) {
  if (!username) return "ユーザー名を入力してください";
  if (!USERNAME_REGEX.test(username)) {
    return "ユーザー名は半角英数字 / _ / - で 3〜32 文字";
  }
  return null;
}

export function validatePassword(password) {
  if (!password) return "パスワードを入力してください";
  if (password.length < 8) return "パスワードは 8 文字以上で設定してください";
  return null;
}

function usernameToEmail(username) {
  return `${username.toLowerCase()}@${FAKE_DOMAIN}`;
}

/* === サインアップ === */
export async function signUp(username, password) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "クラウド機能が無効です (環境変数未設定)" };
  const errU = validateUsername(username);
  if (errU) return { ok: false, error: errU };
  const errP = validatePassword(password);
  if (errP) return { ok: false, error: errP };
  try {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      // 重複チェック
      if (/already registered|already exists/i.test(error.message)) {
        return { ok: false, error: "このユーザー名は既に使われています" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, user: data.user, session: data.session, username };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === ログイン === */
export async function signIn(username, password) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "クラウド機能が無効です (環境変数未設定)" };
  const errU = validateUsername(username);
  if (errU) return { ok: false, error: errU };
  const errP = validatePassword(password);
  if (errP) return { ok: false, error: errP };
  try {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/invalid|credentials/i.test(error.message)) {
        return { ok: false, error: "ユーザー名またはパスワードが違います" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, user: data.user, session: data.session, username };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === ログアウト === */
export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "クラウド機能が無効です" };
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === 現在のユーザーを取得 === */
export async function getCurrentUser() {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      username: data.user.email?.replace(`@${FAKE_DOMAIN}`, "") || "?",
      email: data.user.email,
    };
  } catch {
    return null;
  }
}

/* === セッション変更を購読 === */
export function onAuthChange(callback) {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      callback({
        id: session.user.id,
        username: session.user.email?.replace(`@${FAKE_DOMAIN}`, "") || "?",
        email: session.user.email,
      });
    } else {
      callback(null);
    }
  });
  return () => subscription.unsubscribe();
}
