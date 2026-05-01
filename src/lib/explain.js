/**
 * 数値 → 平易な日本語の説明 (Round 24)
 *
 * 確率/EV/ROI/オッズ などの数字を 小学生でも分かる言葉で言い換える。
 * UI から呼び出して、技術用語の隣にツールチップ的に表示する。
 */

/* 期待回収率 (1.0=100%) を平易に説明 */
export function explainExpectedReturn(er) {
  if (er == null || isNaN(er)) return { tone: "mute", text: "—" };
  if (er >= 1.50) return { tone: "ok",   text: "長期的には大きくプラスを狙える" };
  if (er >= 1.20) return { tone: "ok",   text: "長期的には少しプラスを狙える" };
  if (er >= 1.05) return { tone: "info", text: "わずかに妙味あり" };
  if (er >= 0.95) return { tone: "warn", text: "ほぼトントン (期待値ニュートラル)" };
  return { tone: "neg", text: "長期的にはマイナス。買う価値が薄い" };
}

/* 推定的中確率 + オッズ → 「低確率・高配当」 警告 */
export function explainProbOdds(prob, odds) {
  if (prob == null || odds == null) return null;
  if (prob < 0.01 && odds >= 80) {
    return { tone: "warn", text: `⚠️ 低確率 (${(prob*100).toFixed(1)}%) × 高配当 (${odds.toFixed(0)}倍) — 当たりにくい大穴` };
  }
  if (prob < 0.005) {
    return { tone: "warn", text: `⚠️ 100回に ${Math.round(prob*100*10)/10}回しか当たらない計算` };
  }
  if (prob >= 0.40) {
    return { tone: "ok", text: `当たりやすい (${Math.round(prob*100)}%)` };
  }
  if (prob >= 0.15) {
    return { tone: "info", text: `そこそこ当たる (${Math.round(prob*100)}%)` };
  }
  return null;
}

/* 回収率 (ROI) を平易に */
export function explainROI(roi) {
  if (roi == null || isNaN(roi)) return { tone: "mute", text: "—" };
  if (roi >= 1.30) return { tone: "ok",   text: "30%以上のプラス。好調" };
  if (roi >= 1.10) return { tone: "ok",   text: "10%以上のプラス。順調" };
  if (roi >= 1.00) return { tone: "info", text: "ちょうどトントン" };
  if (roi >= 0.85) return { tone: "warn", text: "やや負け越し" };
  return { tone: "neg", text: "大きく負け越し — 戦略の見直しを" };
}

/* 的中率を平易に */
export function explainHitRate(rate) {
  if (rate == null || isNaN(rate)) return { tone: "mute", text: "—" };
  const pct = Math.round(rate * 100);
  if (rate >= 0.40) return { tone: "ok",   text: `${pct}% — よく当たる` };
  if (rate >= 0.20) return { tone: "info", text: `${pct}% — まずまず` };
  if (rate >= 0.10) return { tone: "warn", text: `${pct}% — 少なめ (高配当狙い向き)` };
  return { tone: "neg", text: `${pct}% — 当たりにくい` };
}

/* グレード 文字を平易に */
export function explainGrade(grade) {
  if (grade === "S") return { tone: "ok",   text: "強気の妙味あり" };
  if (grade === "A") return { tone: "ok",   text: "妙味あり" };
  if (grade === "B") return { tone: "warn", text: "判断微妙" };
  if (grade === "C") return { tone: "neg",  text: "妙味薄い" };
  return { tone: "mute", text: "—" };
}

/* 見送り判定の「価値」 を平易に */
export function explainSkip(reason) {
  return {
    title: "📊 賢い見送り",
    body: reason || "妙味のあるオッズが見当たらないため見送り",
    why: "勝負レースを選ぶことで、長期的な回収率が改善します",
  };
}

/* tone → 色 */
export const toneColor = {
  ok:   "#a7f3d0",
  info: "#bae6fd",
  warn: "#fde68a",
  neg:  "#fca5a5",
  mute: "#9fb0c9",
};
