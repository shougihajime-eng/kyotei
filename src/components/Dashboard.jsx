import { useMemo, useState } from "react";
import BuyDecisionCard from "./BuyDecisionCard.jsx";
import QuickJudgeCard from "./QuickJudgeCard.jsx";
import RefreshBar from "./RefreshBar.jsx";
import NewsPanel from "./NewsPanel.jsx";
import EVExplainer from "./EVExplainer.jsx";
import { yen } from "../lib/format.js";

/**
 * ホーム画面 — 初心者でも一目で判断できるシンプル構成。
 *
 *   上から:
 *     1. 🚀 クイックジャッジ (本命/穴/見送り判定 + EV + エア・リアル成績)
 *     2. 詳細結論カード (折りたたみ可能)
 *     3. 直近の結果
 *     4. 1週間損益
 *     5. EV 解説
 *     6. ニュース
 *     7. タブ移動ボタン
 */
export default function Dashboard({
  races, predictions, recommendations, today, weekly,
  refreshing, refreshMsg, lastRefreshAt, onRefresh,
  onRecord, settings, onPickRace,
}) {
  const [showDetails, setShowDetails] = useState(false);

  const headline = useMemo(() => {
    if (!races || races.length === 0) return null;
    const now = Date.now();
    const annotated = races.map(r => {
      const startMs = startEpoch(r.date, r.startTime);
      return { race: r, startMs, untilStart: startMs ? (startMs - now) / 60000 : null };
    });
    const upcoming = annotated.filter(x => x.untilStart != null && x.untilStart > 1 && x.untilStart < 600);
    if (upcoming.length === 0) return null;
    const sorted = [...upcoming].sort((a, b) => {
      const ra = recommendations[a.race.id]?.decision === "buy" ? 0 : 1;
      const rb = recommendations[b.race.id]?.decision === "buy" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.untilStart - b.untilStart;
    });
    return sorted[0]?.race || null;
  }, [races, recommendations]);

  const rec = headline ? recommendations[headline.id] : null;

  return (
    <div className="space-y-4 max-w-3xl mx-auto px-4 mt-4">
      {/* 更新バー */}
      <RefreshBar onRefresh={onRefresh} refreshing={refreshing} refreshMsg={refreshMsg} lastRefreshAt={lastRefreshAt} />

      {/* 🚀 クイックジャッジ — 一目判定 */}
      <QuickJudgeCard headlineRace={headline} recommendation={rec} today={today} />

      {/* 詳細を見る (折りたたみ) */}
      {headline && rec && rec.decision === "buy" && (
        <button onClick={() => setShowDetails(v => !v)}
          className="btn btn-ghost text-xs w-full" style={{ padding: "8px 0" }}>
          {showDetails ? "▲ 詳細を隠す" : "▼ 詳細を見る (買い目内訳・記録ボタン)"}
        </button>
      )}

      {showDetails && (
        <BuyDecisionCard race={headline} recommendation={rec}
          onRecord={onRecord} virtualMode={settings.virtualMode} />
      )}

      {/* 直近結果 */}
      <RecentResult predictions={predictions} />

      {/* 1週間損益 */}
      <WeeklyTotalBadge weekly={weekly} />

      {/* EV 解説 */}
      <EVExplainer ev={rec?.main?.ev || rec?.items?.[0]?.ev || 0} />

      {/* ニュース */}
      <NewsPanel />

      {/* タブ移動ボタン */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button className="btn btn-ghost text-xs" onClick={() => onPickRace("list")}>📋 全レース →</button>
        <button className="btn btn-ghost text-xs" onClick={() => onPickRace("verify")}>📅 検証 →</button>
        <button className="btn btn-primary text-xs" onClick={() => onPickRace("stats")}>📈 グラフを見る</button>
        <button className="btn btn-ghost text-xs" onClick={() => onPickRace("analysis")}>🔍 外れ分析 →</button>
      </div>
    </div>
  );
}

function RecentResult({ predictions }) {
  const recent = useMemo(() => {
    const arr = Object.values(predictions || {});
    const settled = arr.filter(p => p.result?.first);
    if (settled.length === 0) return null;
    return settled.sort((a, b) => (b.result.fetchedAt || "").localeCompare(a.result.fetchedAt || ""))[0];
  }, [predictions]);

  if (!recent) return null;
  const r = recent.result;
  const correct = `${r.first}-${r.second}-${r.third}`;
  const pnl = recent.pnl ?? 0;
  const isHit = recent.hit;

  return (
    <div className="card p-4" style={{ borderWidth: 2, borderColor: "#475569", minHeight: 140 }}>
      <div className="text-xs opacity-70 mb-2">直近の結果 — {recent.venue} {recent.raceNo}R</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs opacity-70">AIの判断</div>
          {recent.decision === "buy" ? (
            <>
              <div className="font-mono mt-1" style={{ fontSize: 16, fontWeight: 700 }}>
                {(recent.combos || []).map(c => c.combo).join(" / ")}
              </div>
              <div className="text-xs opacity-70 num">{yen(recent.totalStake)}</div>
              <div className={"mt-1 font-bold " + (isHit ? "text-pos" : "text-neg")}
                style={{ fontSize: 16 }}>
                {isHit ? "🎯 的中" : "❌ 外れ"}
              </div>
              <div className={"num " + (pnl >= 0 ? "text-pos" : "text-neg")}
                style={{ fontSize: 18, fontWeight: 800 }}>
                {pnl >= 0 ? "+" : ""}{yen(pnl)}
              </div>
            </>
          ) : (
            <div className="opacity-90 mt-1 font-bold">見送り</div>
          )}
        </div>
        <div>
          <div className="text-xs opacity-70">正解</div>
          <div className="font-mono mt-1" style={{ fontSize: 22, fontWeight: 800, color: "#fde68a" }}>
            {correct}
          </div>
          {r.payouts?.trifecta?.[correct] && (
            <div className="text-xs opacity-70 num mt-1">3連単 {yen(r.payouts.trifecta[correct])}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeeklyTotalBadge({ weekly }) {
  if (!weekly || weekly.count === 0) {
    return (
      <div className="card p-3 text-center text-xs opacity-70" style={{ minHeight: 60 }}>
        💡 「更新」 を押すと AI 予想が記録されます。1 週間続けるとここに損益が出ます。
      </div>
    );
  }
  const pnlColor = weekly.pnl >= 0 ? "text-pos" : "text-neg";
  return (
    <div className="card p-4" style={{ borderWidth: 2, borderColor: weekly.pnl >= 0 ? "#10b981" : "#ef4444", minHeight: 80 }}>
      <div className="text-xs opacity-70 uppercase tracking-widest mb-1">AI通りに 1 週間買っていたら</div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className={"num " + pnlColor} style={{ fontSize: 32, fontWeight: 900 }}>
          {weekly.pnl >= 0 ? "+" : ""}{yen(weekly.pnl)}
        </div>
        <div className="text-sm opacity-80">
          回収率 <b className={pnlColor}>{weekly.stake > 0 ? (weekly.roi * 100).toFixed(0) + "%" : "—"}</b>
          <span className="mx-1 opacity-50">/</span>
          {weekly.settled}/{weekly.count} 確定 (的中 {weekly.hits})
        </div>
      </div>
    </div>
  );
}

function startEpoch(dateStr, startTime) {
  if (!dateStr || !startTime) return null;
  try {
    const d = new Date(`${dateStr}T${startTime}:00+09:00`);
    return isNaN(d.getTime()) ? null : d.getTime();
  } catch { return null; }
}
