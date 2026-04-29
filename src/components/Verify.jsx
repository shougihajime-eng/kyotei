import { useMemo } from "react";
import { yen, pct } from "../lib/format.js";

/**
 * 検証画面 — 「AI通り 1 週間買ってたら いくら増えた / 減った」 を実データで表示。
 */
export default function Verify({ predictions }) {
  const { weekBuys, settled, weekly } = useMemo(() => {
    const arr = Object.values(predictions || {});
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const inRange = (d) => d && d >= weekAgo && d <= today.toISOString().slice(0, 10);
    const weekArr = arr.filter((p) => inRange(p.date));
    const buys = weekArr.filter((p) => p.decision === "buy" && p.totalStake > 0);
    const settledArr = buys.filter((p) => p.result?.first);
    let stake = 0, ret = 0, hits = 0;
    settledArr.forEach((p) => {
      stake += p.totalStake;
      ret += p.payout || 0;
      if (p.hit) hits += 1;
    });
    return {
      weekBuys: buys,
      settled: settledArr,
      weekly: {
        count: buys.length,
        settled: settledArr.length,
        hits,
        misses: settledArr.length - hits,
        stake, ret, pnl: ret - stake,
        roi: stake > 0 ? ret / stake : 0,
        hitRate: settledArr.length > 0 ? hits / settledArr.length : 0,
      },
    };
  }, [predictions]);

  const w = weekly;
  const pnlColor = w.pnl >= 0 ? "text-pos" : "text-neg";

  // 買って正解 / 買って外れ
  const goodBuys = settled.filter((p) => p.hit);
  const badBuys = settled.filter((p) => !p.hit);

  return (
    <div className="max-w-5xl mx-auto px-4 mt-4 space-y-4">
      <section className="card p-5" style={{ borderWidth: 2, borderColor: w.pnl >= 0 ? "#10b981" : "#ef4444" }}>
        <div className="text-xs opacity-70 uppercase tracking-widest mb-2">AI通りに 1 週間買っていたら</div>
        <div className="flex items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-xs opacity-70">利益 / 損失</div>
            <div className={"num " + pnlColor} style={{ fontSize: "min(48px,11vw)", fontWeight: 900, lineHeight: 1.05 }}>
              {w.pnl >= 0 ? "+" : ""}{yen(w.pnl)}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-70">回収率</div>
            <div className={"num " + pnlColor} style={{ fontSize: "min(36px,8vw)", fontWeight: 800 }}>
              {w.stake > 0 ? (w.roi * 100).toFixed(0) + "%" : "—"}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="勝負レース" value={w.count + "件"} />
        <Stat label="的中レース" value={w.hits + "件"}
          sub={`的中率 ${w.settled > 0 ? pct(w.hitRate, 0) : "—"}`} />
        <Stat label="総投資額" value={yen(w.stake)} />
        <Stat label="総払戻" value={yen(w.ret)} />
      </div>

      <DetailTable title="✅ 買って正解" rows={goodBuys} positive />
      <DetailTable title="❌ 買って外れ" rows={badBuys} />
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="num font-bold mt-1" style={{ fontSize: 22 }}>{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

function DetailTable({ title, rows, positive }) {
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">{title} ({rows.length})</h3>
      {rows.length === 0 ? (
        <div className="text-xs opacity-70">該当なし</div>
      ) : (
        <div className="overflow-x-auto scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs opacity-60 border-b border-[#1f2a44]">
                <th className="py-1">日付</th>
                <th>会場/R</th>
                <th>買い目</th>
                <th>投資</th>
                <th>払戻</th>
                <th>収支</th>
                <th>正解</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const correct = p.result ? `${p.result.first}-${p.result.second}-${p.result.third}` : "—";
                return (
                  <tr key={p.key} className="border-b border-[#1f2a44]/50">
                    <td className="py-1 num">{p.date}</td>
                    <td>{p.venue} {p.raceNo}R</td>
                    <td className="font-mono text-xs">{(p.combos || []).map((c) => c.combo).join(" / ")}</td>
                    <td className="num">{yen(p.totalStake)}</td>
                    <td className="num">{yen(p.payout || 0)}</td>
                    <td className={"num " + (positive ? "text-pos" : "text-neg")}>
                      {positive ? "+" : "−"}{yen(Math.abs(p.pnl || 0))}
                    </td>
                    <td className="font-mono text-xs">{correct}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
