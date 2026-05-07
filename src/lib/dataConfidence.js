/**
 * Round 144: 予想根拠の 「データの厚さ」 評価
 *
 * 買い判定の自信スコア (confidence) は EV や根拠数などの「予想ロジック上の自信」 を見る。
 * 一方こちらは 「どれだけ多くの情報源から判断したか」 = メタ信頼度を見る。
 *
 * 例:
 *   ・出走表 + オッズ + 展示 + ST 展示 + 風波 + コース別実績 + 直近成績
 *     + 当日傾向 + 公式予想印 が全部揃ってる → ★★★★★
 *   ・必須 (出走表/オッズ/展示/ST/風波) のみ → ★★★
 *   ・必須が一部欠けている → ★★ 以下
 *
 * 「同じ買い判定でも、 データが薄いものは慎重に」 をユーザーが判断できる。
 */

const REQUIRED_SOURCES = ["出走表", "オッズ", "展示タイム", "ST展示", "風波"];
const SUPPLEMENT_SOURCES = [
  "選手コース別実績",   // Round 121
  "直近3節成績",         // Round 123
  "当日傾向",             // Round 130
  "公式予想印",           // Round 143
];

/**
 * @param {object} race - { boats, odds, wind, wave, dailyTrend, ... }
 * @returns {{ stars, label, sources, missing, requiredFulfilled, supplementCount }}
 */
export function computeDataConfidence(race) {
  if (!race) {
    return { stars: 0, label: "未評価", sources: [], missing: REQUIRED_SOURCES.slice(), requiredFulfilled: 0, supplementCount: 0 };
  }
  const sources = [];
  const missing = [];

  // 必須 5 つ
  if (Array.isArray(race.boats) && race.boats.length === 6) sources.push("出走表");
  else missing.push("出走表");

  if (race.odds?.trifecta || race.odds?.exacta || race.odds?.quinella) sources.push("オッズ");
  else missing.push("オッズ");

  const hasExhibition = (race.boats || []).some((b) => b?.exTime != null);
  if (hasExhibition) sources.push("展示タイム");
  else missing.push("展示タイム");

  const hasStartEx = (race.boats || []).some((b) => b?.exST != null || b?.startEx != null);
  if (hasStartEx) sources.push("ST展示");
  else missing.push("ST展示");

  if (race.wind != null && race.wave != null) sources.push("風波");
  else missing.push("風波");

  // 補助 (Round 121-143 で追加された情報)
  const hasCourse = (race.boats || []).some((b) => Array.isArray(b?.courseStats) && b.courseStats.length > 0);
  if (hasCourse) sources.push("選手コース別実績");

  const hasRecent = (race.boats || []).some((b) => b?.recentForm && (b.recentForm.count || 0) > 0);
  if (hasRecent) sources.push("直近3節成績");

  if (race.dailyTrend && (race.dailyTrend.sampleSize || 0) >= 3) sources.push("当日傾向");

  const hasForecast = (race.boats || []).some((b) => b?.forecastMark);
  if (hasForecast) sources.push("公式予想印");

  const requiredFulfilled = REQUIRED_SOURCES.filter((s) => sources.includes(s)).length;
  const supplementCount = sources.length - requiredFulfilled;

  // 星評価
  //   必須 5 → 補助 0:★3 / 1:★4 / 2:★4 / 3-4:★5
  //   必須 4 → ★2 (1 つ欠けて減点)
  //   必須 3 → ★1
  //   必須 2 以下 → ★0 (買い判定に使えない)
  let stars = 0;
  if (requiredFulfilled === 5) {
    if (supplementCount >= 3) stars = 5;
    else if (supplementCount >= 1) stars = 4;
    else stars = 3;
  } else if (requiredFulfilled === 4) {
    stars = 2;
  } else if (requiredFulfilled === 3) {
    stars = 1;
  }

  const labelMap = {
    5: "★★★★★ 完全データ",
    4: "★★★★ データ厚い",
    3: "★★★ 標準",
    2: "★★ やや薄い",
    1: "★ データ不足気味",
    0: "× データ不足",
  };

  return {
    stars,
    label: labelMap[stars],
    sources,
    missing,
    requiredFulfilled,
    supplementCount,
  };
}
