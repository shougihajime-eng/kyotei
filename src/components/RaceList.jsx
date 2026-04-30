import { useMemo } from "react";
import { yen } from "../lib/format.js";

/**
 * レース一覧 — 連勝系 4 券種ベース。S/A 評価を強調、その他薄表示。
 */
export default function RaceList({ races, evals, recommendations, onPickRace }) {
  const rows = useMemo(() => {
    return (races || []).map((r) => {
      const ev = evals[r.id];
      const rec = recommendations[r.id];
      const grade = ev?.topGrade || "—";
      const maxEV = ev?.maxEV ?? 0;
      const decision = rec?.decision || "skip";
      const mainCombo = rec?.main ? `${rec.main.kind} ${rec.main.combo}` : "—";
      const total = rec?.decision === "buy" ? rec.total : 0;
      const scenario = ev?.development?.scenario || "—";
      return { race: r, ev, rec, grade, maxEV, mainCombo, total, decision, scenario };
    }).sort((a, b) => b.maxEV - a.maxEV);
  }, [races, evals, recommendations]);

  const goodOnly = rows.filter((row) => row.decision === "buy" && (row.grade === "S" || row.grade === "A"));
  const noOdds = rows.filter((row) => row.decision === "no-odds");
  const others = rows.filter((row) => row.decision === "skip");

  return (
    <div className="max-w-5xl mx-auto px-4 mt-4 space-y-4">
      <section className="card p-4" style={{ minHeight: 200 }}>
        <h2 className="text-lg font-bold mb-2">🔥 買うべきレース ({goodOnly.length})</h2>
        <div className="text-xs opacity-70 mb-3">EV 1.10 以上の連勝系券種を抽出。S = EV 1.30+、A = 1.10+。</div>
        {goodOnly.length === 0 ? (
          <div className="text-sm opacity-70">該当なし</div>
        ) : (
          <div className="overflow-x-auto scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs opacity-60 border-b border-[#1f2a44]">
                  <th className="py-2">評価</th><th>会場/R</th><th>締切</th><th>本命買い目</th>
                  <th>EV</th><th>金額</th><th>展開</th><th></th>
                </tr>
              </thead>
              <tbody>
                {goodOnly.map((row) => (
                  <tr key={row.race.id} className="border-b border-[#1f2a44]/50 hover:bg-[#162241]">
                    <td className="py-3"><span className={"pill badge-grade-" + row.grade}>{row.grade}</span></td>
                    <td><div className="font-bold">{row.race.venue}</div><div className="text-xs opacity-70">{row.race.raceNo}R</div></td>
                    <td className="num">{row.race.startTime}</td>
                    <td className="font-mono text-xs">{row.mainCombo}</td>
                    <td className="num text-pos">{row.maxEV.toFixed(2)}</td>
                    <td className="num">{row.total > 0 ? yen(row.total) : "—"}</td>
                    <td className="text-xs opacity-80">{row.scenario}</td>
                    <td><button className="btn btn-ghost text-xs" onClick={() => onPickRace(row.race.id)}>詳細 →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {noOdds.length > 0 && (
        <section className="card p-4 alert-warn">
          <h3 className="text-sm font-bold mb-1">⚠️ オッズ取得不可 ({noOdds.length})</h3>
          <div className="text-xs opacity-90">発走前で実オッズが未公開。仮オッズは使わない方針。</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {noOdds.slice(0, 18).map((row) => (
              <button key={row.race.id} className="btn btn-ghost text-xs" onClick={() => onPickRace(row.race.id)}>
                {row.race.venue} {row.race.raceNo}R · {row.race.startTime}
              </button>
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="card p-4 opacity-60">
          <h3 className="text-sm font-bold mb-1">📭 見送り ({others.length})</h3>
          <div className="text-xs opacity-70">EV 1.10 未満</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.slice(0, 24).map((row) => (
              <button key={row.race.id} className="btn btn-ghost text-xs" onClick={() => onPickRace(row.race.id)}>
                {row.race.venue} {row.race.raceNo}R · {row.race.startTime} · EV {row.maxEV.toFixed(2)}
              </button>
            ))}
            {others.length > 24 && <span className="text-xs opacity-60 self-center">...他 {others.length - 24}件</span>}
          </div>
        </section>
      )}
    </div>
  );
}
