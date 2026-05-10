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

const MIDROUGH_PAYOUT = 5000; // この配当以上で「中穴+」 扱い

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
