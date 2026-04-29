import { useMemo } from "react";
import BuyDecisionCard from "./BuyDecisionCard.jsx";
import RefreshBar from "./RefreshBar.jsx";
import NewsPanel from "./NewsPanel.jsx";
import { yen } from "../lib/format.js";

/**
 * ホーム画面 — 結論カード + 直近結果 + 1週間損益。これだけ。
 */
export default function Dashboard({
  races, predictions, recommendations, today, weekly,
  refreshing, refreshMsg, lastRefreshAt, onRefresh,
  onRecord, settings, onPickRace,
}) {
  // 直近の S/A 評価レース (発走前 60 分以内 OR 発走 5 分以内に終わったもの)
  const headline = useMemo(() => {
    if (!races || races.length === 0) return null;
    const now = Date.now();
    const annotated = races.map(r => {
      const startMs = startEpoch(r.date, r.startTime);
      return { race: r, startMs, untilStart: startMs ? (startMs - now) / 60000 : null };
    });
    // 締切前 (発走 1 分前まで) のレース
    const upcoming = annotated.filter(x => x.untilStart != null && x.untilStart > 1 && x.untilStart < 600);
    if (upcoming.length === 0) return null;
    // 該当レースの中で「買う」推奨が出ているもの優先、なければ直近のもの
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

      {/* 結論カード */}
      <BuyDecisionCard race={headline} recommendation={rec}
        onRecord={onRecord} virtualMode={settings.virtualMode} />

      {/* 直近の確定結果 */}
      <RecentResult predictions={predictions} />

      {/* 1週間損益 */}
      <WeeklyTotalBadge weekly={weekly} />

      {/* 公式ニュース */}
      <NewsPanel />

      {/* レース一覧へのリンク (薄いボタン) */}
      <div className="text-center">
        <button className="btn btn-ghost text-xs" onClick={() => onPickRace("list")}>
          📋 全レースの判定を見る →
        </button>
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
    <div className="card p-4" style={{ borderWidth: 2, borderColor: "#475569" }}>
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
      <div className="card p-3 text-center text-xs opacity-70">
        💡 「最新にする」を押すと AI 予想が記録されます。1 週間続けるとここに損益が出ます。
      </div>
    );
  }
  const pnlColor = weekly.pnl >= 0 ? "text-pos" : "text-neg";
  return (
    <div className="card p-4" style={{ borderWidth: 2, borderColor: weekly.pnl >= 0 ? "#10b981" : "#ef4444" }}>
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

/* helper - ここにだけインライン (App から渡すと冗長) */
function startEpoch(dateStr, startTime) {
  if (!dateStr || !startTime) return null;
  try {
    const d = new Date(`${dateStr}T${startTime}:00+09:00`);
    return isNaN(d.getTime()) ? null : d.getTime();
  } catch { return null; }
}
