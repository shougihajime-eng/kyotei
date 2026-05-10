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

/* ===== Round 182 (SPEC §12 段階 B): 場別重み =====
 * localStorage キー `mansyuVenueWeights` に { jcd: weights } 形式で保存。
 * 各場ごとに独立した重みを持てる (戸田は風重視、 江戸川は潮重視 等)。
 * 場別重みが存在しない場合は全場共通の loadMansyuWeights() にフォールバック。 */

const VENUE_WEIGHTS_KEY = "mansyuVenueWeights";

function loadAllVenueWeights() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(VENUE_WEIGHTS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveAllVenueWeights(map) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(VENUE_WEIGHTS_KEY, JSON.stringify(map || {}));
    return true;
  } catch {
    return false;
  }
}

/** 1 場の重みを取得。 未設定なら全場共通の重みを返す (フォールバック)。 */
export function loadVenueWeights(jcd) {
  if (!jcd) return loadMansyuWeights();
  const all = loadAllVenueWeights();
  const w = all[jcd];
  if (!w) return loadMansyuWeights(); // フォールバック
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    if (typeof w[k] === "number" && isFinite(w[k])) {
      out[k] = clamp(w[k]);
    }
  }
  return out;
}

/** 1 場の重みを保存 */
export function saveVenueWeights(jcd, weights) {
  if (!jcd) return false;
  const all = loadAllVenueWeights();
  const safe = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    if (weights && typeof weights[k] === "number" && isFinite(weights[k])) {
      safe[k] = clamp(weights[k]);
    }
  }
  all[jcd] = safe;
  return saveAllVenueWeights(all);
}

/** 1 場の重みをデフォルト (= 場別設定削除 → 全場共通にフォールバック) */
export function resetVenueWeights(jcd) {
  if (!jcd) return false;
  const all = loadAllVenueWeights();
  delete all[jcd];
  return saveAllVenueWeights(all);
}

/** すべての場の重みマップを取得 (デバッグ・UI 表示用) */
export function loadAllVenueWeightsMap() {
  return loadAllVenueWeights();
}

/* ===== Round 187 (SPEC §13.3): シャドーモード ===========================
 * 学習結果は本番 (mansyuWeights / mansyuVenueWeights) に即反映せず、
 * シャドー (mansyuShadowWeights / mansyuShadowVenueWeights) に保存。
 * 7 日経過 (= 効果検証期間) を経て本番に昇格する。
 * shoug 必須要件「学習をいきなり本番反映するな」 に準拠。
 * ======================================================================= */

const SHADOW_WEIGHTS_KEY = "mansyuShadowWeights";
const SHADOW_VENUE_WEIGHTS_KEY = "mansyuShadowVenueWeights";

/** 全場共通シャドー重みを取得 (なければ null) */
export function loadShadowWeights() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SHADOW_WEIGHTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw); // { weights, savedDate }
  } catch {
    return null;
  }
}

/** 全場共通シャドー重みを保存 (savedDate = 今日 YYYY-MM-DD) */
export function saveShadowWeights(weights) {
  try {
    if (typeof localStorage === "undefined") return false;
    const safe = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (weights && typeof weights[k] === "number" && isFinite(weights[k])) {
        safe[k] = clamp(weights[k]);
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(SHADOW_WEIGHTS_KEY, JSON.stringify({ weights: safe, savedDate: today }));
    return true;
  } catch {
    return false;
  }
}

/** 全場共通シャドーをクリア (昇格 or 破棄後に呼ぶ) */
export function clearShadowWeights() {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.removeItem(SHADOW_WEIGHTS_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 1 場のシャドー重みを取得 */
export function loadShadowVenueWeights(jcd) {
  if (!jcd) return null;
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SHADOW_VENUE_WEIGHTS_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all && all[jcd] ? all[jcd] : null; // { weights, savedDate }
  } catch {
    return null;
  }
}

/** 1 場のシャドー重みを保存 */
export function saveShadowVenueWeights(jcd, weights) {
  if (!jcd) return false;
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(SHADOW_VENUE_WEIGHTS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const safe = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (weights && typeof weights[k] === "number" && isFinite(weights[k])) {
        safe[k] = clamp(weights[k]);
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    all[jcd] = { weights: safe, savedDate: today };
    localStorage.setItem(SHADOW_VENUE_WEIGHTS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** 1 場のシャドーをクリア */
export function clearShadowVenueWeights(jcd) {
  if (!jcd) return false;
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(SHADOW_VENUE_WEIGHTS_KEY);
    if (!raw) return true;
    const all = JSON.parse(raw);
    delete all[jcd];
    localStorage.setItem(SHADOW_VENUE_WEIGHTS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** 全シャドー (デバッグ・UI 表示用) */
export function loadAllShadowVenueWeightsMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(SHADOW_VENUE_WEIGHTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
