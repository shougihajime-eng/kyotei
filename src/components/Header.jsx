/* ヘッダ + タブナビ + エア/リアル損益 + 更新ボタン + 現在のスタイル大表示 + StyleSelector */
import { memo } from "react";
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

export default memo(HeaderImpl);
function HeaderImpl({ tab, setTab, today, settings, setSettings, switchProfile, switchVirtualMode, refreshing, onRefresh, lastRefreshAt, nextRefreshAt, savedCount, authUser, onOpenLogin, onLogout, syncStatus, suggestedStyle }) {
  const air = today?.air || { stake: 0, pnl: 0 };
  const real = today?.real || { stake: 0, pnl: 0 };
  const realLabel = real.stake === 0 ? "未入力" : (real.pnl >= 0 ? "+" + yen(real.pnl) : "−" + yen(Math.abs(real.pnl)));
  const airLabel = air.stake === 0 ? "—" : (air.pnl >= 0 ? "+" + yen(air.pnl) : "−" + yen(Math.abs(air.pnl)));

  const profileInfo = PROFILE_INFO[settings.riskProfile] || PROFILE_INFO.balanced;
  const isVirtual = !!settings.virtualMode;

  function handleRefresh(e) {
    e.preventDefault();
    if (refreshing) return;
    onRefresh && onRefresh();
  }

  function handleStyle(p) {
    if (switchProfile) switchProfile(p);
    else if (setSettings) setSettings({ ...settings, riskProfile: p });
  }

  function handleVirtualToggle(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (switchVirtualMode) switchVirtualMode();
    else if (setSettings) setSettings((prev) => ({ ...prev, virtualMode: !prev.virtualMode }));
  }

  return (
    <header className="brand-header sticky top-0 z-30" style={{ minHeight: 130 }}>
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        {/* ロゴ */}
        <div style={{ minWidth: 130 }} className="flex items-center gap-2">
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(56,189,248,0.35)",
            fontSize: 18,
          }}>🚤</div>
          <div>
            <div className="brand-logo" style={{ fontSize: 17, lineHeight: 1.05 }}>競艇 AI</div>
            <div className="text-xs" style={{ color: "var(--text-mute)", letterSpacing: "0.04em" }}>EXPECTED VALUE ASSISTANT</div>
          </div>
        </div>

        {/* エア / リアル モード切替 (タップで即時切替) + 損益 */}
        {settings.onboardingDone && (
          <div className="flex items-center gap-2">
            {/* モード切替トグル (大きめ) */}
            <button
              type="button"
              onClick={handleVirtualToggle}
              aria-label={isVirtual ? "エア舟券モード (タップでリアルに切替)" : "リアル舟券モード (タップでエアに切替)"}
              title={isVirtual ? "🧪 エア中 — タップでリアルに切替" : "💰 リアル中 — タップでエアに切替"}
              style={{
                minHeight: 44, minWidth: 80, padding: "6px 10px",
                borderRadius: 12, border: "2px solid " + (isVirtual ? "#22d3ee" : "#fbbf24"),
                background: isVirtual ? "rgba(34,211,238,0.15)" : "rgba(251,191,36,0.16)",
                color: isVirtual ? "#67e8f9" : "#fcd34d",
                fontWeight: 800, fontSize: 12, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                transition: "all 0.12s ease",
                lineHeight: 1.1,
              }}>
              <span>{isVirtual ? "🧪 エア" : "💰 リアル"}</span>
              <span style={{ fontSize: 9, opacity: 0.75, fontWeight: 600 }}>タップで切替</span>
            </button>
            <div className="flex flex-col items-end gap-1 text-xs">
              <div className="flex gap-2 items-center">
                <span className="pill badge-brand" style={{ fontSize: 10 }}>エア</span>
                <b className={"num " + (air.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 13 }}>{airLabel}</b>
              </div>
              <div className="flex gap-2 items-center">
                <span className="pill badge-warn" style={{ fontSize: 10 }}>リアル</span>
                <b className={"num " + (real.stake === 0 ? "opacity-60" : (real.pnl >= 0 ? "text-pos" : "text-neg"))} style={{ fontSize: 13 }}>{realLabel}</b>
              </div>
            </div>
          </div>
        )}

        {/* 更新ボタン (右上固定 / 大きめ) */}
        {settings.onboardingDone && (
          <div className="flex items-center gap-2">
            {/* Round 45: ログインボタン / ユーザー表示 */}
            {authUser ? (
              <button onClick={onLogout}
                title={`${authUser.username} (タップでログアウト)`}
                style={{
                  minHeight: 44, padding: "6px 10px", borderRadius: 10,
                  border: "1px solid rgba(16,185,129,0.5)",
                  background: "rgba(16,185,129,0.15)",
                  color: "#a7f3d0", fontSize: 12, cursor: "pointer",
                  fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1,
                }}>
                <span>👤 {authUser.username}</span>
                <span style={{ fontSize: 9, opacity: 0.85 }}>
                  {syncStatus?.state === "syncing" ? "🔄 同期中…"
                    : syncStatus?.state === "error" ? "⚠️ 同期失敗"
                    : syncStatus?.state === "synced" ? "✅ 同期済"
                    : "ログイン中"}
                </span>
              </button>
            ) : (
              <button onClick={onOpenLogin}
                style={{
                  minHeight: 44, padding: "6px 10px", borderRadius: 10,
                  border: "1px solid rgba(56,189,248,0.5)",
                  background: "rgba(56,189,248,0.10)",
                  color: "#bae6fd", fontSize: 12, cursor: "pointer",
                  fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1,
                }}>
                <span>🔑 ログイン</span>
                <span style={{ fontSize: 9, opacity: 0.85 }}>任意 (端末同期)</span>
              </button>
            )}
            <button onClick={handleRefresh} disabled={refreshing} className="btn btn-primary"
              style={{ minHeight: 44, minWidth: 100, fontSize: 14 }}>
              {refreshing ? "🔄 更新中…" : "🔄 更新"}
            </button>
          </div>
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
