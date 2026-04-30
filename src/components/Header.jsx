/* ヘッダ + 5 タブナビ + エア/リアル損益 + 更新ボタン (右上固定 / 44px) */
import { yen } from "../lib/format.js";

const TABS = [
  { k: "home", label: "🏠 ホーム" },
  { k: "list", label: "📋 一覧" },
  { k: "verify", label: "📅 検証" },
  { k: "stats", label: "📈 グラフ" },
  { k: "settings", label: "💼 設定" },
];

export default function Header({ tab, setTab, today, settings, refreshing, onRefresh, lastRefreshAt }) {
  const air = today?.air || { stake: 0, pnl: 0 };
  const real = today?.real || { stake: 0, pnl: 0 };
  const realLabel = real.stake === 0 ? "未入力" : (real.pnl >= 0 ? "+" + yen(real.pnl) : "−" + yen(Math.abs(real.pnl)));
  const airLabel = air.stake === 0 ? "—" : (air.pnl >= 0 ? "+" + yen(air.pnl) : "−" + yen(Math.abs(air.pnl)));

  function handleRefresh(e) {
    e.preventDefault();
    if (refreshing) return;
    onRefresh && onRefresh();
  }

  return (
    <header className="border-b border-[#1f2a44] bg-[#0b1220]/95 sticky top-0 z-30 backdrop-blur" style={{ minHeight: 96 }}>
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        {/* ロゴ */}
        <div style={{ minWidth: 110 }}>
          <div className="font-bold text-sm">競艇 期待値AI</div>
          <div className="text-xs opacity-70">買わないAI v2</div>
        </div>

        {/* エア / リアル */}
        {settings.onboardingDone && (
          <div className="flex flex-col items-center gap-1 text-xs">
            <div className="flex gap-2 items-center">
              <span className="pill" style={{ background: "rgba(34,211,238,0.15)", color: "#a5f3fc", fontSize: 10 }}>エア</span>
              <b className={"num " + (air.pnl >= 0 ? "text-pos" : "text-neg")}>{airLabel}</b>
            </div>
            <div className="flex gap-2 items-center">
              <span className="pill" style={{ background: "rgba(251,191,36,0.18)", color: "#fcd34d", fontSize: 10 }}>リアル</span>
              <b className={"num " + (real.stake === 0 ? "opacity-60" : (real.pnl >= 0 ? "text-pos" : "text-neg"))}>{realLabel}</b>
            </div>
          </div>
        )}

        {/* 更新ボタン (右上固定 / 大きめ) */}
        {settings.onboardingDone && (
          <button onClick={handleRefresh} disabled={refreshing}
            style={{
              minHeight: 44, minWidth: 100, padding: "10px 18px",
              borderRadius: 10, fontSize: 14, fontWeight: 800,
              border: "none", cursor: refreshing ? "not-allowed" : "pointer",
              background: refreshing ? "#475569" : "#2563eb",
              color: "#fff", opacity: refreshing ? 0.65 : 1,
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            }}>
            {refreshing ? "🔄 更新中…" : "🔄 更新"}
          </button>
        )}
      </div>

      {/* タブナビ */}
      <div className="max-w-5xl mx-auto px-4 pb-2">
        <div className="flex gap-1 overflow-x-auto scrollbar">
          {TABS.map((t) => (
            <button key={t.k} className={"tab-btn whitespace-nowrap " + (tab === t.k ? "active" : "")}
              onClick={() => setTab(t.k)}>{t.label}</button>
          ))}
        </div>
      </div>
    </header>
  );
}
