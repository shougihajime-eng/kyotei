import { useMemo } from "react";
import { yen } from "../lib/format.js";
import { analyzePrediction, aggregateLessons } from "../lib/analysis.js";
import { analyzeStrengthsAndWeaknesses, getLearnedWeights, getLearningLog, backtestComparison } from "../lib/learning.js";

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
  const swot = useMemo(() => analyzeStrengthsAndWeaknesses(predictions), [predictions]);
  const learned = useMemo(() => getLearnedWeights(predictions), [predictions]);
  const bt = useMemo(() => backtestComparison(predictions), [predictions]);
  const log = useMemo(() => getLearningLog(), []);

  return (
    <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
      <section className="card p-4" style={{ minHeight: 120 }}>
        <h2 className="text-lg font-bold mb-2">🔍 外れた理由 AI 分析 + 自己改善</h2>
        <div className="text-xs opacity-70">
          AI が出した予想と実際の結果を比較し、なぜ外れたか / 何を見落としたかを言語化します。
          さらに過去の的中傾向から重みを慎重に調整して、<b>過去データをもとに改善を試みます</b> (検証で悪化なら自動ロールバック)。
        </div>
      </section>

      {/* 🧪 バックテスト比較 — 7日 / 14日 / 30日 の ROI */}
      {bt && bt.all.count >= 5 && (
        <section className="card p-4">
          <h3 className="font-bold text-sm mb-2">🧪 バックテスト (期間別 ROI)</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "直近 7日",  s: bt.r7 },
              { label: "直近 14日", s: bt.r14 },
              { label: "直近 30日", s: bt.r30 },
            ].map((x, i) => {
              const color = x.s.roi >= 1 ? "#34d399" : x.s.roi >= 0.85 ? "#fde68a" : "#f87171";
              return (
                <div key={i} className="text-center" style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 10 }}>
                  <div className="text-xs opacity-70">{x.label}</div>
                  <div className="num font-bold mt-1" style={{ fontSize: 18, color }}>
                    {x.s.stake > 0 ? Math.round(x.s.roi * 100) + "%" : "—"}
                  </div>
                  <div className="text-xs opacity-60">{x.s.count}件 / 的中{x.s.hits}</div>
                </div>
              );
            })}
          </div>
          {bt.isDeteriorating && (
            <div className="alert-warn text-xs mt-3">
              ⚠️ 直近 7 日が 30 日比 {bt.recentDropPct}pt 悪化 — 学習を一時停止してロールバック中
            </div>
          )}
        </section>
      )}

      {/* 🧠 学習結果 — 採用 / 不採用 / ロールバック */}
      {learned.ready && (
        <section className="card p-4" style={{ borderColor: learned.decision === "accepted" ? "#22d3ee" : learned.decision === "rollback" ? "#ef4444" : "#475569", borderWidth: 2 }}>
          <h3 className="font-bold text-sm mb-2">
            🧠 学習結果 ({learned.sampleSize} 件) —
            <span className={"ml-2 " + (learned.decision === "accepted" ? "text-pos" : learned.decision === "rollback" ? "text-neg" : "")}>
              {learned.decision === "accepted" ? "✅ 採用"
              : learned.decision === "rollback" ? "🛑 ロールバック (前の重みに戻す)"
              : learned.decision === "pending" ? "⏳ 判断保留"
              : "= 中立 (重み変更なし)"}
            </span>
          </h3>
          {learned.notes.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {learned.notes.map((n, i) => (
                <li key={i} className={n.kind === "pos" ? "text-pos" : n.kind === "neg" ? "text-neg" : ""}>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs opacity-70">特記事項なし</div>
          )}
          <div className="text-xs opacity-60 mt-2">
            ※ 過学習防止: 7/14/30 日で安定した傾向のみ採用。1 期間だけの偏りは除外。最大補正は ±0.02。
          </div>
        </section>
      )}

      {/* 📜 学習ログ (採用/不採用の履歴) */}
      {log.length > 0 && (
        <section className="card p-4">
          <h3 className="font-bold text-sm mb-2">📜 学習ログ (直近 {Math.min(log.length, 10)} 件)</h3>
          <div className="overflow-x-auto scrollbar">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left opacity-60 border-b border-[#1f2a44]">
                  <th className="py-1">日付</th><th>判定</th><th>サンプル</th><th>変更</th><th>30日ROI</th><th>7日ROI</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 10).map((l) => (
                  <tr key={l.timestamp} className="border-b border-[#1f2a44]/40">
                    <td className="py-1 num">{l.date}</td>
                    <td className={l.decision === "accepted" ? "text-pos" : "text-neg"}>
                      {l.decision === "accepted" ? "採用" : "不採用"}
                    </td>
                    <td className="num">{l.sampleSize}</td>
                    <td className="font-mono text-xs">
                      {Object.keys(l.adjustments || {}).length === 0 ? "—" :
                        Object.entries(l.adjustments).map(([k, v]) => `${k}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(", ")}
                    </td>
                    <td className="num">{l.backtest?.r30Roi != null ? Math.round(l.backtest.r30Roi * 100) + "%" : "—"}</td>
                    <td className="num">{l.backtest?.r7Roi != null ? Math.round(l.backtest.r7Roi * 100) + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 得意 / 苦手 */}
      {swot.hasEnoughData && (swot.strengths.length > 0 || swot.weaknesses.length > 0) && (
        <section className="card p-4">
          <h3 className="font-bold text-sm mb-3">🎯 得意条件 / ⚠️ 苦手条件 ({swot.sampleSize}件から抽出)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-bold mb-2 text-pos">🎯 得意 (回収率 110% 以上)</div>
              {swot.strengths.length === 0 ? (
                <div className="text-xs opacity-60">該当なし</div>
              ) : (
                <ul className="space-y-1">
                  {swot.strengths.slice(0, 6).map((s, i) => (
                    <li key={i} className="text-xs flex justify-between" style={{ background: "rgba(16,185,129,0.12)", padding: "4px 8px", borderRadius: 4 }}>
                      <span><b>{s.label}</b> ({s.category})</span>
                      <span className="num text-pos">{Math.round(s.roi * 100)}% ({s.count}件)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-bold mb-2 text-neg">⚠️ 苦手 (回収率 85% 以下)</div>
              {swot.weaknesses.length === 0 ? (
                <div className="text-xs opacity-60">該当なし</div>
              ) : (
                <ul className="space-y-1">
                  {swot.weaknesses.slice(0, 6).map((s, i) => (
                    <li key={i} className="text-xs flex justify-between" style={{ background: "rgba(239,68,68,0.12)", padding: "4px 8px", borderRadius: 4 }}>
                      <span><b>{s.label}</b> ({s.category})</span>
                      <span className="num text-neg">{Math.round(s.roi * 100)}% ({s.count}件)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="text-xs opacity-60 mt-2">
            💡 苦手条件のレースでは見送りを増やし、得意条件のレースでは点数を増やすと回収率が上がります。
          </div>
        </section>
      )}

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
