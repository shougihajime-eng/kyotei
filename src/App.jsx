import { useEffect, useMemo, useState, useCallback, useRef, startTransition, lazy, Suspense } from "react";
import Header from "./components/Header.jsx";
import Dashboard from "./components/Dashboard.jsx";
import RaceList from "./components/RaceList.jsx";
import Onboarding from "./components/Onboarding.jsx";
import ComplianceFooter from "./components/ComplianceFooter.jsx";

/* Round 74: 重いタブは遅延読込 (初回ロード短縮 — 1MB → 各 200-400KB に分割) */
const RaceDetail = lazy(() => import("./components/RaceDetail.jsx"));
const Verify = lazy(() => import("./components/Verify.jsx"));
const Stats = lazy(() => import("./components/Stats.jsx"));
const LossAnalysis = lazy(() => import("./components/LossAnalysis.jsx"));
const Settings = lazy(() => import("./components/Settings.jsx"));

function LazyFallback() {
  return (
    <div className="max-w-3xl mx-auto px-4 mt-6 text-center" role="status" aria-live="polite">
      <div className="card p-4">
        <div className="text-sm font-bold mb-2">⏳ 読込中…</div>
        <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    </div>
  );
}

import { loadState, saveState, saveAndVerify, verifyVisible, clearState, clearAllAppData, setStorageStatusListener, gcOldPredictions, getStorageStats, estimateStorageSize, filterByVersion, purgeLegacy, getVisibleData, getVersionInfo, CURRENT_VERSION } from "./lib/storage.js";
import { cloudEnabled } from "./lib/supabaseClient.js";
import { getCurrentUser, onAuthChange, signOut as authSignOut } from "./lib/auth.js";
import { fullSync, lightSync, deleteCloudData } from "./lib/cloudSync.js";
import { setRateLimitListener, clearApiCaches } from "./lib/api.js";
import LoginModal from "./components/LoginModal.jsx";
import { fetchTodaySchedule, fetchRaceProgram, fetchRaceOdds, fetchRaceResult, fetchBeforeInfo } from "./lib/api.js";
import { evaluateRace, buildBuyRecommendation, computeOverallGrade } from "./lib/predict.js";
import { suggestStyle } from "./components/StyleSelector.jsx";
import { computeStrategyRanking } from "./lib/strategyRanking.js";
import { allocateRacesToStyles, pickHeadlineForEachStyle, explainEmptyBucket, computeGoMode } from "./lib/styleAllocation.js";
import { computeGoModeStats, computeSkipImpact, computeDaySummary, computeStreakStats } from "./lib/dayInsights.js";
import { computeRollingStats, computeAdjustmentSuggestions, computePatternStrength, computeAccuracyHealth } from "./lib/operationalLog.js";
import { computeRecentPurchaseAnalysis, computeDeepReview, computeLabelDistribution, applyLabelOverride } from "./lib/raceLabeler.js";
import { CURRENT_VERIFICATION_VERSION, computeKpiSummary, evaluateWinnability } from "./lib/verificationLog.js";
import { isPreCloseTarget } from "./lib/styleAllocation.js";
import { syncPublicLog } from "./lib/immutableLog.js";
import { buildReasoningSummary } from "./lib/reasoningSummary.js";

const PublicLogPage = lazy(() => import("./components/PublicLogPage.jsx"));
import { getJstDateString, getEffectiveRaceDate, validateDateConsistency, detectDateChange } from "./lib/dateGuard.js";
import { getLearnedWeights } from "./lib/learning.js";
import { defaultSettings, summarizeToday, perRaceCap } from "./lib/money.js";
import { todayDate, todayKey, startEpoch } from "./lib/format.js";
import { generateSampleRaces, buildRacesFromSchedule, mergeProgram, mergeOdds, mergeBeforeInfo } from "./lib/sample.js";

const REFRESH_COOLDOWN_MS = 60 * 1000;

export default function App() {
  /* === Round 75: 公開検証ログページ — URL に ?log=public があれば専用ページを表示 === */
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    if (url.searchParams.get("log") === "public") {
      return (
        <Suspense fallback={<LazyFallback />}>
          <PublicLogPage />
        </Suspense>
      );
    }
  }

  /* === Persistent state === */
  const initial = loadState() || {};
  const [settings, setSettings] = useState({ ...defaultSettings(), ...(initial.settings || {}) });
  // Round 43: 起動時に 90 日以上前の AI スナップショットを GC (手動記録は永続)
  const initialPredictions = useMemo(() => {
    const raw = initial.predictions || {};
    const { next, removed } = gcOldPredictions(raw);
    if (removed > 0) console.log(`[gc] ${removed} 件の古い予測 (90 日超) を整理しました`);
    return next;
  }, []); // 起動時 1 回のみ
  const [predictions, setPredictions] = useState(initialPredictions);

  /* Round 52-58: 単一エントリ visibleData (predictions + UI flags + goMode) — 全 consumer がこれだけを使う
     goMode は races / evals / allStyleRecommendations が必要なので、 visibleData ベースに合成する */
  const showLegacy = !!settings.showLegacy;
  const visibleDataBase = useMemo(
    () => getVisibleData(predictions, { showLegacy, currentStyle: settings.riskProfile }),
    [predictions, showLegacy, settings.riskProfile]
  );
  const visiblePredictions = visibleDataBase.predictions;
  const versionInfo = visibleDataBase.versionInfo;

  /* === Round 43: 保存ステータス (UI バナー用) === */
  const [storageStatus, setStorageStatus] = useState({ ok: true, lastSavedAt: null, error: null });
  useEffect(() => {
    setStorageStatusListener(setStorageStatus);
    return () => setStorageStatusListener(null);
  }, []);

  /* === Round 91: レート制限イベント (UI 通知用) === */
  const [rateLimitEvent, setRateLimitEvent] = useState(null);
  useEffect(() => {
    setRateLimitListener((ev) => {
      setRateLimitEvent(ev);
      // 5 秒で消える (連続発火時は更新)
      setTimeout(() => {
        setRateLimitEvent((cur) => (cur && cur.ts === ev.ts ? null : cur));
      }, Math.max(5000, (ev.retryAfterMs || 0) + 2000));
    });
    return () => setRateLimitListener(null);
  }, []);

  /* === Round 45: Auth state (handler は showToast 定義後に作る — TDZ 回避) === */
  const [authUser, setAuthUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: "idle", lastAt: null, error: null, stats: null });

  // セッション復元 + 監視
  useEffect(() => {
    if (!cloudEnabled()) return;
    getCurrentUser().then((u) => { if (u) setAuthUser(u); });
    const unsub = onAuthChange((u) => setAuthUser(u));
    return () => { try { unsub && unsub(); } catch {} };
  }, []);

  /* === Volatile state === */
  const [tab, setTab] = useState("home");
  const [races, setRaces] = useState([]);
  const [selectedRaceId, setSelectedRaceId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  // Round 74: 仮データ動作中フラグ (実 API 失敗 → サンプル fallback の可視化)
  const [isSampleMode, setIsSampleMode] = useState(false);
  /* スタイル切替の即時フィードバック (トースト) — Auth handler より前に定義 */
  const [toast, setToast] = useState(null);
  const lastToastMsgRef = useRef({ msg: null, ts: 0 });
  const showToast = useCallback((msg, kind = "info") => {
    // デデュープ: 同じメッセージが 800ms 以内なら抑止
    const now = Date.now();
    if (lastToastMsgRef.current.msg === msg && now - lastToastMsgRef.current.ts < 800) return;
    lastToastMsgRef.current = { msg, ts: now };
    const id = now;
    setToast({ msg, kind, id });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2500);
  }, []);

  /* Round 52-53: グローバル notify API (window.__kyoteiToast) — Settings から呼べる */
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__kyoteiToast = showToast;
      window.__kyoteiNotify = (type, message) => showToast(message, type === "success" ? "ok" : type === "error" ? "neg" : "info");
    }
    return () => {
      if (typeof window !== "undefined") {
        try { delete window.__kyoteiToast; delete window.__kyoteiNotify; } catch {}
      }
    };
  }, [showToast]);

  /* === Round 49 TDZ 修正: Auth handler は showToast の後に作る === */
  const handleLogin = useCallback((user) => {
    setAuthUser(user);
    showToast(`👋 ${user.username} でログイン — クラウド同期を開始`, "ok");
  }, [showToast]);

  const handleLogout = useCallback(async () => {
    await authSignOut();
    setAuthUser(null);
    setSyncStatus({ state: "idle", lastAt: null, error: null, stats: null });
    showToast("ログアウトしました — ローカル保存は継続", "info");
  }, [showToast]);

  // ログイン直後の full sync (一度だけ) + 5 分ごと定期 fullSync
  const syncedForUserRef = useRef(null);
  useEffect(() => {
    if (!authUser) { syncedForUserRef.current = null; return; }
    let cancelled = false;
    async function runFullSync(reason) {
      if (cancelled) return;
      setSyncStatus((s) => ({ ...s, state: "syncing" }));
      const res = await fullSync(authUser.id, predictions);
      if (cancelled) return;
      // ok でも partialOk (push 失敗) でも merged は採用 (cloud 新着分は取り込む)
      if (res.merged) setPredictions(res.merged);
      if (res.ok) {
        setSyncStatus({ state: "synced", lastAt: Date.now(), error: null, stats: res.stats });
      } else if (res.partialOk) {
        setSyncStatus({ state: "error", lastAt: Date.now(), error: `${res.error} (cloud 取り込み済)`, stats: res.stats });
      } else {
        setSyncStatus({ state: "error", lastAt: Date.now(), error: res.error, stats: null });
      }
    }
    if (syncedForUserRef.current !== authUser.id) {
      syncedForUserRef.current = authUser.id;
      runFullSync("login");
    }
    // 5 分ごとに定期 fullSync (他端末記録を取り込む)
    const id = setInterval(() => runFullSync("interval"), 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Round 95: 予測変化時の light sync (5s → 1s に短縮 — Supabase 主管理化)
  const lightSyncTimerRef = useRef(null);
  useEffect(() => {
    if (!authUser) return;
    if (lightSyncTimerRef.current) clearTimeout(lightSyncTimerRef.current);
    lightSyncTimerRef.current = setTimeout(() => {
      setSyncStatus((s) => ({ ...s, state: "syncing" }));
      lightSync(authUser.id, predictions).then((res) => {
        if (res.ok) {
          setSyncStatus({ state: "synced", lastAt: Date.now(), error: null, stats: { pushed: res.pushed } });
        } else {
          setSyncStatus({ state: "error", lastAt: Date.now(), error: res.error, stats: null });
        }
      });
    }, 1000);   // Round 95: 5000 → 1000ms (即時同期に近づける)
    return () => clearTimeout(lightSyncTimerRef.current);
  }, [predictions, authUser]);
  /* スタイル切替の差分通知用 ref。switchProfile / useEffect は recommendations 定義後に作る (TDZ 回避) */
  const lastSwitchInfo = useRef(null);
  /* recommendations の最新値を ref に保持 (switchProfile が hoisted で参照できるようにする) */
  const recsRef = useRef({});
  /* news: マウント時に 1 回だけ取得 (キャッシュ s-maxage=600s なので軽量) */
  const [news, setNews] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/news").then(r => r.ok ? r.json() : null).then(j => {
      if (cancelled || !j?.items) return;
      setNews(j.items);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [settings.onboardingDone]);

  /* === Persist on change ===
     Round 66: saveAndVerify で書き込み後に必ず読み戻し検証。
     全 predictions key が読み戻せることを毎回チェック (1 件でも欠落なら storageStatus に notify)。 */
  useEffect(() => {
    const expectedKeys = Object.keys(predictions || {});
    const res = saveAndVerify({ settings, predictions }, expectedKeys);
    if (!res.ok) {
      console.error(`[persist] 保存検証失敗 — missing=${res.missingKeys.length}件 / error=${res.error}`);
    }
  }, [settings, predictions]);

  /* === Round 75: 公開検証ログ自動 sync (finalized レースを append-only ログに追記) ===
     Round 81: sync 後に publicLogTick を進めて、 TodayVerificationPanel 等
     localStorage 直読みコンポーネントを 再描画させる (race condition 解消) */
  const [publicLogTick, setPublicLogTick] = useState(0);
  useEffect(() => {
    const r = syncPublicLog(predictions);
    if (r.added > 0) {
      console.log(`[publicLog] ${r.added} 件追記 (累計 ${r.total})`);
      setPublicLogTick((t) => t + 1);  // パネル強制再描画
    }
  }, [predictions]);

  /* === Compute evals + recommendations for all races === */
  const today = useMemo(() => summarizeToday(visiblePredictions), [visiblePredictions]);
  const cap = useMemo(() => perRaceCap(settings, today), [settings, today]);

  /* 過去成績から学習した重み補正 (-0.05〜+0.05) を計算 */
  // Round 52: 学習も v2 のみ参照 (legacy データに引きずられない)
  const learnedWeights = useMemo(() => getLearnedWeights(visiblePredictions), [visiblePredictions]);

  const evals = useMemo(() => {
    const map = {};
    for (const r of races) map[r.id] = evaluateRace(r, news, learnedWeights.adjustments);
    return map;
  }, [races, news, learnedWeights]);

  /* === Round 30: 3 スタイル同時計算 (事前計算 + キャッシュ) ===
     ・races / evals / cap が変わったとき 1 回だけ全 3 スタイル分を計算
     ・スタイル切替は計算済みキャッシュから O(1) で取り出すだけ → 即時反応
     ・予想スナップショット保存にも 3 スタイル分が利用可能になる */
  const allStyleRecommendations = useMemo(() => {
    const out = { steady: {}, balanced: {}, aggressive: {} };
    for (const r of races) {
      const ev = evals[r.id];
      if (!ev) continue;
      for (const style of ["steady", "balanced", "aggressive"]) {
        const rec = buildBuyRecommendation(ev, style, cap, false);
        rec.overall = computeOverallGrade(ev, rec, ev?.windWave);
        rec.warnings = ev?.warnings || [];
        rec.venueProfile = ev?.venueProfile || null;
        rec.timeSlot = ev?.timeSlot || null;
        rec.accident = ev?.accident || null;
        // Round 51-F: no-odds でも構造スコアを伝えて UI で意味分け
        rec.structuralAssessment = ev?.structuralAssessment || null;
        out[style][r.id] = rec;
      }
    }
    return out;
  }, [races, evals, cap]);

  /* 現在スタイルの recommendations は事前計算からピックするだけ */
  const recommendations = useMemo(() => {
    return allStyleRecommendations[settings.riskProfile] || {};
  }, [allStyleRecommendations, settings.riskProfile]);

  /* Round 32: 戦略ランキング (allStyleRecommendations から導出) */
  const strategyRanking = useMemo(
    () => computeStrategyRanking(allStyleRecommendations),
    [allStyleRecommendations]
  );

  /* Round 51-D: 全レースを 3 スタイルに「三等分割当」 (各モードに必ず headline)
     ・buyability + style fit を計算
     ・候補を steady / balanced / aggressive に分配
     ・各スタイルが必ず 1 つ「ヘッドラインレース」 を持つ → 「押した瞬間に必ず表示」 */
  const styleAllocation = useMemo(
    () => allocateRacesToStyles(races, evals),
    [races, evals]
  );
  const styleHeadlines = useMemo(
    () => pickHeadlineForEachStyle(races, evals, allStyleRecommendations, styleAllocation),
    [races, evals, allStyleRecommendations, styleAllocation]
  );

  /* Round 60-61: 運用ロジック + 購入レース分析 */
  const rollingShort = useMemo(() => computeRollingStats(visiblePredictions, 10), [visiblePredictions]);
  const rollingLong = useMemo(() => computeRollingStats(visiblePredictions, 50), [visiblePredictions]);
  const purchaseAnalysis = useMemo(() => computeRecentPurchaseAnalysis(visiblePredictions, 10), [visiblePredictions]);
  const deepReview = useMemo(() => computeDeepReview(visiblePredictions, 10), [visiblePredictions]);
  const labelDistribution = useMemo(() => computeLabelDistribution(visiblePredictions, 10, 30), [visiblePredictions]);
  const accuracyHealth = useMemo(
    () => computeAccuracyHealth(rollingShort, rollingLong),
    [rollingShort, rollingLong]
  );
  const adjustmentSuggestions = useMemo(
    () => computeAdjustmentSuggestions(rollingShort, rollingLong, settings),
    [rollingShort, rollingLong, settings]
  );
  const patternStrength = useMemo(
    () => computePatternStrength(visiblePredictions),
    [visiblePredictions]
  );

  /* Round 60: 直近成績悪化 (degrading/critical) なら Go モード閾値を引き上げ */
  const isDegraded = accuracyHealth?.level === "degrading" || accuracyHealth?.level === "critical";

  /* Round 67-71: 実戦モード (Go) — 件数制限ではなく「厳しい条件を満たしたレースのみ」 を抽出
     ・topN は 12 (上限ガード) — 結果としては条件未達で 0 件〜数件で落ち着く
     ・直前判定型 (preCloseOnly=true) で 締切 5〜15 分前のみ対象 */
  const goMode = useMemo(
    () => computeGoMode(races, evals, allStyleRecommendations, settings.riskProfile, 12, { degraded: isDegraded, preCloseOnly: true }),
    [races, evals, allStyleRecommendations, settings.riskProfile, isDegraded]
  );

  /* Round 59: 日次インサイト */
  const goModeStats = useMemo(() => computeGoModeStats(visiblePredictions, 10), [visiblePredictions]);
  const skipImpact = useMemo(() => computeSkipImpact(visiblePredictions), [visiblePredictions]);
  const daySummary = useMemo(() => computeDaySummary(goMode, races, evals), [goMode, races, evals]);
  const streakStats = useMemo(() => computeStreakStats(visiblePredictions), [visiblePredictions]);

  /* Round 59: 日付管理 (JST 厳格) */
  const currentJst = useMemo(() => getJstDateString(), []);
  const effectiveRaceDate = useMemo(() => getEffectiveRaceDate(), []);
  const dateConsistency = useMemo(
    () => validateDateConsistency(visiblePredictions, effectiveRaceDate),
    [visiblePredictions, effectiveRaceDate]
  );

  /* visibleData に Round 59-60 のすべてを merge (TopDecisionBar 単一ソース) */
  const visibleData = useMemo(
    () => ({
      ...visibleDataBase,
      goMode,
      goModeStats,
      skipImpact,
      daySummary,
      streakStats,
      currentJst,
      effectiveRaceDate,
      dateConsistency,
      // Round 60
      rollingShort,
      rollingLong,
      accuracyHealth,
      adjustmentSuggestions,
      patternStrength,
      isDegraded,
      // Round 61-63
      purchaseAnalysis,
      deepReview,
      labelDistribution,
    }),
    [visibleDataBase, goMode, goModeStats, skipImpact, daySummary, streakStats,
     currentJst, effectiveRaceDate, dateConsistency,
     rollingShort, rollingLong, accuracyHealth, adjustmentSuggestions, patternStrength, isDegraded,
     purchaseAnalysis, deepReview, labelDistribution]
  );

  /* Round 51-B: 「買い候補だけ速く見つける」 — スキャン結果サマリ
     ・total: 全スキャンレース数
     ・candidates: 買い候補 (現在スタイルで decision=buy のレース数)
     ・lightSkipped: 軽量ゲートで弾いたレース (オッズなし/締切/暴荒れ等)
     ・skip: 9 条件未達で見送り
     ・noOdds / closed / dataChecking: それぞれ */
  const scanStats = useMemo(() => {
    const total = races.length;
    const map = recommendations || {};
    let buy = 0, skip = 0, noOdds = 0, closed = 0, dataChecking = 0, lightSkipped = 0;
    for (const r of races) {
      const rec = map[r.id];
      if (!rec) continue;
      if (rec.decision === "buy") buy++;
      else if (rec.decision === "no-odds") { noOdds++; lightSkipped++; }
      else if (rec.decision === "closed") closed++;
      else if (rec.decision === "data-checking") { dataChecking++; lightSkipped++; }
      else skip++;
    }
    return { total, candidates: buy, skip, noOdds, closed, dataChecking, lightSkipped };
  }, [races, recommendations]);

  /* recommendations の最新値を ref にも反映 (switchProfile が安全に参照できるよう) */
  useEffect(() => { recsRef.current = recommendations; }, [recommendations]);

  /* スタイル切替: 即時反応 + トースト発火 + 切替前の状態を保存 */
  const switchProfile = useCallback((p) => {
    if (settings.riskProfile === p) {
      showToast("既に選択中のスタイルです", "info");
      return;
    }
    // 切替前の「最も発走時刻が近い買い推奨」 を ref から取得 (差分通知用)
    const recsEntries = Object.entries(recsRef.current || {});
    const headlineEntry = recsEntries.find(([_, r]) => r?.decision === "buy") || recsEntries[0];
    const prevRec = headlineEntry?.[1];
    lastSwitchInfo.current = {
      prevDecision: prevRec?.decision,
      prevMainCombo: prevRec?.main?.combo,
      raceId: headlineEntry?.[0],
      newProfile: p,
      ts: Date.now(),
    };
    // 即時トースト (urgent)
    const label = { steady: "🛡️ 安定型", balanced: "⚖️ バランス型", aggressive: "🎯 攻め型" }[p] || p;
    showToast(`${label} に切り替えました`, "ok");
    // recommendations の再選択は事前計算済みキャッシュのピックなので軽い
    setSettings((prev) => ({ ...prev, riskProfile: p }));
  }, [settings.riskProfile, showToast]);

  /* スタイル切替後、recommendations が再計算された結果を旧と比較してトーストで通知 */
  useEffect(() => {
    const info = lastSwitchInfo.current;
    if (!info || !info.raceId) return;
    if (Date.now() - info.ts > 1500) return;
    const newRec = recommendations[info.raceId];
    if (!newRec) return;
    const newMainCombo = newRec.main?.combo;
    const prevDecision = info.prevDecision;
    const newDecision = newRec.decision;
    let msg = null, kind = "info";
    if (prevDecision !== newDecision) {
      if (newDecision === "buy") { msg = "🟢 買い判定に変わりました"; kind = "ok"; }
      else if (newDecision === "skip") { msg = "🔴 見送りに変わりました"; kind = "neg"; }
      else { msg = "判定が変わりました"; }
    } else if (newDecision === "buy" && info.prevMainCombo !== newMainCombo) {
      msg = `📋 買い目が変わりました (${info.prevMainCombo || "—"} → ${newMainCombo || "—"})`;
      kind = "ok";
    } else if (newDecision === "buy") {
      msg = "⚠️ スタイルは変わりましたが、このレースでは同じ買い目です";
      kind = "info";
    } else if (newDecision === "skip") {
      msg = "⚠️ スタイルは変わりましたが、このレースでは見送り判定のままです";
      kind = "info";
    }
    if (msg) {
      const t = setTimeout(() => showToast(msg, kind), 600);
      lastSwitchInfo.current = null;
      return () => clearTimeout(t);
    }
  }, [recommendations, showToast]);

  /* === エア / リアル モード切替 ===
     ・トーストは即時 (urgent)
     ・settings 更新は startTransition で非優先化 — 表示の即時反応を保つ */
  const switchVirtualMode = useCallback((forceValue) => {
    // 即時 (urgent): トースト発火を予測的に行う
    setSettings((prev) => {
      const next = { ...prev, virtualMode: forceValue != null ? !!forceValue : !prev.virtualMode };
      const msg = next.virtualMode
        ? "🧪 エア舟券モードに切り替えました (検証用)"
        : "💰 リアル舟券モードに切り替えました";
      // showToast は urgent (タイマー登録だけなのでブロックしない)
      showToast(msg, next.virtualMode ? "info" : "ok");
      return next;
    });
  }, [showToast]);

  /* === AI判断スナップショット ===
       無限ループ防止のため、races の変更時のみ記録 (recommendations 依存は削除)。
       記録のタイミング: 「最新にする」ボタンで races が更新された直後の 1 回のみ。 */
  const racesSignature = useMemo(() =>
    races.map((r) => r.id + ":" + (r.startTime || "")).join("|"),
  [races]);

  useEffect(() => {
    if (races.length === 0) return;
    /* === Round 77: 全 AI 予想を自動保存 (検証アプリの根幹) ===
       以前 Round 68 で 「Go 候補のみ保存」 に絞ったが、 これでは
       朝〜午後の AI 予想 / 締切 15 分以前の見送り / 結果反映 が一切記録されず
       「検証アプリ」 として成立しなかった。
       本 Round で全 AI 判定 (buy / skip / no-odds / data-checking / closed) を自動保存。

       純度確保はフィルタ側で行う:
         ・KPI Panel: filterForVerification(preCloseOnly=true) で Go 候補のみ集計
         ・PublicLog: appendPublicLog で finalized=true && !isSampleData のみ追記
         ・isGoCandidate / preCloseTarget フラグはレコードに残し、 後でフィルタ可能

       保存タグ:
         ・preCloseTarget: 直前判定対象だったか (KPI 純度フィルタ用)
         ・isGoCandidate: Go 候補だったか (KPI 純度フィルタ用)
         ・isSampleData: 仮データ起源か (公開ログから絶対除外)
         ・verificationVersion: ロジックバージョン (バージョン別 KPI 用)

       key 形式: ${dateKey}_${raceId}_${style}
    */
    const goRacesByStyle = { steady: new Set(), balanced: new Set(), aggressive: new Set() };
    for (const pick of goMode?.goPicks || []) {
      if (pick?.raceId && pick?.style && goRacesByStyle[pick.style]) {
        goRacesByStyle[pick.style].add(pick.raceId);
      }
    }
    const nowForPreClose = new Date();
    const preCloseRaceIds = new Set();
    for (const r of races) {
      const pc = isPreCloseTarget(r, nowForPreClose);
      if (pc.isTarget) preCloseRaceIds.add(r.id);
    }

    setPredictions((prev) => {
      const next = { ...prev };
      let changed = false;
      const stamp = new Date().toISOString();
      const STYLES = ["steady", "balanced", "aggressive"];
      for (const r of races) {
        const dateKey = (r.date || "").replace(/-/g, "");
        for (const style of STYLES) {
          const rec = allStyleRecommendations[style]?.[r.id];
          if (!rec) continue;
          const key = `${dateKey}_${r.id}_${style}`;
          const existing = next[key] || {};
          // 手動記録は触らない (manuallyRecorded=true)
          if (existing.manuallyRecorded) continue;
          // Round 79: 「結果確定後は判断材料をフリーズ」 (後付け書き換え禁止)
          //   買い推奨した瞬間の情報を固定保存し、 後から見返した時に検証可能にする
          if (existing.result?.first) continue;
          // Round 79: 既に「買い」 として保存済なら、 後で skip / no-odds 等に降格しない
          //   (買い瞬間の判断材料を保持。 買い → 買い の更新は許可: より新しいオッズ反映)
          if (existing.decision === "buy" && rec.decision !== "buy") continue;
          // Round 77: 全 AI 判定を保存 (rec が存在 = 保存対象)
          // フラグ付与で後段フィルタ可能
          const isGoTarget = goRacesByStyle[style].has(r.id);

          // === 共通フィールド (buy / skip 両方に必要) ===
          const baseFields = {
            key, date: r.date, raceId: r.id, venue: r.venue, jcd: r.jcd, raceNo: r.raceNo,
            startTime: r.startTime,
            closingTime: r.startTime,
            predictionTime: existing.predictionTime || stamp,
            profile: style,
            predictionType: style,
            virtual: existing.virtual != null ? existing.virtual : !!settings.virtualMode,
            snapshotAt: stamp,
            version: CURRENT_VERSION, // Round 52: v2 タグ付け (legacy と分離)
            // Round 73 Phase 1: 検証バージョン + 直前判定対象フラグ
            verificationVersion: existing.verificationVersion || CURRENT_VERIFICATION_VERSION,
            preCloseTarget: preCloseRaceIds.has(r.id),    // 直前判定対象だったか
            isGoCandidate: isGoTarget,                     // Go 候補だったか
            // Round 76: 仮データ起源フラグ (公開ログから絶対除外)
            isSampleData: existing.isSampleData != null ? existing.isSampleData : !!isSampleMode,
          };

          let updated;
          if (rec.decision === "buy") {
            // === Round 79: 買い = 判断材料を全て厚く保存 (検証用) ===
            const combos = rec.items.map((it) => ({
              kind: it.kind, combo: it.combo, stake: it.stake,
              odds: it.odds, prob: it.prob, ev: it.ev,
              expectedReturn: it.expectedReturn, evMinus1: it.evMinus1,
              role: it.role, grade: it.grade, pickReason: it.pickReason,
            }));
            // 出走表スナップショット (買い時点の選手・モーター・展示・進入)
            const boatsSnapshot = (r.boats || []).map((b) => ({
              boatNo: b.boatNo,
              racer: b.racer || b.name || null,
              class: b.class || null,                     // A1/A2/B1/B2
              winRate: b.winRate ?? null,                  // 全国勝率
              placeRate: b.placeRate ?? null,              // 全国2連率
              localWinRate: b.localWinRate ?? null,        // 当地勝率
              localPlaceRate: b.localPlaceRate ?? null,    // 当地2連率
              motor2: b.motor2 ?? null,                    // モーター2連率
              motor3: b.motor3 ?? null,                    // モーター3連率
              boat2: b.boat2 ?? null,                      // ボート2連率
              boat3: b.boat3 ?? null,                      // ボート3連率
              exTime: b.exTime ?? null,                    // 展示タイム
              tilt: b.tilt ?? null,                        // チルト角
              avgST: b.avgST ?? null,                      // 平均 ST
              exST: b.exST ?? null,                        // スタート展示 ST
              entryHistory: b.entryHistory || null,        // 進入履歴
              partsExchange: b.partsExchange || null,      // 部品交換
              exhibitionNote: b.exhibitionNote || null,    // 気配コメント
              age: b.age ?? null,
              weight: b.weight ?? null,
            }));
            // 天候・水面スナップショット
            const weatherSnapshot = {
              weather: r.weather || null,
              wind: r.wind ?? null,
              windDir: r.windDir || null,
              wave: r.wave ?? null,
              temp: r.temp ?? null,
              waterTemp: r.waterTemp ?? null,
            };
            // 自然言語の判断理由 (whyBuy / whyNot / maxRisk / oneLine)
            const evForRace = evals[r.id];
            const reasoning = (() => {
              try { return buildReasoningSummary(rec, evForRace); }
              catch { return null; }
            })();
            updated = {
              ...existing,
              ...baseFields,
              decision: "buy",
              combos,
              reason: rec.reason || null,
              rationale: rec.rationale || null,
              totalStake: rec.total,
              grade: rec.grade || null,
              warnings: rec.warnings || [],
              venueProfile: rec.venueProfile || null,
              timeSlot: rec.timeSlot || null,
              confidence: rec.confidence,
              worstCaseRoi: rec.worstCaseRoi,
              worstCasePayout: rec.worstCasePayout,
              expectedPayout: rec.expectedPayout,
              // Round 79: 判断材料スナップショット
              boatsSnapshot,
              weatherSnapshot,
              reasoning,
              checks: rec.checks || null,           // 9 条件チェック結果
              development: evForRace?.development || null,  // 展開シナリオ
              inTrust: evForRace?.inTrust || null,           // 1号艇信頼度
              accident: evForRace?.accident || null,         // 危険度
              probConsistency: evForRace?.probConsistency || null,
              probs: evForRace?.probs || null,               // 各艇 1着確率
              maxEV: evForRace?.maxEV ?? null,
            };
          } else {
            // === skip / no-odds / data-checking / closed: 軽量保存 ===
            // 「もし買っていたら」 の本命候補 (検証用)
            const evForRace = evals[r.id];
            const intendedMain = evForRace?.items?.[0]
              ? {
                  kind: evForRace.items[0].kind,
                  combo: evForRace.items[0].combo,
                  prob: evForRace.items[0].prob,
                  odds: evForRace.items[0].odds,
                  ev: evForRace.items[0].ev,
                }
              : null;
            updated = {
              ...existing,
              ...baseFields,
              decision: rec.decision,                       // skip / no-odds / data-checking / closed
              reason: rec.reason || null,
              reasons: rec.reasons || [],                   // 詳細理由 (複数)
              combos: [],
              totalStake: 0,
              grade: null,
              intendedMain,                                  // 検証用: もし買っていたら何だったか
              warnings: rec.warnings || [],
            };
          }

          const cmp = (o) => JSON.stringify({
            d: o.decision || "",
            c: (o.combos || []).map(c => `${c.kind}:${c.combo}`).join("|"),
            p: o.profile || "",
            r: (o.reasons || []).slice(0, 1).join(""),
          });
          if (cmp(existing) !== cmp(updated)) {
            next[key] = updated;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racesSignature, goMode]);

  /* === 「最新にする」ボタン: 一括取得 ===
     try-finally で setRefreshing(false) を保証。
     API 失敗時はサンプルにフォールバックし、画面は壊さない。
     連打防止: 60 秒クールダウン + refreshing フラグで二重実行禁止。 */
  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    const since = lastRefreshAt ? Date.now() - new Date(lastRefreshAt).getTime() : Infinity;
    if (since < REFRESH_COOLDOWN_MS) {
      const left = Math.ceil((REFRESH_COOLDOWN_MS - since) / 1000);
      setRefreshMsg(`⏳ あと ${left} 秒お待ちください (連打防止)`);
      setTimeout(() => setRefreshMsg(""), 2500);
      return;
    }
    setRefreshing(true);
    setRefreshMsg("🔄 最新データを確認中…");
    const startedAt = Date.now();
    try {

    /* ① 今日のスケジュール */
    const sched = await fetchTodaySchedule();
    let baseRaces;
    if (sched?.ok && sched.total_races > 0) {
      baseRaces = buildRacesFromSchedule(sched);
      setIsSampleMode(false);
    } else {
      baseRaces = generateSampleRaces();
      setIsSampleMode(true);   // Round 74: 仮データ動作中フラグ
    }

    /* ② 勝負候補 (発走±60分) を絞る → program/odds/result を並列取得 */
    const now = Date.now();
    const candidates = baseRaces.filter((r) => {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) return false;
      const diff = (e - now) / 60000;
      return diff >= -30 && diff <= 60;
    }).slice(0, 12);
    setRefreshMsg(`🔄 確認中… (候補 ${candidates.length} レース)`);

    const dateK = todayKey();
    const enriched = await Promise.all(candidates.map(async (r) => {
      const e = startEpoch(r.date, r.startTime);
      const finished = e != null && now > e + 5 * 60 * 1000;
      // 直前情報は発走前 30 分以内 + 発走後 10 分のみ取得 (それ以外は不要 / 未公開)
      const fetchBefore = e != null && now > e - 30 * 60 * 1000 && now < e + 10 * 60 * 1000;
      const [prog, odds, before, result] = await Promise.all([
        fetchRaceProgram(r.jcd, r.raceNo, dateK),
        fetchRaceOdds(r.jcd, r.raceNo, dateK),
        fetchBefore ? fetchBeforeInfo(r.jcd, r.raceNo, dateK) : Promise.resolve(null),
        finished ? fetchRaceResult(r.jcd, r.raceNo, dateK) : Promise.resolve(null),
      ]);
      return { id: r.id, prog, odds, before, result };
    }));

    const enrichedMap = Object.fromEntries(enriched.map((e) => [e.id, e]));
    const merged = baseRaces.map((r) => {
      const enr = enrichedMap[r.id];
      if (!enr) return r;
      let next = r;
      if (enr.prog)   next = mergeProgram(next, enr.prog);
      if (enr.odds)   next = mergeOdds(next, enr.odds);
      if (enr.before) next = mergeBeforeInfo(next, enr.before);
      if (enr.result?.first) next = { ...next, apiResult: enr.result };
      return next;
    });
    setRaces(merged);

    /* ③ 結果反映 — Round 51-F: buy + skip 両方の finalize
       buy: payout / hit / pnl を計算
       skip: intendedMain との一致で skipCorrect (= AI が見送って正解か) を判定
    */
    const dateKey = todayDate().replace(/-/g, "");
    const stamp = new Date().toISOString();
    setPredictions((prev) => {
      const out = { ...prev };
      const STYLES = ["steady", "balanced", "aggressive"];
      for (const r of merged) {
        if (!r.apiResult?.first) continue;
        const winnerTri = `${r.apiResult.first}-${r.apiResult.second}-${r.apiResult.third}`;
        const winnerEx = `${r.apiResult.first}-${r.apiResult.second}`;
        const winnerWin = String(r.apiResult.first);
        const candidateKeys = [
          `${dateKey}_${r.id}`,
          ...STYLES.map((s) => `${dateKey}_${r.id}_${s}`),
        ];
        for (const key of candidateKeys) {
          const existing = out[key];
          if (!existing) continue;
          if (existing.result?.first) continue; // 反映済
          const resultObj = {
            first: r.apiResult.first, second: r.apiResult.second, third: r.apiResult.third,
            payouts: r.apiResult.payouts, fetchedAt: stamp,
          };
          if (existing.decision === "buy") {
            // 買い: 通常の hit / pnl 計算
            let payout = 0, hit = false;
            for (const c of (existing.combos || [])) {
              const yenPer100 = c.kind === "3連単" ? r.apiResult.payouts?.trifecta?.[winnerTri]
                              : c.kind === "2連単" ? r.apiResult.payouts?.exacta?.[winnerEx]
                              : c.kind === "単勝"  ? r.apiResult.payouts?.tan?.[winnerWin]
                              : 0;
              const matched = c.combo === (c.kind === "3連単" ? winnerTri : c.kind === "2連単" ? winnerEx : winnerWin);
              if (matched && yenPer100) {
                payout += (c.stake / 100) * yenPer100;
                hit = true;
              }
            }
            out[key] = {
              ...existing,
              result: resultObj,
              payout, hit, pnl: payout - (existing.totalStake || 0),
              finalized: true,
            };
          } else if (existing.decision === "skip") {
            // 見送り: intendedMain が当たっていたら skipMissed=true, 外れていたら skipCorrect=true
            const im = existing.intendedMain;
            let skipCorrect = true; // 何も intendedMain なしなら見送り正解扱い
            let skipMissed = false;
            if (im?.combo && im.kind) {
              const winnerForKind = im.kind === "3連単" ? winnerTri
                                  : im.kind === "2連単" ? winnerEx
                                  : im.kind === "2連複" ? [r.apiResult.first, r.apiResult.second].sort((a,b) => a-b).join("=")
                                  : im.kind === "3連複" ? [r.apiResult.first, r.apiResult.second, r.apiResult.third].sort((a,b) => a-b).join("=")
                                  : winnerWin;
              if (im.combo === winnerForKind) { skipCorrect = false; skipMissed = true; }
            }
            out[key] = {
              ...existing,
              result: resultObj,
              skipCorrect, skipMissed,
              finalized: true,
            };
          } else {
            // no-odds / data-checking / closed: 結果記録だけ残す
            out[key] = {
              ...existing,
              result: resultObj,
              finalized: true,
            };
          }
        }
      }
      return out;
    });

    /* ④ 高速 2 段階追加取得 — オッズだけ 5秒間隔で 2 回追い更新
       (発走直前のオッズ変動を捉えやすくする / 連打防止のため最大 2 回まで) */
    const fastTargets = candidates.filter((r) => {
      const e = startEpoch(r.date, r.startTime);
      const m = e != null ? (e - Date.now()) / 60000 : null;
      return m != null && m >= -5 && m <= 30; // 発走前 30 分〜発走後 5 分のみ
    }).slice(0, 8); // 最大 8 レース

    if (fastTargets.length > 0) {
      for (let pass = 1; pass <= 2; pass++) {
        await new Promise((r) => setTimeout(r, 5000)); // 5 秒間隔
        setRefreshMsg(`🔄 オッズ追い更新 ${pass}/2 (${fastTargets.length}レース)…`);
        const oddsResults = await Promise.all(fastTargets.map(async (r) => {
          const odds = await fetchRaceOdds(r.jcd, r.raceNo, dateK);
          return { id: r.id, odds };
        }));
        setRaces((prev) => {
          if (!prev || prev.length === 0) return prev;
          const idx = Object.fromEntries(oddsResults.filter(x => x.odds).map(x => [x.id, x.odds]));
          let changed = false;
          const next = prev.map((r) => {
            if (!idx[r.id]) return r;
            changed = true;
            return mergeOdds(r, idx[r.id]);
          });
          return changed ? next : prev;
        });
      }
    }

    /* ⑤ 完了 (最低 400 ms 表示) */
    const elapsed = Date.now() - startedAt;
    if (elapsed < 400) await new Promise((r2) => setTimeout(r2, 400 - elapsed));
    const ts = new Date().toISOString();
    setLastRefreshAt(ts);
    if (sched?.ok) {
      setRefreshMsg(`✅ 更新しました (${sched.total_venues}会場 / ${sched.total_races}レース / 詳細 ${candidates.length}件 / オッズ ${fastTargets.length}件 ×3 段階)`);
    } else {
      setRefreshMsg(`⚠️ 一時的に取得できません。少し時間を空けて再実行してください — サンプル動作中`);
    }
    setTimeout(() => setRefreshMsg(""), 5000);
    } catch (err) {
      // 例外時は前回データを保持し、UI を壊さない
      console.error("[refreshAll] error:", err);
      setRefreshMsg("⚠️ 一時的に混雑しています。少し時間を空けて再実行してください");
      setTimeout(() => setRefreshMsg(""), 5000);
    } finally {
      // finally で必ずフラグを下ろす (永続的にボタンが無効化されるのを防止)
      setRefreshing(false);
    }
  }, [refreshing, lastRefreshAt]);

  /* === 起動時に 1 回だけ取得 (cooldown bypass) === */
  useEffect(() => {
    if (!settings.onboardingDone) return;
    setLastRefreshAt(null); // bypass cooldown for first call
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.onboardingDone]);

  /* === Round 59: 日付切替検知 (起動時 + 1 分ごと) ===
     JST 22:00 越えで翌日扱い → 自動的に refreshAll してデータをリセット */
  useEffect(() => {
    if (!settings.onboardingDone) return;
    function checkDateChange() {
      const result = detectDateChange();
      if (result.changed && !result.isFirstLoad) {
        showToast(`📅 新しい日のデータに更新しました (${result.currentDate})`, "ok");
        setLastRefreshAt(null);
        refreshAllRef.current && refreshAllRef.current();
      }
    }
    // 起動時に 1 回
    checkDateChange();
    // 1 分ごと
    const id = setInterval(checkDateChange, 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.onboardingDone]);

  /* === Round 30: 開催時間中バックグラウンド更新 (12 分間隔) ===
     ・8:00 〜 22:00 JST のみ動作 (開催時間外は休む)
     ・refreshing 中はスキップ (二重実行防止) — useRef で stale closure 撃退
     ・setLastRefreshAt(null) で cooldown を回避 (12 分間隔は十分間隔)
     ・「次回更新予定」 を nextRefreshAt として state に保持 */
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const refreshingRef = useRef(false);
  const refreshAllRef = useRef(null);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);
  useEffect(() => { refreshAllRef.current = refreshAll; }, [refreshAll]);
  useEffect(() => {
    if (!settings.onboardingDone) return;
    const BG_INTERVAL_MS = 12 * 60 * 1000; // 12 分
    function isRaceWindow() {
      const h = new Date().getHours();
      return h >= 8 && h < 22;
    }
    function tick() {
      if (refreshingRef.current || !isRaceWindow()) return;
      setLastRefreshAt(null);
      refreshAllRef.current && refreshAllRef.current();
      setNextRefreshAt(new Date(Date.now() + BG_INTERVAL_MS).toISOString());
    }
    setNextRefreshAt(new Date(Date.now() + BG_INTERVAL_MS).toISOString());
    const id = setInterval(tick, BG_INTERVAL_MS);
    return () => clearInterval(id);
  }, [settings.onboardingDone]);

  /* === 手動記録 (リアル/エア舟券フォーム) ===
     Round 66: 保存直後に loadState() で読み戻し検証 + visibleData 反映チェック。
     失敗時は console.error + ユーザーへトースト通知 (見えない保存を撲滅)。 */
  const handleManualBet = useCallback((record) => {
    // Round 52: v2 タグを必ず付与 (現在のスタイルも記録)
    const enhanced = {
      ...record,
      profile: record.profile || settings.riskProfile,
      version: CURRENT_VERSION,
    };
    setPredictions((prev) => {
      const next = { ...prev, [record.key]: enhanced };
      // Round 66: 状態更新が反映された後に読み戻し検証
      queueMicrotask(() => {
        const res = saveAndVerify({ settings, predictions: next }, [record.key]);
        const vis = verifyVisible(next, record.key, {
          showLegacy: !!settings.showLegacy,
          currentStyle: settings.riskProfile,
        });
        console.log(`[handleManualBet] key=${record.key} saveOk=${res.ok} visible=${vis.ok} size=${res.sizeBytes}B`);
        if (!res.ok) {
          console.error(`[handleManualBet] 保存失敗: ${res.error}`);
          showToast(`⚠️ 保存検証に失敗 — ${res.error}`, "neg");
        } else if (!vis.ok) {
          console.warn(`[handleManualBet] 保存はされたが visibleData 非表示: ${vis.reason}`);
          showToast(`⚠️ 保存しましたが画面非表示: ${vis.reason}`, "neg");
        } else if (authUser) {
          showToast("💾 保存完了 (検証済) — クラウド同期を予約", "ok");
        } else {
          showToast("💾 保存完了 (検証済) — このブラウザに保存", "ok");
        }
      });
      return next;
    });
  }, [settings, authUser, showToast]);

  const handleDeleteRecord = useCallback((key) => {
    setPredictions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    showToast("🗑 記録を削除しました", "info");
  }, [showToast]);

  /* === ユーザーアクション: 結論カードから「記録する」 ===
        virtualOverride を渡せば仮想/実 の選択を強制 (例: 「リアル購入として記録」 ボタンから true)
        Round 51-C: key は style-aware に (3 スタイル分離)
        Round 66: 保存直後に loadState() で読み戻し検証 + visibleData 反映チェック */
  const handleRecord = useCallback((race, rec, opts = {}) => {
    const dateKey = (race.date || "").replace(/-/g, "");
    const style = rec?.profile || settings.riskProfile || "balanced";
    const key = `${dateKey}_${race.id}_${style}`;
    const virtual = opts.real === true ? false
                  : opts.real === false ? true
                  : !!settings.virtualMode;
    setPredictions((prev) => {
      const next = {
        ...prev,
        [key]: {
          ...prev[key],
          recorded: true,
          recordedAt: new Date().toISOString(),
          manuallyRecorded: true,    // Round 68: 手動記録フラグ (auto-snapshot で上書き禁止)
          virtual,
          version: CURRENT_VERSION,
        },
      };
      // Round 66: 状態更新後に読み戻し検証
      queueMicrotask(() => {
        const res = saveAndVerify({ settings, predictions: next }, [key]);
        const vis = verifyVisible(next, key, {
          showLegacy: !!settings.showLegacy,
          currentStyle: settings.riskProfile,
        });
        console.log(`[handleRecord] key=${key} saveOk=${res.ok} visible=${vis.ok} size=${res.sizeBytes}B`);
        if (!res.ok) {
          console.error(`[handleRecord] 保存失敗: ${res.error}`);
          showToast(`⚠️ 保存検証に失敗 — ${res.error}`, "neg");
        } else if (!vis.ok) {
          console.warn(`[handleRecord] 保存はされたが visibleData 非表示: ${vis.reason}`);
          showToast(`⚠️ 保存しましたが画面非表示: ${vis.reason}`, "neg");
        } else {
          showToast("✅ 記録 (検証済) — グラフ・収支に反映されます", "ok");
        }
      });
      return next;
    });
  }, [settings, showToast]);

  /* === Reset === */
  /* === Round 90: フレッシュスタート ===
     既存データの精度問題で本日からの新規収集に切替。
     ・ローカル: predictions / publicLog / learningLog を全消去
     ・クラウド: ログイン中なら別ボタンで Supabase 行も削除可
     ・設定 (予算 / リスク感覚) は保持オプション */
  const handleReset = useCallback(async (opts = {}) => {
    const { preserveSettings = true, deleteCloud = false } = opts;
    const localMsg = preserveSettings
      ? "ローカルデータを完全リセットします:\n\n・全予想 / 買い目記録\n・公開検証ログ\n・学習履歴\n\n設定 (予算・リスク) は保持されます。\n\nよろしいですか?"
      : "ローカルデータを完全リセットします:\n\n・全予想 / 買い目記録\n・公開検証ログ\n・学習履歴\n・設定\n\nすべて初期化されます。 よろしいですか?";
    if (!confirm(localMsg)) return;
    // クラウド削除も含むなら 2 段確認
    if (deleteCloud && authUser) {
      if (!confirm("⚠️ Supabase クラウドの全予想行も完全削除します。\nこれは取り消せません。 続行しますか?")) return;
    }
    // ローカル
    clearAllAppData({ preserveSettings });
    clearApiCaches();   // API キャッシュもクリア
    setSettings(preserveSettings ? settings : defaultSettings());
    setPredictions({});
    setRaces([]);
    setLastRefreshAt(null);
    setRefreshMsg("✅ ローカルリセット完了 — 本日から新規蓄積を開始します");
    // クラウド
    if (deleteCloud && authUser) {
      const res = await deleteCloudData(authUser.id);
      if (res.ok) {
        showToast(`☁️ クラウドデータ ${res.deleted} 行を削除しました`, "ok");
      } else {
        showToast(`⚠️ クラウド削除失敗: ${res.error}`, "neg");
      }
    }
    setTimeout(() => setRefreshMsg(""), 5000);
  }, [authUser, settings, showToast]);

  /* === Weekly summary for badge === */
  // Round 52: weekly も visiblePredictions (v2 のみ) で集計
  const weekly = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const arr = Object.values(visiblePredictions || {}).filter((p) => p.date >= weekAgo);
    const buys = arr.filter((p) => p.decision === "buy" && p.totalStake > 0);
    const settled = buys.filter((p) => p.result?.first);
    let stake = 0, ret = 0, hits = 0;
    settled.forEach((p) => { stake += p.totalStake; ret += p.payout || 0; if (p.hit) hits++; });
    return { count: buys.length, settled: settled.length, hits, stake, ret, pnl: ret - stake, roi: stake > 0 ? ret / stake : 0 };
  }, [visiblePredictions]);

  /* === Onboarding === */
  if (!settings.onboardingDone) {
    return (
      <Onboarding settings={settings} setSettings={setSettings}
        onClose={() => setSettings((prev) => ({ ...prev, onboardingDone: true }))} />
    );
  }

  /* === Main === */
  const selectedRace = selectedRaceId ? races.find((r) => r.id === selectedRaceId) : null;

  return (
    <div className="min-h-screen">
      <Header tab={tab} setTab={(t) => { setTab(t); setSelectedRaceId(null); }}
        today={today} settings={settings} setSettings={setSettings}
        switchProfile={switchProfile} switchVirtualMode={switchVirtualMode}
        refreshing={refreshing} onRefresh={refreshAll} lastRefreshAt={lastRefreshAt}
        nextRefreshAt={nextRefreshAt}
        savedCount={Object.keys(predictions || {}).length}
        authUser={authUser} onOpenLogin={() => setShowLogin(true)} onLogout={handleLogout}
        syncStatus={syncStatus}
        effectiveRaceDate={effectiveRaceDate}
        suggestedStyle={suggestStyle(evals, predictions)} />

      {/* ログインモーダル */}
      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} />
      {/* Round 43: 保存失敗バナー (重要 — ユーザーがすぐ気づくべき情報) */}
      {!storageStatus.ok && storageStatus.error && (
        <div className="alert-error mx-4 mt-2 text-center" style={{ fontWeight: 700 }}>
          ⚠️ 保存に失敗しています — {storageStatus.error}
          <div className="text-xs opacity-80 mt-1" style={{ fontWeight: 500 }}>
            ブラウザの設定でストレージが無効化されているか、容量上限の可能性があります。
          </div>
        </div>
      )}

      {/* Round 74: 仮データ動作中バナー (実 API 失敗 → サンプル fallback) ===
          公営競技で実データと混同を防ぐため、 全画面赤帯で警告 */}
      {isSampleMode && (
        <div style={{
          background: "rgba(239,68,68,0.18)",
          borderTop: "2px solid rgba(239,68,68,0.6)",
          borderBottom: "2px solid rgba(239,68,68,0.6)",
          color: "#fecaca",
          padding: "8px 12px",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }} role="alert" aria-live="assertive">
          🔴 <b>仮データ動作中</b> — 実 API 取得に失敗中。 表示中のレース・オッズ・選手はサンプル値です。 購入判断には使用しないでください。
        </div>
      )}

      {/* Round 91: レート制限通知バナー (429 エラー時に短期表示) */}
      {rateLimitEvent && (
        <div style={{
          background: "rgba(251,191,36,0.15)",
          borderTop: "2px solid rgba(251,191,36,0.5)",
          borderBottom: "2px solid rgba(251,191,36,0.5)",
          color: "#fde68a",
          padding: "6px 12px",
          textAlign: "center",
          fontSize: 11,
          fontWeight: 700,
        }} role="status" aria-live="polite">
          ⏳ <b>API レート制限</b> — {Math.round((rateLimitEvent.retryAfterMs || 0) / 1000)} 秒後に自動リトライ (リクエスト間隔調整中)
        </div>
      )}

      {/* Round 52: バージョン状態バッジ (常時表示 — 「今見ている数字の信頼性」 を即時把握) */}
      <button
        onClick={() => {
          setTab("settings");
          setSelectedRaceId(null);
          // settings タブ表示後、v2/legacy パネルにスクロール
          setTimeout(() => {
            const el = document.getElementById("version-panel");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        }}
        className="mx-4 mt-2 text-xs flex items-center justify-center gap-2 flex-wrap w-auto"
        style={{
          background: showLegacy ? "rgba(251,191,36,0.10)" : "rgba(56,189,248,0.10)",
          border: `1px solid ${showLegacy ? "rgba(251,191,36,0.4)" : "rgba(56,189,248,0.4)"}`,
          borderRadius: 12, padding: "8px 12px",
          color: showLegacy ? "#fde68a" : "#bae6fd",
          lineHeight: 1.5, cursor: "pointer", textAlign: "left", display: "flex",
          minHeight: 36,
        }}>
        {showLegacy ? (
          <>
            <span>⚠️ <b>legacy 含めて表示中</b></span>
            <span className="opacity-80">v2 {versionInfo.v2Count} + legacy {versionInfo.legacyCount} 件</span>
            <span className="opacity-70 ml-auto">→ 設定で切替</span>
          </>
        ) : (
          <>
            <span>🆕 <b>v2 のみ表示中</b></span>
            <span className="opacity-80">v2 {versionInfo.v2Count} 件</span>
            {versionInfo.legacyCount > 0 && (
              <span className="opacity-80">/ legacy {versionInfo.legacyCount} 件 (非表示)</span>
            )}
            <span className="opacity-70 ml-auto">→ 設定</span>
          </>
        )}
      </button>

      {/* トースト: スタイル切替 / 操作フィードバック (iOS notch 対応) */}
      {toast && (
        <div style={{
          position: "fixed", top: "calc(12px + env(safe-area-inset-top, 0px))", left: "50%", transform: "translateX(-50%)",
          zIndex: 100, padding: "10px 18px", borderRadius: 999,
          background: toast.kind === "ok" ? "#10b981" : toast.kind === "neg" ? "#ef4444" : "#1d4ed8",
          color: "#fff", fontWeight: 800, fontSize: 14, boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          animation: "toast-slide 0.2s ease-out",
          maxWidth: "calc(100vw - 24px)", textAlign: "center",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Round 105: 現在モード常時表示バー (画面下部固定) — premium polish */}
      {settings.onboardingDone && (() => {
        const isVirtual = !!settings.virtualMode;
        const styleLabel = { steady: "🛡️ 安定", balanced: "⚖️ バランス", aggressive: "🎯 攻め" }[settings.riskProfile] || settings.riskProfile;
        const now = Date.now();
        let nextTarget = null, minDiff = Infinity;
        for (const r of races || []) {
          if (!r.startTime || !r.date) continue;
          const m = String(r.startTime).match(/^(\d{1,2}):(\d{2})$/);
          if (!m) continue;
          const [Y, M, D] = r.date.split("-").map((s) => parseInt(s, 10));
          const startMs = new Date(Y, M - 1, D, +m[1], +m[2]).getTime();
          const diffMin = (startMs - now) / 60000;
          if (diffMin >= 3 && diffMin <= 25) {
            if (diffMin < minDiff) { minDiff = diffMin; nextTarget = { race: r, minutesToTarget: 0, kind: "in-window" }; }
          } else if (diffMin > 25 && diffMin - 25 < minDiff) {
            minDiff = diffMin - 25;
            nextTarget = { race: r, minutesToTarget: Math.ceil(diffMin - 25), kind: "wait" };
          }
        }
        return (
          <div style={{
            position: "fixed", left: 0, right: 0, bottom: 0,
            zIndex: 90,
            background: "linear-gradient(180deg, rgba(14, 20, 36, 0.85) 0%, rgba(6, 10, 24, 0.96) 100%)",
            borderTop: "1px solid var(--border-soft)",
            padding: "8px 12px calc(8px + env(safe-area-inset-bottom, 0px))",
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            fontSize: 11,
            boxShadow: "0 -1px 0 rgba(255, 255, 255, 0.04) inset, 0 -8px 24px rgba(0, 0, 0, 0.30)",
          }}>
            {/* === 左: モード + スタイル === */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => switchVirtualMode()}
                style={{
                  minHeight: 36, padding: "6px 12px", borderRadius: 999,
                  background: isVirtual ? "rgba(34, 211, 238, 0.14)" : "rgba(245, 158, 11, 0.14)",
                  border: `1.5px solid ${isVirtual ? "rgba(34, 211, 238, 0.55)" : "rgba(245, 158, 11, 0.55)"}`,
                  color: isVirtual ? "#67E8F9" : "#FCD34D",
                  fontWeight: 700, fontSize: 11.5, cursor: "pointer",
                  transition: "transform 0.06s ease, background 0.18s ease",
                  letterSpacing: "0.02em",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
                onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                aria-label={isVirtual ? "現在: エアモード (タップでリアルに)" : "現在: リアルモード (タップでエアに)"}
              >
                {isVirtual ? "🧪 エア中" : "💰 リアル中"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const order = ["steady", "balanced", "aggressive"];
                  const i = order.indexOf(settings.riskProfile);
                  const next = order[(i + 1) % order.length];
                  switchProfile(next);
                }}
                style={{
                  minHeight: 36, padding: "6px 12px", borderRadius: 999,
                  background: "rgba(34, 211, 238, 0.10)",
                  border: "1.5px solid rgba(34, 211, 238, 0.40)",
                  color: "#67E8F9",
                  fontWeight: 700, fontSize: 11.5, cursor: "pointer",
                  letterSpacing: "0.02em",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                  transition: "transform 0.06s ease, background 0.18s ease",
                }}
                onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                aria-label={`現在スタイル: ${styleLabel} (タップで切替)`}
              >
                {styleLabel}
              </button>
            </div>

            {/* === 右: 次の対象レース === */}
            <div style={{ color: "var(--text-secondary)", textAlign: "right", lineHeight: 1.4, fontSize: 10.5, fontWeight: 500 }}>
              {nextTarget ? (
                nextTarget.kind === "in-window" ? (
                  <div style={{ color: "#34D399", fontWeight: 700 }}>
                    🟢 直前判定対象あり
                    <div style={{ opacity: 0.85, fontSize: 9.5, fontWeight: 500, marginTop: 1 }}>
                      {nextTarget.race.venue} <span className="num">{nextTarget.race.raceNo}R</span> ({nextTarget.race.startTime})
                    </div>
                  </div>
                ) : (
                  <div>
                    ⏰ 次の対象まで <b className="num" style={{ color: "#FCD34D" }}>{nextTarget.minutesToTarget}</b>分
                    <div style={{ opacity: 0.7, fontSize: 9.5, fontWeight: 500, marginTop: 1 }}>
                      {nextTarget.race.venue} <span className="num">{nextTarget.race.raceNo}R</span> ({nextTarget.race.startTime})
                    </div>
                  </div>
                )
              ) : (
                <span style={{ opacity: 0.6 }}>本日対象レースなし</span>
              )}
            </div>
          </div>
        );
      })()}

      <main style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }} key={tab} className="page-fade">
        {tab === "home" && (
          <Dashboard
            races={races} predictions={visiblePredictions} recommendations={recommendations}
            visibleData={visibleData}
            evals={evals}
            today={today} weekly={weekly}
            refreshing={refreshing} refreshMsg={refreshMsg} lastRefreshAt={lastRefreshAt}
            onRefresh={refreshAll} onRetry={refreshAll} onRecord={handleRecord} settings={settings}
            switchProfile={switchProfile}
            strategyRanking={strategyRanking}
            scanStats={scanStats}
            styleAllocation={styleAllocation}
            styleHeadlines={styleHeadlines}
            goMode={goMode}
            isSampleMode={isSampleMode}
            storageStatus={storageStatus}
            publicLogTick={publicLogTick}
            authUser={authUser}
            syncStatus={syncStatus}
            onPickRace={(t) => setTab(t)}
          />
        )}
        {tab === "list" && (
          <RaceList
            races={races} evals={evals} recommendations={recommendations}
            onPickRace={(id) => { setSelectedRaceId(id); setTab("detail"); }}
          />
        )}
        {tab === "detail" && (
          <Suspense fallback={<LazyFallback />}>
          <RaceDetail
            race={selectedRace}
            evalRes={selectedRace ? evals[selectedRace.id] : null}
            recommendation={selectedRace ? recommendations[selectedRace.id] : null}
            onRecord={handleRecord}
            onBack={() => setTab("list")}
            virtualMode={settings.virtualMode}
          />
          </Suspense>
        )}
        {tab === "verify" && (
          <Suspense fallback={<LazyFallback />}>
          <Verify predictions={visibleData.predictions}
            visibleData={visibleData}
            currentProfile={settings.riskProfile}
            virtualMode={settings.virtualMode}
            onManualBet={handleManualBet}
            onDeleteRecord={handleDeleteRecord} />
          </Suspense>
        )}
        {tab === "stats" && (
          <Suspense fallback={<LazyFallback />}>
          <Stats predictions={visibleData.predictions}
            visibleData={visibleData}
            lastRefreshAt={lastRefreshAt}
            virtualMode={settings.virtualMode} />
          </Suspense>
        )}
        {tab === "analysis" && (
          <Suspense fallback={<LazyFallback />}>
          <LossAnalysis predictions={visibleData.predictions}
            visibleData={visibleData} races={races} />
          </Suspense>
        )}
        {tab === "settings" && (
          <Suspense fallback={<LazyFallback />}>
          <Settings settings={settings} setSettings={setSettings}
            switchVirtualMode={switchVirtualMode}
            switchProfile={switchProfile}
            predictions={predictions}        /* Settings は legacy / v2 両方の生件数を見せる */
            visiblePredictions={visiblePredictions}
            versionInfo={versionInfo}
            onPurgeLegacy={() => {
              if (!confirm(`legacy データ ${versionInfo.legacyCount} 件を完全削除します。 v2 データには影響しません。\nよろしいですか?`)) return;
              const { next, removed } = purgeLegacy(predictions);
              setPredictions(next);
              showToast(`🗑 legacy ${removed} 件を削除しました`, "ok");
            }}
            authUser={authUser} onOpenLogin={() => setShowLogin(true)} onLogout={handleLogout}
            syncStatus={syncStatus}
            onManualSync={async () => {
              if (!authUser) return;
              setSyncStatus({ state: "syncing", lastAt: null, error: null, stats: null });
              const res = await fullSync(authUser.id, predictions);
              if (res.merged) setPredictions(res.merged); // ok / partialOk どちらでも採用
              if (res.ok) {
                setSyncStatus({ state: "synced", lastAt: Date.now(), error: null, stats: res.stats });
                showToast("✅ クラウド同期 完了", "ok");
              } else if (res.partialOk) {
                setSyncStatus({ state: "error", lastAt: Date.now(), error: res.error, stats: res.stats });
                showToast("⚠️ 一部失敗 — cloud 取り込みは完了 (push リトライします)", "info");
              } else {
                setSyncStatus({ state: "error", lastAt: Date.now(), error: res.error, stats: null });
                showToast(`❌ 同期失敗: ${res.error}`, "neg");
              }
            }}
            onReset={handleReset} />
          </Suspense>
        )}
        {/* Round 74: 公営競技責任表示 (main の末尾、 全タブで常時表示) */}
        <ComplianceFooter />
      </main>
    </div>
  );
}
