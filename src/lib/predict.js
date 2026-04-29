/**
 * 5因子で買い目を判定する固定ロジック。ブラックボックスなし。
 *   ① イン有利度 (1号艇の強さ / コース基本勝率)
 *   ② モーター評価 (モーター 2連率)
 *   ③ 展示タイム
 *   ④ スタート力 (平均ST)
 *   ⑤ オッズ評価 (期待値 = 確率 × オッズ)
 *
 * 各艇のスコアをこの 5 因子の重み付け和で算出 → softmax で確率化 → EV を計算。
 *
 * EV >= 1.30 → S 評価 (勝負)
 * EV >= 1.10 → A 評価 (買ってもいい)
 * EV  < 1.10 → 見送り
 */

/* コース別基本 1着率 (%) — 1〜6 コースの全国平均 */
const COURSE_WIN_PCT = [55, 16, 12, 9, 6, 2];

/* 各因子の重み (合計 1.0) */
export const FACTOR_WEIGHTS = {
  inAdvantage: 0.30,
  motor:       0.20,
  exhibition:  0.15,
  startPower:  0.20,
  oddsValue:   0.15, // 確率推定には使わず、最後に EV 算出で間接的に効く
};

export const FACTOR_LABELS = {
  inAdvantage: "1号艇有利度",
  motor:       "モーター",
  exhibition:  "展示タイム",
  startPower:  "スタート力",
  oddsValue:   "オッズ妙味",
};

/* 各因子を 0-1 に正規化 */
function normInAdvantage(boatNo) {
  return COURSE_WIN_PCT[boatNo - 1] / 55; // 1号艇 = 1.0, 2号艇 = 0.29, 6号艇 = 0.04
}
function normMotor(motor2 /* % */) {
  if (motor2 == null || isNaN(motor2)) return 0.5;
  // 30% を中央 (0.5)、50% で上限 (1.0)、10% で下限 (0.0) になるように
  return Math.max(0, Math.min(1, (motor2 - 10) / 40));
}
function normExhibition(exTime /* sec, smaller is better */) {
  if (exTime == null || isNaN(exTime)) return 0.5;
  // 6.65 (速い) = 1.0, 7.0 (普通) = 0.4, 7.2 (遅い) = 0.0
  return Math.max(0, Math.min(1, (7.2 - exTime) / 0.55));
}
function normStartPower(st /* sec, smaller is better */) {
  if (st == null || isNaN(st)) return 0.5;
  // 0.10 (早い) = 1.0, 0.18 (普通) = 0.4, 0.25 (遅い) = 0.0
  return Math.max(0, Math.min(1, (0.25 - st) / 0.15));
}

/* softmax */
function softmax(arr, temp = 1) {
  const max = Math.max(...arr);
  const exps = arr.map((v) => Math.exp((v - max) / Math.max(1e-6, temp)));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

/* 直前情報からの補正係数を計算 (0.85〜1.15) + 理由のリスト */
export function computeConditionMod(boat) {
  let mod = 1.0;
  const reasons = [];
  // 部品交換: 実戦未確認のため減点
  const parts = Array.isArray(boat.partsExchange) ? boat.partsExchange : [];
  if (parts.some((p) => /ペラ|プロペラ|エンジン/.test(p))) {
    mod *= 0.90;
    reasons.push({ kind: "neg", text: `部品交換 (${parts.join("/")}) — 実戦未確認 −10%` });
  } else if (parts.length > 0) {
    mod *= 0.95;
    reasons.push({ kind: "neg", text: `部品交換 (${parts.join("/")}) −5%` });
  }
  // チルト: 大きい値は外艇に有利、1号艇には不利
  if (boat.tilt != null && !isNaN(boat.tilt)) {
    if (boat.tilt >= 1.5) {
      if (boat.boatNo >= 4) { mod *= 1.05; reasons.push({ kind: "pos", text: `チルト ${boat.tilt} 外艇有利 +5%` }); }
      else if (boat.boatNo === 1) { mod *= 0.97; reasons.push({ kind: "neg", text: `チルト ${boat.tilt} 1号艇不利 −3%` }); }
    } else if (boat.tilt <= -0.5) {
      if (boat.boatNo === 1) { mod *= 1.03; reasons.push({ kind: "pos", text: `チルト ${boat.tilt} 出足型 1号艇有利 +3%` }); }
    }
  }
  // 展示気配メモ: ポジ/ネガ語のキーワードで補正
  const note = boat.exhibitionNote || "";
  if (note) {
    if (/良い|良し|良$|伸び|出足良|気配良|上昇|ターン良/.test(note)) {
      mod *= 1.05;
      reasons.push({ kind: "pos", text: `気配メモ「${note}」+5%` });
    } else if (/重い|悪|下降|伸びない|出足悪|気配悪/.test(note)) {
      mod *= 0.95;
      reasons.push({ kind: "neg", text: `気配メモ「${note}」−5%` });
    }
  }
  return { mod: Math.max(0.80, Math.min(1.20, mod)), reasons };
}

/* 全国勝率を 0-1 に正規化 (3.0〜7.5 をスパン) */
function normWinRate(wr) {
  if (wr == null || isNaN(wr)) return 0.5;
  return Math.max(0, Math.min(1, (wr - 3.0) / 4.5));
}
/* ボート 2連率 (補助因子。motor の半分の影響度) */
function normBoat2(b2) {
  if (b2 == null || isNaN(b2)) return 0.5;
  return Math.max(0, Math.min(1, (b2 - 10) / 40));
}
/* 風向補正 — 1号艇は向かい風で有利、追い風で外艇有利 */
function windDirectionMod(boat, windDir, wind) {
  if (!windDir || wind == null || wind < 3) return { mod: 1.0, reason: null };
  if (windDir === "向かい風") {
    if (boat.boatNo === 1) return { mod: 1.03, reason: { kind: "pos", text: `向かい風 ${wind}m 1号艇有利 +3%` } };
    if (boat.boatNo >= 4) return { mod: 0.98, reason: { kind: "neg", text: `向かい風 ${wind}m 外艇不利 −2%` } };
  }
  if (windDir === "追い風") {
    if (boat.boatNo === 1) return { mod: 0.97, reason: { kind: "neg", text: `追い風 ${wind}m 1号艇不利 −3%` } };
    if (boat.boatNo >= 4) return { mod: 1.03, reason: { kind: "pos", text: `追い風 ${wind}m 外艇有利 +3%` } };
  }
  return { mod: 1.0, reason: null };
}

/* 1艇のスコアを計算 (0-1) — 整備状況補正込み + 全国勝率 + ボート2連率 + 風向 */
function scoreBoat(boat, race) {
  const fIn = normInAdvantage(boat.boatNo);
  const fMot = normMotor(boat.motor2);
  const fEx = normExhibition(boat.exTime);
  const fSt = normStartPower(boat.ST);
  // 補助因子 (sub-factors): 全国勝率 + ボート 2連率
  const fWr = normWinRate(boat.winRate);
  const fB2 = normBoat2(boat.boat2);
  // 補助因子は base score に薄く混ぜる (合計 5%)
  const baseScore =
    fIn * FACTOR_WEIGHTS.inAdvantage +
    fMot * FACTOR_WEIGHTS.motor +
    fEx * FACTOR_WEIGHTS.exhibition +
    fSt * FACTOR_WEIGHTS.startPower +
    fWr * 0.03 +    // 補助: 全国勝率
    fB2 * 0.02;     // 補助: ボート 2連率
  // 整備補正 (Phase 1) + 風向補正
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

/* 因子スコアをグレード (A/B/C) で返す (理由表示用) */
export function gradeFactor(v) {
  if (v == null || isNaN(v)) return "—";
  if (v >= 0.7) return "A";
  if (v >= 0.4) return "B";
  return "C";
}

/* 単勝オッズ配列を返す (実オッズ優先、なければ控除率 75% で確率から逆算) */
function pickWinOdds(race, probs) {
  const real = race.currentWinOdds;
  return probs.map((p, i) => {
    const r = real?.[i];
    if (r != null && r > 0) return r;
    return p > 0 ? +(0.75 / p).toFixed(2) : 99;
  });
}

/* 展開シナリオ判定 — 「逃げ / まくり / 差し / 荒れ」の予測 + 一言コメント */
export function predictDevelopment(race, scores, probs) {
  const top = scores.map((s, i) => ({ ...s, prob: probs[i] })).sort((a, b) => b.prob - a.prob);
  const top1 = top[0]; const top2 = top[1];
  const inBoat = race.boats.find((b) => b.boatNo === 1);
  const wave = race.wave ?? 0;
  const wind = race.wind ?? 0;

  // インの絶対勝率 (1コース基本 + 当艇 ST + モーター)
  const inProbability = top.find((s) => s.boatNo === 1)?.prob || 0;
  const isRough = wave > 8 || wind > 6; // 荒水面
  const tilt1 = inBoat?.tilt ?? 0;

  let scenario, comment;
  if (inProbability > 0.45 && !isRough) {
    scenario = "逃げ";
    comment = `1号艇 ${inBoat?.racer || ""} の逃げ濃厚 (確率 ${(inProbability*100).toFixed(0)}%)`;
  } else if (top1.boatNo !== 1 && top1.prob > 0.30) {
    scenario = top1.boatNo === 2 ? "まくり" : "まくり差し";
    comment = `${top1.boatNo}号艇のまくり本線 (確率 ${(top1.prob*100).toFixed(0)}%)`;
  } else if (isRough) {
    scenario = "荒れ";
    comment = `荒水面 (風${wind}m / 波${wave}cm) — 番狂わせ警戒`;
  } else if (top1.prob - top2.prob < 0.05) {
    scenario = "混戦";
    comment = `本命なし — ${top1.boatNo}号艇と${top2.boatNo}号艇の差わずか`;
  } else {
    scenario = "標準";
    comment = `${top1.boatNo}号艇 (${(top1.prob*100).toFixed(0)}%) 中心`;
  }
  return { scenario, comment, inProbability, isRough, top: top.slice(0, 3) };
}

/* オッズ乖離分析 — AI 確率と市場確率の差を出す (overhype / underhype 検出) */
export function analyzeOddsGap(probs, winOdds) {
  // 市場の implied prob = 1 / odds (控除率を 25% として補正)
  const marketProbs = winOdds.map((o) => o > 0 ? Math.min(1, 0.75 / o) : 0);
  const marketSum = marketProbs.reduce((a, b) => a + b, 0) || 1;
  const normalized = marketProbs.map((m) => m / marketSum);

  return probs.map((p, i) => {
    const market = normalized[i];
    const gap = p - market;
    // gap > 0 → AI が市場より強気 (穴狙いの妙味)
    // gap < 0 → AI が市場より弱気 (過剰人気)
    return {
      boatNo: i + 1,
      aiProb: p,
      marketProb: market,
      gap,
      verdict:
        gap > 0.08 ? "💎 underhype (穴妙味)" :
        gap > 0.03 ? "AI 強気" :
        gap < -0.08 ? "🚨 過剰人気 (本命危険)" :
        gap < -0.03 ? "AI 弱気" :
        "市場と一致",
    };
  });
}

/* 会場適性 (当地勝率 vs 全国勝率) を補正に追加 */
export function venueAptitudeMod(boat) {
  if (boat.localWinRate == null || boat.winRate == null) return { mod: 1.0, reason: null };
  const diff = boat.localWinRate - boat.winRate;
  if (diff >= 1.0) return { mod: 1.06, reason: { kind: "pos", text: `当地勝率 +${diff.toFixed(1)} 会場適性◎ +6%` } };
  if (diff >= 0.5) return { mod: 1.03, reason: { kind: "pos", text: `当地勝率 +${diff.toFixed(1)} 会場適性○ +3%` } };
  if (diff <= -1.0) return { mod: 0.95, reason: { kind: "neg", text: `当地勝率 ${diff.toFixed(1)} 当地不振 −5%` } };
  if (diff <= -0.5) return { mod: 0.98, reason: { kind: "neg", text: `当地勝率 ${diff.toFixed(1)} 当地やや不振 −2%` } };
  return { mod: 1.0, reason: null };
}

/* レース全体を評価し、各艇の EV と推奨グレードを返す */
export function evaluateRace(race) {
  if (!race?.boats || race.boats.length === 0) {
    return { ok: false, reason: "no boats", tickets: [] };
  }

  const scores = race.boats.map((b) => scoreBoat(b, race));
  // 会場適性を追加補正
  scores.forEach((s) => {
    const boat = race.boats.find((b) => b.boatNo === s.boatNo);
    const va = venueAptitudeMod(boat);
    s.score *= va.mod;
    s.conditionMod *= va.mod;
    if (va.reason) s.conditionReasons.push(va.reason);
  });
  const probs = softmax(scores.map((s) => s.score), 0.30);
  const winOdds = pickWinOdds(race, probs);

  // 展開予想 + オッズ乖離分析
  const development = predictDevelopment(race, scores, probs);
  const oddsGaps = analyzeOddsGap(probs, winOdds);
  const oddsMovement = analyzeOddsMovement(race);

  const tickets = scores.map((s, i) => {
    const odds = winOdds[i];
    const prob = probs[i];
    const ev = prob * odds;
    const gap = oddsGaps[i];
    return {
      boatNo: s.boatNo,
      kind: "単勝",
      combo: String(s.boatNo),
      prob,
      odds,
      ev,
      factors: s.factors,
      conditionMod: s.conditionMod,
      conditionReasons: s.conditionReasons,
      gapVerdict: gap?.verdict,
      grade: ev >= 1.30 ? "S" : ev >= 1.10 ? "A" : ev >= 0.95 ? "B" : "C",
    };
  });

  // EV 降順
  const ranked = [...tickets].sort((a, b) => b.ev - a.ev);
  const maxEV = ranked[0]?.ev ?? 0;
  const topGrade = ranked[0]?.grade ?? "C";

  // 危険な人気艇: 市場確率 ≥ 30% かつ AI gap ≤ -8%
  const dangerousFavorites = oddsGaps.filter((g) => g.marketProb >= 0.30 && g.gap <= -0.08);

  return {
    ok: true,
    tickets,
    ranked,
    maxEV,
    topGrade,
    development,
    oddsGaps,
    oddsMovement,
    dangerousFavorites,
    summary: {
      bestBoat: ranked[0]?.boatNo ?? null,
      bestEV: maxEV,
      topProb: ranked[0]?.prob ?? 0,
    },
  };
}

/* オッズ変動分析 — 前回オッズと今回オッズの差を出す (10% 以上の変動を検出) */
export function analyzeOddsMovement(race) {
  const prev = race.prevOdds;
  const curr = race.currentWinOdds;
  if (!Array.isArray(prev) || !Array.isArray(curr)) return null;
  const moves = [];
  for (let i = 0; i < curr.length; i++) {
    if (!prev[i] || !curr[i]) continue;
    const changePct = ((curr[i] - prev[i]) / prev[i]) * 100;
    if (Math.abs(changePct) < 5) continue;
    moves.push({
      boatNo: i + 1,
      prev: prev[i],
      curr: curr[i],
      changePct,
      direction: changePct <= -20 ? "急落" : changePct <= -10 ? "下落"
               : changePct >= 20  ? "急上昇" : changePct >= 10 ? "上昇" : "微変動",
    });
  }
  return { hasHistory: moves.length > 0, moves };
}

/* 「なぜこの買い目なのか」 narrative を生成 */
export function buildBuyNarrative(ev, recommendation) {
  if (!ev?.ok || !recommendation || recommendation.decision !== "buy") return null;
  const lines = [];
  // 展開
  lines.push(`📍 ${ev.development.scenario}: ${ev.development.comment}`);
  // 危険な人気艇 (該当なければスキップ)
  if (ev.dangerousFavorites.length > 0) {
    const d = ev.dangerousFavorites[0];
    lines.push(`🚨 危険人気: ${d.boatNo}号艇 — 市場 ${(d.marketProb*100).toFixed(0)}% だが AI ${(d.aiProb*100).toFixed(0)}%`);
  }
  // 本命の理由 (5因子のうち高得点だったもの)
  const top = recommendation.items[0];
  if (top) {
    const f = top.factors;
    const strong = [];
    if (f.inAdvantage >= 0.7) strong.push("インコース有利");
    if (f.motor >= 0.7) strong.push("モーター好調");
    if (f.exhibition >= 0.7) strong.push("展示タイム良");
    if (f.startPower >= 0.7) strong.push("ST 良");
    if (f.winRate >= 0.7) strong.push("全国勝率高");
    const reasonText = strong.length > 0
      ? strong.join(" / ") + " で本命採用"
      : "突出要素はないが EV が立っている本命";
    lines.push(`✅ ${top.combo}号艇 (${top.role}): ${reasonText}`);
  }
  return lines;
}

/* 「なぜそのレースを買う/見送るか」 narrative */
export function buildRaceNarrative(ev, recommendation) {
  if (!ev?.ok) return ["データ不足のため判定不能"];
  if (recommendation?.decision === "buy") {
    return [
      `🎯 最高 EV ${ev.maxEV.toFixed(2)} (${ev.topGrade} 評価)`,
      `本命 ${ev.summary.bestBoat}号艇 確率 ${(ev.summary.topProb*100).toFixed(1)}%`,
      `展開: ${ev.development.scenario}`,
    ];
  }
  return [
    `❌ 最高 EV ${ev.maxEV.toFixed(2)} (1.10 未満) — 妙味なし`,
    `展開: ${ev.development.scenario}`,
    ev.dangerousFavorites.length > 0 ? `🚨 ${ev.dangerousFavorites[0].boatNo}号艇 過剰人気` : null,
  ].filter(Boolean);
}

/* 「買うか / 見送り」 + 配分された買い目を返す
 *  riskProfile: "steady" | "balanced" | "aggressive"
 *  perRaceCap: そのレースに使える上限 (円)
 *  forcedSkip: 強制見送りフラグ (連敗 / 日次損失到達)
 */
export function buildBuyRecommendation(ev, riskProfile, perRaceCap, forcedSkip) {
  if (!ev?.ok) return { decision: "skip", reason: "データ不足", items: [], total: 0 };
  if (forcedSkip) return { decision: "skip", reason: "強制見送り中 (損失/連敗)", items: [], total: 0 };

  // 買い候補: EV >= 1.10 のみ
  const candidates = ev.ranked.filter((t) => t.ev >= 1.10);
  if (candidates.length === 0) {
    return {
      decision: "skip",
      reason: `最高EV ${ev.maxEV.toFixed(2)} (1.10未満) — 妙味なし`,
      items: [], total: 0,
    };
  }
  if (perRaceCap <= 0) {
    return { decision: "skip", reason: "1日予算/1レース上限が 0", items: [], total: 0 };
  }

  // リスク感覚別の配分: 本命 / 押さえ / 穴 (合計1)
  const allocBy = {
    steady:     { 本命: 0.70, 押さえ: 0.30, 穴: 0.00 },
    balanced:   { 本命: 0.50, 押さえ: 0.30, 穴: 0.20 },
    aggressive: { 本命: 0.40, 押さえ: 0.30, 穴: 0.30 },
  };
  const alloc = allocBy[riskProfile] || allocBy.balanced;

  // 上位 3 候補を本命/押さえ/穴 として割り当て
  const roles = ["本命", "押さえ", "穴"];
  const top = candidates.slice(0, 3);
  const items = top.map((t, i) => {
    const role = roles[i];
    const portion = alloc[role] || 0;
    const stake = Math.floor((perRaceCap * portion) / 100) * 100;
    return {
      role,
      grade: t.grade,
      kind: t.kind,
      combo: t.combo,
      boatNo: t.boatNo,
      prob: t.prob,
      odds: t.odds,
      ev: t.ev,
      stake,
      factors: t.factors,
      conditionMod: t.conditionMod,
      conditionReasons: t.conditionReasons || [],
    };
  }).filter((it) => it.stake > 0);

  const total = items.reduce((s, it) => s + it.stake, 0);
  if (total === 0 || items.length === 0) {
    return { decision: "skip", reason: "EV閾値以上の候補に配分できる予算なし", items: [], total: 0 };
  }
  const out = {
    decision: "buy",
    reason: ev.topGrade === "S" ? "🔥 S評価 (EV ≧ 1.30)" : "✅ A評価 (EV ≧ 1.10)",
    items,
    total,
    grade: ev.topGrade,
    development: ev.development,
    dangerousFavorites: ev.dangerousFavorites,
  };
  out.narrative = buildBuyNarrative(ev, out);
  return out;
}
