/**
 * 万舟研究所 — 重み係数の保存/読み込み (Round 166 / Phase 2.5)
 *
 * 各成分のスコア (entry/weather/leader/attackers/exhibition/odds) に掛ける係数を
 * localStorage に保存し、 scoreMansyu の計算に反映する。
 *
 * 既定値はすべて 1.0 (補正なし)。
 * 学習結果から ±0.10〜0.20 の範囲で安全に調整する。
 *
 * MansyuLab の重み補正提案 (boost/reduce/inverse) を 「適用」 ボタンで保存する。
 */

const KEY = "mansyuWeights";
const DEFAULT_WEIGHTS = {
  entry: 1.0,
  weather: 1.0,
  leader: 1.0,
  attackers: 1.0,
  exhibition: 1.0,
  odds: 1.0,
};
const MIN_WEIGHT = 0.5;  // 過剰な減点を防ぐ
const MAX_WEIGHT = 1.5;  // 過剰な加点を防ぐ

/** 現在の重みを読み込む (localStorage 経由)。 失敗時は既定値。 */
export function loadMansyuWeights() {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_WEIGHTS };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WEIGHTS };
    const obj = JSON.parse(raw);
    const out = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (typeof obj[k] === "number" && isFinite(obj[k])) {
        out[k] = clamp(obj[k]);
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

/** 重みを保存する。 範囲外の値は clamp。 失敗時は false。 */
export function saveMansyuWeights(weights) {
  try {
    if (typeof localStorage === "undefined") return false;
    const safe = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (weights && typeof weights[k] === "number" && isFinite(weights[k])) {
        safe[k] = clamp(weights[k]);
      }
    }
    localStorage.setItem(KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

/** 重みをデフォルトに戻す */
export function resetMansyuWeights() {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** 学習結果の recommendations を実重み変更に変換 */
export function applyRecommendation(recommendation, currentWeights) {
  const next = { ...currentWeights };
  const k = recommendation.key;
  if (!Object.prototype.hasOwnProperty.call(next, k)) return next;
  if (recommendation.kind === "boost") {
    next[k] = clamp(next[k] + 0.10);
  } else if (recommendation.kind === "reduce") {
    next[k] = clamp(next[k] - 0.10);
  } else if (recommendation.kind === "inverse") {
    // 逆相関: 大きく下げる
    next[k] = clamp(next[k] - 0.20);
  }
  return next;
}

/** 全提案を一括適用 */
export function applyAllRecommendations(recommendations, currentWeights) {
  let next = { ...currentWeights };
  for (const r of recommendations || []) {
    next = applyRecommendation(r, next);
  }
  return next;
}

function clamp(v) {
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, v));
}

export const MANSYU_WEIGHT_DEFAULTS = DEFAULT_WEIGHTS;
export const MANSYU_WEIGHT_RANGE = { min: MIN_WEIGHT, max: MAX_WEIGHT };
