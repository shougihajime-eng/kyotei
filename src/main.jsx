import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/* === 万舟研究所 フレッシュスタート (旧競艇アプリのデータを完全消去) ===
   背景:
     ・旧アプリ「競艇 EV Assistant」 と新アプリ「万舟研究所」 はコンセプト・予想思想が完全に別物。
     ・旧データ (予測 / 学習 / 検証ログ / 設定) を引き継ぐと新アプリの自己学習に悪影響。
     ・以前の R117 クリーンアップは「設定だけは保持」だったが、 今回は設定も含めて全消去。
   仕様:
     ・新フラグ manfuneFreshStartDone — 旧 R117 フラグの状態に関わらず必ず 1 回実行
     ・対象: localStorage の "kyotei" / "manfune" で始まる全キー + sessionStorage 全部
     ・設定も含めて完全消去 (preserveSettings=false)
     ・クラウド (Supabase predictions) 側の削除は App.jsx の useEffect で auth ロード後に実施 */
(function manfuneFreshStart() {
  if (typeof localStorage === "undefined") return;
  const FLAG = "manfuneFreshStartDone";
  try {
    if (localStorage.getItem(FLAG) === "1") return; // 実行済

    // 既存データの件数を記録 (削除した手応えをユーザーに見せる)
    let predCount = 0;
    let publicLogCount = 0;
    let learningLogCount = 0;
    try {
      const raw = localStorage.getItem("kyoteiAssistantV2");
      if (raw) {
        const obj = JSON.parse(raw);
        predCount = obj?.predictions ? Object.keys(obj.predictions).length : 0;
      }
      const pubRaw = localStorage.getItem("kyoteiPublicLog");
      if (pubRaw) {
        const arr = JSON.parse(pubRaw);
        if (Array.isArray(arr)) publicLogCount = arr.length;
      }
      const learnRaw = localStorage.getItem("kyoteiLearningLog");
      if (learnRaw) {
        const arr = JSON.parse(learnRaw);
        if (Array.isArray(arr)) learningLogCount = arr.length;
      }
    } catch {}

    // localStorage の kyotei* / manfune* キーを全削除 (将来追加されても自動で対象)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("kyotei") || k.startsWith("manfune")) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }

    // sessionStorage も完全クリア (キャッシュ・一時状態)
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.clear();
      }
    } catch {}

    // フレッシュスタートのフラグだけ立てる (これより後の予想は新規データ)
    localStorage.setItem(FLAG, "1");
    sessionStorage.setItem(
      "manfuneFreshStartJustDone",
      JSON.stringify({ predCount, publicLogCount, learningLogCount })
    );
    // eslint-disable-next-line no-console
    console.log(
      `[万舟研究所 フレッシュスタート] 旧アプリのデータを全消去: ` +
      `予測 ${predCount} 件 / 公開ログ ${publicLogCount} 件 / 学習ログ ${learningLogCount} 件 / ` +
      `localStorage キー ${keysToRemove.length} 個`
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[万舟研究所 フレッシュスタート] failed:", e);
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
