import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/* === Round 116: 起動時 1 回だけ過去予想ログを自動削除 ===
   背景: ユーザー判断で 「-15 分前に予想したものではない過去ログは意味がない」 と決まった。
   ボタンを押すのも面倒という要望に応え、 React mount 前に自動で削除する。
   設定 (予算 / リスク感覚) は保持。 1 回実行したらフラグを立てて二度と走らない。

   ※ クラウド (Supabase) 側の削除は App.jsx の useEffect で auth ロード後に実施。 */
(function autoCleanupLegacyData() {
  if (typeof localStorage === "undefined") return;
  const FLAG = "kyoteiRound115CleanupDone";
  try {
    if (localStorage.getItem(FLAG) === "1") return; // 実行済
    const KEY = "kyoteiAssistantV2";
    const raw = localStorage.getItem(KEY);
    let savedSettings = null;
    let predCount = 0;
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        savedSettings = obj?.settings || null;
        predCount = obj?.predictions ? Object.keys(obj.predictions).length : 0;
      } catch {}
    }
    // 何も入っていない (= 新規ユーザー / 既にクリア済) ならフラグだけ立てて終わり
    if (predCount === 0 && !localStorage.getItem("kyoteiPublicLog") && !localStorage.getItem("kyoteiLearningLog")) {
      localStorage.setItem(FLAG, "1");
      return;
    }
    // 削除実行 (設定だけ保持)
    localStorage.removeItem(KEY);
    localStorage.removeItem("kyoteiPublicLog");
    localStorage.removeItem("kyoteiLearningLog");
    localStorage.removeItem("kyoteiAssistantStateV3");
    localStorage.removeItem("kyoteiAssistantStateV2");
    if (savedSettings) {
      localStorage.setItem(KEY, JSON.stringify({ settings: savedSettings, predictions: {} }));
    }
    localStorage.setItem(FLAG, "1");
    // クラウド側は authUser がロードされた後 App 内で削除 (ここでは local のみ)
    // ユーザーへ完了通知用フラグ (App 起動後にトーストを 1 回出すため)
    sessionStorage.setItem("kyoteiCleanupJustDone", JSON.stringify({ predCount }));
    // eslint-disable-next-line no-console
    console.log(`[auto-cleanup] cleared ${predCount} legacy predictions + public/learning logs`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[auto-cleanup] failed:", e);
  }
})();

/**
 * 起動失敗を白画面にせず、必ず原因を表示する ErrorBoundary。
 * - エラーメッセージ + スタックトレースを画面に出す
 * - 「localStorage クリア + 再読み込み」のリカバリーボタンを置く
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[App crash]", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      const e = this.state.error;
      const msg = (e && (e.message || String(e))) || "unknown error";
      const stack = (e && e.stack) || "";
      const compStack = (this.state.errorInfo && this.state.errorInfo.componentStack) || "";
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", color: "#fecaca", background: "#0b1220", minHeight: "100vh" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>⚠️ アプリの実行中にエラーが発生しました</h1>
            <div style={{
              background: "#3b1d1d", border: "1px solid #7f1d1d",
              padding: 12, borderRadius: 8, fontSize: 12,
              marginBottom: 12, whiteSpace: "pre-wrap",
              fontFamily: "monospace", overflow: "auto", maxHeight: 380,
            }}>
              {msg}
              {stack && "\n\n--- stack ---\n" + stack}
              {compStack && "\n\n--- component stack ---" + compStack}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btnPrimary}
                onClick={() => {
                  try {
                    localStorage.removeItem("kyoteiAssistantV2");
                    localStorage.removeItem("kyoteiAssistantStateV3");
                    localStorage.removeItem("kyoteiAssistantStateV2");
                  } catch {}
                  location.reload();
                }}>
                🗑 localStorage クリア + 再読み込み
              </button>
              <button style={btnGhost} onClick={() => location.reload()}>🔄 再読み込み</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const btnPrimary = {
  padding: "10px 16px", background: "#2563eb", color: "white",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer",
};
const btnGhost = {
  padding: "10px 16px", background: "#1a2540", color: "#e7eef8",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer",
};

/* === Mount ===
   StrictMode は開発時のみ effect を 2 回呼ぶため、
   production build では本番動作には影響しないが「ガーっ」 感の一因になりうる。
   ここでは StrictMode を外し、ErrorBoundary だけで保護する。 */
const rootEl = document.getElementById("root");
if (rootEl) {
  try {
    ReactDOM.createRoot(rootEl).render(
      <ErrorBoundary><App /></ErrorBoundary>
    );
  } catch (e) {
    rootEl.innerHTML = `<pre style="color:#fecaca;background:#3b1d1d;padding:16px;border-radius:8px;font-family:monospace;white-space:pre-wrap;">React mount failed:\n${(e && (e.stack || e.message)) || String(e)}</pre>`;
  }
} else {
  document.body.innerHTML = `<pre style="color:#fecaca;background:#3b1d1d;padding:16px;border-radius:8px;font-family:monospace;">root element not found</pre>`;
}

/* グローバルエラー: React の外側 (Promise rejection 等) も補足 */
window.addEventListener("unhandledrejection", (event) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledrejection]", event.reason);
});
