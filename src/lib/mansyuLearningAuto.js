/**
 * 万舟研究所 — 自動学習ループ (SPEC §12 段階 A 前半 / Round 172)
 *
 * 役割: mansyuLearning が出した重み補正提案を、 安全条件を満たした時だけ
 *       自動で mansyuWeights に適用する。 適用前後の履歴を localStorage に残す。
 *       (ロールバックは Round 172.5 で別途実装)
 *
 * 安全条件 (すべて満たす時のみ自動適用):
 *   1. 確定済データが 10 件以上
 *   2. 採用候補の recommendation が「boost / reduce / inverse」 のいずれか
 *   3. 1 日に 1 回しか実行しない (タイムスタンプで多重実行防止)
 *   4. 同じ recommendation を 3 回連続で却下されたら「学習停止」 状態にする
 *      (= 何度提案されても効果がなかったので、 これ以上いじらない)
 *
 * 履歴の構造 (localStorage キー: mansyuLearningHistory, 直近 30 件):
 *   [{
 *     ts: ISO timestamp,
 *     kind: "applied" | "skipped" | "stopped",
 *     reason: 適用 / 却下 / 停止の理由,
 *     sampleSize: 集計に使ったレース数,
 *     before: 適用前の重みオブジェクト (kind=applied のみ),
 *     after:  適用後の重みオブジェクト (kind=applied のみ),
 *     recommendations: 採用 / 却下した recommendation たち,
 *   }]
 */

import { analyzeMansyuLearning } from "./mansyuLearning.js";
import {
  loadMansyuWeights,
  saveMansyuWeights,
  applyAllRecommendations,
  loadVenueWeights,
  saveVenueWeights,
  loadShadowWeights,
  saveShadowWeights,
  clearShadowWeights,
  loadShadowVenueWeights,
  saveShadowVenueWeights,
  clearShadowVenueWeights,
  loadAllShadowVenueWeightsMap,
} from "./mansyuWeights.js";
import { getJudgementLog } from "./mansyuSkipLog.js";
import { TARGET_VENUES } from "./mansyu.js";

/* === Round 187 (SPEC §13.3): シャドー昇格ルール ===
 * 学習結果は本番に即反映せず、 シャドーに保存。
 * SHADOW_PROMOTION_DAYS 日経過したら本番に昇格 (時間ベース・最低限版)。
 * 厳密なバックテスト比較による昇格は Round 187.5 で別途実装。 */
const SHADOW_PROMOTION_DAYS = 7;
const PROMOTE_CHECK_KEY = "mansyuShadowPromoteLastCheck";

const HISTORY_KEY = "mansyuLearningHistory";
const LAST_RUN_KEY = "mansyuLearningLastRun";
const ROLLBACK_CHECK_KEY = "mansyuLearningRollbackLastCheck";
const MAX_HISTORY = 30;
const MIN_SAMPLE = 10;
const STOP_THRESHOLD = 3; // 同じ recommendation を 3 回連続却下で停止

/* === Round 172.5: 自動ロールバック設定 === */
const ROLLBACK_MIN_DAYS = 7;            // 適用後 7 日経過してから判定
const ROLLBACK_MAX_DAYS = 14;           // 適用後 14 日まで判定対象 (それ以降は時効)
const ROLLBACK_MIN_POST_SAMPLE = 5;     // 適用後の確定済データが 5 件未満なら判定保留
const ROLLBACK_DEGRADATION = 0.05;      // 5% 以上悪化したらロールバック

/* === 履歴の読み書き === */
export function getLearningHistory() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pushHistory(entry) {
  try {
    if (typeof localStorage === "undefined") return;
    const list = getLearningHistory();
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

/* === 1 日 1 回チェック === */
function getLastRunDate() {
  try {
    return localStorage.getItem(LAST_RUN_KEY) || null;
  } catch {
    return null;
  }
}

function setLastRunDate(dateStr) {
  try {
    localStorage.setItem(LAST_RUN_KEY, dateStr);
  } catch {
    // ignore
  }
}

/** 今日まだ学習を実行していなければ true */
export function shouldRunLearning() {
  const today = new Date().toISOString().slice(0, 10);
  return getLastRunDate() !== today;
}

/* === 学習停止判定 === */
function isLearningStopped(recommendations) {
  // 直近 STOP_THRESHOLD 件のすべてが「同じ recommendation を却下」 ならば停止
  const history = getLearningHistory();
  if (history.length < STOP_THRESHOLD) return false;
  const recent = history.slice(0, STOP_THRESHOLD);
  if (!recent.every((h) => h.kind === "skipped")) return false;

  // 提案のキーセットがすべて同じか
  const currentKeys = (recommendations || []).map((r) => `${r.key}:${r.kind}`).sort().join(",");
  if (!currentKeys) return false;
  for (const h of recent) {
    const histKeys = (h.recommendations || []).map((r) => `${r.key}:${r.kind}`).sort().join(",");
    if (histKeys !== currentKeys) return false;
  }
  return true;
}

/**
 * 自動学習サイクルを 1 回実行
 *
 * 呼び出し側: App.jsx の useEffect で 1 日 1 回
 *
 * @param {object} predictions  既存予想データ (互換用)
 * @param {Array}  races        当日のレースデータ (互換用)
 * @returns {object} { ran: boolean, kind: string, message: string, history: latest entry }
 */
export function runLearningCycle(predictions, races = []) {
  if (!shouldRunLearning()) {
    return { ran: false, kind: "already_run_today", message: "今日は既に実行済み" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const analysis = analyzeMansyuLearning(predictions, races);

  // ① サンプル不足
  if (!analysis.ready || (analysis.sampleSize || 0) < MIN_SAMPLE) {
    setLastRunDate(today);
    const entry = {
      ts: new Date().toISOString(),
      kind: "skipped",
      reason: `データ不足 (${analysis.sampleSize || 0} / ${MIN_SAMPLE} 件)`,
      sampleSize: analysis.sampleSize || 0,
      recommendations: [],
    };
    pushHistory(entry);
    return { ran: true, kind: "skipped", message: entry.reason, history: entry };
  }

  // ② 提案なし
  const recs = analysis.recommendations || [];
  if (recs.length === 0) {
    setLastRunDate(today);
    const entry = {
      ts: new Date().toISOString(),
      kind: "skipped",
      reason: "重み補正の提案なし (現在の重みは妥当と判断)",
      sampleSize: analysis.sampleSize,
      recommendations: [],
    };
    pushHistory(entry);
    return { ran: true, kind: "skipped", message: entry.reason, history: entry };
  }

  // ③ 学習停止判定 (同じ提案を 3 回連続却下)
  if (isLearningStopped(recs)) {
    setLastRunDate(today);
    const entry = {
      ts: new Date().toISOString(),
      kind: "stopped",
      reason: `同じ提案を ${STOP_THRESHOLD} 回連続で却下 → 学習停止 (人間判断待ち)`,
      sampleSize: analysis.sampleSize,
      recommendations: recs,
    };
    pushHistory(entry);
    return { ran: true, kind: "stopped", message: entry.reason, history: entry };
  }

  // ④ 自動適用
  const before = loadMansyuWeights();
  const after = applyAllRecommendations(recs, before);
  // before と after が完全一致なら適用しない (clamp で実質変化なし)
  const sameAsBefore = Object.keys(before).every((k) => Math.abs((before[k] ?? 1) - (after[k] ?? 1)) < 0.001);
  if (sameAsBefore) {
    setLastRunDate(today);
    const entry = {
      ts: new Date().toISOString(),
      kind: "skipped",
      reason: "提案を適用しても重みに変化なし (clamp 上限・下限到達)",
      sampleSize: analysis.sampleSize,
      recommendations: recs,
    };
    pushHistory(entry);
    return { ran: true, kind: "skipped", message: entry.reason, history: entry };
  }

  /* Round 187: 即本番反映ではなく、 シャドーに保存。 7 日経過後に昇格 (checkAndPromoteShadows) */
  saveShadowWeights(after);
  setLastRunDate(today);
  const entry = {
    ts: new Date().toISOString(),
    appliedDate: today,
    kind: "shadow_applied",
    reason: `${recs.length} 件の提案をシャドー保存 (サンプル ${analysis.sampleSize} 件、 ${SHADOW_PROMOTION_DAYS} 日後に本番昇格判定)`,
    sampleSize: analysis.sampleSize,
    before,
    after,
    recommendations: recs,
    baseline: {
      skipCorrectRate: analysis.skipCorrectRate,
      overHitRate: analysis.overHitRate,
      sampleSize: analysis.sampleSize,
    },
  };
  pushHistory(entry);
  return { ran: true, kind: "shadow_applied", message: entry.reason, history: entry };
}

/* ============================================================================
 * Round 172.5: 自動ロールバック
 * ----------------------------------------------------------------------------
 * 直近の applied エントリから 7-14 日経過した時に、 適用後の見送り正答率 /
 * 見立て正答率 を再集計し、 baseline と比較。 5% 以上悪化していたら前重みに
 * 自動復元する。
 * ============================================================================ */

/* skipLog エントリから「荒れたか」 を判定 (mansyuLearning と同じロジック) */
function isRoughEntry(entry) {
  const r = entry?.result;
  if (!r) return null;
  const payout = r.payout || 0;
  return {
    leaderFlipped: r.first !== 1,
    isMidRough: payout >= 5000,
    isMansyu: payout >= 10000,
    trifectaPayout: payout,
  };
}

/** 指定日以降の skipLog finalized エントリで正答率を再集計 */
function recomputeRatesAfter(sinceDateStr) {
  const all = getJudgementLog().filter((e) => e.finalized && e.result);
  // entry.date が sinceDateStr 以降のもの (= 適用後に判定されたレース)
  const post = all.filter((e) => (e.date || "") > sinceDateStr);
  if (post.length === 0) {
    return { sampleSize: 0, skipCorrectRate: null, overHitRate: null };
  }
  let underScored = 0, correctSkip = 0;
  let overScored = 0, overScoredAndRough = 0;
  for (const entry of post) {
    const result = isRoughEntry(entry);
    if (!result) continue;
    const score = entry.score || 0;
    if (score < 75) {
      underScored++;
      if (!result.isMidRough && !result.leaderFlipped) correctSkip++;
    } else {
      overScored++;
      if (result.isMidRough) overScoredAndRough++;
    }
  }
  return {
    sampleSize: post.length,
    skipCorrectRate: underScored > 0 ? correctSkip / underScored : null,
    overHitRate: overScored > 0 ? overScoredAndRough / overScored : null,
  };
}

/** 経過日数 (today から sinceDateStr まで何日) */
function daysSince(sinceDateStr) {
  if (!sinceDateStr) return null;
  const since = new Date(`${sinceDateStr}T00:00:00`);
  const now = new Date();
  const diffMs = now - since;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/* 今日もうロールバックチェックを走らせたか */
function getLastRollbackCheck() {
  try {
    return localStorage.getItem(ROLLBACK_CHECK_KEY) || null;
  } catch {
    return null;
  }
}
function setLastRollbackCheck(dateStr) {
  try {
    localStorage.setItem(ROLLBACK_CHECK_KEY, dateStr);
  } catch {
    // ignore
  }
}

/**
 * ロールバックチェックを 1 回実行
 *
 * 呼び出し側: App.jsx の useEffect で 1 日 1 回 (runLearningCycle と並走)
 *
 * @returns {object} { ran: boolean, kind: string, message: string, history?: entry }
 */
export function checkAndRollback() {
  const today = new Date().toISOString().slice(0, 10);
  if (getLastRollbackCheck() === today) {
    return { ran: false, kind: "already_checked_today", message: "今日は既にチェック済み" };
  }
  setLastRollbackCheck(today);

  // 直近の applied エントリを探す (rolledback 済はスキップ)
  const history = getLearningHistory();
  const lastApplied = history.find((h) => h.kind === "applied" && !h.rolledBackAt);
  if (!lastApplied) {
    return { ran: true, kind: "no_target", message: "ロールバック対象の applied 履歴なし" };
  }

  const days = daysSince(lastApplied.appliedDate);
  if (days == null) {
    return { ran: true, kind: "invalid_date", message: "applied 日が不明" };
  }
  if (days < ROLLBACK_MIN_DAYS) {
    return { ran: true, kind: "too_early", message: `適用から ${days} 日 (${ROLLBACK_MIN_DAYS} 日待ち)` };
  }
  if (days > ROLLBACK_MAX_DAYS) {
    return { ran: true, kind: "expired", message: `適用から ${days} 日 (${ROLLBACK_MAX_DAYS} 日経過 = 時効)` };
  }

  // 適用後の正答率を再集計
  const post = recomputeRatesAfter(lastApplied.appliedDate);
  if (post.sampleSize < ROLLBACK_MIN_POST_SAMPLE) {
    return {
      ran: true,
      kind: "insufficient_post_sample",
      message: `適用後データ ${post.sampleSize} 件 (${ROLLBACK_MIN_POST_SAMPLE} 件待ち)`,
    };
  }

  const baseline = lastApplied.baseline || {};
  const baseSkip = baseline.skipCorrectRate;
  const baseOver = baseline.overHitRate;

  // どちらかが 5% 以上悪化していればロールバック
  const skipDiff = (baseSkip != null && post.skipCorrectRate != null)
    ? post.skipCorrectRate - baseSkip : null;
  const overDiff = (baseOver != null && post.overHitRate != null)
    ? post.overHitRate - baseOver : null;

  const skipBad = skipDiff != null && skipDiff <= -ROLLBACK_DEGRADATION;
  const overBad = overDiff != null && overDiff <= -ROLLBACK_DEGRADATION;

  if (!skipBad && !overBad) {
    // 効果は維持または改善 → 継続
    const entry = {
      ts: new Date().toISOString(),
      kind: "kept",
      reason: `適用後 ${days} 日 / ${post.sampleSize} 件で効果検証 OK ` +
        `(見送り正答率 ${formatPct(baseSkip)} → ${formatPct(post.skipCorrectRate)} / ` +
        `見立て正答率 ${formatPct(baseOver)} → ${formatPct(post.overHitRate)})`,
      sampleSize: post.sampleSize,
      appliedRef: lastApplied.ts,
      baseline,
      post,
    };
    pushHistory(entry);
    return { ran: true, kind: "kept", message: entry.reason, history: entry };
  }

  // ロールバック実行
  saveMansyuWeights(lastApplied.before);
  // applied エントリに rolledBackAt をマーク (再判定防止)
  markRolledBack(lastApplied.ts);

  const reasons = [];
  if (skipBad) reasons.push(`見送り正答率 ${formatPct(baseSkip)} → ${formatPct(post.skipCorrectRate)} (${formatPctDiff(skipDiff)})`);
  if (overBad) reasons.push(`見立て正答率 ${formatPct(baseOver)} → ${formatPct(post.overHitRate)} (${formatPctDiff(overDiff)})`);
  const entry = {
    ts: new Date().toISOString(),
    kind: "rolledback",
    reason: `効果悪化のため前重みに自動復元 (${reasons.join(" / ")})`,
    sampleSize: post.sampleSize,
    appliedRef: lastApplied.ts,
    baseline,
    post,
    restoredWeights: lastApplied.before,
  };
  pushHistory(entry);
  return { ran: true, kind: "rolledback", message: entry.reason, history: entry };
}

/* applied エントリに rolledBackAt をセット (重複ロールバック防止) */
function markRolledBack(appliedTs) {
  try {
    if (typeof localStorage === "undefined") return;
    const list = getLearningHistory();
    const idx = list.findIndex((h) => h.ts === appliedTs);
    if (idx < 0) return;
    list[idx] = { ...list[idx], rolledBackAt: new Date().toISOString() };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

function formatPct(v) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}
function formatPctDiff(v) {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(0)}pt`;
}

/* === ユーザー画面用: 直近の状態を 1 行で取得 === */
export function getLatestLearningStatus() {
  const list = getLearningHistory();
  if (list.length === 0) return null;
  const latest = list[0];
  return {
    ts: latest.ts,
    kind: latest.kind,
    message: latest.reason,
    sampleSize: latest.sampleSize,
  };
}

/* === デバッグ用: 履歴クリア === */
export function clearLearningHistory() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LAST_RUN_KEY);
    localStorage.removeItem(VENUE_LAST_RUN_KEY);
  } catch {
    // ignore
  }
}

/* ============================================================================
 * Round 182 (SPEC §12 段階 B): 場別学習サイクル
 * ----------------------------------------------------------------------------
 * 5 場 (TARGET_VENUES) それぞれで独立した学習サイクルを 1 日 1 回実行。
 * 全場共通の runLearningCycle と並行して動く。
 * 各場の重みは mansyuVenueWeights (jcd → weights) に保存される。
 * 履歴エントリには jcd フィールド付き ("all" は全場共通、 "01"-"24" は場別)。
 * ロールバックは現状 全場共通のみ (場別ロールバックは Round 182.5 で別途検討)。
 * ============================================================================ */

const VENUE_LAST_RUN_KEY = "mansyuLearningVenueLastRun";

function getVenueLastRunDate() {
  try {
    return localStorage.getItem(VENUE_LAST_RUN_KEY) || null;
  } catch {
    return null;
  }
}
function setVenueLastRunDate(dateStr) {
  try {
    localStorage.setItem(VENUE_LAST_RUN_KEY, dateStr);
  } catch {
    // ignore
  }
}

/** 場別学習を今日まだ実行していないなら true */
export function shouldRunVenueLearning() {
  const today = new Date().toISOString().slice(0, 10);
  return getVenueLastRunDate() !== today;
}

/**
 * 場別学習サイクルを 5 場分一括実行 (1 日 1 回)
 *
 * @param {object} predictions
 * @param {Array}  races
 * @returns {{ ran: boolean, results: Array<{ jcd, kind, message }> }}
 */
export function runVenueLearningCycles(predictions, races = []) {
  if (!shouldRunVenueLearning()) {
    return { ran: false, results: [], message: "今日は既に場別学習を実行済み" };
  }
  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const jcd of TARGET_VENUES) {
    const r = runOneVenueLearning(predictions, races, jcd);
    results.push({ jcd, ...r });
  }
  setVenueLastRunDate(today);
  return { ran: true, results };
}

function runOneVenueLearning(predictions, races, jcd) {
  const analysis = analyzeMansyuLearning(predictions, races, { jcd });
  if (!analysis.ready || (analysis.sampleSize || 0) < MIN_SAMPLE) {
    const entry = {
      ts: new Date().toISOString(),
      jcd,
      kind: "venue_skipped",
      reason: `[場別 ${jcd}] データ不足 (${analysis.sampleSize || 0} / ${MIN_SAMPLE} 件)`,
      sampleSize: analysis.sampleSize || 0,
      recommendations: [],
    };
    pushHistory(entry);
    return { kind: "skipped", message: entry.reason };
  }
  const recs = analysis.recommendations || [];
  if (recs.length === 0) {
    const entry = {
      ts: new Date().toISOString(),
      jcd,
      kind: "venue_skipped",
      reason: `[場別 ${jcd}] 提案なし (現状の場別重みは妥当)`,
      sampleSize: analysis.sampleSize,
      recommendations: [],
    };
    pushHistory(entry);
    return { kind: "skipped", message: entry.reason };
  }

  const before = loadVenueWeights(jcd);
  const after = applyAllRecommendations(recs, before);
  const sameAsBefore = Object.keys(before).every(
    (k) => Math.abs((before[k] ?? 1) - (after[k] ?? 1)) < 0.001
  );
  if (sameAsBefore) {
    const entry = {
      ts: new Date().toISOString(),
      jcd,
      kind: "venue_skipped",
      reason: `[場別 ${jcd}] 提案を適用しても変化なし (clamp 上限/下限)`,
      sampleSize: analysis.sampleSize,
      recommendations: recs,
    };
    pushHistory(entry);
    return { kind: "skipped", message: entry.reason };
  }
  /* Round 187: 場別もシャドーに保存 (7 日後に本番昇格判定) */
  saveShadowVenueWeights(jcd, after);
  const entry = {
    ts: new Date().toISOString(),
    jcd,
    kind: "venue_shadow_applied",
    reason: `[場別 ${jcd}] ${recs.length} 件の提案をシャドー保存 (サンプル ${analysis.sampleSize} 件)`,
    sampleSize: analysis.sampleSize,
    before,
    after,
    recommendations: recs,
    baseline: {
      skipCorrectRate: analysis.skipCorrectRate,
      overHitRate: analysis.overHitRate,
      sampleSize: analysis.sampleSize,
    },
  };
  pushHistory(entry);
  return { kind: "shadow_applied", message: entry.reason };
}

/* ============================================================================
 * Round 187: シャドー → 本番 昇格チェック
 * ----------------------------------------------------------------------------
 * 1 日 1 回チェック。 シャドーの savedDate から SHADOW_PROMOTION_DAYS 日経過したら
 * 本番に昇格 + シャドーをクリア。
 * 厳密な「本番 vs 検証 のバックテスト比較」 による昇格は Round 187.5 で実装予定。
 * 現状は時間ベースの最低限版 (= 「即反映を防ぐ」 安全装置のみ)。
 * ============================================================================ */
function getPromoteLastCheck() {
  try {
    return localStorage.getItem(PROMOTE_CHECK_KEY) || null;
  } catch {
    return null;
  }
}
function setPromoteLastCheck(d) {
  try {
    localStorage.setItem(PROMOTE_CHECK_KEY, d);
  } catch {
    // ignore
  }
}

export function checkAndPromoteShadows() {
  const today = new Date().toISOString().slice(0, 10);
  if (getPromoteLastCheck() === today) {
    return { ran: false, kind: "already_checked_today", results: [] };
  }
  setPromoteLastCheck(today);
  const results = [];

  // 全場共通シャドー
  const shadow = loadShadowWeights();
  if (shadow && shadow.savedDate) {
    const days = daysBetween(shadow.savedDate, today);
    if (days >= SHADOW_PROMOTION_DAYS) {
      // 本番に昇格
      saveMansyuWeights(shadow.weights);
      clearShadowWeights();
      const entry = {
        ts: new Date().toISOString(),
        kind: "shadow_promoted",
        reason: `シャドー (${shadow.savedDate} 保存、 ${days} 日経過) を本番に昇格`,
        promotedWeights: shadow.weights,
      };
      pushHistory(entry);
      results.push({ scope: "all", kind: "promoted", days });
    }
  }

  // 場別シャドー
  const allShadowVenue = loadAllShadowVenueWeightsMap();
  for (const [jcd, sv] of Object.entries(allShadowVenue || {})) {
    if (!sv?.savedDate) continue;
    const days = daysBetween(sv.savedDate, today);
    if (days >= SHADOW_PROMOTION_DAYS) {
      saveVenueWeights(jcd, sv.weights);
      clearShadowVenueWeights(jcd);
      const entry = {
        ts: new Date().toISOString(),
        jcd,
        kind: "venue_shadow_promoted",
        reason: `[場別 ${jcd}] シャドー (${sv.savedDate} 保存、 ${days} 日経過) を本番に昇格`,
        promotedWeights: sv.weights,
      };
      pushHistory(entry);
      results.push({ scope: jcd, kind: "promoted", days });
    }
  }

  return { ran: true, kind: results.length > 0 ? "promoted" : "none", results };
}

function daysBetween(fromDateStr, toDateStr) {
  const a = new Date(`${fromDateStr}T00:00:00`);
  const b = new Date(`${toDateStr}T00:00:00`);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}
