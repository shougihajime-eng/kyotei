/* ヘッダ + タブナビ + エア/リアル損益 + 更新ボタン + 現在のスタイル大表示 + StyleSelector */
import { yen } from "../lib/format.js";
import StyleSelector from "./StyleSelector.jsx";

const TABS = [
  { k: "home", label: "🏠 ホーム" },
  { k: "list", label: "📋 一覧" },
  { k: "verify", label: "📅 検証" },
  { k: "stats", label: "📈 グラフ" },
  { k: "analysis", label: "🔍 分析" },
  { k: "settings", label: "💼 設定" },
];

const PROFILE_INFO = {
  steady:     { label: "🛡️ 安定型", color: "#3b82f6", bg: "rgba(59,130,246,0.18)" },
  balanced:   { label: "⚖️ バランス型", color: "#fbbf24", bg: "rgba(251,191,36,0.18)" },
  aggressive: { label: "🎯 攻め型", color: "#ef4444", bg: "rgba(239,68,68,0.18)" },
};

export default function Header({ tab, setTab, today, settings, setSettings, switchProfile, refreshing, onRefresh, lastRefreshAt, suggestedStyle }) {
  const air = today?.air || { stake: 0, pnl: 0 };
  const real = today?.real || { stake: 0, pnl: 0 };
  const realLabel = real.stake === 0 ? "未入力" : (real.pnl >= 0 ? "+" + yen(real.pnl) : "−" + yen(Math.abs(real.pnl)));
  const airLabel = air.stake === 0 ? "—" : (air.pnl >= 0 ? "+" + yen(air.pnl) : "−" + yen(Math.abs(air.pnl)));

  const profileInfo = PROFILE_INFO[settings.riskProfile] || PROFILE_INFO.balanced;

  function handleRefresh(e) {
    e.preventDefault();
    if (refreshing) return;
    onRefresh && onRefresh();
  }

  function handleStyle(p) {
    if (switchProfile) switchProfile(p);
    else if (setSettings) setSettings({ ...settings, riskProfile: p });
  }

  return (
    <header className="border-b border-[#1f2a44] bg-[#0b1220]/95 sticky top-0 z-30 backdrop-blur" style={{ minHeight: 130 }}>
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

      {/* 現在のスタイル + 切替ボタン (大きく表示) */}
      {settings.onboardingDone && (
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
            <span className="text-xs opacity-70">現在の予想スタイル:</span>
            <span style={{
              padding: "5px 14px", borderRadius: 999,
              background: profileInfo.bg, color: profileInfo.color,
              fontWeight: 800, fontSize: 14,
              border: `2px solid ${profileInfo.color}`,
              transition: "all 0.15s",
            }}>
              {profileInfo.label}
            </span>
          </div>
          <BigStyleButtons current={settings.riskProfile} onChange={handleStyle} suggested={suggestedStyle} />
        </div>
      )}

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

/* スタイル切替ボタン (大きめ + 即時反応) */
function BigStyleButtons({ current, onChange, suggested }) {
  const styles = [
    { k: "steady",     label: "🛡️ 安定", short: "本命党" },
    { k: "balanced",   label: "⚖️ バランス", short: "中堅党" },
    { k: "aggressive", label: "🎯 攻め", short: "穴党" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {styles.map((s) => {
        const info = PROFILE_INFO[s.k];
        const active = current === s.k;
        return (
          <button key={s.k} onClick={() => onChange(s.k)}
            style={{
              padding: "10px 8px", borderRadius: 10,
              border: active ? `2px solid ${info.color}` : "2px solid transparent",
              background: active ? info.bg : "rgba(15,24,48,0.6)",
              color: active ? info.color : "#9fb0c9",
              fontWeight: active ? 800 : 600,
              fontSize: 13, cursor: "pointer",
              transition: "all 0.12s ease-out",
              minHeight: 44,
              boxShadow: active ? `0 0 0 1px ${info.color}40, 0 2px 8px ${info.color}30` : "none",
              transform: active ? "scale(1.02)" : "scale(1.0)",
            }}>
            {active && <span style={{ marginRight: 4 }}>✓</span>}
            {s.label}
            {suggested === s.k && !active && <span style={{ marginLeft: 4, fontSize: 11 }}>💡</span>}
          </button>
        );
      })}
    </div>
  );
}
