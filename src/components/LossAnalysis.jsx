import { useMemo } from "react";
import { yen } from "../lib/format.js";
import { analyzePrediction, aggregateLessons } from "../lib/analysis.js";

/**
 * 外れた理由 AI 分析画面
 *  ・直近の確定済み予測を 1 件ずつ表示し、外れ理由 / 当たり要因を分析
 *  ・全件の集計から「気をつけること」 (自己学習メモ) を抽出
 */
export default function LossAnalysis({ predictions, races }) {
  const list = useMemo(() => {
    return Object.values(predictions || {})
      .filter((p) => p.decision === "buy" && p.result?.first)
      .sort((a, b) => (b.result?.fetchedAt || "").localeCompare(a.result?.fetchedAt || ""))
      .slice(0, 30);
  }, [predictions]);

  const aggregate = useMemo(() => aggregateLessons(predictions), [predictions]);

  return (
    <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
      <section className="card p-4" style={{ minHeight: 120 }}>
        <h2 className="text-lg font-bold mb-2">🔍 外れた理由 AI 分析</h2>
        <div className="text-xs opacity-70">
          AI が出した予想と実際の結果を比較し、なぜ外れたか / 何を見落としたかを言語化します。集計から「次回への教訓」も抽出します。
        </div>
      </section>

      {/* 自己学習メモ (集計から自動抽出) */}
      {aggregate?.memos?.length > 0 && (
        <section className="card p-4">
          <h3 className="font-bold text-sm mb-3">📒 自己学習メモ ({aggregate.totalSettled} 件のレースから抽出)</h3>
          <div className="space-y-2">
            {aggregate.memos.map((m, i) => (
              <div key={i} className={"text-sm " + (m.kind === "warn" ? "alert-warn" : "alert-info")}>
                {m.text}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 個別レース分析 */}
      {list.length === 0 ? (
        <div className="card p-4 text-center text-sm opacity-70" style={{ minHeight: 100 }}>
          まだ分析対象のレースがありません。<br />
          <span className="opacity-60 text-xs">レース結果が確定すると、ここに自動分析が表示されます</span>
        </div>
      ) : (
        list.map((p) => (
          <AnalysisCard key={p.key} p={p} race={races?.find(r => r.id === p.raceId)} />
        ))
      )}
    </div>
  );
}

function AnalysisCard({ p, race }) {
  const result = useMemo(() => analyzePrediction(p, race), [p, race]);
  if (!result) return null;
  const isHit = result.outcome === "hit";
  const bg = isHit ? "linear-gradient(135deg,#053527,#0b1220)"
                   : "linear-gradient(135deg,#3b1d1d,#0b1220)";
  const border = isHit ? "#10b981" : "#ef4444";
  const aiCombos = (p.combos || []).map(c => c.combo).join(" / ") || "—";
  const correct = `${p.result.first}-${p.result.second}-${p.result.third}`;

  return (
    <section style={{
      padding: 16, borderRadius: 14, background: bg, border: `2px solid ${border}`,
      color: "#fff", minHeight: 200,
    }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-sm">
          <span className="font-bold">{p.venue} {p.raceNo}R</span>
          <span className="ml-2 opacity-70 text-xs">{p.date}</span>
        </div>
        {isHit
          ? <span className="pill" style={{ background: "#10b981", color: "#fff" }}>🎯 的中</span>
          : <span className="pill" style={{ background: "#ef4444", color: "#fff" }}>❌ 不的中</span>}
      </div>

      <div className="text-base font-bold mb-2" style={{ color: isHit ? "#a7f3d0" : "#fecaca" }}>
        {result.headline}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        <div>
          <div className="opacity-70 text-xs">AI予想</div>
          <div className="font-mono">{aiCombos}</div>
          <div className="num text-xs opacity-70 mt-1">投資 {yen(p.totalStake)} / {(p.combos || []).length}点</div>
        </div>
        <div>
          <div className="opacity-70 text-xs">正解</div>
          <div className="font-mono" style={{ color: "#fde68a" }}>{correct}</div>
          <div className={"num text-xs mt-1 " + (p.pnl >= 0 ? "text-pos" : "text-neg")}>
            収支 {p.pnl >= 0 ? "+" : ""}{yen(p.pnl)}
          </div>
        </div>
      </div>

      {result.reasons.length > 0 && (
        <div className="space-y-1 mb-2">
          {result.reasons.map((r, i) => (
            <div key={i} className="text-xs"
              style={{
                padding: "6px 10px", borderRadius: 6,
                background: r.kind === "good"   ? "rgba(16,185,129,0.15)"
                          : r.kind === "wrong"  ? "rgba(239,68,68,0.15)"
                          :                       "rgba(251,191,36,0.15)",
                color:      r.kind === "good"   ? "#a7f3d0"
                          : r.kind === "wrong"  ? "#fecaca"
                          :                       "#fde68a",
              }}>
              {r.kind === "good" ? "✓" : r.kind === "wrong" ? "✗" : "⚠"} {r.text}
            </div>
          ))}
        </div>
      )}

      {result.lessons.length > 0 && (
        <div className="text-xs mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <div className="opacity-70 mb-1">📒 次回への教訓</div>
          <ul className="list-disc pl-5 space-y-1">
            {result.lessons.map((l, i) => (
              <li key={i} className="opacity-90">{l}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
