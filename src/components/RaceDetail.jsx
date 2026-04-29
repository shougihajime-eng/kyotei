import BuyDecisionCard from "./BuyDecisionCard.jsx";
import { pct } from "../lib/format.js";

/**
 * レース詳細 — 結論カード + 6艇のスコア + 5因子グレード。これだけ。
 */
export default function RaceDetail({ race, evalRes, recommendation, onRecord, onBack, virtualMode }) {
  if (!race) {
    return (
      <div className="max-w-3xl mx-auto px-4 mt-6 text-center opacity-70">
        レースが選択されていません
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
      <button className="btn btn-ghost text-xs" onClick={onBack}>← 戻る</button>

      <BuyDecisionCard race={race} recommendation={recommendation}
        onRecord={onRecord} virtualMode={virtualMode} />

      {/* 展開予想 + 危険人気 */}
      <DevelopmentSummary evalRes={evalRes} />

      {/* オッズ乖離分析 */}
      <OddsGapTable evalRes={evalRes} race={race} />

      {/* 直前情報サマリ */}
      <BeforeInfoSummary race={race} />

      {/* 予想に影響した記事 */}
      <RelatedNews evalRes={evalRes} />

      {/* 6艇のスコア表 */}
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-3">6艇の評価 (EV 順)</h3>
        <div className="overflow-x-auto scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs opacity-60 border-b border-[#1f2a44]">
                <th className="py-2">艇</th>
                <th>選手</th>
                <th className="text-right">確率</th>
                <th className="text-right">オッズ</th>
                <th className="text-right">EV</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {(evalRes?.ranked || []).map((t) => {
                const boat = race.boats.find((b) => b.boatNo === t.boatNo);
                return (
                  <tr key={t.boatNo} className="border-b border-[#1f2a44]/50">
                    <td className="py-2 font-bold">{t.boatNo}</td>
                    <td>
                      <div className="text-sm">{boat?.racer || "—"}</div>
                      <div className="text-xs opacity-60">{boat?.class || ""}</div>
                    </td>
                    <td className="text-right num">{pct(t.prob, 1)}</td>
                    <td className="text-right num">{t.odds.toFixed(1)}</td>
                    <td className={"text-right num " + (t.ev >= 1.10 ? "text-pos" : "text-neg")}>
                      {t.ev.toFixed(2)}
                    </td>
                    <td>
                      <span className={"pill badge-grade-" + t.grade}>{t.grade}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5因子の説明 */}
      <section className="card p-4 text-xs opacity-80">
        <div className="font-bold mb-1 text-sm">判断要素 (固定 5 因子 + 直前補正)</div>
        <div className="space-y-1">
          <div>① <b>1号艇有利度</b> — コース基本勝率 (1コース 55%, 2コース 16%, ...)</div>
          <div>② <b>モーター</b> — モーター 2連率 (50% で A, 30% で B, 10% で C)</div>
          <div>③ <b>展示タイム</b> — 6.65 秒なら A、7.0 秒で B、7.2 秒以上で C</div>
          <div>④ <b>スタート力</b> — 平均ST 0.10 が A、0.18 で B、0.25 以上で C</div>
          <div>⑤ <b>オッズ</b> — 期待値 (確率 × オッズ) で買うかどうかを最終判断</div>
          <div className="opacity-90 mt-1">+ <b>直前補正</b> — 部品交換 / チルト / 展示気配メモ で各艇のスコアを ±10〜15% 調整</div>
        </div>
      </section>
    </div>
  );
}

/* 展開予想 + 危険な人気艇 */
function DevelopmentSummary({ evalRes }) {
  if (!evalRes?.development) return null;
  const dev = evalRes.development;
  const dangers = evalRes.dangerousFavorites || [];
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📍 展開予想</h3>
      <div className="alert-info text-sm">
        <b>{dev.scenario}</b> — {dev.comment}
      </div>
      {dangers.length > 0 && (
        <div className="alert-warn text-sm mt-2">
          🚨 危険な人気艇: {dangers.map((d) => `${d.boatNo}号艇 (市場 ${(d.marketProb*100).toFixed(0)}% / AI ${(d.aiProb*100).toFixed(0)}%)`).join(", ")}
        </div>
      )}
    </section>
  );
}

/* オッズ乖離分析 — 市場との差を表で */
function OddsGapTable({ evalRes, race }) {
  const gaps = evalRes?.oddsGaps;
  if (!gaps || gaps.length === 0) return null;
  const move = evalRes?.oddsMovement;
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📊 オッズ乖離分析 (AI 確率 vs 市場確率)</h3>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left opacity-60 border-b border-[#1f2a44]">
              <th className="py-1">艇</th>
              <th>AI 確率</th>
              <th>市場確率</th>
              <th>差</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => (
              <tr key={g.boatNo} className="border-b border-[#1f2a44]/40">
                <td className="py-1 font-bold">{g.boatNo}</td>
                <td className="num">{(g.aiProb*100).toFixed(1)}%</td>
                <td className="num">{(g.marketProb*100).toFixed(1)}%</td>
                <td className={"num " + (g.gap > 0 ? "text-pos" : g.gap < 0 ? "text-neg" : "")}>
                  {g.gap >= 0 ? "+" : ""}{(g.gap*100).toFixed(1)}pt
                </td>
                <td className="text-xs">{g.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {move?.hasHistory && (
        <div className="mt-3 text-xs">
          <div className="font-bold mb-1">直前オッズ変動</div>
          <div className="flex flex-wrap gap-1">
            {move.moves.map((m) => (
              <span key={m.boatNo} className="pill"
                style={{
                  background: m.changePct < 0 ? "rgba(248,113,113,0.18)" : "rgba(52,211,153,0.18)",
                  color: m.changePct < 0 ? "#fecaca" : "#a7f3d0",
                }}>
                {m.boatNo}号艇 {m.prev}→{m.curr} ({m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* 予想に影響した記事 — このレース (会場 / 選手名) に関連するニュース */
function RelatedNews({ evalRes }) {
  const items = evalRes?.relatedNews || [];
  if (items.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 予想に影響した記事</h3>
        <div className="text-xs opacity-70">関連記事なし</div>
      </section>
    );
  }
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📰 予想に影響した記事 ({items.length})</h3>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="border-b border-[#1f2a44] pb-2 last:border-b-0">
            <a href={it.link} target="_blank" rel="noopener noreferrer"
              className="block hover:bg-[#162241] rounded p-1">
              <div className="text-sm font-bold text-cyan-300">{it.title}</div>
              <div className="text-xs opacity-60 mt-1">
                {it.date || "—"} · {it.source}
                {it.keywords?.length > 0 && (
                  <span className="ml-2">
                    {it.keywords.slice(0, 4).map((k) => (
                      <span key={k} className="pill ml-1"
                        style={{ background: "rgba(34,211,238,0.15)", color: "#a5f3fc", fontSize: 10 }}>
                        {k.replace(/^[a-z]+:/, "")}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {it.summary && (
                <div className="text-xs opacity-70 mt-1">{it.summary.slice(0, 100)}{it.summary.length > 100 ? "…" : ""}</div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* 直前情報サマリ — 取得済みなら表示、なければ「未取得」 */
function BeforeInfoSummary({ race }) {
  const info = race?.apiBeforeInfo;
  if (!info) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">📰 直前情報</h3>
        <div className="text-xs opacity-60">未取得 — 「最新にする」を押すと発走 30 分前から取得します</div>
      </section>
    );
  }
  const w = info.weather || {};
  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-2">📰 直前情報 <span className="opacity-60 text-xs ml-2">公式 boatrace.jp</span></h3>
      <div className="text-xs opacity-90 mb-3">
        {w.weather && <span className="mr-3">🌤 {w.weather}</span>}
        {w.wind != null && <span className="mr-3">💨 {w.windDir || "風"} {w.wind}m</span>}
        {w.wave != null && <span className="mr-3">🌊 波 {w.wave}cm</span>}
        {w.temp != null && <span className="mr-3">🌡 気温 {w.temp}℃</span>}
        {w.waterTemp != null && <span className="mr-3">💧 水温 {w.waterTemp}℃</span>}
      </div>
      <div className="overflow-x-auto scrollbar">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left opacity-60 border-b border-[#1f2a44]">
              <th className="py-1">艇</th>
              <th>展示タイム</th>
              <th>チルト</th>
              <th>ST展示</th>
              <th>部品交換</th>
              <th>気配</th>
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
