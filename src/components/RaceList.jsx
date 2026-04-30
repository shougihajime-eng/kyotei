import { useMemo } from "react";
import { yen } from "../lib/format.js";

/**
 * レース一覧 — 連勝系 4 券種ベース。S/A 評価をカード化、その他は薄表示。
 * スマホ対応: 1 レース 1 カード形式 (md以上では 2 列グリッド)。
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
      const inTrust = ev?.inTrust;
      const points = rec?.items?.length || 0;
      return { race: r, ev, rec, grade, maxEV, mainCombo, total, decision, scenario, inTrust, points };
    }).sort((a, b) => b.maxEV - a.maxEV);
  }, [races, evals, recommendations]);

  const goodOnly = rows.filter((row) => row.decision === "buy" && (row.grade === "S" || row.grade === "A"));
  const noOdds = rows.filter((row) => row.decision === "no-odds");
  const others = rows.filter((row) => row.decision === "skip");

  // 6号艇偏重チェック
  const totalBuy = goodOnly.length;
  const boat6Heavy = goodOnly.filter((row) => (row.rec?.main?.combo || "").startsWith("6")).length;
  const boat6Ratio = totalBuy > 0 ? boat6Heavy / totalBuy : 0;
  const showBoat6Warning = totalBuy >= 3 && boat6Ratio >= 0.20;

  return (
    <div className="max-w-5xl mx-auto px-4 mt-4 space-y-4">
      {showBoat6Warning && (
        <div className="alert-warn text-sm">
          ⚠️ 6号艇頭の推奨が <b>{Math.round(boat6Ratio * 100)}%</b> ({boat6Heavy}/{totalBuy})。データ偏りや荒れ判定の重なりが原因かもしれません。
        </div>
      )}

      <section className="card p-4" style={{ minHeight: 200 }}>
        <h2 className="text-lg font-bold mb-2">🔥 買うべきレース ({goodOnly.length})</h2>
        <div className="text-xs opacity-70 mb-3">EV 1.10 以上の連勝系券種を抽出。S = EV 1.30+、A = 1.10+。</div>
        {goodOnly.length === 0 ? (
          <div className="text-sm opacity-70">該当なし</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {goodOnly.map((row) => (
              <RaceCard key={row.race.id} row={row} onPick={onPickRace} />
            ))}
          </div>
        )}
      </section>

      {noOdds.length > 0 && (
        <section className="card p-4 alert-warn" style={{ minHeight: 100 }}>
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
        <section className="card p-4 opacity-60" style={{ minHeight: 100 }}>
          <h3 className="text-sm font-bold mb-1">📭 見送り ({others.length})</h3>
          <div className="text-xs opacity-70">EV 1.10 未満</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.slice(0, 24).map((row) => (
              <button key={row.race.id} className="btn btn-ghost text-xs" onClick={() => onPickRace(row.race.id)}>
                {row.race.venue} {row.race.raceNo}R · EV {row.maxEV.toFixed(2)}
              </button>
            ))}
            {others.length > 24 && <span className="text-xs opacity-60 self-center">...他 {others.length - 24}件</span>}
          </div>
        </section>
      )}
    </div>
  );
}

/* スマホ向けレースカード */
function RaceCard({ row, onPick }) {
  const trust = row.inTrust;
  return (
    <div className="card p-4 cursor-pointer hover:bg-[#162241]"
      onClick={() => onPick(row.race.id)}
      style={{ minHeight: 180, transition: "background 0.15s" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div>
          <div className="font-bold text-lg">{row.race.venue} {row.race.raceNo}R</div>
          <div className="text-xs opacity-70 num">締切 {row.race.startTime || "—"}</div>
        </div>
        <span className={"pill badge-grade-" + row.grade} style={{ fontSize: 13, padding: "4px 12px" }}>{row.grade}</span>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="pill badge-buy" style={{ fontSize: 12 }}>👉 買い ({row.points}点)</span>
        {trust && (
          <span className="pill" style={{ fontSize: 11, background: "rgba(0,0,0,0.3)", color: trust.color }}>
            イン: {trust.level}
          </span>
        )}
      </div>

      <div className="text-xs opacity-70 mb-1">推奨買い目</div>
      <div className="font-mono text-base mb-2">{row.mainCombo}</div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="opacity-70">投資</div>
          <div className="num font-bold">{row.total > 0 ? yen(row.total) : "—"}</div>
        </div>
        <div>
          <div className="opacity-70">EV</div>
          <div className="num font-bold text-pos">{row.maxEV.toFixed(2)}</div>
        </div>
        <div>
          <div className="opacity-70">展開</div>
          <div className="font-bold">{row.scenario}</div>
        </div>
      </div>
    </div>
  );
}
