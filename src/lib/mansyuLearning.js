/**
 * 万舟研究所 — 万舟向け学習ロジック (Round 164 / Phase 2 / Round 166 fix)
 *
 * Round 166: データソースを mansyuSkipLog に切替。
 *   旧実装は predictions.mansyuSnapshot を読んでいたが、 これは保存されないため
 *   永久に「データ 0 件」 になる致命バグがあった。
 *   mansyuSkipLog は MansyuTop が races を見るたびに自動で全件記録しているので
 *   そこから読めば 1 日目から学習が回る。
 *
 * 集計対象:
 *   ① 荒れスコア (mansyu) の各成分 × 「実際の荒れ」 の相関
 *   ② 見送りログ: 荒れスコアが低かったレースで実際に荒れたか
 *   ③ スコア重み補正の提案
 *
 * 「荒れ」 の定義:
 *   ・1 号艇が 1 着でない (= 本命飛び)
 *   ・3 連単配当 ≥ 5,000 円 (中穴以上)
 *   ・万舟 = 3 連単配当 ≥ 10,000 円
 */

import { scoreMansyu } from "./mansyu.js";
import { getJudgementLog } from "./mansyuSkipLog.js";

/* === skip log エントリから「荒れたか」 を判定 === */
function isRoughEntry(entry) {
  const r = entry?.result;
  if (!r) return null; // 結果未確定
  const payout = r.payout || 0;
  return {
    leaderFlipped: r.first !== 1,
    isMidRough: payout >= 5000,
    isMansyu: payout >= 10000,
    isMegaMansyu: payout >= 50000,
    trifectaPayout: payout,
  };
}

/* === 旧 predictions ベースの judge (互換用) ===
   レガシー予想が混ざっている場合のフォールバック。 */
function isRoughResult(prediction) {
  const r = prediction?.result;
  if (!r?.first) return null;
  const trifectaPayout = (r.payouts?.trifecta && r.payouts.trifecta[`${r.first}-${r.second}-${r.third}`]) || 0;
  return {
    leaderFlipped: r.first !== 1,
    isMidRough: trifectaPayout >= 5000,
    isMansyu: trifectaPayout >= 10000,
    isMegaMansyu: trifectaPayout >= 50000,
    trifectaPayout,
  };
}

function extractMansyuScore(prediction, racesById) {
  if (prediction?.mansyuSnapshot) return prediction.mansyuSnapshot;
  const race = racesById?.[prediction.raceId] || prediction.raceSnapshot;
  if (!race) return null;
  return scoreMansyu(race);
}

/**
 * メイン: 万舟学習結果を分析
 *
 * Round 166: 主データソースを mansyuSkipLog の確定済エントリに変更。
 * 旧 predictions も 1 件だけある場合は補助的に統合 (互換)。
 *
 * @param {object} predictions  互換用 (使わないが API は残す)
 * @param {Array}  races        互換用 (使わないが API は残す)
 * @returns {object}
 */
export function analyzeMansyuLearning(predictions, races = []) {
  // 主データソース: mansyuSkipLog の finalized エントリ
  const allLog = getJudgementLog();
  const finalizedLog = allLog.filter((e) => e.finalized && e.result);
  const totalLog = allLog.length;

  // 補助: 旧 predictions も読み込み (mansyuSnapshot がある場合のみ集計対象に入れる)
  const racesById = {};
  for (const r of races || []) {
    if (r?.id) racesById[r.id] = r;
  }
  const legacySettled = Object.values(predictions || {})
    .filter((p) => p?.result?.first);

  if (finalizedLog.length < 5) {
    return {
      ready: false,
      sampleSize: finalizedLog.length,
      totalLogged: totalLog,
      remaining: Math.max(0, 5 - finalizedLog.length),
      components: null,
      skipAnalysis: null,
      recommendations: [],
      summary: `分析待ち: 結果確定 ${finalizedLog.length} 件 / 監視中 ${totalLog} 件 (5 件以上で簡易分析、 10 件以上で安定)`,
    };
  }

  /* ① 各成分のスコア × 「荒れたか」 のクロス集計 */
  const COMPONENT_KEYS = ["entry", "weather", "leader", "attackers", "exhibition", "odds"];
  const components = {};
  for (const key of COMPONENT_KEYS) {
    components[key] = {
      label: COMPONENT_LABELS[key],
      max: COMPONENT_MAX[key],
      high: { count: 0, rough: 0, mansyu: 0 },
      mid:  { count: 0, rough: 0, mansyu: 0 },
      low:  { count: 0, rough: 0, mansyu: 0 },
    };
  }

  const skipAnalysis = {
    underScored: 0,
    underScoredButRough: 0,
    underScoredButMansyu: 0,
    correctSkip: 0,
    overScored: 0,
    overScoredAndRough: 0,
    overScoredButCalm: 0,
  };

  let totalAnalyzed = 0;

  // 主ループ: skip log の finalized エントリを集計
  for (const entry of finalizedLog) {
    const result = isRoughEntry(entry);
    if (!result) continue;
    totalAnalyzed++;
    const parts = entry.parts || {};
    for (const key of COMPONENT_KEYS) {
      const partScore = parts[key] ?? 0;
      const max = COMPONENT_MAX[key];
      const ratio = max > 0 ? partScore / max : 0;
      const tier = ratio >= 0.70 ? "high" : ratio >= 0.40 ? "mid" : "low";
      components[key][tier].count++;
      if (result.isMidRough) components[key][tier].rough++;
      if (result.isMansyu)   components[key][tier].mansyu++;
    }
    const score = entry.score || 0;
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

  // 補助ループ: 旧 predictions も統合 (mansyuSnapshot 経由)
  for (const p of legacySettled) {
    const mansyu = extractMansyuScore(p, racesById);
    if (!mansyu) continue;
    const result = isRoughResult(p);
    if (!result) continue;
    totalAnalyzed++;
    for (const key of COMPONENT_KEYS) {
      const partScore = mansyu.parts?.[key]?.score ?? 0;
      const max = COMPONENT_MAX[key];
      const ratio = max > 0 ? partScore / max : 0;
      const tier = ratio >= 0.70 ? "high" : ratio >= 0.40 ? "mid" : "low";
      components[key][tier].count++;
      if (result.isMidRough) components[key][tier].rough++;
      if (result.isMansyu)   components[key][tier].mansyu++;
    }
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
 * Round 166-fix: 主データソースを mansyuSkipLog に切替 (analyzeMansyuLearning と統合)。
 * 旧 predictions も mansyuSnapshot がある場合は補助的に統合。
 *
 * @returns {Array<{ prediction, mansyu, result }>}
 *   ・prediction: { date, jcd, raceNo, venue, startTime, result: { first, second, third } }
 *   ・mansyu:     { score, parts: { entry: {score}, ... } }
 *   ・result:     { leaderFlipped, isMidRough, isMansyu, isMegaMansyu, trifectaPayout }
 */
export function findMissedRoughRaces(predictions, races = []) {
  const racesById = {};
  for (const r of races || []) {
    if (r?.id) racesById[r.id] = r;
  }
  const out = [];
  const seen = new Set();   // (date, jcd, raceNo) の重複排除

  // ① 主: mansyuSkipLog の確定済 + 75 未満 + 中穴以上
  const log = getJudgementLog();
  for (const e of log) {
    if (!e.finalized || !e.result) continue;
    if ((e.score || 0) >= 75) continue;
    const result = isRoughEntry(e);
    if (!result || !result.isMidRough) continue;
    const dedupKey = `${e.date}_${e.jcd}_${e.raceNo}`;
    seen.add(dedupKey);
    out.push({
      prediction: {
        key: e.key,
        date: e.date,
        jcd: e.jcd,
        raceNo: e.raceNo,
        venue: e.venue,
        startTime: e.startTime,
        result: {
          first: e.result.first,
          second: e.result.second,
          third: e.result.third,
        },
      },
      mansyu: {
        score: e.score,
        level: e.level,
        parts: {
          entry:      { score: e.parts?.entry      ?? 0 },
          weather:    { score: e.parts?.weather    ?? 0 },
          leader:     { score: e.parts?.leader     ?? 0 },
          attackers:  { score: e.parts?.attackers  ?? 0 },
          exhibition: { score: e.parts?.exhibition ?? 0 },
          odds:       { score: e.parts?.odds       ?? 0 },
        },
        boost: e.boost || 0,
      },
      result,
    });
  }

  // ② 補助: 旧 predictions に mansyuSnapshot が乗っているケース
  for (const p of Object.values(predictions || {})) {
    if (!p?.result?.first) continue;
    const mansyu = extractMansyuScore(p, racesById);
    if (!mansyu) continue;
    if (mansyu.score >= 75) continue;
    const result = isRoughResult(p);
    if (!result || !result.isMidRough) continue;
    const dedupKey = `${p.date}_${p.jcd}_${p.raceNo}`;
    if (seen.has(dedupKey)) continue; // skipLog 側で既に拾っているのでスキップ
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
