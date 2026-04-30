import BuyDecisionCard from "./BuyDecisionCard.jsx";
import { pct } from "../lib/format.js";
import { dataAvailability, getScoreBreakdown } from "../lib/predict.js";

/**
 * レース詳細 — 結論カード + 6艇の確率/スコア + 直前情報サマリ + 関連記事
 */
export default function RaceDetail({ race, evalRes, recommendation, onRecord, onBack, virtualMode }) {
  if (!race) {
    return <div className="max-w-3xl mx-auto px-4 mt-6 text-center opacity-70">レースが選択されていません</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
      <button className="btn btn-ghost text-xs" onClick={onBack}>← 戻る</button>

      <BuyDecisionCard race={race} recommendation={recommendation} onRecord={onRecord} virtualMode={virtualMode} />

      {/* 「なぜこの点数」 説明 */}
      {recommendation?.rationale && (
        <section className="alert-info text-sm">
          📐 <b>{recommendation.points || 0} 点購入の理由:</b> {recommendation.rationale}
        </section>
      )}

      {/* データ取得状況パネル */}
      <DataAvailabilityPanel race={race} />

      {/* 本命艇の予想分解 (どのデータが何 % 効いたか) */}
      <ScoreBreakdownPanel evalRes={evalRes} race={race} recommendation={recommendation} />

      <DevelopmentSummary evalRes={evalRes} />
      <WindWaveSection evalRes={evalRes} />
      <MaeBukeSection evalRes={evalRes} />
      <ExhibitionSTSection evalRes={evalRes} race={race} />
      <BoatProbabilityTable evalRes={evalRes} race={race} />
      <BeforeInfoSummary race={race} />
      <RelatedNews evalRes={evalRes} />

      <section className="card p-4 text-xs opacity-80">
        <div className="font-bold mb-1 text-sm">判断要素 (固定 5 因子 + 補正)</div>
        <div className="space-y-1">
          <div>① <b>1号艇有利度</b> (コース基本勝率 / 重み 30%)</div>
          <div>② <b>モーター 2連率</b> (重み 20%)</div>
          <div>③ <b>展示タイム</b> (重み 15%)</div>
          <div>④ <b>スタート力</b> (平均ST / 重み 20%)</div>
          <div>⑤ <b>オッズ妙味</b> (実オッズ × 確率 = 期待値)</div>
          <div className="opacity-90 mt-1">+ <b>直前補正</b>: 部品交換 / チルト / 気配 / 当地適性 / 風向</div>
        </div>
      </section>
    </div>
  );
}

/* 展開予想 */
function DevelopmentSummary({ evalRes }) {
  if (!evalRes?.development) return null;
  const dev = evalRes.development;
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📍 展開予想</h3>
      <div className="alert-info text-sm">
        <b>{dev.scenario}</b> — {dev.comment}
      </div>
    </section>
  );
}

/* 6艇の確率 + 因子グレード */
function BoatProbabilityTable({ evalRes, race }) {
  const scores = evalRes?.scores || [];
  const probs = evalRes?.probs || [];
  if (scores.length === 0) return null;
  const rows = scores.map((s, i) => ({ ...s, prob: probs[i] || 0 })).sort((a, b) => b.prob - a.prob);
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-3">6艇の評価 (AI 確率順)</h3>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs opacity-60 border-b border-[#1f2a44]">
              <th className="py-2">艇</th>
              <th>選手</th>
              <th className="text-right">確率</th>
              <th>5因子</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const boat = race.boats.find((b) => b.boatNo === r.boatNo);
              const f = r.factors;
              return (
                <tr key={r.boatNo} className="border-b border-[#1f2a44]/50">
                  <td className="py-2 font-bold">{r.boatNo}</td>
                  <td>
                    <div className="text-sm">{boat?.racer || "—"}</div>
                    <div className="text-xs opacity-60">{boat?.class || ""}</div>
                  </td>
                  <td className="text-right num">{pct(r.prob, 1)}</td>
                  <td className="text-xs opacity-80">
                    イン:{grade(f.inAdvantage)} M:{grade(f.motor)} 展:{grade(f.exhibition)} ST:{grade(f.startPower)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function grade(v) {
  if (v == null) return "—";
  if (v >= 0.7) return "A"; if (v >= 0.4) return "B"; return "C";
}

/* データ取得状況パネル — 選手/コース別/モーター/展示/オッズ/気象 を取得済 / 未取得で表示 */
function DataAvailabilityPanel({ race }) {
  const av = dataAvailability(race);
  const items = av.items || {};
  const completeness = Math.round((av.completeness || 0) * 100);
  return (
    <section className="card p-4" style={{ minHeight: 120 }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-bold text-sm">📋 データ取得状況</h3>
        <span className={"pill " + (completeness >= 80 ? "badge-buy" : completeness >= 50 ? "badge-warn" : "badge-skip")}>
          {av.got || 0} / {av.total || 0} ({completeness}%)
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
        {Object.entries(items).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <span style={{ color: v === "ok" ? "#34d399" : "#f87171" }}>{v === "ok" ? "✓" : "✗"}</span>
            <span className={v === "ok" ? "" : "opacity-50"}>{k}</span>
            {v !== "ok" && <span className="text-xs opacity-60 ml-auto">未取得</span>}
          </div>
        ))}
      </div>
      <div className="text-xs opacity-60 mt-2">
        ※ 未取得項目は「最新にする」を押すと取得試行されます。取得不可のままの場合は仮値を使わず、その項目は予想に反映されません。
      </div>
    </section>
  );
}

/* 本命艇の予想分解 — どの因子がどれだけ効いたかを %s で表示 */
function ScoreBreakdownPanel({ evalRes, race, recommendation }) {
  if (!recommendation || recommendation.decision !== "buy" || !recommendation.main) return null;
  const mainBoatNo = parseInt(recommendation.main.combo[0]);
  const boat = race?.boats?.find((b) => b.boatNo === mainBoatNo);
  if (!boat) return null;
  const bd = getScoreBreakdown(boat, race);
  if (!bd) return null;
  // 寄与度の高い順
  const sorted = [...bd.breakdown].sort((a, b) => b.contribution - a.contribution);
  const maxContribution = Math.max(...sorted.map((c) => c.contribution), 0.001);
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-3">🔬 本命艇 ({mainBoatNo}号艇) の予想分解</h3>
      <div className="text-xs opacity-70 mb-3">
        どのデータが何 % 効いているかを可視化しました。直前補正は ×{bd.conditionMod.toFixed(2)} 倍。
      </div>
      <div className="space-y-2">
        {sorted.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="font-bold">{c.label}</span>
              <span className="opacity-80">
                <span className="opacity-60 mr-2">{c.note}</span>
                <b>{c.pctOfBase}%</b>
              </span>
            </div>
            <div style={{ width: "100%", height: 8, background: "#1f2a44", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                width: `${(c.contribution / maxContribution) * 100}%`,
                height: "100%",
                background: c.contribution > 0.10 ? "#10b981" : c.contribution > 0.05 ? "#fde68a" : "#9fb0c9",
              }} />
            </div>
          </div>
        ))}
      </div>
      {bd.conditionReasons.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1f2a44" }}>
          <div className="text-xs opacity-70 mb-1">直前補正の内訳</div>
          <div className="flex flex-wrap gap-1">
            {bd.conditionReasons.map((r, i) => (
              <span key={i} className="pill text-xs"
                style={{
                  background: r.kind === "pos" ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)",
                  color: r.kind === "pos" ? "#a7f3d0" : "#fecaca",
                }}>
                {r.kind === "pos" ? "✓" : "✗"} {r.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* === Phase D: 風波 影響 === */
function WindWaveSection({ evalRes }) {
  const w = evalRes?.windWave;
  if (!w) return null;
  const inAdv = w.inAdvantage;
  const rough = w.roughLikelihood;
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">🌊 風波 影響</h3>
      <div className="text-xs opacity-90 mb-2">
        💨 {w.windDir || "風向不明"} {w.wind}m / 🌊 波 {w.wave}cm
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Meter label="イン有利度" value={inAdv} positive />
        <Meter label="荒れ期待度" value={rough} negative />
      </div>
    </section>
  );
}
function Meter({ label, value, positive, negative }) {
  const color = positive
    ? (value >= 70 ? "#34d399" : value >= 40 ? "#fde68a" : "#f87171")
    : (value >= 70 ? "#f87171" : value >= 40 ? "#fde68a" : "#34d399");
  return (
    <div>
      <div className="text-xs opacity-70">{label}</div>
      <div className="num font-bold mt-1" style={{ fontSize: 24, color }}>{value}</div>
      <div style={{ width: "100%", height: 6, background: "#1f2a44", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
        <div style={{ width: value + "%", height: "100%", background: color }} />
      </div>
    </div>
  );
}

/* === Phase D: 前付け検知 === */
function MaeBukeSection({ evalRes }) {
  const m = evalRes?.maeBuke;
  if (!m) return null;
  const stars = Math.min(5, Math.round(m.likelihood / 20));
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">🔄 前付け検知</h3>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div>
          <div className="text-xs opacity-70">前付け可能性</div>
          <div className="num font-bold" style={{ fontSize: 24, color: m.likelihood >= 60 ? "#f87171" : m.likelihood >= 30 ? "#fde68a" : "#34d399" }}>
            {m.likelihood}%
          </div>
        </div>
        <div>
          <div className="text-xs opacity-70">想定進入</div>
          <div className="font-mono" style={{ fontSize: 18, fontWeight: 700 }}>{m.expectedLane || "—"}</div>
        </div>
      </div>
      {m.isMaebuke && m.suspectBoats?.length > 0 && (
        <div className="alert-warn text-xs mt-2">
          ⚠️ {m.suspectBoats.map(s => `${s.boat}号艇`).join(", ")} が前付けの可能性 — 荒れ警戒
        </div>
      )}
      {!m.isMaebuke && (
        <div className="text-xs opacity-70 mt-2">標準進入 (枠番=進入) と推定</div>
      )}
    </section>
  );
}

/* === Phase D: 展示ST 分析 === */
function ExhibitionSTSection({ evalRes, race }) {
  const arr = evalRes?.stExh || [];
  if (arr.length === 0) return null;
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">⏱️ 展示ST 分析 (本番平均ST との差分)</h3>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left opacity-60 border-b border-[#1f2a44]">
              <th className="py-1">艇</th><th>本番平均ST</th><th>展示ST</th><th>差分</th><th>判定</th>
            </tr>
          </thead>
          <tbody>
            {arr.map((s) => {
              const color = s.status === "好調" ? "text-pos" : s.status === "不調" ? "text-neg" : "";
              return (
                <tr key={s.boatNo} className="border-b border-[#1f2a44]/40">
                  <td className="py-1 font-bold">{s.boatNo}</td>
                  <td className="num">{s.baseST ?? "—"}</td>
                  <td className="num">{s.exST ?? "—"}</td>
                  <td className={"num " + color}>{s.diff != null ? (s.diff >= 0 ? "+" : "") + s.diff.toFixed(2) : "—"}</td>
                  <td className={color}>{s.status}{s.note && <span className="opacity-70 ml-1">({s.note})</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* 直前情報サマリ */
function BeforeInfoSummary({ race }) {
  const info = race?.apiBeforeInfo;
  if (!info) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 直前情報</h3>
        <div className="text-xs opacity-60">未取得 — 発走 30 分前から取得します</div>
      </section>
    );
  }
  const w = info.weather || {};
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📰 直前情報</h3>
      <div className="text-xs opacity-90 mb-3">
        {w.weather && <span className="mr-3">🌤 {w.weather}</span>}
        {w.wind != null && <span className="mr-3">💨 {w.windDir || "風"} {w.wind}m</span>}
        {w.wave != null && <span className="mr-3">🌊 波 {w.wave}cm</span>}
        {w.temp != null && <span className="mr-3">🌡 {w.temp}℃</span>}
      </div>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left opacity-60 border-b border-[#1f2a44]">
              <th className="py-1">艇</th><th>展示</th><th>チルト</th><th>ST展示</th><th>部品交換</th><th>気配</th>
            </tr>
          </thead>
          <tbody>
            {(info.boats || []).map((b) => (
              <tr key={b.boatNo} className="border-b border-[#1f2a44]/40">
                <td className="py-1 font-bold">{b.boatNo}</td>
                <td className="num">{b.exTime ?? "—"}</td>
                <td className="num">{b.tilt ?? "—"}</td>
                <td className="num">{b.startEx ?? "—"}</td>
                <td>{b.partsExchange?.length ? <span className="text-neg">{b.partsExchange.join("/")}</span> : "—"}</td>
                <td>{b.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RelatedNews({ evalRes }) {
  const items = evalRes?.related || [];
  if (items.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 予想に影響した記事</h3>
        <div className="text-xs opacity-60">関連記事なし</div>
      </section>
    );
  }
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📰 予想に影響した記事 ({items.length})</h3>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="border-b border-[#1f2a44] pb-2 last:border-b-0">
            <a href={it.link} target="_blank" rel="noopener noreferrer" className="block hover:bg-[#162241] rounded p-1">
              <div className="text-sm font-bold text-cyan-300">{it.title}</div>
              <div className="text-xs opacity-60 mt-1">{it.date || "—"} · {it.source}</div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
