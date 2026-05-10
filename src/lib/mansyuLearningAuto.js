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
} from "./mansyuWeights.js";

const HISTORY_KEY = "mansyuLearningHistory";
const LAST_RUN_KEY = "mansyuLearningLastRun";
const MAX_HISTORY = 30;
const MIN_SAMPLE = 10;
const STOP_THRESHOLD = 3; // 同じ recommendation を 3 回連続却下で停止

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

  saveMansyuWeights(after);
  setLastRunDate(today);
  const entry = {
    ts: new Date().toISOString(),
    kind: "applied",
    reason: `${recs.length} 件の提案を自動適用 (サンプル ${analysis.sampleSize} 件)`,
    sampleSize: analysis.sampleSize,
    before,
    after,
    recommendations: recs,
  };
  pushHistory(entry);
  return { ran: true, kind: "applied", message: entry.reason, history: entry };
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
  } catch {
    // ignore
  }
}
