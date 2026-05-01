/**
 * ログインモーダル — username + password のみ (個人情報なし)
 *
 * 役割:
 * ・新規登録 / ログイン の切替タブ
 * ・成功時に onLogin(user) コールバック
 * ・「ログインしなくても使える」 を強調
 */
import { useState } from "react";
import { signIn, signUp, validateUsername, validatePassword } from "../lib/auth.js";
import { cloudEnabled } from "../lib/supabaseClient.js";

export default function LoginModal({ open, onClose, onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!open) return null;

  const enabled = cloudEnabled();

  async function submit(e) {
    e?.preventDefault?.();
    if (busy) return;
    setMsg(null);
    const errU = validateUsername(username);
    if (errU) { setMsg({ kind: "err", text: errU }); return; }
    const errP = validatePassword(password);
    if (errP) { setMsg({ kind: "err", text: errP }); return; }
    setBusy(true);
    try {
      const fn = mode === "login" ? signIn : signUp;
      const res = await fn(username, password);
      if (res.ok) {
        setMsg({ kind: "ok", text: mode === "login" ? "ログインしました" : "登録しました" });
        setTimeout(() => {
          if (onLogin) onLogin({
            id: res.user.id,
            username: res.username,
            email: res.user.email,
          });
          onClose();
        }, 600);
      } else {
        setMsg({ kind: "err", text: res.error || "失敗しました" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="card" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">{mode === "login" ? "🔑 ログイン" : "✨ 新規登録"}</h3>
          <button onClick={onClose} className="btn btn-ghost text-xs">✕</button>
        </div>

        {!enabled && (
          <div className="alert-warn text-xs mb-3" style={{ lineHeight: 1.55 }}>
            ⚠️ クラウド機能は現在無効です。<br/>
            (環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定)<br/>
            ローカル保存のみで利用できます。
          </div>
        )}

        <div className="alert-info text-xs mb-3" style={{ lineHeight: 1.55 }}>
          💡 ログインすると <b>PC / iPhone / 別ブラウザ</b> で同じ履歴が見られます。<br/>
          メールアドレス・名前・住所など <b>個人情報は不要</b> です。<br/>
          ログインしなくても、これまで通りアプリは使えます。
        </div>

        {/* タブ切替 */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setMode("login"); setMsg(null); }}
            className={"flex-1 p-2 rounded-lg border-2 " + (mode === "login" ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830] opacity-70")}
            style={{ minHeight: 44 }}>
            🔑 ログイン
          </button>
          <button onClick={() => { setMode("signup"); setMsg(null); }}
            className={"flex-1 p-2 rounded-lg border-2 " + (mode === "signup" ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830] opacity-70")}
            style={{ minHeight: 44 }}>
            ✨ 新規登録
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs opacity-80">ユーザー名 (3〜32 文字 / 英数字・_・- のみ)</label>
            <input className="input mt-1" type="text" value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value.trim())}
              placeholder="例: ahiru123" disabled={busy || !enabled}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
          <div>
            <label className="text-xs opacity-80">パスワード (8 文字以上)</label>
            <input className="input mt-1" type="password" value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="安全なパスワードを設定" disabled={busy || !enabled} />
            {mode === "signup" && (
              <div className="text-xs opacity-60 mt-1">
                ※ パスワードはサーバー側で安全にハッシュ化されます (bcrypt)。<br/>
                ※ <b>パスワードは記録できません</b> — 忘れた場合は新規登録になります。
              </div>
            )}
          </div>

          {msg && (
            <div className={msg.kind === "ok" ? "alert-ok text-xs" : "alert-error text-xs"}>
              {msg.text}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={busy || !enabled}
            style={{ minHeight: 48 }}>
            {busy ? "⏳ 処理中…" : mode === "login" ? "🔑 ログイン" : "✨ 登録 + ログイン"}
          </button>
        </form>

        <div className="text-xs opacity-70 mt-4 text-center" style={{ lineHeight: 1.6 }}>
          🔒 <b>個人情報は預かりません</b><br/>
          ・メールアドレス不要<br/>
          ・名前・住所不要<br/>
          ・ユーザー名 + パスワードのみで登録<br/>
          ・パスワードは平文で保存しません (bcrypt ハッシュ)
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(11,18,32,0.85)", zIndex: 60,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)",
};
const modalStyle = {
  maxWidth: 480, width: "100%", padding: 20, border: "2px solid #22d3ee",
  maxHeight: "90vh", overflowY: "auto",
};
