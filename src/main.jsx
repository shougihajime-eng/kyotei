import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

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

/* === Mount === */
const rootEl = document.getElementById("root");
if (rootEl) {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary><App /></ErrorBoundary>
      </React.StrictMode>
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
