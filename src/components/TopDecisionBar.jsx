/**
 * Top Decision Bar (Round 54) — 純粋コンポーネント
 *
 * 設計契約 (絶対):
 *   ・props は visibleData と currentStyle と switchProfile のみ
 *   ・useState / useEffect / useMemo は使わない (純粋描画のみ)
 *   ・predictions / races / settings には触れない
 *   ・visibleData.bestStyle / countsByStyle / roiByStyle / pnlSummary /
 *     driftDetected / lastUpdated / isEmpty を描画
 *   ・Dashboard・Stats・Settings と数値完全一致
 */
import { memo } from "react";
import { yen } from "../lib/format.js";

const STYLE_LABELS = {
  steady:     { label: "🛡️ 本命型",   color: "#3b82f6" },
  balanced:   { label: "⚖️ バランス型", color: "#fbbf24" },
  aggressive: { label: "🎯 穴狙い型",  color: "#ef4444" },
};

export default memo(TopDecisionBar);
function TopDecisionBar({ visibleData, currentStyle, switchProfile }) {
  // visibleData の必須フィールド検証 (defensive)
  if (!visibleData || typeof visibleData !== "object") {
    return (
      <section className="card p-3" style={{ minHeight: 80 }} aria-live="polite">
        <div className="text-xs opacity-60">⏳ visibleData 未取得</div>
      </section>
    );
  }
  const {
    countsByStyle = { steady: 0, balanced: 0, aggressive: 0 },
    roiByStyle = { steady: null, balanced: null, aggressive: null },
    pnlSummary = { air: null, real: null },
    bestStyle = null,
    driftDetected = false,
    lastUpdated = null,
    isEmpty = true,
    error = null,
  } = visibleData;

  /* ヘッドライン (visibleData の値だけで決定) */
  let headline;
  if (error) {
    headline = `⚠️ エラー: ${error}`;
  } else if (isEmpty) {
    headline = "📭 v2 データなし — 「🔄 更新」 を押して開始";
  } else if (bestStyle) {
    headline = `🏆 今日のおすすめ: ${STYLE_LABELS[bestStyle].label}`;
  } else {
    headline = "💡 実績データ蓄積中 — 各スタイルの候補をご確認ください";
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

      {/* 3 スタイル比較 (visibleData の countsByStyle / roiByStyle のみ参照) */}
      <div className="grid grid-cols-3 gap-2">
        {["steady", "balanced", "aggressive"].map((s) => {
          const info = STYLE_LABELS[s];
          const count = countsByStyle[s] || 0;
          const realRoi = roiByStyle[s];
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
              <div className="num font-bold" style={{
                fontSize: 22,
                color: count > 0 ? info.color : "#9fb0c9",
                marginTop: 2,
              }}>
                {count}
              </div>
              <div className="text-xs opacity-75">買い件数</div>
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

      {/* ズレ検知 (visibleData.driftDetected のみで判定) */}
      {driftDetected && bestStyle && (
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

      {/* 累計収支 (pnlSummary のみ参照) */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-70">🧪 エア累計</div>
          <div className={"num font-bold " + ((air?.pnl ?? 0) >= 0 ? "text-pos" : "text-neg")}
            style={{ fontSize: 20, lineHeight: 1.05 }}>
            {!air || air.stake === 0 ? "—" : `${air.pnl >= 0 ? "+" : ""}${yen(Math.round(air.pnl))}`}
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
