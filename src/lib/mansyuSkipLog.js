/**
 * 万舟研究所 — 見送りログ (Phase 2 / 学習基盤)
 *
 * 目的:
 *   ・「荒れスコア < 75 で見送ったレース」 の判断を全件残す。
 *   ・あとから結果と突き合わせて 「見送って正解 / 万舟見逃し」 を測れるようにする。
 *   ・将来の自己学習 (Phase 2 後半) はこのログを教師データとして使う。
 *
 * 設計:
 *   ・localStorage キー: `manfuneSkipLog` (旧 kyotei 系とは独立)
 *   ・直近 30 日分のみ保持 (それ以上は GC)
 *   ・各エントリは race の (date, jcd, raceNo) で一意
 *   ・finalized=true になったあとはスコアやスタンスを再計算しない
 *     (判断時点の重みで評価するため)
 *
 * 万舟しきい値:
 *   ・3 連単払戻 5,000 円以上 (= 50 倍以上) を 「万舟」 扱い。
 *   ・本格的な万舟 (10,000+) はあとで grading で分けたいので payout もそのまま保存。
 */

const SKIP_LOG_KEY = "manfuneSkipLog";
const MAX_LOG_DAYS = 30;
const MANSYU_PAYOUT_THRESHOLD = 5000;

/* === ユーティリティ === */
export function makeKey(race) {
  if (!race?.date || !race?.jcd || race?.raceNo == null) return null;
  const d = String(race.date).replaceAll("-", "");
  const jcd = String(race.jcd).padStart(2, "0");
  return `${d}_${jcd}_${race.raceNo}`;
}

function loadLog() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SKIP_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(SKIP_LOG_KEY, JSON.stringify(log));
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[mansyuSkipLog] save failed:", e);
    return false;
  }
}

function pruneOld(log, maxDays = MAX_LOG_DAYS) {
  const cutoff = new Date(Date.now() - maxDays * 86400_000).toISOString().slice(0, 10);
  return log.filter((e) => (e.date || "0000-00-00") >= cutoff);
}

function entryFromScore(race, sr, prev) {
  const judgement = sr.score >= 75 ? "show" : "skip";
  return {
    key: makeKey(race),
    date: race.date,
    jcd: String(race.jcd).padStart(2, "0"),
    raceNo: race.raceNo,
    venue: race.venue,
    startTime: race.startTime,
    score: sr.score,
    level: sr.level,
    rating: sr.mansyuRating,
    judgement,
    focus: (sr.focus || []).slice(0, 3).map((f) => ({ boatNo: f.boatNo, score: f.score })),
    parts: {
      entry: sr.parts?.entry?.score ?? 0,
      weather: sr.parts?.weather?.score ?? 0,
      leader: sr.parts?.leader?.score ?? 0,
      attackers: sr.parts?.attackers?.score ?? 0,
      exhibition: sr.parts?.exhibition?.score ?? 0,
      odds: sr.parts?.odds?.score ?? 0,
    },
    boost: sr.boost || 0,
    recordedAt: prev?.recordedAt ?? Date.now(),
    updatedAt: Date.now(),
    result: prev?.result ?? null,
    isMissedMansyu: prev?.isMissedMansyu ?? null,
    finalized: prev?.finalized ?? false,
  };
}

/* === 1 件分の判断を記録 (idempotent) === */
export function recordJudgement(race, scoreResult) {
  if (!race || !scoreResult) return false;
  const key = makeKey(race);
  if (!key) return false;
  const log = loadLog();
  const idx = log.findIndex((e) => e.key === key);
  const prev = idx >= 0 ? log[idx] : null;
  // 確定済みエントリは再計算しない (= 判断時点の状態を保つ)
  if (prev?.finalized) return false;
  const next = entryFromScore(race, scoreResult, prev);
  if (idx >= 0) log[idx] = next;
  else log.push(next);
  return saveLog(pruneOld(log));
}

/* === バッチ記録 (1 回の更新で全レースを判定) === */
export function recordBatch(races, scoreFn) {
  if (!Array.isArray(races) || typeof scoreFn !== "function") return 0;
  const log = loadLog();
  const map = new Map(log.map((e) => [e.key, e]));
  let touched = 0;
  for (const race of races) {
    const key = makeKey(race);
    if (!key) continue;
    const prev = map.get(key);
    if (prev?.finalized) continue;        // 確定済はスキップ
    const sr = scoreFn(race);
    if (!sr) continue;
    const next = entryFromScore(race, sr, prev);
    map.set(key, next);
    touched++;
  }
  const all = pruneOld(Array.from(map.values()));
  saveLog(all);
  return touched;
}

/* === 結果が判明したエントリに反映 (一回限り) === */
export function attachResult(race) {
  if (!race?.result?.first) return false;
  const key = makeKey(race);
  if (!key) return false;
  const log = loadLog();
  const idx = log.findIndex((e) => e.key === key);
  if (idx < 0) return false;
  const entry = log[idx];
  if (entry.finalized) return false;
  // 払戻金額の取り出し方は API レスポンス次第なので複数の場所をフォールバック
  const payout =
    race?.result?.payout3t ??
    race?.result?.trifectaPayout ??
    race?.payouts?.trifecta ??
    race?.payouts?.["3t"] ??
    race?.result?.payouts?.["3t"] ??
    null;
  const order = `${race.result.first}-${race.result.second}-${race.result.third}`;
  log[idx] = {
    ...entry,
    result: {
      first: race.result.first,
      second: race.result.second,
      third: race.result.third,
      order,
      payout,
    },
    isMissedMansyu:
      entry.judgement === "skip" && payout != null && payout >= MANSYU_PAYOUT_THRESHOLD,
    finalized: true,
    updatedAt: Date.now(),
  };
  return saveLog(log);
}

/* === バッチで結果反映 === */
export function attachResultsBatch(races) {
  let n = 0;
  for (const r of races || []) {
    if (attachResult(r)) n++;
  }
  return n;
}

/* === 取得系 === */
export function getJudgementLog() {
  return loadLog();
}

export function getSkipLog() {
  return loadLog().filter((e) => e.judgement === "skip");
}

export function getShownLog() {
  return loadLog().filter((e) => e.judgement === "show");
}

export function getMissedMansyu() {
  return loadLog().filter((e) => e.judgement === "skip" && e.isMissedMansyu === true);
}

export function getTodayJudgementLog(date) {
  const today = date || new Date().toISOString().slice(0, 10);
  return loadLog().filter((e) => e.date === today);
}

/* === 集計サマリ ===
   ・skippedFinal: 結果まで判明している見送り件数 (= 検証可能な母数)
   ・missedRatio = missedMansyu / skippedFinal
     → 値が低いほど 「見送り判断は正解だった」 ということになる。 */
export function summarizeSkipPerformance(opts = {}) {
  const { days = null } = opts;
  let log = loadLog();
  if (days != null) {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    log = log.filter((e) => (e.date || "") >= cutoff);
  }
  const skipped = log.filter((e) => e.judgement === "skip");
  const shown = log.filter((e) => e.judgement === "show");
  const skippedFinal = skipped.filter((e) => e.finalized);
  const shownFinal = shown.filter((e) => e.finalized);
  const missed = skippedFinal.filter((e) => e.isMissedMansyu);
  const missedPayoutSum = missed.reduce((s, e) => s + (e.result?.payout || 0), 0);
  const avgMissedPayout = missed.length > 0 ? Math.round(missedPayoutSum / missed.length) : 0;
  return {
    totalRaces: log.length,
    skipped: skipped.length,
    shown: shown.length,
    skippedFinal: skippedFinal.length,
    shownFinal: shownFinal.length,
    missedMansyu: missed.length,
    missedRatio: skippedFinal.length > 0 ? missed.length / skippedFinal.length : null,
    missedPayoutSum,
    avgMissedPayout,
    threshold: MANSYU_PAYOUT_THRESHOLD,
  };
}

/* === UI 用ショートカット === */
export function getTodaySkipCount(date) {
  return getTodayJudgementLog(date).filter((e) => e.judgement === "skip").length;
}

export function getTodayMissedCount(date) {
  return getTodayJudgementLog(date).filter((e) => e.judgement === "skip" && e.isMissedMansyu).length;
}

/* === 完全クリア (デバッグ・テスト用) === */
export function clearSkipLog() {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.removeItem(SKIP_LOG_KEY);
    return true;
  } catch {
    return false;
  }
}

export const _internals = { SKIP_LOG_KEY, MAX_LOG_DAYS, MANSYU_PAYOUT_THRESHOLD };
