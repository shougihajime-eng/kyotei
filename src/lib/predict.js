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

const COURSE_WIN_PCT = [55, 16, 12, 9, 6, 2];

export const FACTOR_WEIGHTS = {
  inAdvantage: 0.30,
  motor:       0.20,
  exhibition:  0.15,
  startPower:  0.20,
  oddsValue:   0.15,
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
  const baseScore =
    fIn * FACTOR_WEIGHTS.inAdvantage +
    fMot * FACTOR_WEIGHTS.motor +
    fEx * FACTOR_WEIGHTS.exhibition +
    fSt * FACTOR_WEIGHTS.startPower +
    fWr * 0.03 + fB2 * 0.02;
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

/* 各券種を全列挙して EV を計算 (実オッズが無い combo は除外) */
function enumerateExacta(probs, oddsTable) {
  const items = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i === j) continue;
    const odds = oddsTable[`${i+1}-${j+1}`];
    if (odds == null) continue;
    const p = rankProb2(probs, i, j);
    items.push({ kind: "2連単", combo: `${i+1}-${j+1}`, prob: p, odds, ev: p * odds });
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
    items.push({ kind: "3連単", combo: `${i+1}-${j+1}-${k+1}`, prob: p, odds, ev: p * odds });
  }
  return items;
}
function enumerateQuinella(probs, oddsTable) {
  const items = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const odds = oddsTable[`${i+1}=${j+1}`];
    if (odds == null) continue;
    const p = rankProb2(probs, i, j) + rankProb2(probs, j, i);
    items.push({ kind: "2連複", combo: `${i+1}=${j+1}`, prob: p, odds, ev: p * odds });
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
    items.push({ kind: "3連複", combo: `${i+1}=${j+1}=${k+1}`, prob: p, odds, ev: p * odds });
  }
  return items;
}

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

/* レース全体の評価 */
export function evaluateRace(race, newsItems) {
  if (!race?.boats || race.boats.length !== 6) return { ok: false, reason: "no-boats", message: "出走表未取得" };

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
  const out = {
    ok: true,
    probs, scores, items,
    top, maxEV: top?.ev ?? 0,
    topGrade: !top ? "—" : top.ev >= 1.30 ? "S" : top.ev >= 1.10 ? "A" : top.ev >= 0.95 ? "B" : "C",
    development,
    windWave,
    maeBuke,
    stExh,
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

/* 戦略別の買い目選定:
 *   攻め (aggressive): 3連単 のみ
 *   バランス (balanced): 2連単 + 3連単
 *   安全 (steady): 2連複 + 3連複
 * 上位 3 を「本命」「押さえ」「穴」 に割当て、本命を強調。
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
    aggressive: ["3連単"],
    balanced:   ["2連単", "3連単"],
    steady:     ["2連複", "3連複"],
  }[riskProfile] || ["2連単", "3連単"];

  const candidates = ev.items.filter((t) => allowed.includes(t.kind) && t.ev >= 1.10);
  if (candidates.length === 0) {
    return {
      decision: "skip",
      reason: `${allowed.join("/")}で EV 1.10 以上の候補なし`,
      items: [], total: 0,
    };
  }
  if (perRaceCap <= 0) {
    return { decision: "skip", reason: "1日予算/1レース上限が 0", items: [], total: 0 };
  }

  const top3 = candidates.slice(0, 3);
  const stakes = [
    Math.floor((perRaceCap * 0.60) / 100) * 100,
    Math.floor((perRaceCap * 0.25) / 100) * 100,
    Math.floor((perRaceCap * 0.15) / 100) * 100,
  ];
  const roles = ["本命", "押さえ", "穴"];

  const items = top3.map((t, i) => {
    const mainBoat = parseInt(t.combo[0]);
    const score = ev.scores.find((s) => s.boatNo === mainBoat);
    return {
      role: roles[i],
      kind: t.kind,
      combo: t.combo,
      prob: t.prob,
      odds: t.odds,
      ev: t.ev,
      stake: stakes[i] || 0,
      grade: t.ev >= 1.30 ? "S" : t.ev >= 1.10 ? "A" : "B",
      conditionReasons: score?.conditionReasons || [],
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
  };
}
