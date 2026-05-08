import { useEffect, useState } from "react";

/**
 * 「最新にする」ボタン + クールダウン + 状態表示 + 次回自動更新カウントダウン。
 * Round 154: nextRefreshAt を受け取って 「次の自動更新まで N 分 N 秒」 を常時表示。
 */
export default function RefreshBar({ onRefresh, refreshing, refreshMsg, lastRefreshAt, cooldownSec = 15, nextRefreshAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // 1 秒ごと (カウントダウン表示のため常時)
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const since = lastRefreshAt ? Math.floor((now - new Date(lastRefreshAt).getTime()) / 1000) : null;
  const cooldownLeft = since != null && since < cooldownSec ? cooldownSec - since : 0;
  const lastLabel = since == null ? "未取得"
    : since < 5 ? "たった今"
    : since < 60 ? `${since}秒前`
    : `${Math.floor(since / 60)}分前`;
  const buttonLabel = refreshing ? "🔄 取得中…"
    : cooldownLeft > 0 ? `⏳ あと ${cooldownLeft}秒`
    : "🔄 最新データを取得";
  const disabled = refreshing || cooldownLeft > 0;

  // 進捗バー (クールダウン中の経過率)
  const progress = cooldownLeft > 0 ? ((cooldownSec - cooldownLeft) / cooldownSec) * 100 : 100;

  // 次回自動更新までのカウントダウン
  let nextAutoLabel = null;
  if (nextRefreshAt) {
    const nextMs = new Date(nextRefreshAt).getTime();
    const diff = Math.max(0, nextMs - now);
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (diff > 0) {
      nextAutoLabel = m > 0 ? `${m}分${String(s).padStart(2, "0")}秒` : `${s}秒`;
    } else {
      nextAutoLabel = "まもなく";
    }
  }

  return (
    <div className="card p-3 card-glow" style={{ minHeight: 64 }}>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onRefresh} disabled={disabled}
          className={refreshing ? "btn btn-primary pulse-soft" : "btn btn-primary"}
          style={{ minWidth: 200, minHeight: 48, padding: "12px 24px", fontSize: 15, fontWeight: 800 }}>
          {buttonLabel}
        </button>
        <div className="flex-1 text-xs opacity-80" style={{ minWidth: 140 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <span>最終更新: <b className="num">{lastLabel}</b></span>
            {nextAutoLabel && (
              <span style={{ color: "#67E8F9" }}>
                ⏱ 次の自動更新まで <b className="num">{nextAutoLabel}</b>
              </span>
            )}
          </div>
          {/* クールダウン進捗バー */}
          <div style={{ height: 4, marginTop: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999 }}>
            <div style={{
              height: "100%", width: `${progress}%`, borderRadius: 999,
              background: cooldownLeft > 0 ? "#fbbf24" : "#10b981",
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>
      </div>
      {refreshMsg && (
        <div className={"mt-2 text-sm " + (refreshMsg.startsWith("✅") ? "alert-ok" : refreshMsg.startsWith("⚠") ? "alert-warn" : refreshMsg.startsWith("🔄") ? "alert-info" : "alert-info")}>
          {refreshMsg}
        </div>
      )}
    </div>
  );
}
