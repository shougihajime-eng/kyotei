/**
 * 万舟研究所 — 荒れスコア計算ロジック
 *
 * 「1号艇が飛ぶ」「人気艇が危ない」 = 高配当が出そうなレースを検出する。
 * 全レースを予想しない。荒れる条件が揃った時だけ表示する。
 *
 * 配点 (合計 100):
 *   進入不安       20
 *   強風・波       15
 *   1号艇不安要素 20
 *   攻め手存在     20
 *   展示異変       15
 *   オッズ妙味     10
 *
 * 判定:
 *   85+ : 激荒れ警報
 *   75-84: 荒れ注意
 *   74- : 通常 (表示しない)
 */

/* === 対象 5 場 (jcd) ===
   戸田 02 / 江戸川 03 / 平和島 04 / 鳴門 14 / 桐生 01 */
export const TARGET_VENUES = ["01", "02", "03", "04", "14"];

export function isTargetVenue(jcd) {
  return TARGET_VENUES.includes(String(jcd || "").padStart(2, "0"));
}

/** 場ごとの基礎荒れ係数 (場の特性で初期点を引き上げる) */
const VENUE_BASE = {
  "01": { name: "桐生",   bias: { entry: 3, wind: 4 }, note: "ナイター・強風で荒れやすい" },
  "02": { name: "戸田",   bias: { entry: 8, wind: 1 }, note: "全国一狭く進入崩れ多発" },
  "03": { name: "江戸川", bias: { entry: 6, wind: 3 }, note: "潮位・うねりで荒水面" },
  "04": { name: "平和島", bias: { entry: 2, wind: 4 }, note: "風の影響を強く受ける" },
  "14": { name: "鳴門",   bias: { entry: 3, wind: 3 }, note: "潮で大荒れの実績" },
};

/* === スコア計算 (各カテゴリ 0..max) === */

/** 進入不安 (max 20) */
function scoreEntry(race) {
  let s = 0;
  const reasons = [];
  const jcd = String(race?.jcd || "").padStart(2, "0");
  const venueBias = VENUE_BASE[jcd]?.bias?.entry || 0;
  if (venueBias > 0) {
    s += venueBias;
    if (venueBias >= 6) reasons.push(`${VENUE_BASE[jcd].name}は進入崩れの巣`);
    else reasons.push(`${VENUE_BASE[jcd].name}は進入が安定しない`);
  }
  const boats = race?.boats || [];
  const b1 = boats[0];
  if (b1?.ST != null && b1.ST >= 0.18) {
    s += 5;
    reasons.push("1号艇のST遅い (深インの兆候)");
  }
  if (b1 && (b1.class === "B1" || b1.class === "B2")) {
    s += 4;
    reasons.push(`1号艇が${b1.class}級で進入で逃げる`);
  }
  // 4-6号艇に「前付けタイプ」 (鋭いST) が居る
  const frontPress = boats.slice(3).some((b) => b?.ST != null && b.ST <= 0.14);
  if (frontPress) {
    s += 5;
    reasons.push("4-6号艇に前付けの動きあり");
  }
  return { score: Math.min(20, s), reasons };
}

/** 強風・波 (max 15) */
function scoreWeather(race) {
  let s = 0;
  const reasons = [];
  const wind = +race?.wind || 0;
  const wave = +race?.wave || 0;
  const dir = race?.windDir || "";
  if (wind >= 9) { s += 10; reasons.push(`強風 ${wind}m`); }
  else if (wind >= 7) { s += 7; reasons.push(`強い風 ${wind}m`); }
  else if (wind >= 5) { s += 3; reasons.push(`風 ${wind}m`); }
  if (wave >= 10) { s += 6; reasons.push(`高波 ${wave}cm`); }
  else if (wave >= 6) { s += 3; reasons.push(`波 ${wave}cm`); }
  if ((race?.weather || "").includes("雨")) { s += 2; reasons.push("雨"); }
  if (wind >= 5 && (dir.includes("向かい") || dir.includes("追い"))) {
    s += 2;
    reasons.push(`${dir}が効く`);
  }
  // 場の風影響
  const jcd = String(race?.jcd || "").padStart(2, "0");
  const venueBias = VENUE_BASE[jcd]?.bias?.wind || 0;
  if (venueBias > 0 && wind >= 4) {
    s += Math.min(3, venueBias);
    reasons.push(`${VENUE_BASE[jcd].name}は風で水面荒れる`);
  }
  return { score: Math.min(15, s), reasons };
}

/** 1号艇不安要素 (max 20) */
function scoreLeaderRisk(race) {
  let s = 0;
  const reasons = [];
  const b1 = race?.boats?.[0];
  if (!b1) return { score: 0, reasons };
  if (b1.class === "B2") { s += 8; reasons.push("1号艇B2級"); }
  else if (b1.class === "B1") { s += 5; reasons.push("1号艇B1級"); }
  else if (b1.class === "A2") { s += 2; reasons.push("1号艇A2級"); }
  if (b1.winRate != null && b1.winRate < 5.0) { s += 4; reasons.push(`1号艇勝率 ${b1.winRate}`); }
  else if (b1.winRate != null && b1.winRate < 5.8) { s += 2; }
  if (b1.localWinRate != null && b1.localWinRate < 4.5) { s += 3; reasons.push(`1号艇当地勝率 ${b1.localWinRate}`); }
  if (b1.motor2 != null && b1.motor2 < 28) { s += 3; reasons.push(`1号艇モーター${b1.motor2}%`); }
  else if (b1.motor2 != null && b1.motor2 < 32) { s += 1; }
  if (b1.exTime != null && b1.exTime >= 6.85) { s += 3; reasons.push(`1号艇展示${b1.exTime}遅い`); }
  return { score: Math.min(20, s), reasons };
}

/** 攻め手存在 (max 20) */
function scoreAttackers(race) {
  let s = 0;
  const reasons = [];
  const boats = race?.boats || [];
  const focus = []; // 注目艇 (boatNo)
  for (let i = 1; i < Math.min(4, boats.length); i++) {
    const b = boats[i];
    if (!b) continue;
    let local = 0;
    let why = [];
    if (b.class === "A1") { local += 5; why.push("A1"); }
    else if (b.class === "A2") { local += 2; }
    if (b.winRate != null && b.winRate >= 6.5) { local += 4; why.push(`勝率${b.winRate}`); }
    else if (b.winRate != null && b.winRate >= 6.0) { local += 2; }
    if (b.ST != null && b.ST <= 0.14) { local += 3; why.push(`ST${b.ST}`); }
    if (b.motor2 != null && b.motor2 >= 40) { local += 2; why.push(`モ${b.motor2}%`); }
    if (b.localWinRate != null && b.localWinRate >= 6.0) { local += 2; why.push("地元実績"); }
    // 4号艇 (カド) で強ければボーナス
    if (i === 3 && local >= 5) { local += 2; why.unshift("カド"); }
    if (local >= 4) {
      focus.push({ boatNo: b.boatNo, racer: b.racer, score: local, tags: why });
    }
    s += local;
  }
  if (focus.length > 0) {
    const top = focus.sort((a, b) => b.score - a.score).slice(0, 2);
    reasons.push(`攻め手: ${top.map((f) => `${f.boatNo}号艇 (${f.tags.join("/")})`).join("、")}`);
  }
  return { score: Math.min(20, s), reasons, focus };
}

/** 展示異変 (max 15) */
function scoreExhibition(race) {
  let s = 0;
  const reasons = [];
  const boats = race?.boats || [];
  const b1 = boats[0];
  if (!b1) return { score: 0, reasons };
  // 1号艇の展示タイムが他艇平均より遅い
  const exTimes = boats.map((b) => +b?.exTime).filter((x) => x > 0);
  if (b1.exTime != null && exTimes.length >= 4) {
    const avg = exTimes.reduce((a, b) => a + b, 0) / exTimes.length;
    if (b1.exTime - avg >= 0.10) {
      s += 6;
      reasons.push(`1号艇展示が他艇より${(b1.exTime - avg).toFixed(2)}遅い`);
    } else if (b1.exTime - avg >= 0.05) {
      s += 3;
    }
  }
  // 1号艇の部品交換 (モーター気配の変化)
  if (Array.isArray(b1.partsExchange) && b1.partsExchange.length > 0) {
    s += 3;
    reasons.push(`1号艇 部品交換 (${b1.partsExchange.slice(0, 2).join("/")})`);
  }
  // 1号艇の展示メモにネガ語
  const note = String(b1.exhibitionNote || "");
  if (note && /弱|悪|不安|遅|乗り遅れ|出ない|出足悪/.test(note)) {
    s += 4;
    reasons.push(`1号艇 展示メモ「${note.slice(0, 12)}」`);
  }
  // 2-4 号艇に展示快調 (展示タイム+メモ良)
  for (let i = 1; i < 4; i++) {
    const b = boats[i];
    if (!b) continue;
    if (b.exTime != null && b1.exTime != null && b.exTime <= b1.exTime - 0.10) {
      s += 2;
      reasons.push(`${b.boatNo}号艇 展示快調`);
      break;
    }
  }
  return { score: Math.min(15, s), reasons };
}

/** オッズ妙味 (max 10) — 1号艇に過剰人気が集中している */
function scoreOddsBias(race) {
  let s = 0;
  const reasons = [];
  const winOdds = race?.apiOdds?.win || {};
  const o1 = +winOdds["1"];
  if (!o1) return { score: 0, reasons };
  if (o1 < 1.3) { s += 6; reasons.push(`1号艇単勝${o1.toFixed(1)} (過剰人気)`); }
  else if (o1 < 1.5) { s += 4; reasons.push(`1号艇単勝${o1.toFixed(1)}`); }
  else if (o1 < 1.8) { s += 2; }
  // 2-6 号艇のオッズが軒並み高い (= 配当妙味)
  const others = [2, 3, 4, 5, 6].map((n) => +winOdds[String(n)]).filter((x) => x > 0);
  if (others.length >= 3) {
    const min = Math.min(...others);
    if (min >= 5.5) { s += 3; reasons.push(`他艇単勝が薄い (最安${min.toFixed(1)})`); }
    else if (min >= 4.0) { s += 1; }
  }
  return { score: Math.min(10, s), reasons };
}

/** Round 166: 重み係数を成分スコアに掛けるヘルパー
 *   ・係数 1.0 で no-op、 0.5〜1.5 の範囲外は丸める
 *   ・focus / reasons は維持、 score だけ補正 */
function applyWeight(part, w) {
  const factor = (typeof w === "number" && isFinite(w)) ? Math.max(0.5, Math.min(1.5, w)) : 1;
  if (factor === 1 || !part) return part;
  return { ...part, score: Math.round((part.score || 0) * factor) };
}

/** 強制激荒れブースト — 複数条件が重なった時だけ追加点 */
function forcedStormBoost(race, parts) {
  let boost = 0;
  const reasons = [];
  const flags = {
    deepIn: parts.entry.score >= 12,         // 進入崩れ高
    strongWind: parts.weather.score >= 9,    // 強風波
    weakLeader: parts.leader.score >= 14,    // 1号艇弱
    attackers: parts.attackers.score >= 14,  // 攻め手豊富
    exhibitBad: parts.exhibition.score >= 9, // 展示異変
    oddsBias: parts.odds.score >= 6,         // オッズ偏り
  };
  const hits = Object.values(flags).filter(Boolean).length;
  if (hits >= 4) { boost += 8; reasons.push("複数条件重なり (激荒れ濃厚)"); }
  else if (hits >= 3) { boost += 4; reasons.push("3条件重なり"); }
  // 「深イン+強風+1号艇弱」 三重苦
  if (flags.deepIn && flags.strongWind && flags.weakLeader) {
    boost += 5;
    reasons.push("深イン×強風×1号艇不安の三重苦");
  }
  return { boost, reasons };
}

/** Round 166: 「現在の重み」 をモジュール内に保持 (App.jsx の起動時にロード)。
 *  scoreMansyu が weights 引数を受け取らない時はこの値を使う。
 *  デフォルトは全 1.0 (補正なし) なので、 setMansyuWeights を呼ばなければ従来通り動く。 */
let _currentMansyuWeights = null;
export function setMansyuWeights(weights) {
  if (!weights) { _currentMansyuWeights = null; return; }
  _currentMansyuWeights = {
    entry:      typeof weights.entry      === "number" ? weights.entry      : 1,
    weather:    typeof weights.weather    === "number" ? weights.weather    : 1,
    leader:     typeof weights.leader     === "number" ? weights.leader     : 1,
    attackers:  typeof weights.attackers  === "number" ? weights.attackers  : 1,
    exhibition: typeof weights.exhibition === "number" ? weights.exhibition : 1,
    odds:       typeof weights.odds       === "number" ? weights.odds       : 1,
  };
}
export function getMansyuWeights() {
  return _currentMansyuWeights || { entry: 1, weather: 1, leader: 1, attackers: 1, exhibition: 1, odds: 1 };
}

/** メイン: race を受け取り 荒れスコア + 詳細を返す
 *  Round 166: 学習補正係数 weights を反映 (各成分スコアに 0.5〜1.5 の係数を掛ける)
 *  weights が省略された場合は setMansyuWeights() で設定した現在値を使う。
 *  まだ何も設定されていなければ 全 1.0 (補正なし) で動作 — 既存呼び出しは無修正で OK */
export function scoreMansyu(race, weights) {
  if (!race) return null;
  const w = weights || _currentMansyuWeights || { entry: 1, weather: 1, leader: 1, attackers: 1, exhibition: 1, odds: 1 };
  const entry      = applyWeight(scoreEntry(race),      w.entry);
  const weather    = applyWeight(scoreWeather(race),    w.weather);
  const leader     = applyWeight(scoreLeaderRisk(race), w.leader);
  const attackers  = applyWeight(scoreAttackers(race),  w.attackers);
  const exhibition = applyWeight(scoreExhibition(race), w.exhibition);
  const odds       = applyWeight(scoreOddsBias(race),   w.odds);
  const parts = { entry, weather, leader, attackers, exhibition, odds };
  const baseScore =
    entry.score + weather.score + leader.score +
    attackers.score + exhibition.score + odds.score;
  const { boost, reasons: boostReasons } = forcedStormBoost(race, parts);
  const score = Math.min(100, Math.round(baseScore + boost));
  const level =
    score >= 85 ? "alarm" :   // 激荒れ警報
    score >= 75 ? "warn"  :   // 荒れ注意
    "normal";
  // 万舟期待度: スコア比例 + 1号艇単勝が薄ければ加点
  const winOdds1 = +race?.apiOdds?.win?.["1"] || null;
  const mansyuRating =
    score >= 90 ? "★★★★★" :
    score >= 85 ? "★★★★" :
    score >= 80 ? "★★★" :
    score >= 75 ? "★★" :
    "★";
  return {
    score,
    level,
    parts,
    boost,
    mansyuRating,
    focus: attackers.focus || [],
    winOdds1,
    reasons: [
      ...entry.reasons,
      ...weather.reasons,
      ...leader.reasons,
      ...attackers.reasons,
      ...exhibition.reasons,
      ...odds.reasons,
      ...boostReasons,
    ],
  };
}

/** ラベル文字 */
export function levelLabel(level) {
  if (level === "alarm") return "激荒れ警報";
  if (level === "warn") return "荒れ注意";
  return "通常";
}

/** ラベル色 */
export function levelColor(level) {
  if (level === "alarm") return "#DC2626"; // 赤
  if (level === "warn")  return "#F59E0B"; // 黄
  return "#64748B";                         // グレー
}

/* === 買い目生成 (最大 5 点) + 5,000 円配分 (Round 173 / SPEC §3) ===
 * 注目艇 (focus) を頭に置いた3連単。
 * 1号艇は頭から外し、相手枠と3着流しに絡める。
 * 重複禁止。 各買い目に stake (円) を付与: 5,000 円を点数で均等配分し、
 * 余り (100 円単位) は最初 (一番強い) に上乗せ。 */
const MANSYU_TOTAL_STAKE = 5000;
const STAKE_UNIT = 100;

function distributeStake(points, total = MANSYU_TOTAL_STAKE) {
  if (!points || points <= 0) return [];
  const perPoint = Math.floor(total / points / STAKE_UNIT) * STAKE_UNIT;
  const used = perPoint * points;
  const remainder = total - used;
  const stakes = new Array(points).fill(perPoint);
  // 余りは最初 (一番強い買い目) に上乗せ
  if (remainder > 0) stakes[0] += remainder;
  return stakes;
}

export function buildMansyuBuyOrders(race, scoreResult) {
  if (!race || !scoreResult) return [];
  const focus = scoreResult.focus || [];
  if (focus.length === 0) return [];
  const orders = [];
  const seen = new Set();
  function add(combo, kind, reason) {
    const key = combo.join("-");
    if (seen.has(key)) return;
    seen.add(key);
    orders.push({ combo, kind, reason });
  }
  // 頭に立てる艇 = focus 上位 (最大 2 艇)
  const heads = focus.slice(0, 2).map((f) => f.boatNo);
  // 2着候補 = 1号艇 + 残りfocus + 強そうな選手
  const allBoats = (race.boats || []).map((b) => b?.boatNo).filter((n) => n);
  for (const head of heads) {
    // 第1: head → 1号艇 → 流し (3点)
    for (const third of allBoats) {
      if (third === head || third === 1) continue;
      add([head, 1, third], "3連単", `${head}号艇頭・1号艇から流し`);
      if (orders.length >= 3) break;
    }
    if (orders.length >= 3) break;
  }
  // 第2: focus 1艇目 → focus 2艇目 → 流し (1-2点) 残枠で
  if (heads.length >= 2 && orders.length < 5) {
    add([heads[0], heads[1], 1], "3連単", `${heads[0]}-${heads[1]}-1`);
  }
  if (heads.length >= 1 && orders.length < 5) {
    // 1艇目頭 → 1号艇以外の人気薄に流す (4-6号艇)
    const longShot = allBoats.find((n) => n >= 4 && n !== heads[0] && !heads.includes(n));
    if (longShot) {
      add([heads[0], 1, longShot], "3連単", `穴狙い ${heads[0]}-1-${longShot}`);
    }
  }
  const trimmed = orders.slice(0, 5);
  const stakes = distributeStake(trimmed.length);
  return trimmed.map((o, i) => ({ ...o, stake: stakes[i] }));
}

/* 買い目配分定数 (UI 表示や合計計算で参照) */
export const MANSYU_STAKE = MANSYU_TOTAL_STAKE;

/** 理由コメント (1 行・スラッシュ連結) — 後方互換用 */
export function buildMansyuReason(race, scoreResult) {
  if (!scoreResult) return "";
  const top = scoreResult.reasons.slice(0, 3);
  if (top.length === 0) return `荒れスコア${scoreResult.score}点`;
  return top.join(" / ");
}

/** Round 175: 理由を配列で返す (最大 3 行・SPEC §4 「理由 3 行」 用) */
export function buildMansyuReasonLines(scoreResult, max = 3) {
  if (!scoreResult) return [];
  const top = scoreResult.reasons.slice(0, max);
  if (top.length === 0) return [`荒れスコア ${scoreResult.score} 点`];
  return top;
}

/** 締切までの残り時間 (分) — 締切は発走時刻ちょうどとして扱う */
export function minutesToClose(race, now = Date.now()) {
  if (!race?.startTime || !race?.date) return null;
  const [h, m] = race.startTime.split(":").map((x) => +x);
  if (isNaN(h) || isNaN(m)) return null;
  const [yy, mm, dd] = race.date.split("-").map((x) => +x);
  const t = new Date(yy, mm - 1, dd, h, m, 0).getTime();
  return Math.round((t - now) / 60000);
}

export function formatMinutesToClose(min) {
  if (min == null) return "—";
  if (min < 0) return `終了 (${Math.abs(min)}分前)`;
  if (min === 0) return "締切";
  if (min < 60) return `${min}分後`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}時間${m}分後`;
}
