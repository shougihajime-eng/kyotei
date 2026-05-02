import { useMemo, useState, memo } from "react";
import BuyDecisionCard from "./BuyDecisionCard.jsx";
import QuickJudgeCard from "./QuickJudgeCard.jsx";
import RefreshBar from "./RefreshBar.jsx";
import NewsPanel from "./NewsPanel.jsx";
import EVExplainer from "./EVExplainer.jsx";
import TodaySummary from "./TodaySummary.jsx";
import TopDecisionBar from "./TopDecisionBar.jsx";
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
  switchProfile, strategyRanking, scanStats,
  styleAllocation, styleHeadlines,
  visibleData,
}) {
  const [showDetails, setShowDetails] = useState(false);

  /* Round 51-D: 現在スタイルの headline を styleHeadlines から取得
     ・各スタイルが必ず headline race を持つ (空状態を許さない)
     ・割当バケットの buy 優先 → fit 高い skip → fallback の順 */
  const headline = useMemo(() => {
    const currentStyle = settings.riskProfile;
    const pick = styleHeadlines?.[currentStyle];
    if (pick?.raceId) {
      return races.find((r) => r.id === pick.raceId) || null;
    }
    // フォールバック: 旧ロジック (発走 60-600 分以内で買い優先)
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
  }, [races, recommendations, styleHeadlines, settings.riskProfile]);

  const rec = headline ? recommendations[headline.id] : null;
  const headlineKind = styleHeadlines?.[settings.riskProfile]?.kind || null; // "buy" / "near-skip" / "fallback"

  return (
    <div className="space-y-4 max-w-3xl mx-auto px-4 mt-4 pb-20">
      {/* 更新バー (常時) */}
      <RefreshBar onRefresh={onRefresh} refreshing={refreshing} refreshMsg={refreshMsg} lastRefreshAt={lastRefreshAt} />

      {/* Round 52-54: Top Decision Bar (純粋コンポーネント, visibleData + currentStyle のみ) */}
      <TopDecisionBar
        visibleData={visibleData}
        currentStyle={settings.riskProfile}
        switchProfile={switchProfile}
      />

      {/* Round 51-B: 「買えるレースを探索中」 サマリ */}
      {scanStats && scanStats.total > 0 && (
        <ScanStatsBar stats={scanStats} refreshing={refreshing} />
      )}

      {/* Round 51-D: 3 スタイルへの「三等分割当」 状況 */}
      {styleAllocation && (
        <StyleAllocationBar
          allocation={styleAllocation}
          currentStyle={settings.riskProfile}
          switchProfile={switchProfile}
        />
      )}

      {/* 戦略ランキング (Round 32) — 「今日はどの戦い方が有利か」 */}
      {strategyRanking && (
        <StrategyRankingCard ranking={strategyRanking} currentProfile={settings.riskProfile} switchProfile={switchProfile} />
      )}

      {/* 🚀 クイックジャッジ — 一目判定 (最重要) */}
      <QuickJudgeCard
        headlineRace={headline}
        recommendation={rec}
        today={today}
        profile={settings.riskProfile}
        headlineKind={headlineKind}
        headlineReason={styleHeadlines?.[settings.riskProfile]?.reasonShort || null}
      />

      {/* 今日の収支 (1行ミニバー) */}
      <TodayMiniBar today={today} />

      {/* 主要ボタン (大きく) */}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => onPickRace("verify")}>
          📅 履歴・検証
        </button>
        <button className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => onPickRace("stats")}>
          📈 グラフ
        </button>
      </div>

      {/* ▼ 詳細を見る (折りたたみ) — 一括展開 */}
      <button onClick={() => setShowDetails(v => !v)}
        className="btn btn-ghost w-full" style={{ minHeight: 44, fontSize: 14 }}>
        {showDetails ? "▲ 詳細を隠す" : "▼ 詳細を見る (買い目内訳・予想理由・直近結果・1週間損益・ニュース)"}
      </button>

      {showDetails && (
        <>
          {/* 買い目詳細 */}
          {headline && rec && rec.decision === "buy" && (
            <BuyDecisionCard race={headline} recommendation={rec}
              onRecord={onRecord} virtualMode={settings.virtualMode} />
          )}

          {/* 📅 今日のサマリ (予想/結果/収支/回収率/スタイル別) */}
          <TodaySummary predictions={predictions} onPickRace={onPickRace} />

          {/* 直近結果 */}
          <RecentResult predictions={predictions} />

          {/* 1週間損益 */}
          <WeeklyTotalBadge weekly={weekly} />

          {/* EV 解説 */}
          <EVExplainer ev={rec?.main?.ev || rec?.items?.[0]?.ev || 0} />

          {/* ニュース */}
          <NewsPanel />

          {/* 副次的なタブ */}
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <button className="btn btn-ghost text-xs" onClick={() => onPickRace("list")}>📋 全レース →</button>
            <button className="btn btn-ghost text-xs" onClick={() => onPickRace("analysis")}>🔍 外れ分析 →</button>
          </div>
        </>
      )}
    </div>
  );
}

/** 今日の収支ミニバー (1 行) */
const TodayMiniBar = memo(TodayMiniBarImpl);
function TodayMiniBarImpl({ today }) {
  const air  = today?.air  || { stake: 0, pnl: 0 };
  const real = today?.real || { stake: 0, pnl: 0 };
  const total = (air.pnl || 0) + (real.pnl || 0);
  const totalStake = (air.stake || 0) + (real.stake || 0);
  const roi = totalStake > 0 ? ((air.ret || 0) + (real.ret || 0)) / totalStake : 0;
  return (
    <div className="card p-3 flex items-center justify-between gap-3 flex-wrap" style={{ minHeight: 64 }}>
      <div className="flex items-center gap-2">
        <span className="pill badge-brand">📅 今日</span>
        <div className={"num font-bold " + (total >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 22 }}>
          {totalStake === 0 ? "—" : (total >= 0 ? "+" : "") + yen(total)}
        </div>
      </div>
      <div className="text-xs opacity-80">
        回収率 <b className={roi >= 1 ? "text-pos" : "text-neg"}>{totalStake > 0 ? Math.round(roi * 100) + "%" : "—"}</b>
        <span className="mx-2 opacity-50">|</span>
        投資 {yen(totalStake)}
      </div>
    </div>
  );
}

const RecentResult = memo(RecentResultImpl);
function RecentResultImpl({ predictions }) {
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

const WeeklyTotalBadge = memo(WeeklyTotalBadgeImpl);
function WeeklyTotalBadgeImpl({ weekly }) {
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

/* === Round 51-D: 3 スタイル三等分割当バー (現在スタイル + 各スタイルの件数) === */
const StyleAllocationBar = memo(StyleAllocationBarImpl);
function StyleAllocationBarImpl({ allocation, currentStyle, switchProfile }) {
  const bs = allocation?.buckets || {};
  const total = allocation?.totalCandidates || 0;
  if (total === 0) return null; // 候補ゼロのときは表示しない (ScanStatsBar で説明済)
  const STYLE_INFO = {
    steady:     { label: "🛡️ 本命型",   color: "#3b82f6" },
    balanced:   { label: "⚖️ バランス型", color: "#fbbf24" },
    aggressive: { label: "🎯 穴狙い型",  color: "#ef4444" },
  };
  return (
    <section className="card p-3" style={{ minHeight: 80 }}>
      <div className="text-xs opacity-75 mb-2 font-bold">📋 候補レース三等分 (タップでスタイル切替)</div>
      <div className="grid grid-cols-3 gap-2">
        {["steady", "balanced", "aggressive"].map((s) => {
          const info = STYLE_INFO[s];
          const count = bs[s]?.length || 0;
          const active = currentStyle === s;
          return (
            <button key={s} type="button"
              onClick={() => switchProfile && switchProfile(s)}
              style={{
                textAlign: "center",
                padding: "8px 6px",
                borderRadius: 10,
                border: `2px solid ${active ? info.color : "transparent"}`,
                background: active ? `${info.color}22` : "rgba(0,0,0,0.22)",
                color: active ? info.color : "#e7eef8",
                cursor: "pointer",
                transition: "all 0.12s ease",
                minHeight: 60,
              }}>
              <div className="text-xs font-bold">{info.label}</div>
              <div className="num font-bold mt-1" style={{ fontSize: 22, color: count > 0 ? info.color : "#9fb0c9" }}>
                {count}
              </div>
              <div className="text-xs opacity-70">候補</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* === Round 51-B: スキャン結果サマリ (買えるレース探索中) === */
const ScanStatsBar = memo(ScanStatsBarImpl);
function ScanStatsBarImpl({ stats, refreshing }) {
  const { total, candidates, skip, noOdds, closed, dataChecking } = stats;
  // 状態判定: 候補あり / 探索中 / 候補なし
  let mode, color, headline;
  if (refreshing) {
    mode = "scanning"; color = "#bae6fd"; headline = "🔍 買えるレースを探索中…";
  } else if (candidates > 0) {
    mode = "found"; color = "#a7f3d0"; headline = `🎯 買い候補 ${candidates} 件 / 全 ${total} レース`;
  } else if (total === 0) {
    mode = "empty"; color = "#9fb0c9"; headline = "🤖 「🔄 更新」 を押すとスキャンが始まります";
  } else {
    mode = "no-candidate"; color = "#fde68a"; headline = `📊 候補なし — 全 ${total} レース 厳選見送り`;
  }
  return (
    <section className="card p-3" style={{ minHeight: 70, borderColor: color, borderWidth: 1 }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-bold text-sm" style={{ color }}>{headline}</div>
          {mode !== "empty" && (
            <div className="text-xs opacity-70 mt-1" style={{ lineHeight: 1.5 }}>
              候補 <b style={{ color: "#a7f3d0" }}>{candidates}</b>
              <span className="mx-1 opacity-50">/</span>
              見送り <b>{skip}</b>
              {noOdds > 0 && <> <span className="mx-1 opacity-50">/</span> オッズ待ち <b>{noOdds}</b></>}
              {dataChecking > 0 && <> <span className="mx-1 opacity-50">/</span> 確認中 <b>{dataChecking}</b></>}
              {closed > 0 && <> <span className="mx-1 opacity-50">/</span> 締切 <b>{closed}</b></>}
            </div>
          )}
          {mode === "no-candidate" && (
            <div className="text-xs opacity-60 mt-1" style={{ lineHeight: 1.5 }}>
              💡 厳選見送り — 期待値が出るレースは限られます。 無理に買わない判断もアプリの価値です。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* === 戦略ランキングカード (Round 32) ===
   「今日はどの戦い方が有利か」 を 1 枚で見せる。クリックで該当スタイルに切替 */
const StrategyRankingCard = memo(StrategyRankingCardImpl);
function StrategyRankingCardImpl({ ranking, currentProfile, switchProfile }) {
  const STYLE_COLORS = {
    steady:     { bd: "#3b82f6", bg: "rgba(59,130,246,0.15)",  fg: "#93c5fd" },
    balanced:   { bd: "#fbbf24", bg: "rgba(251,191,36,0.15)",  fg: "#fcd34d" },
    aggressive: { bd: "#ef4444", bg: "rgba(239,68,68,0.15)",   fg: "#fca5a5" },
  };
  if (!ranking?.ranking || ranking.ranking.length === 0) return null;

  return (
    <section className="card p-4" style={{ minHeight: 180 }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="font-bold text-sm">📊 今日の戦略ランキング</h3>
          <div className="text-xs opacity-75 mt-1" style={{ color: "#fde68a", fontWeight: 700 }}>
            {ranking.summary?.text}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {ranking.ranking.map((r, i) => {
          const c = STYLE_COLORS[r.style] || STYLE_COLORS.balanced;
          const active = currentProfile === r.style;
          return (
            <button
              key={r.style}
              type="button"
              onClick={() => switchProfile && switchProfile(r.style)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: `2px solid ${active ? c.bd : "transparent"}`,
                background: active ? c.bg : "rgba(0,0,0,0.22)",
                color: active ? c.fg : "#e7eef8",
                cursor: "pointer",
                transition: "all 0.12s ease",
              }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? "#fde68a" : "#9fb0c9" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </span>
                  <span className="font-bold text-sm">{r.label}</span>
                  {active && <span className="pill badge-brand" style={{ fontSize: 10 }}>選択中</span>}
                </div>
                <span className="num text-xs opacity-75">スコア {r.score}</span>
              </div>
              <div className="text-xs opacity-85 mt-2" style={{ lineHeight: 1.5 }}>
                {(r.reasons || []).join(" / ")}
              </div>
              <div className="text-xs opacity-70 mt-1 num">
                買い候補 {r.summary.buy} 件 · 平均 期待回収率 {Math.round((r.summary.avgEv || 0) * 100)}%
                {r.summary.sCount > 0 && ` · S級 ${r.summary.sCount}`}
                {r.summary.holes > 0 && ` · 穴 ${r.summary.holes}`}
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-xs opacity-70 mt-2 text-center">
        💡 タップして該当スタイルに切替できます
      </div>
    </section>
  );
}
