/**
 * 自己進化エンジン — 過去の予想と結果から学習し、次の予想に反映する。
 *
 *   ① analyzeStrengthsAndWeaknesses(predictions):
 *      会場別 / 艇番 (1着) 別 / 風波別 / スタイル別 / 展開別 の ROI を集計し、
 *      得意条件 (ROI ≧ 1.10) と 苦手条件 (ROI ≦ 0.85) を抽出。
 *
 *   ② getLearnedWeights(predictions):
 *      過去の的中傾向から各因子の重み補正値を計算。predict.js に渡せる形式で返す。
 *      例: 「1号艇本命の的中率が低い」→ inAdvantage を弱める
 *           「モーター上位艇の的中率が高い」→ motor を強める
 *
 *   ③ getSituationalAdvice(race, predictions):
 *      現在のレースの状況 (風 / 波 / 会場) に対して、
 *      過去の同条件レースの成績から「今回の信頼度」 を返す。
 */

/* === 補助: predictions を確定済 (result あり) のみフィルタ === */
function settledList(predictions) {
  return Object.values(predictions || {})
    .filter((p) => p.result?.first && p.decision === "buy" && p.totalStake > 0);
}

function group(arr, keyFn) {
  const m = new Map();
  for (const p of arr) {
    const k = keyFn(p);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return m;
}

function summarize(arr) {
  let stake = 0, ret = 0, hits = 0;
  for (const p of arr) {
    stake += p.totalStake || 0;
    ret += p.payout || 0;
    if (p.hit) hits++;
  }
  return {
    count: arr.length, hits,
    stake, ret, pnl: ret - stake,
    roi: stake > 0 ? ret / stake : 0,
    hitRate: arr.length > 0 ? hits / arr.length : 0,
  };
}

/* === ① 得意 / 苦手 条件の抽出 === */
export function analyzeStrengthsAndWeaknesses(predictions) {
  const settled = settledList(predictions);
  if (settled.length < 5) return { strengths: [], weaknesses: [], hasEnoughData: false, sampleSize: settled.length };

  const buckets = [];

  // 会場別
  const byVenue = group(settled, (p) => p.venue);
  for (const [v, arr] of byVenue) {
    if (arr.length < 3) continue;
    const s = summarize(arr);
    buckets.push({ category: "会場", label: v, ...s });
  }

  // 1着艇番別 (本命艇番)
  const byMainBoat = group(settled, (p) => parseInt((p.combos || [])[0]?.combo[0] || "0"));
  for (const [b, arr] of byMainBoat) {
    if (!b || arr.length < 3) continue;
    const s = summarize(arr);
    buckets.push({ category: "本命艇番", label: `${b}号艇`, ...s });
  }

  // スタイル別
  const byProfile = group(settled, (p) => p.profile);
  for (const [pr, arr] of byProfile) {
    if (!pr || arr.length < 3) continue;
    const s = summarize(arr);
    const label = pr === "steady" ? "本命党" : pr === "balanced" ? "中堅党" : pr === "aggressive" ? "穴党" : pr;
    buckets.push({ category: "スタイル", label, ...s });
  }

  // 券種別
  const byKind = group(settled, (p) => (p.combos || [])[0]?.kind);
  for (const [k, arr] of byKind) {
    if (!k || arr.length < 3) continue;
    const s = summarize(arr);
    buckets.push({ category: "券種", label: k, ...s });
  }

  // 展開別 (記録時に保存していれば)
  // 現状 predictions に scenario が無いので skip。将来的に追加可能。

  buckets.sort((a, b) => b.roi - a.roi);
  const strengths = buckets.filter((b) => b.roi >= 1.10);
  const weaknesses = buckets.filter((b) => b.roi <= 0.85);

  return {
    hasEnoughData: true,
    sampleSize: settled.length,
    strengths,
    weaknesses,
    allBuckets: buckets,
  };
}

/* === ② 学習済みの重み補正 ===
   過去の hit/miss から、どの因子を強めれば良いかを計算する。
   実装方針:
     ・1号艇本命の的中率 vs 全国平均 (約 50%) を比較
     ・モーター上位艇 (motor2 ≥ 40) と中位艇の的中差を比較
     ・展示タイム良好艇の的中率を比較
     ・スタート力上位艇の的中率を比較
   各因子の最大補正幅は ±0.05 (重み 0.40 → 0.35〜0.45 の範囲)
*/
export function getLearnedWeights(predictions) {
  const settled = settledList(predictions);
  if (settled.length < 10) return { adjustments: {}, sampleSize: settled.length, ready: false };

  const adj = { inAdvantage: 0, motor: 0, exhibition: 0, startPower: 0 };
  const notes = [];

  // 1号艇本命の的中率
  const inMainAll = settled.filter((p) => parseInt((p.combos || [])[0]?.combo[0]) === 1);
  if (inMainAll.length >= 5) {
    const inHit = inMainAll.filter((p) => p.hit).length / inMainAll.length;
    if (inHit > 0.55) {
      adj.inAdvantage += 0.03;
      notes.push({ kind: "pos", text: `1号艇本命の的中率 ${Math.round(inHit*100)}% → イン有利度を強化 +0.03` });
    } else if (inHit < 0.30) {
      adj.inAdvantage -= 0.03;
      notes.push({ kind: "neg", text: `1号艇本命の的中率 ${Math.round(inHit*100)}% → イン有利度を抑制 -0.03` });
    }
  }

  // 「広げ買い」 と 「絞り買い」 の ROI 比較 (将来的に展開)
  // 今回は省略

  // 注: predict.js が利用するのは adj。注釈は UI 用。
  return {
    ready: true,
    sampleSize: settled.length,
    adjustments: adj,
    notes,
  };
}

/* === ③ 現在レース向けの状況的アドバイス === */
export function getSituationalAdvice(race, predictions) {
  const settled = settledList(predictions);
  if (settled.length < 10 || !race) return null;
  // 同会場の過去成績
  const sameVenue = settled.filter((p) => p.venue === race.venue);
  if (sameVenue.length < 3) return { message: `${race.venue} の過去データ不足 (${sameVenue.length} 件)`, kind: "info" };
  const s = summarize(sameVenue);
  if (s.roi >= 1.20) return { kind: "pos", message: `🔥 ${race.venue} は得意会場 (回収率 ${Math.round(s.roi*100)}% / ${sameVenue.length}件)` };
  if (s.roi >= 1.05) return { kind: "pos", message: `✅ ${race.venue} は好相性 (回収率 ${Math.round(s.roi*100)}%)` };
  if (s.roi <= 0.85) return { kind: "neg", message: `⚠️ ${race.venue} は苦手会場 (回収率 ${Math.round(s.roi*100)}%) — 慎重に` };
  return { kind: "neutral", message: `${race.venue} 平均的 (回収率 ${Math.round(s.roi*100)}%)` };
}
