/**
 * 万舟研究所 — 万舟向け学習ロジック (Round 164 / Phase 2)
 *
 * 過去の確定済み predictions から:
 *   ① 荒れスコア (mansyu) の各成分が「実際の荒れ」 と相関するか集計
 *   ② 見送りログ: 荒れスコアが低かったレースで実際は荒れたか / 万舟出たか
 *   ③ スコア重み補正の提案: 各成分の「効いてるか」 / 「効いてないか」 を判定
 *
 * 「荒れ」 の定義:
 *   ・1号艇が 1 着でない (= 本命飛び)
 *   ・3 連単配当 ≥ 5,000 円 (中穴以上)
 *   ・万舟 = 3 連単配当 ≥ 10,000 円
 *
 * 入力:
 *   predictions: localStorage の予想記録
 *   races: 現在のレース一覧 (scoreMansyu 再計算用、 オプショナル)
 *
 * 出力 (analyzeMansyuLearning):
 *   { ready, sampleSize, components, skipAnalysis, recommendations }
 */

import { scoreMansyu } from "./mansyu.js";

/* === 「荒れた」 判定 === */
function isRoughResult(prediction) {
  const r = prediction?.result;
  if (!r?.first) return null;        // 結果未確定
  const trifectaPayout = (r.payouts?.trifecta && r.payouts.trifecta[`${r.first}-${r.second}-${r.third}`]) || 0;
  return {
    leaderFlipped: r.first !== 1,                       // 1号艇 1 着失敗
    isMidRough: trifectaPayout >= 5000,                  // 中穴以上
    isMansyu: trifectaPayout >= 10000,                   // 万舟
    isMegaMansyu: trifectaPayout >= 50000,               // 超万舟
    trifectaPayout,
  };
}

/* === predictions から scoreMansyu を取り出す ===
   ・prediction.mansyuSnapshot があればそれを使う (Round 164 で保存予定)
   ・無ければ prediction の boats / weather / odds スナップショットから再計算 */
function extractMansyuScore(prediction, racesById) {
  if (prediction?.mansyuSnapshot) return prediction.mansyuSnapshot;
  // race 情報があれば再計算
  const race = racesById?.[prediction.raceId] || prediction.raceSnapshot;
  if (!race) return null;
  return scoreMansyu(race);
}

/**
 * メイン: 万舟学習結果を分析
 *
 * @param {object} predictions
 * @param {Array} races (optional) — scoreMansyu 再計算用
 * @returns {object}
 */
export function analyzeMansyuLearning(predictions, races = []) {
  const racesById = {};
  for (const r of races || []) {
    if (r?.id) racesById[r.id] = r;
  }

  // 確定済の予想 (skip + buy 両方)
  const settled = Object.values(predictions || {})
    .filter((p) => p?.result?.first);

  if (settled.length < 5) {
    return {
      ready: false,
      sampleSize: settled.length,
      remaining: 5 - settled.length,
      components: null,
      skipAnalysis: null,
      recommendations: [],
      summary: `データが ${settled.length} 件 (10 件で安定した分析、 5 件以上で簡易分析)`,
    };
  }

  /* ① 各成分のスコア × 「荒れたか」 のクロス集計 */
  const COMPONENT_KEYS = ["entry", "weather", "leader", "attackers", "exhibition", "odds"];
  const components = {};
  for (const key of COMPONENT_KEYS) {
    components[key] = {
      label: COMPONENT_LABELS[key],
      max: COMPONENT_MAX[key],
      // 高 (>= 70%) / 中 (40〜69%) / 低 (< 40%) の 3 階級で集計
      high: { count: 0, rough: 0, mansyu: 0 },
      mid:  { count: 0, rough: 0, mansyu: 0 },
      low:  { count: 0, rough: 0, mansyu: 0 },
    };
  }

  // ② 見送り分析 (荒れスコア < 75 のレースで実際は荒れたか)
  const skipAnalysis = {
    underScored: 0,         // スコア < 75 だったレース数
    underScoredButRough: 0, // そのうち実際に荒れた (誤って見送った)
    underScoredButMansyu: 0,// そのうち万舟が出た
    correctSkip: 0,         // スコア < 75 で実際も荒れず (見送り正解)
    overScored: 0,          // スコア >= 75 で表示したレース数
    overScoredAndRough: 0,  // そのうち実際に荒れた (見立て正解)
    overScoredButCalm: 0,   // そのうち荒れなかった (見立てミス)
  };

  let totalAnalyzed = 0;

  for (const p of settled) {
    const mansyu = extractMansyuScore(p, racesById);
    if (!mansyu) continue;
    const result = isRoughResult(p);
    if (!result) continue;
    totalAnalyzed++;

    // 各成分の階級別集計
    for (const key of COMPONENT_KEYS) {
      const partScore = mansyu.parts?.[key]?.score ?? 0;
      const max = COMPONENT_MAX[key];
      const ratio = max > 0 ? partScore / max : 0;
      const tier = ratio >= 0.70 ? "high" : ratio >= 0.40 ? "mid" : "low";
      components[key][tier].count++;
      if (result.isMidRough) components[key][tier].rough++;
      if (result.isMansyu)   components[key][tier].mansyu++;
    }

    // 見送り判定
    const score = mansyu.score || 0;
    if (score < 75) {
      skipAnalysis.underScored++;
      if (result.isMidRough) skipAnalysis.underScoredButRough++;
      if (result.isMansyu)   skipAnalysis.underScoredButMansyu++;
      if (!result.isMidRough && !result.leaderFlipped) skipAnalysis.correctSkip++;
    } else {
      skipAnalysis.overScored++;
      if (result.isMidRough) skipAnalysis.overScoredAndRough++;
      else                   skipAnalysis.overScoredButCalm++;
    }
  }

  /* ③ 重み補正の提案 */
  const recommendations = [];
  for (const key of COMPONENT_KEYS) {
    const c = components[key];
    const highRoughRate = c.high.count >= 3
      ? c.high.rough / c.high.count : null;
    const lowRoughRate = c.low.count >= 3
      ? c.low.rough / c.low.count : null;
    if (highRoughRate != null && lowRoughRate != null) {
      const diff = highRoughRate - lowRoughRate;
      if (diff >= 0.30) {
        recommendations.push({
          key, label: COMPONENT_LABELS[key],
          kind: "boost",
          diff: +(diff * 100).toFixed(0),
          message: `${COMPONENT_LABELS[key]} スコア高い時の荒れ率 ${(highRoughRate * 100).toFixed(0)}% vs 低い時 ${(lowRoughRate * 100).toFixed(0)}% — よく効いている / 重み +1〜2 を提案`,
        });
      } else if (diff <= 0.05 && (c.high.count + c.low.count) >= 8) {
        recommendations.push({
          key, label: COMPONENT_LABELS[key],
          kind: "reduce",
          diff: +(diff * 100).toFixed(0),
          message: `${COMPONENT_LABELS[key]} は高低で荒れ率 ${(highRoughRate * 100).toFixed(0)}% vs ${(lowRoughRate * 100).toFixed(0)}% — 効いていない / 重み -1〜2 を提案`,
        });
      } else if (diff < 0) {
        recommendations.push({
          key, label: COMPONENT_LABELS[key],
          kind: "inverse",
          diff: +(diff * 100).toFixed(0),
          message: `${COMPONENT_LABELS[key]} は高い時のほうが荒れ率が低い (${(highRoughRate * 100).toFixed(0)}% vs ${(lowRoughRate * 100).toFixed(0)}%) — 逆相関の可能性 / 見直し推奨`,
        });
      }
    }
  }

  // 見送り正答率
  const skipTotal = skipAnalysis.underScored;
  const skipCorrectRate = skipTotal > 0 ? skipAnalysis.correctSkip / skipTotal : null;
  // 見立て正答率 (高スコアレースで実際に荒れたか)
  const overTotal = skipAnalysis.overScored;
  const overHitRate = overTotal > 0 ? skipAnalysis.overScoredAndRough / overTotal : null;

  return {
    ready: true,
    sampleSize: totalAnalyzed,
    components,
    skipAnalysis,
    skipCorrectRate,
    overHitRate,
    recommendations,
    summary: buildSummary({
      sampleSize: totalAnalyzed,
      skipAnalysis,
      skipCorrectRate,
      overHitRate,
    }),
  };
}

const COMPONENT_LABELS = {
  entry:      "進入不安",
  weather:    "強風・波",
  leader:     "1号艇不安",
  attackers:  "攻め手存在",
  exhibition: "展示異変",
  odds:       "オッズ妙味",
};
const COMPONENT_MAX = {
  entry: 20, weather: 15, leader: 20, attackers: 20, exhibition: 15, odds: 10,
};

function buildSummary({ sampleSize, skipAnalysis, skipCorrectRate, overHitRate }) {
  const lines = [];
  lines.push(`分析対象 ${sampleSize} 件`);
  if (overHitRate != null) {
    lines.push(`荒れスコア 75+ レースの的中率 ${(overHitRate * 100).toFixed(0)}% (${skipAnalysis.overScoredAndRough}/${skipAnalysis.overScored})`);
  }
  if (skipCorrectRate != null) {
    lines.push(`見送り正答率 ${(skipCorrectRate * 100).toFixed(0)}% (${skipAnalysis.correctSkip}/${skipAnalysis.underScored})`);
  }
  if (skipAnalysis.underScoredButMansyu > 0) {
    lines.push(`⚠️ 見送ったレースで万舟 ${skipAnalysis.underScoredButMansyu} 件 — 取りこぼし`);
  }
  return lines.join(" / ");
}

/**
 * 見送り研究データ: 荒れスコア < 75 だったが実際は荒れたレースを抽出
 *
 * @returns {Array<{ prediction, mansyu, result }>}
 */
export function findMissedRoughRaces(predictions, races = []) {
  const racesById = {};
  for (const r of races || []) {
    if (r?.id) racesById[r.id] = r;
  }
  const out = [];
  for (const p of Object.values(predictions || {})) {
    if (!p?.result?.first) continue;
    const mansyu = extractMansyuScore(p, racesById);
    if (!mansyu) continue;
    if (mansyu.score >= 75) continue; // 見立てた分は除外
    const result = isRoughResult(p);
    if (!result) continue;
    if (!result.isMidRough) continue; // 荒れていない分は除外
    out.push({ prediction: p, mansyu, result });
  }
  // 配当の高い順
  out.sort((a, b) => b.result.trifectaPayout - a.result.trifectaPayout);
  return out;
}

/**
 * 見送り判定でも保存しておくべきレースを取得 (Round 164)
 * predictions に scoreMansyu スナップショットを保存する想定。
 * 既存実装と整合させるためのヘルパー。
 */
export function buildSkipSnapshot(race) {
  if (!race) return null;
  const m = scoreMansyu(race);
  if (!m) return null;
  return {
    score: m.score,
    level: m.level,
    parts: {
      entry: { score: m.parts.entry.score },
      weather: { score: m.parts.weather.score },
      leader: { score: m.parts.leader.score },
      attackers: { score: m.parts.attackers.score },
      exhibition: { score: m.parts.exhibition.score },
      odds: { score: m.parts.odds.score },
    },
    boost: m.boost,
    mansyuRating: m.mansyuRating,
  };
}
