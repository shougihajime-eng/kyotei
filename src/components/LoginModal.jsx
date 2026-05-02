/**
 * ログインモーダル — email + password (Round 51-A 改修版)
 *
 * 役割:
 * ・新規登録 / ログイン の切替タブ
 * ・成功時に onLogin(user) コールバック
 * ・失敗理由を必ず画面に表示
 * ・診断パネル (Supabase 設定が正しいか自動チェック)
 */
import { useState, useEffect } from "react";
import {
  signIn, signUp, signOut as authSignOut,
  validateEmail, validatePassword, validatePasswordConfirm,
  diagnoseAuth,
} from "../lib/auth.js";
import { cloudEnabled } from "../lib/supabaseClient.js";

export default function LoginModal({ open, onClose, onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [diag, setDiag] = useState(null);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => {
    if (open) {
      setDiag(diagnoseAuth());
      setMsg(null);
    }
  }, [open]);

  if (!open) return null;
  const enabled = cloudEnabled();

  async function submit(e) {
    e?.preventDefault?.();
    if (busy) return;
    setMsg(null);
    const errE = validateEmail(email);
    if (errE) { setMsg({ kind: "err", text: errE }); return; }
    const errP = validatePassword(password);
    if (errP) { setMsg({ kind: "err", text: errP }); return; }
    if (mode === "signup") {
      const errC = validatePasswordConfirm(password, confirm);
      if (errC) { setMsg({ kind: "err", text: errC }); return; }
    }
    setBusy(true);
    try {
      const res = mode === "login"
        ? await signIn(email, password)
        : await signUp(email, password, confirm);
      if (res.ok) {
        setMsg({ kind: "ok", text: mode === "login" ? "ログインしました" : "登録しました" });
        setTimeout(() => {
          if (onLogin) onLogin({
            id: res.user.id,
            email: res.email,
            username: res.displayName,
            displayName: res.displayName,
          });
          onClose();
        }, 600);
      } else {
        setMsg({ kind: "err", text: res.error || "失敗", detail: res.detail });
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
          <button onClick={onClose} className="btn btn-ghost text-xs" style={{ minHeight: 36 }}>✕</button>
        </div>

        {/* === 診断バナー (常に表示で問題を見える化) === */}
        {!enabled && (
          <div className="alert-error text-xs mb-3" style={{ lineHeight: 1.55 }}>
            <b>❌ Supabase 環境変数が未設定です</b><br/>
            このままでは新規登録/ログインができません。<br/>
            <ul style={{ paddingLeft: 16, marginTop: 4, listStyle: "disc" }}>
              <li>Vercel のプロジェクト設定 → Environment Variables を確認</li>
              <li>VITE_SUPABASE_URL を設定</li>
              <li>VITE_SUPABASE_ANON_KEY を設定</li>
              <li>設定後 Redeploy が必要</li>
              <li>詳細: docs/supabase-setup.md</li>
            </ul>
          </div>
        )}

        {enabled && (
          <div className="alert-info text-xs mb-3" style={{ lineHeight: 1.55 }}>
            ✅ クラウド接続 OK<br/>
            ログインすれば PC / iPhone / 別ブラウザ で同じ履歴が見られます。<br/>
            ログインしなくても、ローカル保存のみで使えます。
          </div>
        )}

        {/* タブ切替 */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setMode("login"); setMsg(null); }} type="button"
            className={"flex-1 p-2 rounded-lg border-2 " + (mode === "login" ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830] opacity-70")}
            style={{ minHeight: 44 }}>
            🔑 ログイン
          </button>
          <button onClick={() => { setMode("signup"); setMsg(null); }} type="button"
            className={"flex-1 p-2 rounded-lg border-2 " + (mode === "signup" ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830] opacity-70")}
            style={{ minHeight: 44 }}>
            ✨ 新規登録
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs opacity-80">メールアドレス</label>
            <input className="input mt-1" type="email" value={email}
              autoComplete="email" inputMode="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例: yourname@example.com" disabled={busy || !enabled}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
          <div>
            <label className="text-xs opacity-80">パスワード (8 文字以上)</label>
            <input className="input mt-1" type="password" value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="安全なパスワードを設定" disabled={busy || !enabled} />
          </div>
          {mode === "signup" && (
            <div>
              <label className="text-xs opacity-80">確認用パスワード (もう一度)</label>
              <input className="input mt-1" type="password" value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="同じパスワードを入力" disabled={busy || !enabled} />
              <div className="text-xs opacity-60 mt-1" style={{ lineHeight: 1.5 }}>
                ※ パスワードはサーバー側で安全にハッシュ化されます (bcrypt)。<br/>
                ※ 現状 <b>パスワードリセット未対応</b> — 忘れた場合は新規登録になります。
              </div>
            </div>
          )}

          {/* エラー / 成功 メッセージ */}
          {msg && (
            <div className={msg.kind === "ok" ? "alert-ok text-xs" : "alert-error text-xs"}
              style={{ lineHeight: 1.55 }}>
              <b>{msg.text}</b>
              {msg.detail && <div className="opacity-85 mt-1" style={{ fontSize: 11 }}>{msg.detail}</div>}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={busy || !enabled}
            style={{ minHeight: 48 }}>
            {busy ? "⏳ 処理中…" : mode === "login" ? "🔑 ログイン" : "✨ 登録 + ログイン"}
          </button>
        </form>

        {/* 診断トグル */}
        <div className="mt-4 text-center">
          <button onClick={() => setShowDiag(v => !v)} type="button"
            className="text-xs opacity-70 underline" style={{ background: "none", border: "none", cursor: "pointer", color: "#bae6fd" }}>
            {showDiag ? "▲ 接続診断を閉じる" : "▼ 接続診断を表示"}
          </button>
          {showDiag && diag && (
            <div className="mt-2 text-xs text-left p-2 rounded" style={{ background: "rgba(0,0,0,0.3)", lineHeight: 1.55 }}>
              <div className="font-bold mb-1">🔍 接続診断</div>
              {diag.issues.map((iss, i) => (
                <div key={i} className="mb-1" style={{
                  color: iss.severity === "error" ? "#fca5a5" : iss.severity === "warn" ? "#fde68a" : "#a7f3d0"
                }}>
                  {iss.severity === "error" ? "❌" : iss.severity === "warn" ? "⚠️" : "✅"} {iss.message}
                  {iss.detail && <div className="opacity-80 ml-4">{iss.detail}</div>}
                  {iss.action && <div className="opacity-80 ml-4 italic">→ {iss.action}</div>}
                </div>
              ))}
              {diag.config?.urlPreview && (
                <div className="mt-1 opacity-70">URL: {diag.config.urlPreview}</div>
              )}
            </div>
          )}
        </div>

        <div className="text-xs opacity-70 mt-4 text-center" style={{ lineHeight: 1.6 }}>
          🔒 <b>セキュリティ</b><br/>
          ・パスワードは平文で保存しません (bcrypt)<br/>
          ・サーバーは 認証用のメールのみ保管 (個人特定はしません)<br/>
          ・他人のデータは RLS で完全分離
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
