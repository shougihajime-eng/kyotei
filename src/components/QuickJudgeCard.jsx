import { yen } from "../lib/format.js";

const PROFILE_LABELS = {
  steady: { label: "🛡️ 安定型", color: "#3b82f6" },
  balanced: { label: "⚖️ バランス型", color: "#fbbf24" },
  aggressive: { label: "🎯 攻め型", color: "#ef4444" },
};

/**
 * 「クイックジャッジ」カード — ホーム最上部に巨大表示。
 * 初心者でも一瞬で「買う/穴/見送り」「EV」「過去成績」 が分かるレイアウト。
 */
export default function QuickJudgeCard({ headlineRace, recommendation, today, profile }) {
  const profileInfo = PROFILE_LABELS[profile] || PROFILE_LABELS.balanced;
  const air = today?.air || { stake: 0, pnl: 0 };
  const real = today?.real || { stake: 0, pnl: 0 };
  const dec = recommendation?.decision;

  let mode, color, headline;
  if (dec === "buy" && recommendation.grade === "S") {
    mode = "buy_strong"; color = "#10b981"; headline = "🟢 勝負レース";
  } else if (dec === "buy") {
    mode = "buy"; color = "#34d399"; headline = "🟢 買い";
  } else if (dec === "no-odds") {
    mode = "no-odds"; color = "#f59e0b"; headline = "⚠️ オッズ取得不可";
  } else {
    mode = "skip"; color = "#f87171"; headline = "🔴 見送り";
  }

  if (!headlineRace) {
    return (
      <section className="card p-6 text-center" style={{ minHeight: 180, borderColor: "#475569", borderWidth: 2 }}>
        <div style={{ fontSize: 48 }}>🤖</div>
        <div className="font-bold text-2xl mt-2">本日の対象なし</div>
        <div className="opacity-70 text-xs mt-1">「更新」ボタンで取得してください</div>
      </section>
    );
  }

  const main = recommendation?.main;
  const sub = (recommendation?.items || [])[1];

  return (
    <section className="card p-5" style={{
      minHeight: 240, borderColor: color, borderWidth: 3,
      background: dec === "buy"
        ? "linear-gradient(135deg, rgba(6,95,70,0.3), rgba(11,18,32,1))"
        : dec === "no-odds"
        ? "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(11,18,32,1))"
        : "linear-gradient(135deg, rgba(127,29,29,0.3), rgba(11,18,32,1))",
    }}>
      {/* ヘッダ: 判定 + レース + 現在スタイル */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div style={{ fontSize: "min(28px,7vw)", fontWeight: 900, color }}>{headline}</div>
        <div className="text-sm opacity-80">
          <b>{headlineRace.venue} {headlineRace.raceNo}R</b>
          <span className="ml-2 text-xs">{headlineRace.startTime}</span>
        </div>
      </div>
      <div className="text-xs opacity-80 mb-3" style={{ color: profileInfo.color }}>
        現在のスタイル: <b>{profileInfo.label}</b>
      </div>

      {/* 中央: 本命買い目 / 見送り理由 */}
      {main && dec === "buy" ? (
        <>
          <div className="text-center" style={{
            background: "rgba(0,0,0,0.32)", borderRadius: 14, padding: 14,
            border: `2px solid ${color}40`,
          }}>
            <div className="text-xs opacity-70 mb-1">👉 本命買い目 ({main.kind})</div>
            <div className="font-mono" style={{ fontSize: "min(40px,10vw)", fontWeight: 900 }}>
              {main.combo}
            </div>
            <div className="text-xs opacity-80 mt-1">
              EV <b style={{ color: "#fde68a" }}>{main.ev?.toFixed(2)}</b>
              {" · "}オッズ {main.odds?.toFixed(1)}
              {" · "}{yen(main.stake)}
            </div>
          </div>
          {sub && (
            <div className="text-center mt-2 text-xs opacity-80">
              <span className="opacity-60">穴狙い </span>
              <span className="font-mono font-bold mx-1">{sub.combo}</span>
              <span className="opacity-60">({yen(sub.stake)})</span>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-4 opacity-90">
          <div style={{ fontSize: 14, color: "#fecaca" }}>
            {recommendation?.reason || "対象なし"}
          </div>
          {recommendation?.rationale && (
            <div className="text-xs opacity-70 mt-2">{recommendation.rationale}</div>
          )}
        </div>
      )}

      {/* 一言理由 */}
      {dec === "buy" && recommendation?.reason && (
        <div className="text-center mt-3 text-sm" style={{ color: "#fde68a" }}>
          💡 {recommendation.reason}
        </div>
      )}

      {/* 最重要の警戒事項 (Round 17) — 1つだけ表示 */}
      {(recommendation?.warnings || []).find(w => w.kind === "warn") && (
        <div className="text-center mt-2 text-xs px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.16)", color: "#fecaca" }}>
          ⚠️ {recommendation.warnings.find(w => w.kind === "warn").text}
        </div>
      )}

      {/* エア / リアル 成績 */}
      <div className="grid grid-cols-2 gap-2 mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
        <div className="text-center">
          <div className="text-xs opacity-70">エア舟券</div>
          <div className={"num font-bold " + (air.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 16 }}>
            {air.stake === 0 ? "—" : (air.pnl >= 0 ? "+" : "") + yen(air.pnl)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs opacity-70">リアル舟券</div>
          <div className={"num font-bold " + (real.stake === 0 ? "opacity-50" : real.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 16 }}>
            {real.stake === 0 ? "未入力" : (real.pnl >= 0 ? "+" : "") + yen(real.pnl)}
          </div>
        </div>
      </div>
    </section>
  );
}
