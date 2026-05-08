import { useMemo } from "react";
import { yen } from "../lib/format.js";

/**
 * Round 154: 買い忘れ警告 (MissedBuyCard)
 *
 * 思想:
 *   ・買い判定が出ていたのに記録 (実買 or エア) しなかったレースのうち、
 *     結果が確定したものを集計
 *   ・「もし買ってたら +XXX 円 だった」 を可視化して 「次は乗ろう」 を促す
 *   ・的中したのに買い忘れ = 機会損失。 外れたなら「結果的に正解」 と表示
 *
 * 表示条件:
 *   ・買い判定が確定 buy
 *   ・結果が確定 (apiResult.first or result.first)
 *   ・predictions に保存されていない or totalStake = 0
 */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function MissedBuyCard({ races, recommendations, predictions, onPickRace }) {
  const summary = useMemo(() => {
    if (!races || !recommendations) return null;
    const today = todayKey();
    const missed = [];
    for (const r of races) {
      if (r.date !== today) continue;
      const rec = recommendations[r.id];
      if (rec?.decision !== "buy") continue;
      const firstCombo = r.apiResult?.first || r.result?.first;
      if (!firstCombo) continue; // まだ終わっていない
      const recorded = predictions?.[r.id];
      const wasRecorded = (recorded?.totalStake || 0) > 0;
      if (wasRecorded) continue;

      const main = rec.main;
      if (!main?.combo) continue;
      const wouldHit = String(main.combo).trim() === String(firstCombo).trim();
      const stake = main.stake || 0;
      const wouldProfit = wouldHit ? Math.round((main.odds || 0) * stake) - stake : -stake;
      missed.push({ race: r, rec, wouldHit, firstCombo, wouldProfit });
    }
    if (missed.length === 0) return null;

    const hitCount = missed.filter((m) => m.wouldHit).length;
    const totalIfBought = missed.reduce((s, m) => s + m.wouldProfit, 0);
    return { missed, hitCount, totalIfBought };
  }, [races, recommendations, predictions]);

  if (!summary) return null;
  const { missed, hitCount, totalIfBought } = summary;
  const isPositive = totalIfBought > 0;

  return (
    <section style={{
      padding: "16px 18px 14px",
      borderRadius: 16,
      background: isPositive
        ? "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(11,18,32,0.96) 100%)"
        : "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(11,18,32,0.96) 100%)",
      border: isPositive ? "1.5px solid rgba(245,158,11,0.45)" : "1.5px solid rgba(239,68,68,0.30)",
      boxShadow: isPositive ? "0 0 32px -8px rgba(245,158,11,0.40)" : null,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: isPositive ? "#FCD34D" : "#FCA5A5" }}>
          {isPositive ? "💸 買い忘れ警告" : "🛡️ 見送り正解"}
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8" }}>
          AI 買い判定の <b className="num">{missed.length}</b> 件を未記録
        </div>
      </div>
      <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(0,0,0,0.30)", borderRadius: 10 }}>
        {isPositive ? (
          <>
            <div style={{ fontSize: 12.5, color: "#FDE68A", lineHeight: 1.5 }}>
              買っていれば 累計 <b className="num" style={{ fontSize: 18, color: "#FCD34D" }}>+{yen(totalIfBought)}</b>
              {hitCount > 0 && <> (<span className="num">{hitCount}</span> 件的中)</>}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
              次は AI 提案を信じて買いましょう。
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "#CBD5E1", lineHeight: 1.5 }}>
            買わなくて<span style={{ color: "#22F5A8", fontWeight: 800 }}> {yen(Math.abs(totalIfBought))} 損失回避</span>。
            このスタイルでは買い忘れが結果的に正解でした。
          </div>
        )}
      </div>

      {/* 上位 3 件を一覧表示 */}
      {missed.slice(0, 3).map((m) => (
        <button
          key={m.race.id}
          type="button"
          onClick={() => onPickRace?.(m.race.id)}
          style={{
            width: "100%", textAlign: "left",
            marginTop: 6, padding: "8px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#CBD5E1", cursor: "pointer",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 10,
          }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              {m.wouldHit ? "✅" : "❌"} {m.race.venue} <span className="num">{m.race.raceNo}R</span>
            </div>
            <div className="num" style={{ fontSize: 10.5, color: "#94A3B8" }}>
              本命 {m.rec.main.kind} {m.rec.main.combo} / 結果 {m.firstCombo}
            </div>
          </div>
          <div className="num" style={{
            fontSize: 14, fontWeight: 800,
            color: m.wouldProfit > 0 ? "#22F5A8" : "#F87171",
          }}>
            {m.wouldProfit > 0 ? "+" : ""}{yen(m.wouldProfit)}
          </div>
        </button>
      ))}
      {missed.length > 3 && (
        <div style={{ fontSize: 10.5, color: "#94A3B8", textAlign: "center", marginTop: 6 }}>
          …他 {missed.length - 3} 件
        </div>
      )}
    </section>
  );
}
