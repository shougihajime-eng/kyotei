import { useMemo, useState, memo } from "react";
import BuyDecisionCard from "./BuyDecisionCard.jsx";
import QuickJudgeCard from "./QuickJudgeCard.jsx";
import ImminentRaces from "./ImminentRaces.jsx";
import BattleModeCard from "./BattleModeCard.jsx";
import LegacyDataBanner from "./LegacyDataBanner.jsx";
import RefreshBar from "./RefreshBar.jsx";
import NewsPanel from "./NewsPanel.jsx";
import EVExplainer from "./EVExplainer.jsx";
import TodaySummary from "./TodaySummary.jsx";
import TopDecisionBar from "./TopDecisionBar.jsx";
import TopVerdictBanner from "./TopVerdictBanner.jsx";
import KpiPanel from "./KpiPanel.jsx";
import TodayVerificationPanel from "./TodayVerificationPanel.jsx";
import { analyzePatterns, classifyRaceByPattern } from "../lib/patternAnalysis.js";
import DataProgressCard from "./DataProgressCard.jsx";
import CloudSyncCheckPanel from "./CloudSyncCheckPanel.jsx";
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
  refreshing, refreshMsg, lastRefreshAt, onRefresh, onRetry,
  onRecord, settings, onPickRace,
  switchProfile, strategyRanking, scanStats,
  styleAllocation, styleHeadlines, goMode,
  visibleData, evals,
  isSampleMode, storageStatus, publicLogTick,
  authUser, syncStatus,
  onReset,
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
      {/* Round 115: -15 分前以前の旧予想ログ全削除バナー (1 度クリアすれば消える) */}
      {onReset && (
        <LegacyDataBanner predictions={predictions} onReset={onReset} authUser={authUser} />
      )}

      {/* 更新バー (常時) */}
      <RefreshBar onRefresh={onRefresh} refreshing={refreshing} refreshMsg={refreshMsg} lastRefreshAt={lastRefreshAt} />

      {/* Round 118: 「今、 これに賭けろ」 巨大表示モード — 最重要 (買い判定があれば最優先表示) */}
      {/* Round 139: predictions / evals / profile を渡してパターンマッチを表示 */}
      <BattleModeCard
        races={races}
        recommendations={recommendations}
        onPickRace={onPickRace}
        predictions={visibleData?.predictions}
        evals={evals}
        profile={settings.riskProfile}
      />

      {/* Round 88: 最上部「今日の結論」 — どのスタイルが勝っているか 1 枚で */}
      <TopVerdictBanner predictions={visibleData?.predictions} />

      {/* Round 52-58: Top Decision Bar (visibleData 単一ソース — goMode も visibleData 経由) */}
      <TopDecisionBar
        visibleData={visibleData}
        currentStyle={settings.riskProfile}
        switchProfile={switchProfile}
        onRetry={onRetry || onRefresh}
      />

      {/* Round 80: 本日の検証状態パネル (ユーザー向け可視化 — DevTools 不要) */}
      <TodayVerificationPanel
        predictions={visibleData?.predictions}
        isSampleMode={isSampleMode}
        storageStatus={storageStatus}
        publicLogTick={publicLogTick}
      />

      {/* Round 73 Phase 1②: 検証 KPI パネル (ROI / 的中率 / 平均オッズ / 最大連敗 / 連敗確率) */}
      <KpiPanel predictions={visibleData?.predictions} />

      {/* Round 139: データ蓄積進捗 — 「あと何件で機能解禁か」 を進捗バーで見える化 */}
      <DataProgressCard predictions={visibleData?.predictions} />

      {/* Round 136: 得意/苦手パターン自動抽出 — 過去の確定済データから 「あなたが得意なレース条件」 を見える化 */}
      <WinningPatternsCard predictions={visibleData?.predictions} />

      {/* Round 137: 今日のレースから 「自分の得意パターン」 に合致するものを強調 */}
      <PatternMatchedRacesCard
        races={races}
        evals={evals}
        profile={settings.riskProfile}
        predictions={visibleData?.predictions}
        onPickRace={onPickRace}
      />

      {/* Round 87: クラウド同期チェック (折りたたみ式) — DevTools 不要で復元状態確認 */}
      <CloudSyncCheckPanel
        authUser={authUser}
        predictions={visibleData?.predictions}
        syncStatus={syncStatus}
        isSampleMode={isSampleMode}
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

      {/* Round 119: 今日のアプリ判定サマリ (1 行で「全体 / 買い / 見送り」 を即把握) */}
      <TodayJudgmentSummary races={races} recommendations={recommendations} />

      {/* Round 114: 「もうすぐ判定」 専用ミニ一覧 — 1 秒ごとカウントダウン */}
      <ImminentRaces races={races} recommendations={recommendations} onPickRace={onPickRace} />

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

      {/* Round 119: 「アプリ提案累計」 を最大ボタンで強調 (ユーザーが「アプリ信用してよいか」 即判定) */}
      <button onClick={() => onPickRace("stats:ai")} style={{
        width: "100%", minHeight: 56, padding: "12px 18px",
        borderRadius: 14, border: "2px solid #F59E0B",
        background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
        color: "#451A03", fontWeight: 800, fontSize: 14.5,
        letterSpacing: "0.01em", cursor: "pointer",
        boxShadow: "0 1px 0 rgba(255,255,255,0.30) inset, 0 4px 14px rgba(245,158,11,0.40)",
      }}>
        🤖 アプリ提案だけの累計収支グラフ — 信用してよいか判定する
      </button>

      {/* 主要ボタン (大きく) */}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => onPickRace("verify")}>
          📅 履歴・検証
        </button>
        <button className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => onPickRace("stats")}>
          📈 全体グラフ
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
              evalRes={evals?.[headline.id]}
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

/* === Round 119: 今日のアプリ判定サマリ ===
   「いま全レース中、 アプリは何件 buy / 何件 skip / 何件待ち と判断しているか」 を 1 行で。
   ユーザーが 「全然出ない」 と感じる時に、 本当に出ていないのか・データ待ちなのかを区別できる。 */
const TodayJudgmentSummary = memo(TodayJudgmentSummaryImpl);
function TodayJudgmentSummaryImpl({ races, recommendations }) {
  const stats = useMemo(() => {
    if (!races || races.length === 0 || !recommendations) {
      return { total: 0, buy: 0, skip: 0, pending: 0, noOdds: 0, closed: 0 };
    }
    let buy = 0, skip = 0, pending = 0, noOdds = 0, closed = 0;
    for (const r of races) {
      const rec = recommendations[r.id];
      const dec = rec?.decision;
      if (dec === "buy") buy++;
      else if (dec === "skip") skip++;
      else if (dec === "odds-pending") pending++;
      else if (dec === "no-odds") noOdds++;
      else if (dec === "closed") closed++;
    }
    return { total: races.length, buy, skip, pending, noOdds, closed };
  }, [races, recommendations]);
  if (stats.total === 0) return null;
  const buyHighlight = stats.buy > 0;
  return (
    <section className="card p-3" style={{
      minHeight: 64,
      background: buyHighlight
        ? "linear-gradient(180deg, rgba(16, 185, 129, 0.10) 0%, rgba(0, 0, 0, 0.20) 100%), var(--bg-card)"
        : "linear-gradient(180deg, rgba(148, 163, 184, 0.06) 0%, rgba(0, 0, 0, 0.15) 100%), var(--bg-card)",
      border: buyHighlight ? "1px solid rgba(16, 185, 129, 0.32)" : "1px solid rgba(148, 163, 184, 0.18)",
    }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <span style={{
          fontSize: 11, padding: "2px 9px", borderRadius: 999,
          background: "rgba(0, 0, 0, 0.30)", color: "#bae6fd", fontWeight: 800,
          letterSpacing: "0.04em",
        }}>
          📋 今日のアプリ判定
        </span>
        <span className="num" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          全 <b style={{ color: "#e0f2fe" }}>{stats.total}</b> R 中
        </span>
        <span className="num" style={{
          fontSize: 13.5, fontWeight: 800,
          color: buyHighlight ? "#34D399" : "var(--text-tertiary)",
        }}>
          🟢 買い <b style={{ fontSize: 16 }}>{stats.buy}</b>
        </span>
        <span className="num" style={{ fontSize: 12, color: "#fca5a5" }}>
          🔴 見送り {stats.skip}
        </span>
        {stats.pending > 0 && (
          <span className="num" style={{ fontSize: 12, color: "#a78bfa" }}>
            ⏳ 待ち {stats.pending}
          </span>
        )}
        {stats.noOdds > 0 && (
          <span className="num" style={{ fontSize: 12, color: "#fde68a" }}>
            ⚠️ オッズ無 {stats.noOdds}
          </span>
        )}
        {stats.closed > 0 && (
          <span className="num" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            🔒 締切 {stats.closed}
          </span>
        )}
      </div>
      {stats.buy === 0 && stats.pending > 0 && (
        <div className="text-xs mt-1" style={{ color: "#ddd6fe", lineHeight: 1.5 }}>
          💡 まだ買い判定はありませんが、 オッズ確定待ちが {stats.pending} 件あります。 締切 18 分前から判定が動き始めます。
        </div>
      )}
      {stats.buy === 0 && stats.pending === 0 && stats.skip > 0 && (
        <div className="text-xs mt-1" style={{ color: "#fca5a5", lineHeight: 1.5 }}>
          💡 今日は全レース見送り判定です。 厳選見送りはアプリの仕様。 リスク回避日と捉えてください。
        </div>
      )}
    </section>
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

/* === Round 136: 得意/苦手パターン自動抽出カード === */
function WinningPatternsCard({ predictions }) {
  const result = useMemo(() => analyzePatterns(predictions), [predictions]);

  if (!result.hasEnough) {
    return (
      <section className="card p-4">
        <h3 className="font-bold text-sm mb-2">🧠 あなたの得意パターン (自動分析)</h3>
        <div className="text-xs opacity-70" style={{ lineHeight: 1.6 }}>
          📊 蓄積中 — 確定済 {result.sampleSize} 戦 / あと <b>{result.remaining || 0}</b> 戦で分析開始<br />
          確定したレースが 10 戦溜まると、 <b>「会場 × イン濃厚度 × 風 × スタイル」</b> の組み合わせで
          得意/苦手パターンを自動抽出します。
        </div>
      </section>
    );
  }

  const hasBest = result.bestPatterns.length > 0;
  const hasWorst = result.worstPatterns.length > 0;

  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-3">🧠 あなたの得意/苦手パターン (確定 {result.sampleSize} 戦から自動分析)</h3>

      {hasBest && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--c-success-text)", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>
            🏆 得意パターン (ROI 100% 超)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {result.bestPatterns.map((p, i) => (
              <div key={i} style={{
                padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--c-success-border)",
                background: "var(--c-success-bg)",
                fontSize: 11.5, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                  {p.pattern}
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  ROI <b className="text-pos">{Math.round(p.roi * 100)}%</b> /
                  的中率 {Math.round(p.hitRate * 100)}% /
                  {p.count}戦 / 損益 <b className={p.pnl >= 0 ? "text-pos" : "text-neg"}>{p.pnl >= 0 ? "+" : ""}¥{p.pnl.toLocaleString()}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasWorst && (
        <div>
          <div style={{ fontSize: 11, color: "var(--c-danger-text)", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>
            ⚠️ 苦手パターン (ROI 85% 未満 — 避けるべき)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {result.worstPatterns.map((p, i) => (
              <div key={i} style={{
                padding: "8px 10px", borderRadius: 8,
                border: "1px solid var(--c-danger-border)",
                background: "var(--c-danger-bg)",
                fontSize: 11.5, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                  {p.pattern}
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  ROI <b className="text-neg">{Math.round(p.roi * 100)}%</b> /
                  的中率 {Math.round(p.hitRate * 100)}% /
                  {p.count}戦 / 損益 <b className="text-neg">¥{p.pnl.toLocaleString()}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasBest && !hasWorst && (
        <div className="text-xs opacity-70" style={{ lineHeight: 1.6 }}>
          現時点で 「ROI 100% 超」 の得意パターンも 「ROI 85% 未満」 の苦手パターンも
          検出されていません。 全体的に中庸な状態です。 試行回数を増やすと特化が見えてきます。
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.5 }}>
        💡 「会場類型 × 1号艇1着確率 × 風 × スタイル」 で 3 戦以上のクロス集計を ROI 順に表示。
      </div>
    </section>
  );
}

/* === Round 138: 得意パターンに合致する今日のレースを強調 === */
function PatternMatchedRacesCard({ races, evals, profile, predictions, onPickRace }) {
  const result = useMemo(() => analyzePatterns(predictions), [predictions]);

  const matched = useMemo(() => {
    if (!result.hasEnough || !races || races.length === 0) return { best: [], worst: [] };
    const best = [], worst = [];
    const now = Date.now();
    for (const r of races) {
      const e = startEpoch(r.date, r.startTime);
      if (e == null || e < now) continue; // 未来のレースのみ
      const ev = evals?.[r.id];
      const cls = classifyRaceByPattern(r, ev, profile, result);
      if (!cls) continue;
      if (cls.kind === "best") best.push({ race: r, cls });
      else if (cls.kind === "worst") worst.push({ race: r, cls });
    }
    // 発走時刻順
    best.sort((a, b) => (startEpoch(a.race.date, a.race.startTime) || 0) - (startEpoch(b.race.date, b.race.startTime) || 0));
    worst.sort((a, b) => (startEpoch(a.race.date, a.race.startTime) || 0) - (startEpoch(b.race.date, b.race.startTime) || 0));
    return { best: best.slice(0, 6), worst: worst.slice(0, 6) };
  }, [result, races, evals, profile]);

  if (!result.hasEnough) return null;
  if (matched.best.length === 0 && matched.worst.length === 0) return null;

  return (
    <section className="card p-4">
      <h3 className="font-bold text-sm mb-3">💎 今日のレース × あなたのパターン</h3>

      {matched.best.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--c-success-text)", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>
            🏆 得意パターン該当 ({matched.best.length} レース)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {matched.best.map(({ race, cls }) => (
              <button key={race.id} onClick={() => onPickRace?.(race.id)} className="btn btn-ghost"
                style={{
                  padding: "8px 12px", minHeight: 40, fontSize: 12,
                  borderRadius: 10,
                  border: "1.5px solid var(--c-success-border)",
                  background: "var(--c-success-bg)",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}>
                <span style={{ fontWeight: 700 }}>{race.venue} {race.raceNo}R · {race.startTime}</span>
                <span style={{ fontSize: 10, color: "var(--c-success-text)", marginTop: 2 }} className="num">
                  ROI {Math.round(cls.roi * 100)}% / 過去 {cls.count}戦
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {matched.worst.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--c-danger-text)", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>
            ⚠️ 苦手パターン該当 ({matched.worst.length} レース) — 慎重に
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {matched.worst.map(({ race, cls }) => (
              <button key={race.id} onClick={() => onPickRace?.(race.id)} className="btn btn-ghost"
                style={{
                  padding: "8px 12px", minHeight: 40, fontSize: 12,
                  borderRadius: 10,
                  border: "1.5px solid var(--c-danger-border)",
                  background: "var(--c-danger-bg)",
                  color: "var(--text-primary)",
                  textAlign: "left",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}>
                <span style={{ fontWeight: 700 }}>{race.venue} {race.raceNo}R · {race.startTime}</span>
                <span style={{ fontSize: 10, color: "var(--c-danger-text)", marginTop: 2 }} className="num">
                  ROI {Math.round(cls.roi * 100)}% / 過去 {cls.count}戦
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.5 }}>
        💡 過去の確定データに基づいて 「自分が勝てる/負けるパターン」 に該当するレースを自動判定。
      </div>
    </section>
  );
}

