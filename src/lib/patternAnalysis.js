/**
 * Round 136: 得意/苦手パターンの自動抽出
 *
 * 過去の確定済 buy 予想を「会場類型 × 1号艇1着確率 × 風 × スタイル」 でクロス集計し、
 * 件数 3 件以上で ROI が高い/低い組合せを抽出する。
 *
 * 既存 learning.js の analyzeStrengthsAndWeaknesses は単一軸 (会場 / 艇番 / スタイル / 券種) のみ。
 * Round 136 ではより細かい「条件の組合せ」 で得意/苦手を見る。
 *
 * 返り値:
 *   { hasEnough, sampleSize, bestPatterns: [...], worstPatterns: [...] }
 */

/* 会場タイプ分類 (venueBias.js の VENUE_PROFILE と整合) */
const VENUE_TYPE_MAP = {
  // イン強 (inAdv >= +3)
  "12": "イン強", "13": "イン強", "18": "イン強", "21": "イン強", "24": "イン強",
  // イン弱 (inAdv <= -3)
  "02": "イン弱", "10": "イン弱", "11": "イン弱",
};
function venueType(jcd) {
  return VENUE_TYPE_MAP[jcd] || "中庸";
}

function inProbBucket(p) {
  if (p == null || isNaN(p)) return null;
  if (p >= 0.55) return "イン濃厚";
  if (p >= 0.40) return "イン中庸";
  return "イン薄";
}

function windBucket(w) {
  if (w == null || isNaN(w)) return null;
  return w >= 4 ? "強風" : "穏やか";
}

const STYLE_LABELS = {
  steady: "🛡️安定",
  balanced: "⚖️バランス",
  aggressive: "🎯攻め",
};

/**
 * パターン分析。
 * @param {object} predictions - localStorage の predictions
 * @returns {{ hasEnough, sampleSize, bestPatterns, worstPatterns, allPatterns }}
 */
export function analyzePatterns(predictions) {
  const settled = Object.values(predictions || {})
    .filter((p) => p?.result?.first && p?.decision === "buy" && (p?.totalStake || 0) > 0);
  if (settled.length < 10) {
    return {
      hasEnough: false,
      sampleSize: settled.length,
      remaining: 10 - settled.length,
      bestPatterns: [],
      worstPatterns: [],
      allPatterns: [],
    };
  }

  const buckets = new Map();
  for (const p of settled) {
    // probs[0] = 1号艇 1 着確率 (predictions 保存時のスナップショット)
    const inProb = Array.isArray(p.probs) && p.probs.length > 0 ? p.probs[0] : null;
    const wind = p.weatherSnapshot?.wind;
    const venue = venueType(p.jcd);
    const inB = inProbBucket(inProb);
    const wB = windBucket(wind);
    const style = STYLE_LABELS[p.profile] || p.profile || "balanced";
    if (!inB || !wB) continue;

    const key = `${venue} × ${inB} × ${wB} × ${style}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }

  const summarized = [];
  for (const [pattern, arr] of buckets) {
    if (arr.length < 3) continue;
    let stake = 0, ret = 0, hits = 0;
    for (const p of arr) {
      stake += p.totalStake || 0;
      ret += p.payout || 0;
      if (p.hit) hits++;
    }
    const roi = stake > 0 ? ret / stake : 0;
    const hitRate = arr.length > 0 ? hits / arr.length : 0;
    summarized.push({
      pattern,
      count: arr.length,
      stake,
      ret,
      pnl: ret - stake,
      roi: +roi.toFixed(3),
      hitRate: +hitRate.toFixed(3),
    });
  }
  summarized.sort((a, b) => b.roi - a.roi);

  return {
    hasEnough: true,
    sampleSize: settled.length,
    bestPatterns: summarized.filter((s) => s.roi >= 1.0).slice(0, 5),
    worstPatterns: summarized.filter((s) => s.roi < 0.85).slice(-5).reverse(),
    allPatterns: summarized,
  };
}

/* === Round 137: レースを今のスタイル・状況でパターンキー化 ===
   patternAnalysis の結果と照合して 「これは得意/苦手パターンか」 を判定する。 */
export function getPatternKeyForRace(race, ev, profile) {
  if (!race || !profile) return null;
  const inProb = Array.isArray(ev?.probs) && ev.probs.length > 0 ? ev.probs[0] : null;
  const venue = venueType(race.jcd);
  const inB = inProbBucket(inProb);
  const wB = windBucket(race.wind);
  const style = STYLE_LABELS[profile] || profile;
  if (!inB || !wB || !venue || !style) return null;
  return `${venue} × ${inB} × ${wB} × ${style}`;
}

/**
 * レースを得意/苦手パターンに照合する。
 * @returns { kind: "best" | "worst" | "neutral" | null, pattern, roi, count, hitRate }
 */
export function classifyRaceByPattern(race, ev, profile, analyzeResult) {
  if (!analyzeResult?.hasEnough) return null;
  const key = getPatternKeyForRace(race, ev, profile);
  if (!key) return null;
  const found = analyzeResult.allPatterns.find((p) => p.pattern === key);
  if (!found) return { kind: "neutral", pattern: key, roi: null, count: 0, hitRate: null };
  let kind = "neutral";
  if (found.roi >= 1.0) kind = "best";
  else if (found.roi < 0.85) kind = "worst";
  return { kind, ...found };
}
