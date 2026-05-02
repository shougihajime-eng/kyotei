/**
 * Top Decision Bar (Round 52-53) — トップ画面の「今日の結論」 常時表示
 *
 * 設計原則 (Round 52-53):
 *   ・visibleData を 唯一のソース として参照する
 *   ・自前で predictions を再計算しない (Dashboard/Stats/Settings との数値完全一致)
 *   ・visibleData.bestStyle / countsByStyle / pnlSummary / driftDetected / lastUpdated のみ使用
 *
 * 表示内容:
 *   1. おすすめスタイル (visibleData.bestStyle)
 *   2. 各スタイルの 買い件数 (countsByStyle)
 *   3. 各スタイルの 実績 ROI (roiByStyle)
 *   4. 現在収支 (pnlSummary.air / real)
 *   5. ズレ検知 (driftDetected)
 */
import { memo } from "react";
import { yen } from "../lib/format.js";

const STYLE_LABELS = {
  steady:     { label: "🛡️ 本命型",   color: "#3b82f6" },
  balanced:   { label: "⚖️ バランス型", color: "#fbbf24" },
  aggressive: { label: "🎯 穴狙い型",  color: "#ef4444" },
};

export default memo(TopDecisionBar);
function TopDecisionBar({
  visibleData,         // 単一ソース (App.jsx から)
  styleAllocation,     // 三等分割当 (今日の候補件数)
  switchProfile,
}) {
  // visibleData が来ない場合の防御
  if (!visibleData) {
    return (
      <section className="card p-3" style={{ minHeight: 80 }}>
        <div className="text-xs opacity-60">⏳ 状況を読み込み中…</div>
      </section>
    );
  }
  const {
    countsByStyle = {},
    roiByStyle = {},
    pnlSummary = {},
    bestStyle,
    driftDetected,
    currentStyle,
    lastUpdated,
    isEmpty,
  } = visibleData;

  const buckets = styleAllocation?.buckets || {};

  /* 「今日の結論」 ヘッドライン */
  let headline;
  if (isEmpty && (!styleAllocation || (styleAllocation.totalCandidates || 0) === 0)) {
    headline = "📭 今日のデータなし — 「🔄 更新」 を押してください";
  } else if (bestStyle) {
    headline = `🏆 今日のおすすめ: ${STYLE_LABELS[bestStyle].label}`;
  } else {
    // 実績データ不足、 候補件数で判断
    const candidates = Object.values(buckets).reduce((s, b) => s + (b?.length || 0), 0);
    if (candidates === 0) headline = "📊 候補なし — 厳選見送り日";
    else headline = "💡 実績データ蓄積中 — 候補レースを参照ください";
  }

  const air = pnlSummary?.air;
  const real = pnlSummary?.real;

  return (
    <section className="card card-glow p-3" style={{ minHeight: 140 }} aria-live="polite">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-bold text-sm">⚡ 今日の結論</div>
        {lastUpdated && (
          <div className="text-xs opacity-60">
            📅 最終更新 {new Date(lastUpdated).toLocaleTimeString("ja-JP")}
          </div>
        )}
      </div>

      <div className="text-sm font-bold mb-3" style={{
        color: bestStyle ? STYLE_LABELS[bestStyle].color : "#fde68a",
        lineHeight: 1.4,
      }}>
        {headline}
      </div>

      {/* スタイル別 候補件数 + 実績 ROI (タップで切替) */}
      <div className="grid grid-cols-3 gap-2">
        {["steady", "balanced", "aggressive"].map((s) => {
          const info = STYLE_LABELS[s];
          const candidates = buckets[s]?.length || 0;
          const realRoi = roiByStyle[s];
          const buyCount = countsByStyle[s] || 0;
          const active = currentStyle === s;
          const isBest = bestStyle === s;
          return (
            <button key={s} type="button"
              onClick={() => switchProfile && switchProfile(s)}
              aria-label={`${info.label} に切替`}
              style={{
                textAlign: "center",
                padding: "8px 6px",
                borderRadius: 10,
                border: `2px solid ${active ? info.color : isBest ? `${info.color}80` : "transparent"}`,
                background: active ? `${info.color}22` : isBest ? `${info.color}10` : "rgba(0,0,0,0.22)",
                color: active ? info.color : "#e7eef8",
                cursor: "pointer",
                transition: "all 0.12s",
                minHeight: 96,
                lineHeight: 1.2,
              }}>
              <div className="text-xs font-bold">{info.label}{isBest ? " 🏆" : ""}</div>
              <div className="num font-bold" style={{ fontSize: 22, color: candidates > 0 ? info.color : "#9fb0c9", marginTop: 2 }}>
                {candidates}
              </div>
              <div className="text-xs opacity-75">買い候補 / 保存{buyCount}</div>
              {realRoi != null ? (
                <div className="text-xs mt-1" style={{ color: realRoi >= 1 ? "#34d399" : "#f87171" }}>
                  実績 ROI {Math.round(realRoi * 100)}%
                </div>
              ) : (
                <div className="text-xs mt-1 opacity-60">実績未蓄積</div>
              )}
            </button>
          );
        })}
      </div>

      {/* ズレ検知 */}
      {driftDetected && (
        <div className="mt-3 p-2 rounded text-xs" style={{
          background: "rgba(251,191,36,0.12)",
          border: "1px solid rgba(251,191,36,0.4)",
          color: "#fde68a",
          lineHeight: 1.5,
        }}>
          ⚠️ <b>選択スタイルと実績にズレあり</b><br/>
          📈 実績では <b>{STYLE_LABELS[bestStyle]?.label}</b> の方が好調 (ROI {Math.round((roiByStyle[bestStyle] || 0) * 100)}%)
          <button onClick={() => switchProfile && switchProfile(bestStyle)}
            className="btn btn-ghost text-xs mt-1 ml-2" style={{ minHeight: 32, padding: "4px 10px" }}>
            → {STYLE_LABELS[bestStyle]?.label} に切替
          </button>
        </div>
      )}

      {/* 現在収支 (エア / リアル 並列) */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-70">🧪 エア累計</div>
          <div className={"num font-bold " + ((air?.pnl ?? 0) >= 0 ? "text-pos" : "text-neg")}
            style={{ fontSize: 20, lineHeight: 1.05 }}>
            {air ? `${air.pnl >= 0 ? "+" : ""}${yen(Math.round(air.pnl))}` : "—"}
          </div>
        </div>
        <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-70">💰 リアル累計</div>
          <div className={"num font-bold " + ((!real || real.stake === 0) ? "opacity-60" : ((real.pnl ?? 0) >= 0 ? "text-pos" : "text-neg"))}
            style={{ fontSize: 20, lineHeight: 1.05 }}>
            {!real || real.stake === 0 ? "未入力" : `${real.pnl >= 0 ? "+" : ""}${yen(Math.round(real.pnl))}`}
          </div>
        </div>
      </div>
    </section>
  );
}
