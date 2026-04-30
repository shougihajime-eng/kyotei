import BuyDecisionCard from "./BuyDecisionCard.jsx";
import { pct } from "../lib/format.js";

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

      <DevelopmentSummary evalRes={evalRes} />
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
