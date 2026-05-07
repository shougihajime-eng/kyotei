/**
 * Round 129: 当日リアルタイム補正
 *
 * 当日の確定済レース結果から会場別の傾向を計算し、 残りレースの予想に反映する。
 *
 * 思想:
 *   ・午前のレースで「今日この会場は荒れてる」 と分かれば、 午後のレースは
 *     1 号艇への信頼を下げて穴狙いを強める。
 *   ・午前で「1 号艇逃げ多発」 なら、 午後も 1 号艇を厚く評価する。
 *   ・データ不足 (3 件未満) なら補正なし。
 *   ・補正は控えめ (±5% 以内) で過度な動きを避ける。
 */

/**
 * 当日のその会場の傾向を計算する。
 *
 * @param {object} predictions  - localStorage の predictions
 * @param {string} jcd          - 会場コード ("01" 〜 "24")
 * @param {string} today        - "YYYY-MM-DD"
 * @returns {{
 *   sampleSize, inWinRate, avgFirst, highPayoutRate, isRoughDay, isStableDay
 * } | null}
 */
export function computeDailyTrend(predictions, jcd, today) {
  if (!predictions || !jcd || !today) return null;
  const records = Object.values(predictions).filter((p) =>
    p?.jcd === jcd && p?.date === today && p?.result?.first
  );
  if (records.length < 3) return null;

  const inWins = records.filter((p) => +p.result.first === 1).length;
  const inWinRate = inWins / records.length;
  const avgFirst = records.reduce((s, p) => s + (+p.result.first || 0), 0) / records.length;

  // 高配当 (3 連単 1 万円超) の頻度
  const highPayouts = records.filter((p) => {
    const tri = p.result?.payouts?.trifecta || {};
    const values = Object.values(tri).filter((v) => typeof v === "number");
    const max = values.length > 0 ? Math.max(...values) : 0;
    return max >= 10000;
  }).length;
  const highPayoutRate = highPayouts / records.length;

  return {
    sampleSize: records.length,
    inWinRate: +inWinRate.toFixed(3),
    avgFirst: +avgFirst.toFixed(2),
    highPayoutRate: +highPayoutRate.toFixed(3),
    isRoughDay: inWinRate < 0.40 || highPayoutRate >= 0.50,
    isStableDay: inWinRate >= 0.65 && highPayoutRate < 0.20,
  };
}

/**
 * scoreBoat 内で使う補正係数を返す。
 *   ・今日荒れ気味の会場: 1 号艇 -5% / 外艇 (4-6) +4%
 *   ・今日堅い会場: 1 号艇 +4% / 外艇 -2%
 *   ・どちらでもない: 補正なし
 *
 * @param {object} boat   - { boatNo, ... }
 * @param {object} trend  - computeDailyTrend の返り値
 * @returns {{ mod, reason }}
 */
export function dailyTrendMod(boat, trend) {
  if (!trend || trend.sampleSize < 3) return { mod: 1.0, reason: null };
  const bno = boat?.boatNo;
  if (!bno) return { mod: 1.0, reason: null };
  const inPct = Math.round(trend.inWinRate * 100);
  if (trend.isRoughDay) {
    if (bno === 1) return {
      mod: 0.95,
      reason: { kind: "neg", text: `今日この会場 荒れ気味 (1号艇1着率 ${inPct}%) → 1号艇 -5%` },
    };
    if (bno >= 4) return {
      mod: 1.04,
      reason: { kind: "pos", text: `今日この会場 荒れ気味 → 外艇 +4%` },
    };
  }
  if (trend.isStableDay) {
    if (bno === 1) return {
      mod: 1.04,
      reason: { kind: "pos", text: `今日この会場 堅い (1号艇1着率 ${inPct}%) → 1号艇 +4%` },
    };
    if (bno >= 4) return {
      mod: 0.98,
      reason: { kind: "neg", text: `今日この会場 堅い (1号艇1着率 ${inPct}%) → 外艇 -2%` },
    };
  }
  return { mod: 1.0, reason: null };
}
