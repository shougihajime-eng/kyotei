/**
 * 予想エンジン (連勝系 4 券種専用 — 単勝・複勝は対象外)
 *
 * 5 因子で各艇のスコア → softmax で確率推定 → Plackett-Luce で順位確率 → 実オッズで EV 計算。
 * 仮オッズは一切生成しない。実オッズが取れない券種は計算しない (「オッズ取得不可」状態)。
 *
 * 対象券種:
 *   ・2連単 (順序あり)
 *   ・2連複 (順序なし)
 *   ・3連単 (順序あり)
 *   ・3連複 (順序なし)
 */

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
  const note = boat.exhibitionNote || "";
  if (note) {
    if (/良い|良し|良$|伸び|出足良|気配良|上昇|ターン良/.test(note)) {
      mod *= 1.05; reasons.push({ kind: "pos", text: `気配「${note}」+5%` });
    } else if (/重い|悪|下降|伸びない|出足悪|気配悪/.test(note)) {
      mod *= 0.95; reasons.push({ kind: "neg", text: `気配「${note}」−5%` });
    }
  }
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

/* レース全体の評価
   learnedAdjustments: 過去の的中傾向から各因子の重み補正 (-0.05〜+0.05) を渡せる。
                       null なら標準重みのまま動作。 */
export function evaluateRace(race, newsItems, learnedAdjustments) {
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
    probConsistency,
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
   ・本命 (idx 0) に最も多く、後ろは指数的に減衰
   ・aggressive では上位を厚くしすぎず、下位にも残す */
function computeAllocationsExt(n, profile) {
  if (n <= 0) return [];
  if (n === 1) return [1.0];
  // 上位ほど多い指数減衰: weight = base^i
  const base = profile === "aggressive" ? 0.85 : profile === "steady" ? 0.65 : 0.75;
  const raw = Array.from({ length: n }, (_, i) => Math.pow(base, i));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
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

/* 戦略別の買い目選定:
 *   攻め (aggressive): 3連単 / 多めの点数 (4-6)
 *   バランス (balanced): 2連単 + 3連単 / 中程度 (3-4)
 *   安全 (steady): 2連複 + 3連複 / 少なめ (1-3)
 *
 * 6号艇から始まる買い目は明確根拠なしには採用しない。
 */
export function buildBuyRecommendation(ev, riskProfile, perRaceCap) {
  if (!ev) return { decision: "skip", reason: "未評価", items: [], total: 0 };
  if (ev.reason === "no-odds") {
    return { decision: "no-odds", reason: ev.message || "オッズ取得不可", items: [], total: 0 };
  }
  if (!ev.ok) {
    return { decision: "skip", reason: ev.message || "データ不足", items: [], total: 0 };
  }

  const allowed = {
    aggressive: ["3連単", "2連単"],
    balanced:   ["2連単", "3連単"],
    steady:     ["2連複", "3連複", "2連単"],
  }[riskProfile] || ["2連単", "3連単"];

  const boat6Valid = isBoat6CandidateValid(ev.race || {boats: []}, ev.scores || [], ev.probs || [], ev.inTrust);
  const inProbIdx = ev.scores?.findIndex((s) => s.boatNo === 1) ?? -1;
  const inProb = inProbIdx >= 0 ? (ev.probs?.[inProbIdx] ?? 0) : 0;
  // 1号艇逃げ濃厚 (≥50%) / やや有利 (≥45%) のときは外艇ヘッドを強く抑制する
  const inDominant = inProb >= 0.50;
  const inFavored = inProb >= 0.45;

  let candidates = ev.items.filter((t) => {
    if (!allowed.includes(t.kind)) return false;
    if (t.ev < 1.05) return false; // 期待回収率 105% 以上を候補に
    // 券種別 最低的中確率フィルタ — オッズが高いだけのスパイクを排除
    const minP = MIN_PROB_BY_KIND[t.kind] ?? 0.005;
    if (t.prob < minP) return false;
    // 6号艇本命チェック (展示◎/モーター/勝率/インドミナント低/荒れ/内側進入歴 の根拠)
    if (t.combo.startsWith("6") && !boat6Valid) return false;
    // インドミナント時は外艇ヘッドの本線採用を抑制
    if (inDominant) {
      // 1号艇逃げ濃厚 — ヘッドが 1 以外は EV ≥ 1.30 + 確率 2倍 を超えなければ除外
      const head = t.combo[0];
      if (head !== "1") {
        const minProbForOuter = (MIN_PROB_BY_KIND[t.kind] ?? 0.005) * 2;
        if (t.ev < 1.30 || t.prob < minProbForOuter) return false;
      }
    } else if (inFavored) {
      // やや有利 — 1ヘッド以外は EV 1.15 以上を要求
      const head = t.combo[0];
      if (head !== "1" && t.ev < 1.15) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return {
      decision: "skip",
      reason: `${allowed.join("/")}で EV 1.05 以上の候補なし`,
      items: [], total: 0,
      rationale: "妙味のあるオッズが見当たらないため見送り (回収率重視)",
    };
  }
  if (perRaceCap <= 0) {
    return { decision: "skip", reason: "1日予算/1レース上限が 0", items: [], total: 0 };
  }

  // === 見送り強化条件 (回収率最大化のための積極見送り) ===
  const topEv = candidates[0]?.ev || 0;
  const isRoughHard = (ev.development?.scenario === "荒れ") && ev.windWave?.roughLikelihood >= 70;
  const inUnstableHard = ev.inTrust?.level === "イン崩壊警戒";
  // S 級 (EV 1.30+) も A 級も無く、しかも荒れ要素強 → 見送り
  const sCountForSkip = candidates.filter((c) => c.ev >= 1.30).length;
  const aCountForSkip = candidates.filter((c) => c.ev >= 1.10 && c.ev < 1.30).length;
  if (sCountForSkip === 0 && aCountForSkip === 0 && (isRoughHard || inUnstableHard)) {
    return {
      decision: "skip",
      reason: "B級候補のみ + 荒れ/インドミナント低 — 回収率悪化リスクのため見送り",
      items: [], total: 0,
      rationale: "EV 1.10 未満かつ展開不透明。安易な購入は長期的にマイナスになるため見送り推奨",
    };
  }

  // === 利益重視: 候補 EV と分布を見て点数を動的に決める ===
  //  ・S級 (EV ≥ 1.30) が 1 つだけ → 絞り (1-3 点)
  //  ・S級 + A級 が 5 つ以上 → 広め (5-10 点)
  //  ・荒れ展開 (development.scenario === "荒れ") → さらに広め
  //  ・1号艇信頼度低 → 広め
  //  ・riskProfile aggressive → 上限緩い (最大 20 点)
  const sCount = candidates.filter((c) => c.ev >= 1.30).length;
  const aCount = candidates.filter((c) => c.ev >= 1.10 && c.ev < 1.30).length;
  const isRough = ev.development?.scenario === "荒れ" || ev.development?.scenario === "混戦";
  const inUnstable = ev.inTrust?.level && (ev.inTrust.level === "荒れ注意" || ev.inTrust.level === "イン崩壊警戒");

  const upperByProfile = { steady: 5, balanced: 10, aggressive: 20 };
  const upper = upperByProfile[riskProfile] || 10;

  let suggestedCount;
  let why;
  if (sCount >= 1 && aCount === 0 && !isRough && !inUnstable) {
    suggestedCount = Math.min(3, upper);
    why = `S級 1点 (EV ≥ 1.30) があり、展開も読みやすいため ${suggestedCount} 点に絞ります`;
  } else if (sCount >= 1 && (aCount >= 3 || isRough)) {
    suggestedCount = Math.min(Math.max(5, sCount + aCount - 1), upper);
    why = `S級 + A級が ${sCount + aCount} 件、${isRough ? "荒れ展開で" : ""} 広めに ${suggestedCount} 点取ります`;
  } else if (sCount >= 1) {
    suggestedCount = Math.min(Math.max(3, sCount + 1), upper);
    why = `S級 ${sCount} 点を中心に押さえを加えて ${suggestedCount} 点`;
  } else if (aCount >= 5 || isRough || inUnstable) {
    suggestedCount = Math.min(Math.max(6, aCount), upper);
    why = `A級が ${aCount} 件あり ${isRough || inUnstable ? "展開不透明なので" : ""} 広めに ${suggestedCount} 点`;
  } else if (aCount >= 1) {
    suggestedCount = Math.min(Math.max(3, aCount + 1), upper);
    why = `A級 ${aCount} 件を中心に ${suggestedCount} 点`;
  } else {
    suggestedCount = Math.min(2, upper);
    why = `B級のみ ${candidates.length} 件 — 最低限 ${suggestedCount} 点で補助購入`;
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

  const main = items[0];
  const mainBoat = parseInt(main.combo[0]);
  const mainScore = ev.scores.find((s) => s.boatNo === mainBoat);
  const reason = oneLineReason(mainScore, main);

  return {
    decision: "buy",
    reason,
    items,
    main,
    total: items.reduce((s, it) => s + it.stake, 0),
    grade: main.grade,
    development: ev.development,
    /* 「なぜこの点数か」 — UI で表示 */
    rationale: why,
    points: items.length,
    profile: riskProfile,
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
