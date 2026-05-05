/* Round 97: Header premium refinement
   ・ロゴエリアの整理 (アイコン + ブランド + 対象日)
   ・損益エリアを 2 行コンパクト + 大きい数字
   ・ログイン/更新を整理
   ・スタイルセレクタを refined card 風 + スムーズ animation
   ・タブナビを sophisticated underline 表示 */
import { memo } from "react";
import { yen } from "../lib/format.js";
import { cloudEnabled } from "../lib/supabaseClient.js";

const TABS = [
  { k: "home",     label: "ホーム",  icon: "🏠" },
  { k: "list",     label: "一覧",    icon: "📋" },
  { k: "verify",   label: "検証",    icon: "📅" },
  { k: "stats",    label: "グラフ",  icon: "📈" },
  { k: "analysis", label: "分析",    icon: "🔍" },
  { k: "settings", label: "設定",    icon: "⚙️" },
];

const PROFILE_INFO = {
  steady:     { label: "安定型",     short: "🛡️", desc: "的中率特化",  color: "#3B82F6", bg: "rgba(59, 130, 246, 0.10)", border: "rgba(59, 130, 246, 0.40)" },
  balanced:   { label: "バランス型", short: "⚖️", desc: "実戦最適",     color: "#F59E0B", bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.40)" },
  aggressive: { label: "攻め型",     short: "🎯", desc: "高配当狙い",   color: "#EF4444", bg: "rgba(239, 68, 68, 0.10)",  border: "rgba(239, 68, 68, 0.40)" },
};

export default memo(HeaderImpl);
function HeaderImpl({ tab, setTab, today, settings, setSettings, switchProfile, switchVirtualMode, refreshing, onRefresh, lastRefreshAt, nextRefreshAt, savedCount, authUser, onOpenLogin, onLogout, syncStatus, effectiveRaceDate, suggestedStyle }) {
  const air = today?.air || { stake: 0, pnl: 0 };
  const real = today?.real || { stake: 0, pnl: 0 };
  const realLabel = real.stake === 0 ? "—" : (real.pnl >= 0 ? "+" + yen(real.pnl) : "−" + yen(Math.abs(real.pnl)));
  const airLabel = air.stake === 0 ? "—" : (air.pnl >= 0 ? "+" + yen(air.pnl) : "−" + yen(Math.abs(air.pnl)));

  const profileInfo = PROFILE_INFO[settings.riskProfile] || PROFILE_INFO.balanced;
  const isVirtual = !!settings.virtualMode;
  const cloudOk = cloudEnabled();

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
    <header className="brand-header sticky top-0 z-30">
      {/* ===== 第一行: ロゴ + 損益サマリ + アクション ===== */}
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        {/* ロゴエリア */}
        <div className="flex items-center gap-2.5" style={{ minWidth: 0, flex: "0 0 auto" }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: "linear-gradient(135deg, #22D3EE 0%, #2563EB 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(34, 211, 238, 0.32), inset 0 1px 0 rgba(255,255,255,0.20)",
            fontSize: 19,
          }}>🚤</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-logo" style={{ fontSize: 18, lineHeight: 1.0, letterSpacing: "-0.01em" }}>競艇 AI</div>
            {effectiveRaceDate ? (
              <div style={{ fontSize: 10.5, color: "var(--brand-text)", letterSpacing: "0.04em", fontWeight: 600, marginTop: 2 }}>
                📅 {effectiveRaceDate}
              </div>
            ) : (
              <div style={{ fontSize: 9, color: "var(--text-quaternary)", letterSpacing: "0.10em", marginTop: 2, fontWeight: 600 }}>
                EV ASSISTANT
              </div>
            )}
          </div>
        </div>

        {/* スペーサー */}
        <div style={{ flex: "1 1 0", minWidth: 16 }} />

        {/* 損益サマリ + モード切替 + ログイン + 更新 (右端固定) */}
        {settings.onboardingDone && (
          <div className="flex items-center gap-2 flex-wrap" style={{ flex: "0 0 auto" }}>
            {/* モード切替 (エア/リアル) */}
            <button
              type="button"
              onClick={handleVirtualToggle}
              aria-label={isVirtual ? "エア舟券モード" : "リアル舟券モード"}
              title={isVirtual ? "🧪 エア中 — タップで リアルに" : "💰 リアル中 — タップで エアに"}
              style={{
                minHeight: 46, padding: "5px 12px",
                borderRadius: 12,
                border: `1.5px solid ${isVirtual ? "rgba(34, 211, 238, 0.55)" : "rgba(245, 158, 11, 0.55)"}`,
                background: isVirtual ? "rgba(34, 211, 238, 0.10)" : "rgba(245, 158, 11, 0.10)",
                color: isVirtual ? "#67E8F9" : "#FCD34D",
                fontWeight: 700, fontSize: 11.5, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                transition: "all 0.18s ease",
                lineHeight: 1.1,
                letterSpacing: "0.01em",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}>
              <span style={{ fontSize: 12 }}>{isVirtual ? "🧪 エア" : "💰 リアル"}</span>
              <b className={"num " + ((isVirtual ? air.pnl : real.pnl) >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 13 }}>
                {isVirtual ? airLabel : realLabel}
              </b>
            </button>

            {/* ログインボタン or ユーザー表示 */}
            {authUser ? (
              <button onClick={onLogout}
                title={`${authUser.username || authUser.email} (タップでログアウト)`}
                style={{
                  minHeight: 46, padding: "5px 12px", borderRadius: 12,
                  border: "1.5px solid rgba(16, 185, 129, 0.45)",
                  background: "rgba(16, 185, 129, 0.10)",
                  color: "#A7F3D0", fontSize: 11.5, cursor: "pointer",
                  fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1,
                  gap: 1,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}>
                <span>👤 {(authUser.username || authUser.email || "user").slice(0, 12)}</span>
                <span style={{ fontSize: 9.5, opacity: 0.85, fontWeight: 600 }}>
                  {syncStatus?.state === "syncing" ? "🔄 同期中"
                    : syncStatus?.state === "error" ? "⚠️ 同期失敗"
                    : syncStatus?.state === "synced" ? "✅ 同期済"
                    : "ログイン中"}
                </span>
              </button>
            ) : (
              <button onClick={onOpenLogin}
                title={cloudOk ? "Supabase 設定済 — タップでログイン" : "Supabase 未設定 — タップで設定手順を表示"}
                style={{
                  minHeight: 46, padding: "5px 12px", borderRadius: 12,
                  border: cloudOk ? "1.5px solid rgba(34, 211, 238, 0.45)" : "1.5px solid rgba(245, 158, 11, 0.45)",
                  background: cloudOk ? "rgba(34, 211, 238, 0.08)" : "rgba(245, 158, 11, 0.08)",
                  color: cloudOk ? "#67E8F9" : "#FCD34D", fontSize: 11.5, cursor: "pointer",
                  fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1,
                  gap: 1,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}>
                <span>{cloudOk ? "🔑 ログイン" : "⚠️ 未設定"}</span>
                <span style={{ fontSize: 9.5, opacity: 0.85, fontWeight: 600 }}>
                  {cloudOk ? "端末同期" : "ローカルのみ"}
                </span>
              </button>
            )}

            {/* 更新ボタン (cyan primary) */}
            <button onClick={handleRefresh} disabled={refreshing} className="btn btn-primary"
              style={{ minHeight: 46, minWidth: 92, padding: "6px 14px", fontSize: 14 }}>
              {refreshing ? "🔄 更新中…" : "🔄 更新"}
            </button>
          </div>
        )}
      </div>

      {/* ===== 第二行: スタイルセレクタ (大きく一目で) ===== */}
      {settings.onboardingDone && (
        <div className="max-w-5xl mx-auto px-4 pb-2.5">
          <BigStyleButtons current={settings.riskProfile} onChange={handleStyle} suggested={suggestedStyle} />
        </div>
      )}

      {/* ===== 第三行: タブナビ (洗練された pill style — Round 108c で 現在地表示強化) ===== */}
      <div className="max-w-5xl mx-auto px-4 pb-2" role="tablist" aria-label="メインメニュー">
        <div className="flex gap-1 overflow-x-auto scrollbar" style={{ scrollSnapType: "x proximity" }}>
          {TABS.map((t) => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(t.k)}
                className="whitespace-nowrap"
                style={{
                  flex: "0 0 auto",
                  scrollSnapAlign: "start",
                  padding: "9px 14px",
                  borderRadius: 10,
                  background: active ? "linear-gradient(180deg, var(--brand) 0%, var(--brand-hover) 100%)" : "transparent",
                  color: active ? "#021824" : "var(--text-tertiary)",
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  border: "1px solid " + (active ? "transparent" : "transparent"),
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  letterSpacing: "0.01em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: active ? "0 1px 0 rgba(255,255,255,0.20) inset, 0 4px 14px rgba(34, 211, 238, 0.25)" : "none",
                  minHeight: 40,
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                <span>{t.label}</span>
                {/* 現在地ドット (active のみ) */}
                {active && (
                  <span aria-hidden="true" style={{
                    position: "absolute",
                    bottom: -4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--brand)",
                    boxShadow: "0 0 6px rgba(34, 211, 238, 0.80)",
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

/* スタイルセレクタ — 3 列カード形式、 active には光と若干スケール */
function BigStyleButtons({ current, onChange, suggested }) {
  const items = [
    { k: "steady",     label: "安定型",   short: "🛡️", desc: "的中率特化" },
    { k: "balanced",   label: "バランス", short: "⚖️", desc: "実戦最適" },
    { k: "aggressive", label: "攻め型",   short: "🎯", desc: "高配当狙い" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((s) => {
        const info = PROFILE_INFO[s.k];
        const active = current === s.k;
        const isSuggested = suggested === s.k && !active;
        return (
          <button
            key={s.k}
            onClick={() => onChange(s.k)}
            style={{
              padding: "10px 6px",
              borderRadius: 12,
              border: active ? `1.5px solid ${info.color}` : "1.5px solid var(--border-soft)",
              background: active
                ? `linear-gradient(180deg, ${info.bg} 0%, rgba(255,255,255,0.02) 100%)`
                : "rgba(255,255,255,0.02)",
              color: active ? info.color : "var(--text-secondary)",
              fontWeight: active ? 700 : 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              minHeight: 56,
              boxShadow: active
                ? `0 0 0 1px ${info.color}40, 0 4px 16px ${info.color}25, inset 0 1px 0 rgba(255,255,255,0.06)`
                : "inset 0 1px 0 rgba(255,255,255,0.02)",
              transform: active ? "translateY(-1px)" : "translateY(0)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              position: "relative",
              overflow: "hidden",
            }}>
            {/* おすすめバッジ */}
            {isSuggested && (
              <div style={{
                position: "absolute", top: 4, right: 4,
                padding: "1px 5px", borderRadius: 999,
                background: "rgba(34, 211, 238, 0.20)",
                color: "#67E8F9",
                fontSize: 8, fontWeight: 700, letterSpacing: "0.05em",
              }}>
                推奨
              </div>
            )}
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{s.short}</span>
              <span style={{ fontSize: 13, lineHeight: 1.1, letterSpacing: "0.01em" }}>{s.label}</span>
            </div>
            <div style={{
              fontSize: 9.5,
              opacity: active ? 0.95 : 0.65,
              letterSpacing: "0.04em",
              lineHeight: 1.2,
              fontWeight: 500,
            }}>
              {s.desc}
            </div>
          </button>
        );
      })}
    </div>
  );
}
