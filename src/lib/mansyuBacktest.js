/**
 * バックテスト集計 (Round 186 / SPEC §13.2)
 *
 * 過去 mansyuSkipLog から「予想がどれくらい当たったか」 を 5 指標で集計する。
 * これがあるから「感覚で良くなった」 を排除できる (= shoug 必須要件)。
 *
 * 5 指標:
 *   ① 的中率: show 判定したレースのうち、 実際に的中 (買い目が当たった) 割合
 *   ② 回収率: virtualPnl.totalReturn の合計 ÷ totalStake の合計
 *   ③ 期待値: 1 レースあたりの平均 pnl
 *   ④ 最大連敗: 連続して hits=0 だった show 判定レース数の最大値
 *   ⑤ 見送り精度: skip 判定したレースで実際に堅かった (中穴未満) 割合
 *
 * 入力:
 *   - 過去 N 日 (days)
 *   - jcd フィルタ (省略時は全場混合)
 *
 * 出力:
 *   - 各指標 + サンプル数 + 期間メタ情報
 */

import { getJudgementLog } from "./mansyuSkipLog.js";
import { scoreMansyu } from "./mansyu.js";

const MIDROUGH_PAYOUT = 5000; // この配当以上で「中穴+」 扱い

/* === Round 187.5: snapshot から擬似 race オブジェクトを再構築 ===
 * scoreMansyu に渡せる形にする (シャドー重みでの再評価用)。 */
export function rebuildRaceFromSnapshot(entry) {
  if (!entry?.snapshot) return null;
  const s = entry.snapshot;
  return {
    id: entry.key,
    date: entry.date,
    jcd: entry.jcd,
    raceNo: entry.raceNo,
    venue: entry.venue,
    startTime: entry.startTime,
    weather: s.weather,
    wind: s.wind,
    windDir: s.windDir,
    wave: s.wave,
    boats: s.boats || [],
    apiOdds: s.apiOdds,
    officialForecast: s.officialForecast,
  };
}

/**
 * バックテスト集計を実行
 *
 * @param {object} opts
 *   - days: 7 | 14 | 30 | "all" (default: 30)
 *   - jcd: 場別フィルタ (省略時は全場混合)
 *
 * @returns {object} 集計結果
 */
export function runBacktest(opts = {}) {
  const { days = 30, jcd = null } = opts;
  const all = getJudgementLog();
  const finalized = all.filter((e) => e.finalized && e.result);
  // 期間フィルタ (今日から N 日以内)
  const cutoff = days === "all"
    ? null
    : daysAgoString(days);
  const inRange = cutoff
    ? finalized.filter((e) => (e.date || "") >= cutoff)
    : finalized;
  // 場別フィルタ
  const filtered = jcd
    ? inRange.filter((e) => String(e.jcd).padStart(2, "0") === String(jcd).padStart(2, "0"))
    : inRange;

  if (filtered.length === 0) {
    return emptyResult({ days, jcd, message: "対象データなし (まだ確定したレースがありません)" });
  }

  // show 判定エントリ
  const showEntries = filtered.filter((e) => e.judgement === "show");
  // skip 判定エントリ
  const skipEntries = filtered.filter((e) => e.judgement === "skip");

  // ① 的中率 (show のうち hits >= 1)
  const showWithBuy = showEntries.filter((e) => e.virtualPnl);
  const hitCount = showWithBuy.filter((e) => (e.virtualPnl?.hits || 0) >= 1).length;
  const hitRate = showWithBuy.length > 0 ? hitCount / showWithBuy.length : null;

  // ② 回収率 (合計配当 ÷ 合計投入)
  let totalStake = 0, totalReturn = 0;
  for (const e of showWithBuy) {
    totalStake += e.virtualPnl?.totalStake || 0;
    totalReturn += e.virtualPnl?.totalReturn || 0;
  }
  const roi = totalStake > 0 ? totalReturn / totalStake : null;

  // ③ 期待値 (1 レースあたりの平均 pnl)
  const totalPnl = showWithBuy.reduce((acc, e) => acc + (e.virtualPnl?.pnl || 0), 0);
  const avgPnl = showWithBuy.length > 0 ? totalPnl / showWithBuy.length : null;

  // ④ 最大連敗 (時系列順で連続 hits=0)
  const orderedShow = [...showWithBuy].sort((a, b) => {
    const ad = a.date + String(a.raceNo || "0").padStart(2, "0");
    const bd = b.date + String(b.raceNo || "0").padStart(2, "0");
    return ad.localeCompare(bd);
  });
  let curStreak = 0, maxStreak = 0;
  for (const e of orderedShow) {
    if ((e.virtualPnl?.hits || 0) === 0) {
      curStreak += 1;
      if (curStreak > maxStreak) maxStreak = curStreak;
    } else {
      curStreak = 0;
    }
  }
  const maxLosingStreak = orderedShow.length > 0 ? maxStreak : null;

  // ⑤ 見送り精度 (skip 判定で実際に堅かった = 配当 < 5000)
  const skipWithResult = skipEntries.filter((e) => e.result);
  const correctSkip = skipWithResult.filter((e) => (e.result?.payout || 0) < MIDROUGH_PAYOUT).length;
  const skipAccuracy = skipWithResult.length > 0 ? correctSkip / skipWithResult.length : null;

  return {
    ready: true,
    days,
    jcd,
    sampleSize: filtered.length,
    showCount: showEntries.length,
    showWithBuyCount: showWithBuy.length,
    skipCount: skipEntries.length,
    skipWithResultCount: skipWithResult.length,
    hitRate,
    hitCount,
    roi,
    totalStake,
    totalReturn,
    totalPnl,
    avgPnl,
    maxLosingStreak,
    skipAccuracy,
    correctSkip,
    message: showWithBuy.length === 0 && filtered.length > 0
      ? "判定データはあるが、 買い目スナップショット (Round 185+) が無いため回収率算出不可"
      : null,
  };
}

function emptyResult({ days, jcd, message }) {
  return {
    ready: false,
    days, jcd,
    sampleSize: 0,
    showCount: 0,
    showWithBuyCount: 0,
    skipCount: 0,
    skipWithResultCount: 0,
    hitRate: null,
    roi: null,
    avgPnl: null,
    maxLosingStreak: null,
    skipAccuracy: null,
    message,
  };
}

function daysAgoString(days) {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

/* ============================================================================
 * Round 187.5: シャドー比較用バックテスト
 * ----------------------------------------------------------------------------
 * 任意の重み (weights) で過去 snapshot を再評価し、
 * 「その重みなら show / skip 判定はどうだったか」 を再計算する。
 * show 判定したエントリの virtualPnl (= 保存時の買い目に対する実払戻) を集計。
 *
 * 注意: virtualPnl は「保存時の buyOrders」 を使う (重みを変えても買い目自体は変わらない)。
 *       完全な再シミュレーションではないが、 「どのレースを show と判定するか」 の
 *       目利き能力の比較として十分。
 * ============================================================================ */
export function runBacktestWithWeights(opts = {}) {
  const { days = 14, jcd = null, weights = null } = opts;
  if (!weights) {
    return { ...emptyResult({ days, jcd, message: "重み未指定" }), method: "shadow" };
  }
  const all = getJudgementLog();
  const finalizedWithSnapshot = all.filter(
    (e) => e.finalized && e.result && e.snapshot && e.virtualPnl
  );
  // 期間フィルタ
  const cutoff = days === "all" ? null : daysAgoString(days);
  const inRange = cutoff
    ? finalizedWithSnapshot.filter((e) => (e.date || "") >= cutoff)
    : finalizedWithSnapshot;
  // 場別フィルタ
  const filtered = jcd
    ? inRange.filter((e) => String(e.jcd).padStart(2, "0") === String(jcd).padStart(2, "0"))
    : inRange;

  if (filtered.length === 0) {
    return { ...emptyResult({ days, jcd, message: "snapshot 持ち確定データなし" }), method: "shadow" };
  }

  // 各エントリを weights で再評価 → show 判定だけ集計
  let showCount = 0, hitCount = 0;
  let totalStake = 0, totalReturn = 0, totalPnl = 0;
  const showWithBuyEntries = [];

  for (const entry of filtered) {
    const race = rebuildRaceFromSnapshot(entry);
    if (!race) continue;
    const sr = scoreMansyu(race, weights);
    if (!sr) continue;
    const judgement = sr.score >= 75 ? "show" : "skip";
    if (judgement !== "show") continue;
    showCount++;
    if ((entry.virtualPnl?.hits || 0) >= 1) hitCount++;
    totalStake += entry.virtualPnl?.totalStake || 0;
    totalReturn += entry.virtualPnl?.totalReturn || 0;
    totalPnl += entry.virtualPnl?.pnl || 0;
    showWithBuyEntries.push(entry);
  }

  const hitRate = showCount > 0 ? hitCount / showCount : null;
  const roi = totalStake > 0 ? totalReturn / totalStake : null;
  const avgPnl = showCount > 0 ? totalPnl / showCount : null;

  // 最大連敗
  const ordered = [...showWithBuyEntries].sort((a, b) => {
    const ad = a.date + String(a.raceNo || "0").padStart(2, "0");
    const bd = b.date + String(b.raceNo || "0").padStart(2, "0");
    return ad.localeCompare(bd);
  });
  let curStreak = 0, maxStreak = 0;
  for (const e of ordered) {
    if ((e.virtualPnl?.hits || 0) === 0) {
      curStreak += 1;
      if (curStreak > maxStreak) maxStreak = curStreak;
    } else {
      curStreak = 0;
    }
  }

  return {
    method: "shadow",
    ready: true,
    days, jcd,
    sampleSize: filtered.length,
    showCount,
    showWithBuyCount: showCount,
    hitRate, hitCount,
    roi,
    totalStake, totalReturn,
    totalPnl,
    avgPnl,
    maxLosingStreak: ordered.length > 0 ? maxStreak : null,
    skipAccuracy: null, // skip 側の集計は省略 (シャドー比較では show 側だけ重要)
    message: null,
  };
}
