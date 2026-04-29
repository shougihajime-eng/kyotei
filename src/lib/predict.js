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

/* 1艇のスコアを計算 (0-1) */
function scoreBoat(boat) {
  const fIn = normInAdvantage(boat.boatNo);
  const fMot = normMotor(boat.motor2);
  const fEx = normExhibition(boat.exTime);
  const fSt = normStartPower(boat.ST);
  const score =
    fIn * FACTOR_WEIGHTS.inAdvantage +
    fMot * FACTOR_WEIGHTS.motor +
    fEx * FACTOR_WEIGHTS.exhibition +
    fSt * FACTOR_WEIGHTS.startPower;
  return {
    boatNo: boat.boatNo,
    score,
    factors: { inAdvantage: fIn, motor: fMot, exhibition: fEx, startPower: fSt },
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

/* レース全体を評価し、各艇の EV と推奨グレードを返す */
export function evaluateRace(race) {
  if (!race?.boats || race.boats.length === 0) {
    return { ok: false, reason: "no boats", tickets: [] };
  }

  const scores = race.boats.map(scoreBoat);
  const probs = softmax(scores.map((s) => s.score), 0.30);
  const winOdds = pickWinOdds(race, probs);

  const tickets = scores.map((s, i) => {
    const odds = winOdds[i];
    const prob = probs[i];
    const ev = prob * odds;
    return {
      boatNo: s.boatNo,
      kind: "単勝",
      combo: String(s.boatNo),
      prob,
      odds,
      ev,
      factors: s.factors,
      grade: ev >= 1.30 ? "S" : ev >= 1.10 ? "A" : ev >= 0.95 ? "B" : "C",
    };
  });

  // EV 降順
  const ranked = [...tickets].sort((a, b) => b.ev - a.ev);
  const maxEV = ranked[0]?.ev ?? 0;
  const topGrade = ranked[0]?.grade ?? "C";

  return {
    ok: true,
    tickets,            // 元の艇番順
    ranked,             // EV 降順
    maxEV,
    topGrade,           // S / A / B / C
    summary: {
      bestBoat: ranked[0]?.boatNo ?? null,
      bestEV: maxEV,
      topProb: ranked[0]?.prob ?? 0,
    },
  };
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
    };
  }).filter((it) => it.stake > 0);

  const total = items.reduce((s, it) => s + it.stake, 0);
  if (total === 0 || items.length === 0) {
    return { decision: "skip", reason: "EV閾値以上の候補に配分できる予算なし", items: [], total: 0 };
  }
  return {
    decision: "buy",
    reason:
      ev.topGrade === "S"
        ? "🔥 S評価 (EV ≧ 1.30)"
        : "✅ A評価 (EV ≧ 1.10)",
    items,
    total,
    grade: ev.topGrade,
  };
}
