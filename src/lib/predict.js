/**
 * 予想エンジン (連勝系 4 券種専用 — 単勝・複勝は対象外)
 *
 * 5 因子で各艇のスコア → softmax で確率推定 → Plackett-Luce で順位確率 → 実オッズで EV 計算。
 * 仮オッズは一切生成しない。実オッズが取れない券種は計算しない (「オッズ取得不可」状態)。
 *
 * Round 17: 会場バイアス (24場特性) + 昼/ナイター適性 + 戦法相性 を補正係数として組み込み
 *           最終 EV = 基本確率 × オッズ × (会場補正) × (時間帯補正) × (戦法相性補正)
 *
 * 対象券種:
 *   ・2連単 (順序あり)
 *   ・2連複 (順序なし)
 *   ・3連単 (順序あり)
 *   ・3連複 (順序なし)
 */
import { venueTimeMods, timeAptitudeMod, styleMatchupMod, buildWarnings } from "./venueBias.js";

/* コース別 1着率 (公営競艇 全国平均):
   1コースが圧倒的に有利。これを必ず予想に反映する。 */
const COURSE_WIN_PCT = [55, 16, 12, 9, 6, 2];

/* 因子の重み:
   ・1号艇有利度を 0.30 → 0.40 に強化 (6号艇偏重の解消)
   ・他因子は均等に下げる */
export const FACTOR_WEIGHTS = {
  inAdvantage: 0.40,
  motor:       0.18,
  exhibition:  0.12,
  startPower:  0.18,
  oddsValue:   0.12,
};
export const FACTOR_LABELS = {
  inAdvantage: "1号艇有利度",
  motor:       "モーター",
  exhibition:  "展示タイム",
  startPower:  "スタート力",
  oddsValue:   "オッズ妙味",
};

const norm = {
  in:    (b) => COURSE_WIN_PCT[b - 1] / 55,
  motor: (m) => m == null || isNaN(m) ? 0.5 : Math.max(0, Math.min(1, (m - 10) / 40)),
  ex:    (t) => t == null || isNaN(t) ? 0.5 : Math.max(0, Math.min(1, (7.2 - t) / 0.55)),
  st:    (s) => s == null || isNaN(s) ? 0.5 : Math.max(0, Math.min(1, (0.25 - s) / 0.15)),
  wr:    (w) => w == null || isNaN(w) ? 0.5 : Math.max(0, Math.min(1, (w - 3.0) / 4.5)),
  b2:    (b) => b == null || isNaN(b) ? 0.5 : Math.max(0, Math.min(1, (b - 10) / 40)),
};

export function gradeFactor(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 0.7) return "A";
  if (v >= 0.4) return "B";
  return "C";
}

/* 直前情報からの補正係数 (0.85〜1.15) + 理由 */
export function computeConditionMod(boat) {
  let mod = 1.0;
  const reasons = [];
  const parts = Array.isArray(boat.partsExchange) ? boat.partsExchange : [];
  if (parts.some((p) => /ペラ|プロペラ|エンジン/.test(p))) {
    mod *= 0.90;
    reasons.push({ kind: "neg", text: `部品交換 (${parts.join("/")}) −10%` });
  } else if (parts.length > 0) {
    mod *= 0.95;
    reasons.push({ kind: "neg", text: `部品交換 −5%` });
  }
  if (boat.tilt != null && !isNaN(boat.tilt)) {
    if (boat.tilt >= 1.5) {
      if (boat.boatNo >= 4) { mod *= 1.05; reasons.push({ kind: "pos", text: `チルト ${boat.tilt} 外艇有利 +5%` }); }
      else if (boat.boatNo === 1) { mod *= 0.97; reasons.push({ kind: "neg", text: `チルト ${boat.tilt} 1号艇不利 −3%` }); }
    } else if (boat.tilt <= -0.5 && boat.boatNo === 1) {
      mod *= 1.03;
      reasons.push({ kind: "pos", text: `チルト ${boat.tilt} 出足型 1号艇 +3%` });
    }
  }
  /* Round 64: 定性情報 (気配コメント) は「例外的補正要素」 のみ。
     ・買う理由ではなく、 主に「買わない理由」 として使う設計
     ・加点は軽め (+3%) / 減点は強め (-10% or -15%)
     ・明確な異常値は強く反映、 一般的な気配は軽くしか反映しない */
  const note = boat.exhibitionNote || "";
  if (note) {
    // (a) 強い減点 (整備失敗 / 重大な不調) — -15%
    if (/整備失敗|エンスト|エンジン不調|失格|転覆/.test(note)) {
      mod *= 0.85; reasons.push({ kind: "neg", text: `🚨 異常「${note}」−15%` });
    }
    // (b) 中程度の減点 (足弱い / 気配悪) — -10%
    else if (/足弱|重い|悪い|悪$|下降|伸びない|出足悪|気配悪|不調/.test(note)) {
      mod *= 0.90; reasons.push({ kind: "neg", text: `⚠️ 不調「${note}」−10%` });
    }
    // (c) 軽い加点 (伸び抜群 / モーター好調) — +3% (買う理由には弱め)
    else if (/伸び抜群|伸び良|抜群|上昇|気配良|出足良/.test(note)) {
      mod *= 1.03; reasons.push({ kind: "pos", text: `気配「${note}」+3%` });
    }
    // (d) 一般的な気配良 — +1% (ノイズ防止)
    else if (/良い|良し|良$|伸び|ターン良/.test(note)) {
      mod *= 1.01; reasons.push({ kind: "pos", text: `気配「${note}」+1%` });
    }
  }
  // (e) 明確な好材料 — モーター 2連率 50%+ ですでに加点済 (factor weight)、追加加点なし
  return { mod: Math.max(0.80, Math.min(1.20, mod)), reasons };
}

export function venueAptitudeMod(boat) {
  if (boat.localWinRate == null || boat.winRate == null) return { mod: 1.0, reason: null };
  const diff = boat.localWinRate - boat.winRate;
  if (diff >= 1.0) return { mod: 1.06, reason: { kind: "pos", text: `当地+${diff.toFixed(1)} +6%` } };
  if (diff >= 0.5) return { mod: 1.03, reason: { kind: "pos", text: `当地+${diff.toFixed(1)} +3%` } };
  if (diff <= -1.0) return { mod: 0.95, reason: { kind: "neg", text: `当地${diff.toFixed(1)} −5%` } };
  if (diff <= -0.5) return { mod: 0.98, reason: { kind: "neg", text: `当地${diff.toFixed(1)} −2%` } };
  return { mod: 1.0, reason: null };
}

function windDirectionMod(boat, windDir, wind) {
  if (!windDir || wind == null || wind < 3) return { mod: 1.0, reason: null };
  if (windDir === "向かい風") {
    if (boat.boatNo === 1) return { mod: 1.03, reason: { kind: "pos", text: `向かい風 ${wind}m 1号 +3%` } };
    if (boat.boatNo >= 4) return { mod: 0.98, reason: { kind: "neg", text: `向かい風 外艇 −2%` } };
  }
  if (windDir === "追い風") {
    if (boat.boatNo === 1) return { mod: 0.97, reason: { kind: "neg", text: `追い風 ${wind}m 1号 −3%` } };
    if (boat.boatNo >= 4) return { mod: 1.03, reason: { kind: "pos", text: `追い風 外艇 +3%` } };
  }
  return { mod: 1.0, reason: null };
}

function softmax(arr, temp = 1) {
  const max = Math.max(...arr);
  const exps = arr.map((v) => Math.exp((v - max) / Math.max(1e-6, temp)));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function scoreBoat(boat, race) {
  const fIn = norm.in(boat.boatNo);
  const fMot = norm.motor(boat.motor2);
  const fEx = norm.ex(boat.exTime);
  const fSt = norm.st(boat.ST);
  const fWr = norm.wr(boat.winRate);
  const fB2 = norm.b2(boat.boat2);
  let baseScore =
    fIn * FACTOR_WEIGHTS.inAdvantage +
    fMot * FACTOR_WEIGHTS.motor +
    fEx * FACTOR_WEIGHTS.exhibition +
    fSt * FACTOR_WEIGHTS.startPower +
    fWr * 0.03 + fB2 * 0.02;
  // コース基本ボーナス/ペナルティ (6号艇偏重の解消)
  if (boat.boatNo === 1) baseScore += 0.05;       // 1号艇に下駄
  else if (boat.boatNo === 6) baseScore -= 0.08;  // 6号艇は強いペナルティ (明確根拠が無ければ本命にしない)
  else if (boat.boatNo === 5) baseScore -= 0.04;
  const cond = computeConditionMod(boat);
  const wd = windDirectionMod(boat, race?.windDir, race?.wind);
  const totalMod = cond.mod * wd.mod;
  const reasons = [...cond.reasons];
  if (wd.reason) reasons.push(wd.reason);
  return {
    boatNo: boat.boatNo,
    score: baseScore * totalMod,
    baseScore,
    conditionMod: totalMod,
    conditionReasons: reasons,
    factors: { inAdvantage: fIn, motor: fMot, exhibition: fEx, startPower: fSt, winRate: fWr, boat2: fB2 },
  };
}

/* 1号艇信頼度の判定 (5段階)
   1号艇の AI 確率 + 周辺要素から判定 */
export function judgeInTrust(race, scores, probs) {
  const inIdx = scores.findIndex(s => s.boatNo === 1);
  if (inIdx < 0) return { level: "—", message: "判定不能", color: "#9fb0c9", score: 0 };
  const p1 = probs[inIdx] || 0;
  const inBoat = race.boats[inIdx] || {};
  const isRough = (race.wave ?? 0) > 8 || (race.wind ?? 0) > 6;
  const partsExch = inBoat.partsExchange?.length > 0;
  const tilt = inBoat.tilt;
  // ベース判定
  let level, message, color;
  if (p1 >= 0.55 && !isRough) { level = "イン逃げ濃厚"; message = "1号艇の逃げ展開"; color = "#10b981"; }
  else if (p1 >= 0.45) { level = "1号艇やや有利"; message = "1号艇本線"; color = "#34d399"; }
  else if (p1 >= 0.30) { level = "1号艇不安あり"; message = "本命級だが盤石ではない"; color = "#fde68a"; }
  else if (p1 >= 0.20 || isRough) { level = "荒れ注意"; message = "1号艇の信頼度低 / 荒れ要素"; color = "#f59e0b"; }
  else { level = "イン崩壊警戒"; message = "外艇の捲り狙い濃厚"; color = "#f87171"; }
  // 補足: 部品交換あり / 高チルト で信頼度下方修正
  if (partsExch && level !== "イン崩壊警戒") {
    message += " (1号艇 部品交換)";
  }
  if (tilt != null && tilt >= 1.5 && (level === "イン逃げ濃厚" || level === "1号艇やや有利")) {
    level = "1号艇不安あり";
    message = "1号艇 高チルト (出足落ち懸念)";
    color = "#fde68a";
  }
  return { level, message, color, score: Math.round(p1 * 100) };
}

/* 展開予想 */
export function predictDevelopment(race, scores, probs) {
  const top = scores.map((s, i) => ({ ...s, prob: probs[i] })).sort((a, b) => b.prob - a.prob);
  const top1 = top[0]; const top2 = top[1];
  const inProb = top.find((s) => s.boatNo === 1)?.prob || 0;
  const wave = race.wave ?? 0; const wind = race.wind ?? 0;
  const isRough = wave > 8 || wind > 6;
  let scenario, comment;
  if (inProb > 0.45 && !isRough) { scenario = "逃げ"; comment = `1号艇逃げ濃厚 (${(inProb*100).toFixed(0)}%)`; }
  else if (top1.boatNo !== 1 && top1.prob > 0.30) { scenario = top1.boatNo === 2 ? "まくり" : "まくり差し"; comment = `${top1.boatNo}号艇本線`; }
  else if (isRough) { scenario = "荒れ"; comment = `荒水面 (風${wind}m / 波${wave}cm)`; }
  else if (top1.prob - top2.prob < 0.05) { scenario = "混戦"; comment = `${top1.boatNo}号艇と${top2.boatNo}号艇わずか`; }
  else { scenario = "標準"; comment = `${top1.boatNo}号艇中心`; }
  return { scenario, comment, inProbability: inProb, isRough, top: top.slice(0, 3) };
}

/* Plackett-Luce で順位確率 */
function rankProb2(probs, i, j) {
  if (i === j) return 0;
  return probs[i] * probs[j] / Math.max(1e-9, 1 - probs[i]);
}
function rankProb3(probs, i, j, k) {
  if (i === j || j === k || i === k) return 0;
  return probs[i]
       * probs[j] / Math.max(1e-9, 1 - probs[i])
       * probs[k] / Math.max(1e-9, 1 - probs[i] - probs[j]);
}

/* === EV / 期待回収率 / 採用理由 ===
   ・期待回収率 (expectedReturn) = 推定的中確率 × オッズ        … 100% 超なら期待値プラス
   ・EV = 推定的中確率 × オッズ − 1 = 期待回収率 − 1            … 0 超なら期待値プラス
   ・「100円購入時の期待払戻」 = prob × odds × 100 円
   ・「100円購入時の期待利益」 = prob × odds × 100 − 100 円
*/
function makeItem(kind, combo, prob, odds) {
  const expectedReturn = prob * odds;     // 1.20 = 期待回収率 120%
  const ev = expectedReturn;               // 旧コードと整合 (買い目ランキングに使う指標として旧名を維持)
  const evMinus1 = expectedReturn - 1;     // 「期待値プラスマイナス」 として明確に持つ
  return { kind, combo, prob, odds, ev, expectedReturn, evMinus1 };
}

/* 各券種を全列挙して EV を計算 (実オッズが無い combo は除外) */
function enumerateExacta(probs, oddsTable) {
  const items = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i === j) continue;
    const odds = oddsTable[`${i+1}-${j+1}`];
    if (odds == null) continue;
    const p = rankProb2(probs, i, j);
    items.push(makeItem("2連単", `${i+1}-${j+1}`, p, odds));
  }
  return items;
}
function enumerateTrifecta(probs, oddsTable) {
  const items = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 6; k++) {
    if (new Set([i, j, k]).size !== 3) continue;
    const odds = oddsTable[`${i+1}-${j+1}-${k+1}`];
    if (odds == null) continue;
    const p = rankProb3(probs, i, j, k);
    items.push(makeItem("3連単", `${i+1}-${j+1}-${k+1}`, p, odds));
  }
  return items;
}
function enumerateQuinella(probs, oddsTable) {
  const items = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const odds = oddsTable[`${i+1}=${j+1}`];
    if (odds == null) continue;
    const p = rankProb2(probs, i, j) + rankProb2(probs, j, i);
    items.push(makeItem("2連複", `${i+1}=${j+1}`, p, odds));
  }
  return items;
}
function enumerateTrio(probs, oddsTable) {
  const items = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) {
    const odds = oddsTable[`${i+1}=${j+1}=${k+1}`];
    if (odds == null) continue;
    const perms = [[i,j,k],[i,k,j],[j,i,k],[j,k,i],[k,i,j],[k,j,i]];
    let p = 0;
    for (const [a, b, c] of perms) p += rankProb3(probs, a, b, c);
    items.push(makeItem("3連複", `${i+1}=${j+1}=${k+1}`, p, odds));
  }
  return items;
}

/* === 確率整合性チェック ===
   softmax + Plackett-Luce が壊れていないかを「全買い目の的中確率合計」で検算する。
   完全列挙すれば 1.000 になる。実オッズが無い combo は除外しているので 1 未満になるが、
   1.05 を超える / 0.30 を下回る ならどこかが壊れている。 */
export function checkProbabilityConsistency(probs, items) {
  // 1着確率合計 (softmax) — 必ず 1.0
  const oneFirst = probs.reduce((a, b) => a + b, 0);
  // 券種別 全買い目確率合計
  const sumByKind = {};
  for (const it of items) {
    sumByKind[it.kind] = (sumByKind[it.kind] || 0) + it.prob;
  }
  return {
    oneFirstSum: +oneFirst.toFixed(4),
    byKind: Object.fromEntries(Object.entries(sumByKind).map(([k, v]) => [k, +v.toFixed(4)])),
    healthy: Math.abs(oneFirst - 1.0) < 0.01,
  };
}

/* === 最低的中確率フィルタ ===
   オッズが高いだけで的中確率が極端に低い買い目を本線から除外する。
   券種ごとに「全買い目の母集団に対する平均確率」 を基準にして適応的に決定する。
   - 2連単 (30 通り):  平均 1/30 ≒ 3.3%。下限 1.0%
   - 3連単 (120 通り): 平均 1/120 ≒ 0.83%。下限 0.3%
   - 2連複 (15 通り):  平均 1/15 ≒ 6.7%。下限 2.0%
   - 3連複 (20 通り):  平均 1/20 = 5.0%。下限 1.5%
*/
export const MIN_PROB_BY_KIND = {
  "2連単": 0.010,
  "3連単": 0.003,
  "2連複": 0.020,
  "3連複": 0.015,
};

/* 一言理由 (本命の強い因子から) */
function oneLineReason(score, ticket) {
  if (!score) return `EV ${ticket.ev.toFixed(2)} 妙味`;
  const f = score.factors;
  const strong = [];
  if (f.inAdvantage >= 0.7) strong.push("イン有利");
  if (f.motor >= 0.7) strong.push("モーター上位");
  if (f.exhibition >= 0.7) strong.push("展示◎");
  if (f.startPower >= 0.7) strong.push("ST良");
  if (strong.length === 0) return `EV ${ticket.ev.toFixed(2)} 妙味`;
  return strong.slice(0, 3).join("＋");
}

/* 各買い目の採用理由を生成 (UI 表示用) */
function buildPickReason(ticket, score, ev, inDominant, inFavored, inProb) {
  const head = ticket.combo[0];
  const r = [];
  // 推定的中確率 / オッズ / 期待回収率
  const probPct = (ticket.prob * 100).toFixed(1);
  const er = (ticket.prob * ticket.odds * 100).toFixed(0);
  r.push(`的中確率 ${probPct}% × オッズ ${ticket.odds.toFixed(1)} = 期待回収率 ${er}%`);
  // 本命艇の強い因子
  if (score?.factors) {
    const f = score.factors;
    if (head === "1" && (inDominant || inFavored)) {
      r.push(`1号艇1着確率 ${(inProb * 100).toFixed(0)}% (イン${inDominant ? "濃厚" : "やや有利"})`);
    }
    if (f.motor >= 0.7) r.push(`${head}号艇 モーター上位`);
    if (f.exhibition >= 0.7) r.push(`${head}号艇 展示◎`);
    if (f.startPower >= 0.7) r.push(`${head}号艇 ST良`);
  }
  // 外艇ヘッドの場合の追加理由
  if (head !== "1") {
    if (inProb < 0.30) r.push("1号艇信頼度低 → 外艇展開");
    else if (ev?.development?.scenario === "荒れ") r.push("荒れ展開期待");
  }
  return r;
}

/* === Phase D: 前付け検知 === */
export function predictMaeBuke(race) {
  const boats = race.boats || [];
  // 各艇の進入コース最頻値 (entryHistory が無ければ枠番)
  const lanes = boats.map((b) => {
    const hist = Array.isArray(b.entryHistory) ? b.entryHistory : [];
    if (hist.length === 0) return { boat: b.boatNo, lane: b.boatNo, conf: 0 };
    const counts = {};
    for (const h of hist) counts[h] = (counts[h] || 0) + 1;
    let topLane = b.boatNo, topCount = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > topCount) { topCount = v; topLane = +k; }
    }
    return { boat: b.boatNo, lane: topLane, conf: topCount / hist.length };
  });
  // 1コースに 1号艇以外が入る確率 (前付け可能性)
  const inner = lanes.find((l) => l.lane === 1);
  const isMaebuke = inner && inner.boat !== 1;
  const likelihood = isMaebuke ? Math.round(60 + (inner.conf || 0) * 40) : 0;
  // 想定進入文字列 (例: "125/346" のような形式)
  const expectedLane = lanes.sort((a, b) => a.lane - b.lane).map((l) => l.boat).join("");
  return {
    isMaebuke,
    likelihood,
    expectedLane,
    suspectBoats: isMaebuke ? [{ boat: inner.boat, fromLane: inner.boat, toLane: 1 }] : [],
  };
}

/* === Phase D: 展示ST 分析 (本番平均ST vs 展示ST) === */
export function analyzeExhibitionST(race) {
  const boats = race.boats || [];
  return boats.map((b) => {
    const baseST = b.ST;
    const exST = b.startEx;
    if (baseST == null || exST == null) {
      return { boatNo: b.boatNo, status: "未取得", baseST, exST, diff: null, note: null };
    }
    const diff = +(exST - baseST).toFixed(3);
    if (Math.abs(diff) < 0.03) return { boatNo: b.boatNo, status: "標準", baseST, exST, diff, note: null };
    if (diff <= -0.03) return { boatNo: b.boatNo, status: "好調", baseST, exST, diff, note: "展示ST 異常に良い → 狙い目" };
    return { boatNo: b.boatNo, status: "不調", baseST, exST, diff, note: "展示ST 異常に遅い → 崩れ警戒" };
  });
}

/* === Round 21: 事故レース (危険レース) 検知 ===
   ・ST ばらつき大 (max - min > 0.10)
   ・モーター差が極端 (max - min > 35)
   ・展開依存が強い (上位 2 艇の確率差が小さい / 1号艇 0.30 未満かつ拮抗)
   検出された場合、UI で「危険レース」 を表示し「買わない」 提案
*/
export function detectAccidentRace(race, scores, probs) {
  if (!Array.isArray(race?.boats) || race.boats.length !== 6) return null;
  const stArr = race.boats.map((b) => b.ST).filter((s) => s != null && !isNaN(s));
  const motorArr = race.boats.map((b) => b.motor2).filter((m) => m != null && !isNaN(m));

  const causes = [];
  // ST ばらつき大
  if (stArr.length >= 4) {
    const maxST = Math.max(...stArr);
    const minST = Math.min(...stArr);
    if (maxST - minST > 0.10) {
      causes.push(`ST ばらつき大 (${minST.toFixed(2)}〜${maxST.toFixed(2)})`);
    }
  }
  // モーター差が極端
  if (motorArr.length >= 4) {
    const maxM = Math.max(...motorArr);
    const minM = Math.min(...motorArr);
    if (maxM - minM > 35) {
      causes.push(`モーター差が極端 (${minM}%〜${maxM}%)`);
    }
  }
  // 展開依存が強い
  if (Array.isArray(probs) && probs.length === 6) {
    const sorted = [...probs].sort((a, b) => b - a);
    const inProb = probs[0];
    if (sorted[0] - sorted[1] < 0.05 && sorted[0] < 0.40) {
      causes.push(`上位拮抗 (展開依存高)`);
    }
    if (inProb < 0.30) {
      causes.push(`1号艇1着確率 ${(inProb * 100).toFixed(0)}% — 安定軸なし`);
    }
  }
  // 風 + 波 が同時に強い
  if ((race.wind ?? 0) >= 7 && (race.wave ?? 0) >= 8) {
    causes.push(`大荒れ水面 (風${race.wind}m + 波${race.wave}cm)`);
  }
  // 部品交換が複数艇
  const partsCount = race.boats.filter((b) => Array.isArray(b.partsExchange) && b.partsExchange.length > 0).length;
  if (partsCount >= 3) {
    causes.push(`${partsCount}艇で部品交換 — 直前変動大`);
  }

  if (causes.length === 0) return { isAccident: false, causes: [], severity: 0 };
  // 重大度 (重み付け)
  const severity = Math.min(100, causes.length * 25);
  return {
    isAccident: causes.length >= 2 || severity >= 50,
    causes,
    severity,
    message: causes.length >= 2
      ? "⚠️ 危険レース — 複数の不安要素あり、買わない選択を推奨"
      : "⚠️ 注意レース — 不安要素あり",
  };
}

/* === Phase D: 風波 影響分析 === */
export function analyzeWindWave(race) {
  const wind = race.wind ?? 0;
  const wave = race.wave ?? 0;
  const dir = race.windDir || "";
  let inAdv = 50;
  if (dir === "向かい風") inAdv += Math.min(20, wind * 3);
  else if (dir === "追い風") inAdv -= Math.min(20, wind * 3);
  else if (dir === "横風") inAdv -= 5;
  inAdv = Math.max(0, Math.min(100, inAdv));
  let rough = 0;
  if (wind > 5) rough += (wind - 5) * 8;
  if (wave > 5) rough += (wave - 5) * 3;
  rough = Math.max(0, Math.min(100, rough));
  return {
    wind, wave, windDir: dir,
    inAdvantage: Math.round(inAdv),
    roughLikelihood: Math.round(rough),
  };
}

/* === Phase D: 総合評価 ★1〜5 + 推奨アクション === */
export function computeOverallGrade(ev, recommendation, windWave) {
  if (!ev) return { stars: 0, action: "見送り", note: "未評価" };
  if (recommendation?.decision === "no-odds") return { stars: 0, action: "見送り", note: "オッズ取得不可" };
  if (!ev.ok) return { stars: 0, action: "見送り", note: ev.message || "データ不足" };
  let stars = 0;
  if (ev.maxEV >= 1.50) stars = 5;
  else if (ev.maxEV >= 1.30) stars = 4;
  else if (ev.maxEV >= 1.15) stars = 3;
  else if (ev.maxEV >= 1.05) stars = 2;
  else if (ev.maxEV >= 0.95) stars = 1;
  if (windWave?.roughLikelihood >= 70) stars = Math.max(0, stars - 1);
  let action = "見送り";
  if (stars >= 4) action = ev.development?.scenario === "標準" || ev.development?.scenario === "逃げ" ? "本線" : "本線/穴";
  else if (stars === 3) action = "本線";
  else if (stars === 2) action = "穴狙い";
  return { stars, action };
}

/* 関連ニュース抽出 (会場名 / 選手姓) */
export function relatedNews(race, newsItems) {
  if (!Array.isArray(newsItems) || newsItems.length === 0) return [];
  const venueKey = `venue:${race.venue}`;
  const racers = (race.boats || []).map((b) => b.racer).filter(Boolean);
  return newsItems.filter((it) => {
    if (it.keywords?.includes(venueKey)) return true;
    if (racers.some((r) => r && it.title?.includes(r.split(" ")[0]))) return true;
    return false;
  }).slice(0, 5);
}

/* === Round 22: 評価結果キャッシュ ===
   レースの「中身」 が変わらない限り再評価しない。
   キー: raceId + (出走表/オッズ/天候の signature) + (learnedAdjustments の signature)
*/
const _evalCache = new Map();
function _raceSig(r) {
  return [
    r.id,
    r.boats?.length || 0,
    Object.keys(r.apiOdds?.exacta   || {}).length,
    Object.keys(r.apiOdds?.trifecta || {}).length,
    Object.keys(r.apiOdds?.quinella || {}).length,
    Object.keys(r.apiOdds?.trio     || {}).length,
    r.wind ?? "", r.wave ?? "", r.windDir || "",
    r.startTime || "",
    // boats のうちオッズ妙味/モーター/展示は変わる可能性
    (r.boats || []).map((b) => `${b.boatNo}:${b.motor2 ?? ""}:${b.exTime ?? ""}:${b.ST ?? ""}:${b.partsExchange?.length || 0}:${b.tilt ?? ""}`).join(","),
  ].join("|");
}
function _cacheKey(race, learnedAdjustments) {
  const ladj = learnedAdjustments
    ? Object.entries(learnedAdjustments).map(([k, v]) => `${k}:${v?.toFixed?.(3) || v}`).join(",")
    : "";
  return _raceSig(race) + "@@" + ladj;
}

/* === Round 51-F: オッズ無しでも構造データから「候補性」 を評価 ===
   オッズ取得失敗時に「構造的には買い候補」 のレースを区別するためのスコア。
   返り値: { score: 0-100, candidateLevel: "high" | "medium" | "low" | "skip", reasons: [...] }
*/
export function assessWithoutOdds(race) {
  if (!race?.boats || race.boats.length !== 6) {
    return { score: 0, candidateLevel: "skip", reasons: ["出走表未取得"] };
  }
  let score = 0;
  const reasons = [];
  // 1号艇のスコア要素
  const b1 = race.boats[0];
  if (b1) {
    if (b1.motor2 != null && b1.motor2 >= 38) { score += 15; reasons.push("1号艇モーター上位"); }
    else if (b1.motor2 != null && b1.motor2 >= 30) { score += 8; }
    if (b1.exTime != null && b1.exTime <= 6.78) { score += 12; reasons.push("1号艇展示◎"); }
    else if (b1.exTime != null && b1.exTime <= 6.85) { score += 6; }
    if (b1.winRate != null && b1.winRate >= 6.0) { score += 10; reasons.push("1号艇 勝率高"); }
    else if (b1.winRate != null && b1.winRate >= 5.0) { score += 5; }
    if (b1.ST != null && b1.ST <= 0.15) { score += 10; reasons.push("1号艇ST良"); }
    else if (b1.ST != null && b1.ST <= 0.17) { score += 5; }
    // class A1 ボーナス
    if (b1.class === "A1") { score += 5; reasons.push("1号艇 A1級"); }
  }
  // 風波 (穏やかなら +、 荒れすぎなら -)
  const wind = race.wind ?? 0;
  const wave = race.wave ?? 0;
  if (wind <= 3 && wave <= 4) { score += 10; reasons.push("平水面"); }
  else if (wind >= 7 || wave >= 8) { score -= 15; reasons.push("荒水面"); }
  // 部品交換 (1号艇)
  if (b1?.partsExchange?.length > 0) { score -= 10; reasons.push("1号艇 部品交換"); }
  // 暴荒れ
  if (wind >= 10 || wave >= 12) { score = 0; reasons.push("大荒れで分析不能"); }
  // 候補レベル判定
  let candidateLevel;
  if (score >= 50) candidateLevel = "high";
  else if (score >= 30) candidateLevel = "medium";
  else if (score >= 15) candidateLevel = "low";
  else candidateLevel = "skip";
  return { score, candidateLevel, reasons };
}

/* === Round 51: 軽量判定ゲート ===
   全レースを完璧に予想しない。 まず構造的に「買えるレースかどうか」 を高速判定。
   失敗したら詳細分析・買い目生成・重い保存をスキップ。
   返り値: { pass: bool, reason: string, message: string }
*/
export function lightGate(race) {
  // 1. 出走表データあり (6 艇)
  if (!race?.boats || race.boats.length !== 6) {
    return { pass: false, reason: "no-boats", message: "出走表未取得" };
  }
  // 2. オッズ取得済み
  const apiOdds = race.apiOdds || {};
  const oddsCount = Object.keys(apiOdds.exacta || {}).length
                  + Object.keys(apiOdds.trifecta || {}).length
                  + Object.keys(apiOdds.quinella || {}).length
                  + Object.keys(apiOdds.trio || {}).length;
  if (oddsCount === 0) {
    return { pass: false, reason: "no-odds", message: "オッズ公開待ち" };
  }
  // 3. stale オッズ (キャッシュ) は深堀り回避
  if (apiOdds.stale) {
    return { pass: false, reason: "stale-odds", message: "オッズ整合性チェック中" };
  }
  // 4. 締切済み (発走時刻を過ぎた)
  const startMs = race.date && race.startTime
    ? new Date(`${race.date}T${race.startTime}:00+09:00`).getTime()
    : null;
  if (startMs != null && Date.now() > startMs) {
    return { pass: false, reason: "closed", message: "締切済み" };
  }
  // 5. 暴荒れ (風 ≥ 10m or 波 ≥ 12cm) — 不確定すぎて買えない
  const wave = race.wave ?? 0;
  const wind = race.wind ?? 0;
  if (wave >= 12 || wind >= 10) {
    return { pass: false, reason: "extreme-rough", message: `大荒れ (風${wind}m / 波${wave}cm)` };
  }
  // 6. 部品交換が複数艇 (3 艇以上 ペラ/エンジン) — 信頼性低
  const partsExchCount = (race.boats || []).filter(b =>
    Array.isArray(b.partsExchange) && b.partsExchange.some(p => /ペラ|プロペラ|エンジン/.test(p))
  ).length;
  if (partsExchCount >= 3) {
    return { pass: false, reason: "many-parts-exchange", message: `部品交換が ${partsExchCount} 艇 — 不確定` };
  }
  return { pass: true, reason: null, message: "OK" };
}

/* レース全体の評価
   learnedAdjustments: 過去の的中傾向から各因子の重み補正 (-0.05〜+0.05) を渡せる。
                       null なら標準重みのまま動作。
   Round 22: race の中身が変わらない限りキャッシュから返す (useMemo より外側で作用)
   Round 51: 先頭で lightGate を呼び、不適格レースは深堀りせずに即帰る (高速化) */
export function evaluateRace(race, newsItems, learnedAdjustments) {
  // === 軽量判定 (高速) — 失敗なら深堀りしない ===
  const gate = lightGate(race);
  if (!gate.pass) {
    // Round 51-F: no-odds の場合は構造スコアも添える (UI で意味分け)
    const extra = (gate.reason === "no-odds" || gate.reason === "stale-odds")
      ? { structuralAssessment: assessWithoutOdds(race) }
      : {};
    return {
      ok: false,
      reason: gate.reason,
      message: gate.message,
      lightSkipped: true,
      ...extra,
    };
  }
  if (!race?.id) return _evaluateRaw(race, newsItems, learnedAdjustments);
  const key = _cacheKey(race, learnedAdjustments);
  const cached = _evalCache.get(race.id);
  if (cached && cached.key === key) return cached.result;
  const result = _evaluateRaw(race, newsItems, learnedAdjustments);
  _evalCache.set(race.id, { key, result });
  // バウンド: 同時に持つキャッシュは最大 60 (24 場 × 12R 程度)
  if (_evalCache.size > 60) {
    const firstKey = _evalCache.keys().next().value;
    _evalCache.delete(firstKey);
  }
  return result;
}

function _evaluateRaw(race, newsItems, learnedAdjustments) {
  if (!race?.boats || race.boats.length !== 6) return { ok: false, reason: "no-boats", message: "出走表未取得" };
  // 学習済み補正があれば一時的に FACTOR_WEIGHTS を変更
  const orig = { ...FACTOR_WEIGHTS };
  if (learnedAdjustments) {
    for (const k of ["inAdvantage", "motor", "exhibition", "startPower"]) {
      const v = learnedAdjustments[k];
      if (typeof v === "number" && Math.abs(v) <= 0.10) {
        FACTOR_WEIGHTS[k] = Math.max(0.05, Math.min(0.50, FACTOR_WEIGHTS[k] + v));
      }
    }
  }
  try {
    return _evaluateInner(race, newsItems, learnedAdjustments);
  } finally {
    Object.assign(FACTOR_WEIGHTS, orig);
  }
}

function _evaluateInner(race, newsItems, learnedAdjustments) {
  const scores = race.boats.map((b) => scoreBoat(b, race));
  scores.forEach((s) => {
    const boat = race.boats.find((b) => b.boatNo === s.boatNo);
    const va = venueAptitudeMod(boat);
    s.score *= va.mod;
    if (va.reason) s.conditionReasons.push(va.reason);
  });

  /* ===== Round 17: 会場バイアス + 時間帯 + 戦法相性 を掛ける ===== */
  const venueRes = venueTimeMods(race.jcd, race.venue, race.startTime);
  const matchupMods = styleMatchupMod(race.boats);
  scores.forEach((s, idx) => {
    const boatNo = s.boatNo;
    // 会場 (1〜6 号艇別) 補正
    const vMod = venueRes.mods[boatNo - 1] ?? 1;
    if (vMod !== 1) {
      s.score *= vMod;
      const pct = Math.round((vMod - 1) * 100);
      if (Math.abs(pct) >= 1) {
        s.conditionReasons.push({ kind: pct > 0 ? "pos" : "neg", text: `${venueRes.profile?.name || ""}補正 ${pct > 0 ? "+" : ""}${pct}%` });
      }
    }
    // 時間帯適性
    const tMod = timeAptitudeMod(race.boats[idx], venueRes.slot);
    if (tMod !== 1) {
      s.score *= tMod;
      const pct = Math.round((tMod - 1) * 100);
      s.conditionReasons.push({ kind: pct > 0 ? "pos" : "neg", text: `${venueRes.slot === "night" ? "ナイター" : "昼"}適性 ${pct > 0 ? "+" : ""}${pct}%` });
    }
    // 戦法相性 (1号艇のみ影響)
    const mMod = matchupMods[boatNo - 1] ?? 1;
    if (mMod !== 1 && Math.abs(mMod - 1) >= 0.01) {
      s.score *= mMod;
      const pct = Math.round((mMod - 1) * 100);
      s.conditionReasons.push({ kind: "neg", text: `戦法相性 ${pct}% (まくり/差しリスク)` });
    }
  });

  const probs = softmax(scores.map((s) => s.score), 0.30);

  // 実オッズ (どれか 1 つでもあれば計算可能)
  const apiOdds = race.apiOdds || {};
  const sumOdds =
    Object.keys(apiOdds.exacta || {}).length +
    Object.keys(apiOdds.trifecta || {}).length +
    Object.keys(apiOdds.quinella || {}).length +
    Object.keys(apiOdds.trio || {}).length;
  if (sumOdds === 0) {
    return {
      ok: false, reason: "no-odds", message: "オッズ取得不可",
      probs, scores, related: relatedNews(race, newsItems),
      development: predictDevelopment(race, scores, probs),
    };
  }

  // === Round 35: 古いキャッシュデータで「買い」 を出さない ===
  // apiOdds.stale=true (last-success フォールバック) の場合は参考値扱い。
  // EV 計算は行うが、買い判定は禁止 → buildBuyRecommendation で "data-checking" を返す。
  const apiOddsStale = !!apiOdds.stale;
  const apiOddsLastFetchedAt = apiOdds.lastFetchedAt || null;

  // === Round 35: 締切後 (発走時刻を過ぎた未確定) のレースは閉じる ===
  // 発走後はオッズも変わらず、途中経過は締め切られているため、
  // 新規買い判定は禁止 (記録閲覧のみ)
  const startEpoch = race.date && race.startTime
    ? new Date(`${race.date}T${race.startTime}:00+09:00`).getTime()
    : null;
  const closedNow = startEpoch != null && Date.now() > startEpoch;

  const items = [];
  if (apiOdds.exacta) items.push(...enumerateExacta(probs, apiOdds.exacta));
  if (apiOdds.trifecta) items.push(...enumerateTrifecta(probs, apiOdds.trifecta));
  if (apiOdds.quinella) items.push(...enumerateQuinella(probs, apiOdds.quinella));
  if (apiOdds.trio) items.push(...enumerateTrio(probs, apiOdds.trio));

  items.sort((a, b) => b.ev - a.ev);
  const top = items[0];

  const development = predictDevelopment(race, scores, probs);
  const windWave = analyzeWindWave(race);
  const maeBuke = predictMaeBuke(race);
  const stExh = analyzeExhibitionST(race);
  const inTrust = judgeInTrust(race, scores, probs);
  const accident = detectAccidentRace(race, scores, probs);
  // 確率分布の整合性 (1着確率合計=1, 券種別 全買い目確率合計)
  const probConsistency = checkProbabilityConsistency(probs, items);
  const out = {
    ok: true,
    race, // 後続の buildBuyRecommendation で 6号艇チェック等に使う
    probs, scores, items,
    top, maxEV: top?.ev ?? 0,
    topGrade: !top ? "—" : top.ev >= 1.30 ? "S" : top.ev >= 1.10 ? "A" : top.ev >= 0.95 ? "B" : "C",
    development,
    windWave,
    maeBuke,
    stExh,
    inTrust,
    accident,
    probConsistency,
    venueProfile: venueRes.profile,
    timeSlot: venueRes.slot,
    apiOddsStale,
    apiOddsLastFetchedAt,
    closedNow,
    learnedAdjustments: learnedAdjustments || null,
    related: relatedNews(race, newsItems),
    availableKinds: {
      "2連単": Object.keys(apiOdds.exacta || {}).length > 0,
      "2連複": Object.keys(apiOdds.quinella || {}).length > 0,
      "3連単": Object.keys(apiOdds.trifecta || {}).length > 0,
      "3連複": Object.keys(apiOdds.trio || {}).length > 0,
    },
  };
  out.overall = computeOverallGrade(out, null, windWave); // recommendation 未確定のため lite
  out.warnings = buildWarnings(race, out);                // Round 17: 「このレース要注意」 警告
  return out;
}

/* 配分計算: 本命に多め、押さえ/穴は均等に分配 (旧 — 後方互換) */
function computeAllocations(n, profile) {
  if (n === 1) return [1.0];
  if (n === 2) return [0.65, 0.35];
  if (n === 3) {
    if (profile === "aggressive") return [0.45, 0.30, 0.25];
    return [0.55, 0.28, 0.17];
  }
  if (n === 4) return [0.40, 0.25, 0.20, 0.15];
  if (n === 5) return [0.35, 0.22, 0.18, 0.13, 0.12];
  const each = 1 / n;
  return Array(n).fill(each);
}

/* 拡張版: 1〜20 点の任意の点数で配分計算
   Round 35b: スタイル別の「資金配分」 思想を明確化:
     ・steady     (本命党): 強い集中 (本命に 65%+) — メリハリ
     ・balanced   (中堅党): 中間 (本命に 50%) — バランス
     ・aggressive (穴党)  : 分散 (本命と他をほぼ均等) — 広く拾う
*/
function computeAllocationsExt(n, profile) {
  if (n <= 0) return [];
  if (n === 1) return [1.0];
  // base が小さいほど 本命に集中 (steady=0.55: 集中 / aggressive=0.88: 分散)
  const base = profile === "aggressive" ? 0.88 : profile === "steady" ? 0.55 : 0.72;
  const raw = Array.from({ length: n }, (_, i) => Math.pow(base, i));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/* スタイル別の「資金配分の思想」 を 1 行で説明 (UI 表示用) */
export function describeAllocationStyle(profile, n) {
  if (profile === "steady") {
    if (n === 1) return "本命 1 点に全額集中 (本命型: メリハリ)";
    return `本命に集中 (約 60%+) + 押さえ — 本命型の集中投資`;
  }
  if (profile === "aggressive") {
    if (n === 1) return "1 点集中 (穴狙い型: 根拠が強い時のみ)";
    return `分散投資 (各買い目に均等寄り) — 穴狙い型は広くカバー`;
  }
  if (n === 1) return "本命 1 点 (バランス型: 妙味が明確な時)";
  return `本命寄り + 押さえ (バランス型: 中庸な配分)`;
}

/* 役割ラベル生成 */
function makeRoles(n) {
  if (n <= 0) return [];
  if (n === 1) return ["本命"];
  if (n === 2) return ["本命", "押さえ"];
  if (n === 3) return ["本命", "押さえ", "穴"];
  // 4 点以上: 本命 / 押さえ × 2 / 穴 × N / 大穴
  const labels = ["本命", "押さえ1", "押さえ2"];
  for (let i = 3; i < n; i++) {
    if (i < n - 2) labels.push(`穴${i - 2}`);
    else labels.push(`大穴${i - n + 3}`);
  }
  return labels.slice(0, n);
}

/* 6号艇本命チェック: 6号艇から始まる買い目 (1着=6) は、
   明確な根拠 (展示◎ / モーター高 / 全国勝率高 / 1号艇信頼度低 / 荒れ判定) が無ければ除外する。 */
function isBoat6CandidateValid(race, scores, probs, inTrust) {
  const i6 = race.boats?.findIndex((b) => b.boatNo === 6) ?? -1;
  if (i6 < 0) return false;
  const b = race.boats[i6];
  const s = scores[i6];
  if (!s || !b) return false;
  // 5 つの根拠を点数化
  let evidence = 0;
  if (b.exTime != null && b.exTime <= 6.75) evidence += 1; // 展示タイム良
  if (b.motor2 != null && b.motor2 >= 45)    evidence += 1; // モーター高
  if (b.winRate != null && b.winRate >= 6.0) evidence += 1; // 選手勝率高
  if (inTrust?.level === "荒れ注意" || inTrust?.level === "イン崩壊警戒") evidence += 1;
  if ((race.wind ?? 0) >= 6 || (race.wave ?? 0) >= 8) evidence += 1; // 荒れレース判定
  // 進入で内に入る可能性 (entryHistory に 1〜3 がある)
  if (Array.isArray(b.entryHistory) && b.entryHistory.some((l) => l <= 3)) evidence += 1;
  return evidence >= 2; // 2つ以上の強根拠が必要
}

/* === Round 28: 厳選版 EV 基準 ===
 *   ・「全部のレースを買うアプリ」 ではなく
 *     「勝てる可能性が高いレースだけ厳選するアプリ」
 *   ・EV 下限を引き上げ (steady 1.20 / balanced 1.15 / aggressive 1.10)
 *   ・複数の見送り条件を明示し、reasons[] で UI に表示
 *   ・買えるレースが無ければ堂々と「本日は見送り」 で良い
 *
 * 戦略別:
 *   steady     (本命党): 厳選 1〜2 点 / 2連複 + 3連複 + 2連単
 *   balanced   (中堅党): 厳選 1〜3 点 / 2連単 + 3連単
 *   aggressive (穴党)  : 厳選 1〜5 点 / 3連単 + 2連単
 */

/* スタイル別 EV 下限 (Round 69-70: ロジック完全分離) ===
   ・steady (的中率重視) : EV 1.05 — 「損しない」 程度に緩和、 代わりに勝率・モーター・展示・ST 厳格ゲート
   ・balanced (中庸)     : EV 1.20 — EV と的中率のバランス
   ・aggressive (EV 重視) : EV 1.50 — 高配当狙いで EV を最優先 */
export const EV_MIN_BY_PROFILE = {
  steady:     1.05,  // 本命党: EV 撤廃寄り — 当たりやすさ最優先
  balanced:   1.20,  // 中堅党: 期待回収率 120% 以上
  aggressive: 1.50,  // 穴党:   期待回収率 150% 以上 (高配当のみ)
};

/* スタイル別 「点数上限」 */
export const POINT_CAP_BY_PROFILE = {
  steady:     2,
  balanced:   4,
  aggressive: 6,
};

/* スタイル別 必要根拠数 (Round 37 で更に引き上げ — 厳選見送り強化) */
export const MIN_EVIDENCE_BY_PROFILE = {
  steady:     4,  // 本命型: 強根拠 4 つ以上 (1コース有利+モーター+展示+ST 等)
  balanced:   3,  // バランス型: 3 つ以上
  aggressive: 3,  // 穴狙い型: 3 つ以上 (穴ヘッドは別途厳格)
};

/* スタイル別 × 券種別 の本命買い目 最低的中確率 (Round 37b)
   2連単/2連複 は本来 prob 高め、3連単は構造的に低いので、券種ごとに下限を分ける。 */
export const MIN_MAIN_PROB_BY_PROFILE_KIND = {
  steady:     { "2連単": 0.10, "2連複": 0.15, "3連単": 0.020, "3連複": 0.030 },
  balanced:   { "2連単": 0.05, "2連複": 0.08, "3連単": 0.010, "3連複": 0.015 },
  aggressive: { "2連単": 0.02, "2連複": 0.04, "3連単": 0.005, "3連複": 0.008 },
};
function getMinMainProb(profile, kind) {
  return MIN_MAIN_PROB_BY_PROFILE_KIND[profile]?.[kind] ?? 0.01;
}

/* スタイル別 自信スコア下限 (0-100, Round 37 新設) */
export const MIN_CONFIDENCE_BY_PROFILE = {
  steady:     75,
  balanced:   65,
  aggressive: 60,
};

/* === 自信スコア (0-100) — 買い判断の総合信頼度 ===
   高いほど「自信あり」。 全要素が揃っていなければ低いまま。 */
function computeConfidence(ev, mainItem, mainScore, evidenceCount, riskProfile) {
  let score = 0;
  // (1) データ品質 (最大 25 点)
  if (!ev.apiOddsStale) score += 15;
  if (ev.probConsistency && Math.abs(ev.probConsistency.oneFirstSum - 1) < 0.05) score += 10;
  // (2) EV 強さ (最大 25 点)
  const evMin = EV_MIN_BY_PROFILE[riskProfile] || 1.20;
  const evGap = mainItem.ev - evMin;
  score += Math.max(0, Math.min(25, Math.round(evGap * 100)));
  // (3) 根拠数 (最大 20 点)
  score += Math.min(20, evidenceCount * 4);
  // (4) 的中確率の高さ (最大 15 点)
  score += Math.min(15, Math.round(mainItem.prob * 50));
  // (5) 危険要素なし (最大 10 点)
  if (!ev.accident?.isAccident) score += 10;
  else score -= Math.min(20, ev.accident.severity || 0);
  // (6) 1号艇信頼度 (最大 5 点) — steady のみ
  if (riskProfile === "steady" && ev.inTrust?.level === "イン逃げ濃厚") score += 5;
  return Math.max(0, Math.min(100, score));
}

/* 本命艇の根拠カウント:
 *   ・1コース有利度 (factors.inAdvantage >= 0.6)
 *   ・モーター高 (factors.motor >= 0.6)
 *   ・展示◎ (factors.exhibition >= 0.7)
 *   ・スタート力 (factors.startPower >= 0.6)
 *   ・選手勝率 (factors.winRate >= 0.5)
 *   ・コンディション補正プラス (conditionMod > 1.02)
 */
function countMainEvidence(score) {
  if (!score?.factors) return 0;
  const f = score.factors;
  let c = 0;
  if (f.inAdvantage >= 0.6) c++;
  if (f.motor >= 0.6) c++;
  if (f.exhibition >= 0.7) c++;
  if (f.startPower >= 0.6) c++;
  if (f.winRate >= 0.5) c++;
  if (score.conditionMod > 1.02) c++;
  return c;
}

export function buildBuyRecommendation(ev, riskProfile, perRaceCap) {
  /* === 早期 skip 判定 === */
  if (!ev) return { decision: "skip", reason: "未評価", reasons: ["評価対象なし"], items: [], total: 0 };
  if (ev.reason === "no-odds") {
    return { decision: "no-odds", reason: ev.message || "オッズ取得不可", reasons: ["オッズが未公開のため評価不能"], items: [], total: 0 };
  }
  if (!ev.ok) {
    return { decision: "skip", reason: ev.message || "データ不足", reasons: ["出走表/直前情報が未取得 — データ不足のため見送り"], items: [], total: 0 };
  }
  if (perRaceCap <= 0) {
    return { decision: "skip", reason: "予算上限ゼロ", reasons: ["1日予算/1レース上限が 0 円 — 設定で調整してください"], items: [], total: 0 };
  }

  /* === Round 35: 正確性最優先 — 古いキャッシュ + 締切後 では絶対に「買い」 判定しない === */
  if (ev.closedNow) {
    return {
      decision: "closed",
      reason: "締切済み",
      reasons: ["発走時刻を過ぎているため新規購入判定はしません"],
      items: [], total: 0,
      lastFetchedAt: ev.apiOddsLastFetchedAt,
    };
  }
  if (ev.apiOddsStale) {
    return {
      decision: "data-checking",
      reason: "オッズ整合性チェック中",
      reasons: [
        "現在のオッズは前回成功時のキャッシュ (参考値) です",
        "リトライ中 — 最新データ取得後に再評価します",
        "古いオッズで「買い」 と判定するのは危険なため、確認中表示にしています",
      ],
      items: [], total: 0,
      lastFetchedAt: ev.apiOddsLastFetchedAt,
    };
  }
  // 確率分布が壊れている (合計 ≠ 1) ときも 「整合性チェック中」 として買わない
  if (ev.probConsistency && Math.abs(ev.probConsistency.oneFirstSum - 1) > 0.10) {
    return {
      decision: "data-checking",
      reason: "確率整合性チェック中",
      reasons: [
        `1着確率合計が ${(ev.probConsistency.oneFirstSum * 100).toFixed(0)}% (期待値計算が不安定)`,
        "データ再取得後に再評価します",
      ],
      items: [], total: 0,
    };
  }

  const evMin = EV_MIN_BY_PROFILE[riskProfile] ?? 1.15;
  const pointCap = POINT_CAP_BY_PROFILE[riskProfile] ?? 4;

  const allowed = {
    aggressive: ["3連単", "2連単"],
    balanced:   ["2連単", "3連単"],
    steady:     ["2連複", "3連複", "2連単"],
  }[riskProfile] || ["2連単", "3連単"];

  const boat6Valid = isBoat6CandidateValid(ev.race || {boats: []}, ev.scores || [], ev.probs || [], ev.inTrust);
  const inProbIdx = ev.scores?.findIndex((s) => s.boatNo === 1) ?? -1;
  const inProb = inProbIdx >= 0 ? (ev.probs?.[inProbIdx] ?? 0) : 0;
  const inDominant = inProb >= 0.50;
  const inFavored  = inProb >= 0.45;

  /* === 候補を厳選 === */
  let candidates = ev.items.filter((t) => {
    if (!allowed.includes(t.kind)) return false;
    if (t.ev < evMin) return false; // スタイル別 EV 下限 (1.20 / 1.15 / 1.10)
    // 券種別 最低的中確率フィルタ
    const minP = MIN_PROB_BY_KIND[t.kind] ?? 0.005;
    if (t.prob < minP) return false;
    // 6号艇本命チェック
    if (t.combo.startsWith("6") && !boat6Valid) return false;
    // インドミナント時は外艇ヘッドを強く抑制
    if (inDominant) {
      const head = t.combo[0];
      if (head !== "1") {
        const minProbForOuter = (MIN_PROB_BY_KIND[t.kind] ?? 0.005) * 2;
        if (t.ev < 1.30 || t.prob < minProbForOuter) return false;
      }
    } else if (inFavored) {
      const head = t.combo[0];
      if (head !== "1" && t.ev < 1.20) return false; // 厳格化: 1.15 → 1.20
    }
    return true;
  });

  /* === 見送り理由 (詳細) を集める === */
  const skipReasons = [];

  // 1. データ整合性チェック
  if (ev.probConsistency && Math.abs(ev.probConsistency.oneFirstSum - 1) > 0.05) {
    skipReasons.push(`データ整合性なし (1着確率合計 ${(ev.probConsistency.oneFirstSum * 100).toFixed(0)}% — 期待値計算が信頼できません)`);
  }
  // 2. 危険レース (Round 21)
  if (ev.accident?.isAccident && riskProfile !== "aggressive") {
    skipReasons.push(`危険レース判定 (severity ${ev.accident.severity}/100) — 不安要素: ${ev.accident.causes.join(" / ")}`);
  }
  // 3. インドミナント低下
  if (ev.inTrust?.level === "イン崩壊警戒" && riskProfile !== "aggressive") {
    skipReasons.push(`本命信頼度不足 (1号艇 ${(inProb * 100).toFixed(0)}% — イン崩壊警戒)`);
  }

  /* === Round 69-70: スタイル別ロジック完全分離 ===
     スタイル毎に「スコア式・閾値・除外条件・買い目生成ルール」 が独立。
     各モードは異なる思想を持つ 3 人の予想家として動作する。 */
  if (riskProfile === "steady") {
    /* === 本命型 (的中率最優先) — EV を撤廃寄り、 当たりやすさのみ重視 ===
       必須ゲート (1 つでも未達 → 全レース見送り):
         (a) 1号艇 winRate ≥ 5.50
         (b) 1号艇 motor2 ≥ 35
         (c) 1号艇 exTime が全 6 艇中の上位 3 位以内
         (d) 1号艇 avgST ≤ 0.17 (=平均以上)
         (e) 風 ≤ 3 m AND 波 ≤ 4 cm (強風・荒水面は対象外)
         (f) 1号艇信頼度 = 「イン逃げ濃厚」 or 「1号艇やや有利」
       これらを満たさないレースは 「Go 候補にしない」 ことを徹底 (件数制限ではない)。 */
    const boats = ev.race?.boats || [];
    const b1 = boats[0] || null;
    const winRate1 = b1?.winRate;
    const motor1 = b1?.motor2;
    const exTime1 = b1?.exTime;
    const avgST1 = b1?.avgST != null ? b1.avgST : b1?.exST;
    const wind = ev.race?.wind ?? 0;
    const wave = ev.race?.wave ?? 0;
    const trustLevel = ev.inTrust?.level;

    // (a) 1号艇 勝率
    if (winRate1 == null) {
      skipReasons.push("本命型ゲート: 1号艇勝率データ不足 — 的中率重視のため判定保留");
    } else if (winRate1 < 5.50) {
      skipReasons.push(`本命型ゲート: 1号艇勝率 ${winRate1.toFixed(2)} < 5.50 — 的中率不足`);
    }
    // (b) モーター
    if (motor1 == null) {
      skipReasons.push("本命型ゲート: 1号艇モーター値データ不足");
    } else if (motor1 < 35) {
      skipReasons.push(`本命型ゲート: 1号艇モーター ${motor1.toFixed(1)}% < 35% — 上位ではない`);
    }
    // (c) 展示タイム
    if (exTime1 == null) {
      skipReasons.push("本命型ゲート: 1号艇展示タイムデータ不足");
    } else {
      const allEx = boats.map((b) => b?.exTime).filter((t) => t != null).sort((a, b) => a - b);
      const top3Cut = allEx[2];
      if (top3Cut != null && exTime1 > top3Cut) {
        skipReasons.push(`本命型ゲート: 1号艇展示 ${exTime1.toFixed(2)}秒 (上位3位外) — 当たりやすさ不足`);
      }
    }
    // (d) スタート力
    if (avgST1 == null) {
      skipReasons.push("本命型ゲート: 1号艇スタート力データ不足");
    } else if (avgST1 > 0.17) {
      skipReasons.push(`本命型ゲート: 1号艇平均ST ${avgST1.toFixed(2)} > 0.17 — スタート遅い`);
    }
    // (e) 強風・荒水面
    if (wind >= 5) skipReasons.push(`本命型ゲート: 風 ${wind}m が強い (>=5) — 本命型対象外`);
    if (wave >= 6) skipReasons.push(`本命型ゲート: 波 ${wave}cm が荒い (>=6) — 本命型対象外`);
    // (f) 1号艇信頼度
    const trustOk = (trustLevel === "イン逃げ濃厚" || trustLevel === "1号艇やや有利");
    if (!trustOk) {
      skipReasons.push(`本命型ゲート: 1号艇信頼度不足 (${trustLevel || "判定不能"}) — 「イン逃げ濃厚」 「1号艇やや有利」 のみ`);
    }
    // 荒れ/混戦シナリオも除外
    if (ev.development?.scenario === "荒れ" || ev.development?.scenario === "混戦") {
      skipReasons.push(`本命型ゲート: 展開シナリオ「${ev.development.scenario}」 — 本命型対象外`);
    }
    // 候補は 1ヘッド限定 (本命型は 1号艇1着固定の的中率重視)
    candidates = candidates.filter((t) => t.combo.startsWith("1"));
    if (candidates.length === 0 && skipReasons.length === 0) {
      skipReasons.push("本命型ゲート: 1号艇ヘッドの候補がない");
    }
  } else if (riskProfile === "balanced") {
    /* === バランス型 (的中率と EV の中間) ===
       ・本命オッズが薄すぎる (< 1.8) は妙味なし
       ・中穴 (オッズ ≤ 60倍) を上限
       ・1号艇 winRate ≥ 5.0 (緩めの的中率ガード)
       ・風 ≤ 5 AND 波 ≤ 6 (steady より緩く、 aggressive より厳しい) */
    const boats = ev.race?.boats || [];
    const b1 = boats[0] || null;
    const winRate1 = b1?.winRate;
    const wind = ev.race?.wind ?? 0;
    const wave = ev.race?.wave ?? 0;
    if (winRate1 != null && winRate1 < 5.0) {
      skipReasons.push(`バランス型ゲート: 1号艇勝率 ${winRate1.toFixed(2)} < 5.00 — 的中率の最低ライン未達`);
    }
    if (wind > 5) skipReasons.push(`バランス型ゲート: 風 ${wind}m が強い (>5)`);
    if (wave > 6) skipReasons.push(`バランス型ゲート: 波 ${wave}cm が荒い (>6)`);
    if (inProb > 0.65 && candidates.length > 0 && candidates[0].odds < 1.8) {
      skipReasons.push(`バランス型ゲート: 1号艇圧倒的 ${(inProb*100).toFixed(0)}% かつ本命オッズ ${candidates[0].odds.toFixed(1)}倍 — 安すぎて妙味なし`);
    }
    candidates = candidates.filter((t) => t.odds <= 60);
  } else if (riskProfile === "aggressive") {
    /* === 穴狙い型 (EV/高配当 最優先) — 的中率は気にしない ===
       必須ゲート:
         (a) EV ≥ 1.50 が候補に含まれる (高配当のみ)
         (b) 候補本線オッズ ≥ 8 倍 (低配当除外)
         (c) 4-6号艇ヘッド は「根拠 2+」 を引き続き要求
       的中率関連のゲートは一切なし — 当たらなくても OK、 当たれば大きい設計。 */
    candidates = candidates.filter((t) => {
      const head = parseInt(t.combo[0]);
      if (head <= 3) return true;
      const boatIdx = head - 1;
      const b = ev.race?.boats?.[boatIdx];
      if (!b) return false;
      let evidence = 0;
      if (b.exTime != null && b.exTime <= 6.80) evidence++;
      if (b.motor2 != null && b.motor2 >= 40) evidence++;
      if (b.winRate != null && b.winRate >= 5.5) evidence++;
      if (Array.isArray(b.entryHistory) && b.entryHistory.some((l) => l <= 3)) evidence++;
      if ((ev.race?.wind ?? 0) >= 5 || (ev.race?.wave ?? 0) >= 6) evidence++;
      if (ev.development?.scenario === "荒れ" || ev.development?.scenario === "まくり") evidence++;
      if (b.tilt != null && b.tilt >= 1.5) evidence++;
      return evidence >= 2;
    });
    // (b) 高配当のみ (オッズ < 8 倍は除外)
    candidates = candidates.filter((t) => t.odds >= 8);
    // (a) 候補本線 EV ≥ 1.50
    if (candidates.length > 0 && candidates[0].ev < 1.50) {
      skipReasons.push(`穴狙い型ゲート: 本線 EV ${Math.round(candidates[0].ev*100)}% < 150% — 高配当ねらいに値しない`);
    }
    if (candidates.length === 0 && skipReasons.length === 0) {
      skipReasons.push("穴狙い型ゲート: EV ≥ 150% かつオッズ ≥ 8倍 の候補なし — 高配当狙いの対象外");
    }
  }

  // 4. 候補が無い (style 固有フィルタ後)
  if (candidates.length === 0 && skipReasons.length === 0) {
    skipReasons.push(`オッズ妙味なし (期待回収率 ${Math.round(evMin * 100)}% 以上の候補が ${allowed.join("/")}に存在しない)`);
  }
  // 5. 候補のトップ EV が低い (薄プラスは見送り)
  if (candidates.length > 0 && candidates[0].ev < evMin + 0.05) {
    skipReasons.push(`妙味薄い (最高でも期待回収率 ${Math.round(candidates[0].ev * 100)}% — わずかなプラスは長期で消える)`);
  }
  // 6. 候補が広すぎる (穴狙い型のみ — 根拠ある穴に絞る思想なので、広すぎは不確定要素過多)
  if (riskProfile === "aggressive" && candidates.length > pointCap * 2) {
    skipReasons.push(`買い目が広すぎる (${candidates.length} 件 > 上限 ${pointCap * 2} 件 — 穴狙い型は根拠ある絞り込みが必要)`);
  }
  // 7. 荒れすぎ + S/A 級なし
  const sCount = candidates.filter((c) => c.ev >= 1.30).length;
  const aCount = candidates.filter((c) => c.ev >= 1.15 && c.ev < 1.30).length;
  const isRoughHard = (ev.development?.scenario === "荒れ") && ev.windWave?.roughLikelihood >= 70;
  if (sCount === 0 && aCount === 0 && isRoughHard) {
    skipReasons.push(`荒れ判定が強い + S級・A級候補なし — 期待値プラスが望めない`);
  }
  // 8. 拮抗 + 低 EV
  if (candidates.length > 0 && candidates[0].ev < 1.20 && ev.development?.scenario === "混戦") {
    skipReasons.push(`混戦かつ妙味弱 — 不確定要素が多く期待値プラスが薄い`);
  }

  /* === skip 理由が 1 つでもあれば見送り === */
  if (skipReasons.length > 0) {
    return {
      decision: "skip",
      reason: skipReasons[0],
      reasons: skipReasons,
      items: [], total: 0,
      rationale: "厳選した結果、勝てる可能性が高い買い目が見つかりませんでした。買えない日もあります。",
      accident: ev.accident?.isAccident ? ev.accident : null,
    };
  }

  // === Round 20: 利益重視 + 本命レースは絞る + 荒れレースのみ広げる ===
  //   ・本命レース (1号艇 ≥55% かつ 荒れ要素なし) → 1〜2 点に厳格に絞る (トリガミ防止)
  //   ・荒れる根拠が複数ある場合のみ点数を増やす
  // (sCount/aCount は skip 判定で既に算出済 — そのまま再利用)
  const isRough = ev.development?.scenario === "荒れ" || ev.development?.scenario === "混戦";
  const inUnstable = ev.inTrust?.level && (ev.inTrust.level === "荒れ注意" || ev.inTrust.level === "イン崩壊警戒");
  // 「荒れる根拠」 を点数化 (2 点以上で広げる対象)
  // 注: 1号艇逃げ濃厚 と判定されたレースでは「会場のまくり傾向」 は弱い根拠と見なし無視する
  //     (inProb の方がレース個別情報として優先度高い)
  let roughEvidence = 0;
  if (isRough) roughEvidence += 1;
  if (inUnstable) roughEvidence += 2;
  if ((ev.race?.wind ?? 0) >= 6) roughEvidence += 1;
  if ((ev.race?.wave ?? 0) >= 8) roughEvidence += 1;
  if (ev.windWave?.roughLikelihood >= 60) roughEvidence += 1;
  // 会場特性 (荒れやすい場) — ただしイン逃げ濃厚なら無視
  if (ev.venueProfile?.makuri >= 3 && ev.inTrust?.level !== "イン逃げ濃厚") roughEvidence += 1;
  // 本命レース判定:
  //   ・「イン逃げ濃厚」 (inProb 高 + 部品交換なし + チルト OK) なら強制 honmei
  //   ・もしくは 1号艇 ≥50% かつ 荒れ根拠 0
  const isHonmei = (ev.inTrust?.level === "イン逃げ濃厚") || (inDominant && roughEvidence === 0);

  /* === Round 35b: スタイル別「買い方」 を完全分離 ===
     ・steady     (本命党): 1〜2 点 (本命レースなら 1 点)
     ・balanced   (中堅党): 2〜4 点 (本命レースなら 1 点)
     ・aggressive (穴党)  : 3〜6 点 (本命レースなら 2 点)
     これにより 3 人の予想家が違う「買い方」 をする状態に。 */
  const upperByProfile = { steady: 2, balanced: 4, aggressive: 6 };
  const honmeiCapByProfile = { steady: 1, balanced: 1, aggressive: 2 };
  const upper = isHonmei
    ? (honmeiCapByProfile[riskProfile] || 1)
    : (upperByProfile[riskProfile] || 4);

  let suggestedCount;
  let why;
  if (isHonmei && sCount >= 1) {
    // 本命レース + S級あり → 1点 (steady) / 1-2点 (balanced/aggressive)
    suggestedCount = riskProfile === "aggressive" ? 2 : 1;
    why = `本命レース (1号艇 ${(inProb*100).toFixed(0)}%、荒れ根拠なし) → 本線 ${suggestedCount} 点に絞ります (トリガミ防止)`;
  } else if (isHonmei) {
    // 本命レース + S級なし → A級1点だけ or 見送り寄り
    suggestedCount = aCount >= 1 ? Math.min(2, upper) : 1;
    why = `本命レース → 候補を ${suggestedCount} 点に絞ります`;
  } else if (sCount >= 1 && roughEvidence >= 2) {
    // 荒れ根拠強 + S級あり → 広めに
    suggestedCount = Math.min(Math.max(4, sCount + aCount), upper);
    why = `荒れ根拠 ${roughEvidence} 件 + S級 ${sCount} → 広めに ${suggestedCount} 点`;
  } else if (sCount >= 1 && roughEvidence === 1) {
    suggestedCount = Math.min(Math.max(3, sCount + 1), upper);
    why = `S級 ${sCount} + 軽い荒れ要素 → ${suggestedCount} 点`;
  } else if (sCount >= 1) {
    suggestedCount = Math.min(Math.max(2, sCount), upper);
    why = `S級 ${sCount} 中心 → ${suggestedCount} 点`;
  } else if (aCount >= 1 && roughEvidence >= 2) {
    suggestedCount = Math.min(Math.max(4, aCount), upper);
    why = `荒れ根拠 ${roughEvidence} 件 + A級 ${aCount} → ${suggestedCount} 点`;
  } else if (aCount >= 1) {
    suggestedCount = Math.min(Math.max(2, aCount), upper);
    why = `A級 ${aCount} 中心 → ${suggestedCount} 点`;
  } else {
    suggestedCount = 1;
    why = `候補 ${candidates.length} 件 — 最低限 1 点`;
  }

  const numItems = Math.min(suggestedCount, candidates.length);
  const allocations = computeAllocationsExt(numItems, riskProfile);
  const stakes = allocations.map((a) => Math.max(100, Math.floor((perRaceCap * a) / 100) * 100));
  const roles = makeRoles(numItems);

  const top = candidates.slice(0, numItems);
  const items = top.map((t, i) => {
    const mainBoat = parseInt(t.combo[0]);
    const score = ev.scores.find((s) => s.boatNo === mainBoat);
    // 採用理由 — なぜこの買い目を出したか
    const pickReason = buildPickReason(t, score, ev, inDominant, inFavored, inProb);
    return {
      role: roles[i] || `候補${i + 1}`,
      kind: t.kind,
      combo: t.combo,
      prob: t.prob,                   // 推定的中確率 (0〜1)
      odds: t.odds,                   // 実オッズ
      expectedReturn: +(t.prob * t.odds).toFixed(3), // 期待回収率
      ev: t.ev,                       // (旧名互換) = expectedReturn
      evMinus1: +(t.prob * t.odds - 1).toFixed(3),   // EV (期待値プラスマイナス)
      stake: stakes[i] || 0,
      grade: t.ev >= 1.30 ? "S" : t.ev >= 1.10 ? "A" : t.ev >= 0.95 ? "B" : "C",
      conditionReasons: score?.conditionReasons || [],
      pickReason,                     // 採用理由 (UI で表示)
    };
  }).filter((it) => it.stake > 0);

  if (items.length === 0) {
    return { decision: "skip", reason: "予算配分後の有効候補なし", items: [], total: 0 };
  }

  // === Round 20: トリガミ除外 ===
  // 各買い目について「もしこの 1 点だけ的中した場合」 の収支を計算
  //   profit_if_only_i_hits = stake_i * odds_i - (全買い目の合計賭け金)
  // 本命 (items[0]) は保護、それ以降で profit < 0 (= 100 円儲からない) を除外
  const totalStakeSum = items.reduce((s, it) => s + it.stake, 0);
  const trigamiThreshold = 100; // 利益 100 円未満は実質トリガミ扱い
  const profitable = items.filter((it, idx) => {
    if (idx === 0) return true; // 本命は必ず残す
    const profitIfOnlyHits = it.stake * it.odds - totalStakeSum;
    return profitIfOnlyHits >= trigamiThreshold;
  });
  if (profitable.length < items.length) {
    const removed = items.length - profitable.length;
    why = `${why}（トリガミ除外で ${removed} 点削減）`;
  }

  const main = profitable[0] || items[0];
  // items を profitable に置き換え (本命1点しか残らない場合もある)
  items.length = 0;
  items.push(...profitable);

  /* === Round 36-37: 9 条件チェック ===
     EV だけで買わない。 全条件を満たしたときだけ「買い」 とする。 */
  const checks = [];
  // 1. データが最新 (apiOddsStale でない)
  checks.push({ ok: !ev.apiOddsStale, label: "データが最新", detail: ev.apiOddsStale ? "オッズがキャッシュ参考値" : "OK" });
  // 2. オッズ取得済み
  const oddsOk = !!(ev.race?.apiOdds && (
    Object.keys(ev.race.apiOdds.exacta || {}).length > 0
    || Object.keys(ev.race.apiOdds.trifecta || {}).length > 0
  ));
  checks.push({ ok: oddsOk, label: "オッズ取得済み", detail: oddsOk ? "OK" : "未取得" });
  // 3. 確率整合性
  const probOk = !ev.probConsistency || Math.abs(ev.probConsistency.oneFirstSum - 1) < 0.05;
  checks.push({ ok: probOk, label: "確率整合性 OK", detail: probOk ? "1着確率合計 ≒ 100%" : `1着確率合計 ${(ev.probConsistency.oneFirstSum * 100).toFixed(0)}%` });
  // 4. 的中時に利益が出る (期待回収率 >= EV下限)
  const profitOk = main.ev >= (EV_MIN_BY_PROFILE[riskProfile] || 1.20);
  checks.push({ ok: profitOk, label: "期待回収率 OK", detail: `${Math.round(main.ev * 100)}% (下限 ${Math.round((EV_MIN_BY_PROFILE[riskProfile] || 1.20) * 100)}%)` });
  // 5. 根拠が複数ある (Round 37: 引き上げ)
  const mainBoatNoForCheck = parseInt(main.combo[0]);
  const mainScoreForCheck = ev.scores.find((s) => s.boatNo === mainBoatNoForCheck);
  const evidenceCount = countMainEvidence(mainScoreForCheck);
  const minEvidence = MIN_EVIDENCE_BY_PROFILE[riskProfile] || 3;
  const evidenceOk = evidenceCount >= minEvidence;
  checks.push({ ok: evidenceOk, label: `根拠 ${minEvidence} つ以上`, detail: `現在 ${evidenceCount} / 6 つ` });
  // 6. 買い目が広がりすぎない
  const widthOk = items.length <= (POINT_CAP_BY_PROFILE[riskProfile] || 4);
  checks.push({ ok: widthOk, label: "買い目が広がりすぎない", detail: `${items.length} 点` });
  // 7. 危険要素が少ない
  const dangerOk = !ev.accident?.isAccident || riskProfile === "aggressive";
  checks.push({ ok: dangerOk, label: "危険要素が少ない", detail: ev.accident?.isAccident ? `severity ${ev.accident.severity}` : "OK" });
  // 8. (Round 37) 本命買い目の的中確率が「宝くじ過ぎない」 か (券種別)
  const minMainProb = getMinMainProb(riskProfile, main.kind);
  const probHighEnoughOk = main.prob >= minMainProb;
  checks.push({ ok: probHighEnoughOk, label: "的中確率が宝くじ過ぎない", detail: `${(main.prob * 100).toFixed(1)}% (${main.kind} 下限 ${(minMainProb * 100).toFixed(1)}%)` });
  // 9. (Round 37) 自信スコア
  const confidence = computeConfidence(ev, main, mainScoreForCheck, evidenceCount, riskProfile);
  const minConf = MIN_CONFIDENCE_BY_PROFILE[riskProfile] || 65;
  const confOk = confidence >= minConf;
  checks.push({ ok: confOk, label: "自信スコア OK", detail: `${confidence}/100 (下限 ${minConf})` });

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    return {
      decision: "skip",
      reason: `${checks.length} 条件中 ${failed.length} 件未達 — 厳選見送り`,
      reasons: [
        ...failed.map((c) => `❌ ${c.label}: ${c.detail}`),
        `✅ 通過: ${checks.length - failed.length} / ${checks.length}`,
        "全条件を満たさない限り買い判定を出しません",
      ],
      items: [], total: 0,
      checks,
      confidence,
    };
  }

  /* === Round 35c: 「保証回収率 (最悪ケース)」 + 利益設計 ===
     最低オッズの買い目だけが的中したケースで損しないか確認。
     ・steady     (本命型): worstCaseRoi >= 1.10 (10% 以上の利益保証必須)
     ・balanced   (中堅型): worstCaseRoi >= 1.05
     ・aggressive (穴狙い型): worstCaseRoi >= 1.00 (最悪ケースでも損なし)
     満たさない場合は points を 1 まで削減して再試行。 */
  const minWorstRoiByProfile = { steady: 1.10, balanced: 1.05, aggressive: 1.00 };
  const minWorstRoi = minWorstRoiByProfile[riskProfile] || 1.05;
  let totalStakeNow = items.reduce((s, it) => s + it.stake, 0);
  function computeWorstCase(arr, totalStake) {
    if (arr.length === 0) return { worstCasePayout: 0, worstCaseRoi: 0, expectedPayout: 0 };
    const worst = Math.min(...arr.map((it) => Math.round(it.stake * it.odds)));
    const exp = Math.round(arr.reduce((s, it) => s + it.prob * it.odds * it.stake, 0));
    return {
      worstCasePayout: worst,
      worstCaseRoi: totalStake > 0 ? worst / totalStake : 0,
      expectedPayout: exp,
    };
  }
  let wc = computeWorstCase(items, totalStakeNow);
  // 保証回収率を満たさない場合 → 本命1点 まで絞って再評価
  if (wc.worstCaseRoi < minWorstRoi && items.length > 1) {
    items.length = 0;
    items.push(profitable[0]);
    items[0].stake = perRaceCap; // 本命に全額集中
    totalStakeNow = items[0].stake;
    wc = computeWorstCase(items, totalStakeNow);
    why = `${why}（保証回収率 ${Math.round(minWorstRoi*100)}% 未達のため本命 1 点集中に変更）`;
  }
  // それでも満たさない場合 → 見送り (利益確保不能)
  if (wc.worstCaseRoi < minWorstRoi) {
    return {
      decision: "skip",
      reason: `利益確保不能 — 最悪ケース回収率 ${Math.round(wc.worstCaseRoi*100)}% < 必要 ${Math.round(minWorstRoi*100)}%`,
      reasons: [
        `当たっても利益が出ない買い方は出しません`,
        `${riskProfile}型の利益保証ライン: 回収率 ${Math.round(minWorstRoi*100)}% 以上`,
        `最低オッズの買い目が的中しても、総投資を回収できません`,
      ],
      items: [], total: 0,
    };
  }

  const mainBoat = parseInt(main.combo[0]);
  const mainScore = ev.scores.find((s) => s.boatNo === mainBoat);
  const reason = oneLineReason(mainScore, main);
  const allocationStyle = describeAllocationStyle(riskProfile, items.length);

  return {
    decision: "buy",
    reason,
    items,
    main: items[0],
    total: totalStakeNow,
    grade: main.grade,
    development: ev.development,
    /* 「なぜこの点数か」 — UI で表示 */
    rationale: why,
    points: items.length,
    profile: riskProfile,
    /* Round 35c: 利益設計 */
    worstCasePayout: wc.worstCasePayout,
    worstCaseRoi: +wc.worstCaseRoi.toFixed(2),
    expectedPayout: wc.expectedPayout,
    minProfitGuard: minWorstRoi,
    allocationStyle,
    /* Round 36-37: 9 条件チェック (全 OK だから買い) */
    checks,
    evidenceCount,
    confidence,
  };
}

/* === 予想分解: 本命艇のスコアを因子別に分解して可視化 ===
   どのデータが予想にどれだけ影響したかを %s で示す。 */
export function getScoreBreakdown(boat, race) {
  if (!boat) return null;
  const fIn = norm.in(boat.boatNo);
  const fMot = norm.motor(boat.motor2);
  const fEx = norm.ex(boat.exTime);
  const fSt = norm.st(boat.ST);
  const fWr = norm.wr(boat.winRate);
  const fB2 = norm.b2(boat.boat2);
  const cond = computeConditionMod(boat);
  const wd = windDirectionMod(boat, race?.windDir, race?.wind);
  const components = [
    { key: "inAdvantage", label: "1号艇有利度", value: fIn, weight: FACTOR_WEIGHTS.inAdvantage,
      contribution: +(fIn * FACTOR_WEIGHTS.inAdvantage).toFixed(3),
      note: `コース基本勝率 ${(norm.in(boat.boatNo) * 55).toFixed(0)}%` },
    { key: "motor", label: "モーター", value: fMot, weight: FACTOR_WEIGHTS.motor,
      contribution: +(fMot * FACTOR_WEIGHTS.motor).toFixed(3),
      note: boat.motor2 != null ? `2連率 ${boat.motor2}%` : "未取得" },
    { key: "exhibition", label: "展示タイム", value: fEx, weight: FACTOR_WEIGHTS.exhibition,
      contribution: +(fEx * FACTOR_WEIGHTS.exhibition).toFixed(3),
      note: boat.exTime != null ? `${boat.exTime}秒` : "未取得" },
    { key: "startPower", label: "スタート", value: fSt, weight: FACTOR_WEIGHTS.startPower,
      contribution: +(fSt * FACTOR_WEIGHTS.startPower).toFixed(3),
      note: boat.ST != null ? `平均ST ${boat.ST}` : "未取得" },
    { key: "winRate", label: "全国勝率", value: fWr, weight: 0.03,
      contribution: +(fWr * 0.03).toFixed(3),
      note: boat.winRate != null ? `${boat.winRate}` : "未取得" },
    { key: "boat2", label: "ボート2連率", value: fB2, weight: 0.02,
      contribution: +(fB2 * 0.02).toFixed(3),
      note: boat.boat2 != null ? `${boat.boat2}%` : "未取得" },
  ];
  const baseSum = components.reduce((s, c) => s + c.contribution, 0);
  const condMod = cond.mod * wd.mod;
  // 寄与度を %換算 (各因子が最終スコアの何 % を占めるか)
  const totalRaw = baseSum * condMod;
  const breakdown = components.map((c) => ({
    ...c,
    pctOfBase: baseSum > 0 ? Math.round((c.contribution / baseSum) * 100) : 0,
  }));
  return {
    breakdown,
    baseSum: +baseSum.toFixed(3),
    conditionMod: +condMod.toFixed(3),
    finalScore: +totalRaw.toFixed(3),
    conditionReasons: [...cond.reasons, wd.reason].filter(Boolean),
  };
}

/* === データ取得状況のサマリ === */
export function dataAvailability(race) {
  if (!race) return {};
  const boats = race.boats || [];
  const av = {
    "選手データ":   boats.length === 6 && boats.every(b => b.racer && b.class) ? "ok" : "—",
    "コース別成績": boats.some(b => b.localWinRate != null) ? "ok" : "—",
    "モーター成績": boats.some(b => b.motor2 != null) ? "ok" : "—",
    "ボート成績":   boats.some(b => b.boat2 != null) ? "ok" : "—",
    "展示タイム":   boats.some(b => b.exTime != null) ? "ok" : "—",
    "スタートST":   boats.some(b => b.ST != null) ? "ok" : "—",
    "チルト":       boats.some(b => b.tilt != null) ? "ok" : "—",
    "部品交換":     boats.some(b => b.partsExchange?.length) ? "ok" : "—",
    "オッズ":       race.apiOdds && (Object.keys(race.apiOdds.exacta || {}).length > 0
                                     || Object.keys(race.apiOdds.trifecta || {}).length > 0) ? "ok" : "—",
    "天候":         race.weather ? "ok" : "—",
    "風":           race.wind != null ? "ok" : "—",
    "波":           race.wave != null ? "ok" : "—",
  };
  const total = Object.keys(av).length;
  const got = Object.values(av).filter(v => v === "ok").length;
  return { items: av, completeness: total > 0 ? got / total : 0, got, total };
}
