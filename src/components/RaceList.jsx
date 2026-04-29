import { useMemo } from "react";
import { yen, pct } from "../lib/format.js";

/**
 * レース一覧 — EV 高い順。S/A 評価のみ強調、BC は薄表示。
 */
export default function RaceList({ races, evals, recommendations, onPickRace }) {
  const rows = useMemo(() => {
    return (races || []).map((r) => {
      const ev = evals[r.id];
      const rec = recommendations[r.id];
      const grade = ev?.topGrade || "—";
      const maxEV = ev?.maxEV ?? 0;
      const pickedCombos = rec?.decision === "buy"
        ? rec.items.map((it) => it.combo).join(" / ")
        : "—";
      const total = rec?.decision === "buy" ? rec.total : 0;
      return { race: r, ev, rec, grade, maxEV, pickedCombos, total };
    }).sort((a, b) => b.maxEV - a.maxEV);
  }, [races, evals, recommendations]);

  const goodOnly = rows.filter((row) => row.grade === "S" || row.grade === "A");
  const others = rows.filter((row) => row.grade !== "S" && row.grade !== "A");

  return (
    <div className="max-w-5xl mx-auto px-4 mt-4 space-y-4">
      <section className="card p-4">
        <h2 className="text-lg font-bold mb-2">🔥 買うべきレース ({goodOnly.length})</h2>
        <div className="text-xs opacity-70 mb-3">EV 1.10 以上のレースだけ抽出。S = EV 1.30 以上 (勝負)、A = 1.10 以上 (買ってもいい)。</div>
        {goodOnly.length === 0 ? (
          <div className="text-sm opacity-70">該当なし — 今日は買い目候補が出ていません</div>
        ) : (
          <div className="overflow-x-auto scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs opacity-60 border-b border-[#1f2a44]">
                  <th className="py-2">評価</th>
                  <th>会場/R</th>
                  <th>締切</th>
                  <th>最高EV</th>
                  <th>買い目</th>
                  <th>金額</th>
                  <th>展開</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {goodOnly.map((row) => (
                  <tr key={row.race.id} className="border-b border-[#1f2a44]/50 hover:bg-[#162241]">
                    <td className="py-3"><span className={"pill badge-grade-" + row.grade}>{row.grade}</span></td>
                    <td>
                      <div className="font-bold">{row.race.venue}</div>
                      <div className="text-xs opacity-70">{row.race.raceNo}R</div>
                    </td>
                    <td className="num">{row.race.startTime}</td>
                    <td className="num text-pos">{row.maxEV.toFixed(2)}</td>
                    <td className="font-mono text-xs">{row.pickedCombos}</td>
                    <td className="num">{row.total > 0 ? yen(row.total) : "—"}</td>
                    <td className="text-xs opacity-80">{row.ev?.development?.scenario || "—"}</td>
                    <td>
                      <button className="btn btn-ghost text-xs" onClick={() => onPickRace(row.race.id)}>
                        詳細 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section className="card p-4 opacity-50">
          <h3 className="text-sm font-bold mb-1">📭 見送り ({others.length})</h3>
          <div className="text-xs opacity-70">EV 1.10 未満。クリックで詳細</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.slice(0, 24).map((row) => (
              <button key={row.race.id} className="btn btn-ghost text-xs"
                onClick={() => onPickRace(row.race.id)}>
                {row.race.venue} {row.race.raceNo}R · {row.race.startTime} · EV {row.maxEV.toFixed(2)}
              </button>
            ))}
            {others.length > 24 && (
              <span className="text-xs opacity-60 self-center">... 他 {others.length - 24}件</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
