/**
 * 戦略ランキング — 「今日はどの戦い方が有利か」 を一瞬で判断 (Round 32)
 *
 * 入力: allStyleRecommendations { steady: { raceId: rec }, balanced: {...}, aggressive: {...} }
 *       races: そのまま (会場 / 1号艇 prob を見るため)
 * 出力:
 *   ranking: [{ style, score, reasons }] (3 件、上位順)
 *   byVenue: 会場別の推奨戦略
 *   summary: 「今日は穴の日」 等のキャッチ
 */

const STYLE_LABELS = {
  steady:     "🛡️ 本命型 (イン逃げ重視)",
  balanced:   "⚖️ バランス型 (本命 + 中穴)",
  aggressive: "🎯 穴狙い型 (高配当狙い)",
};

/* スタイル別の指標を集計 */
function summarizeStyle(recsForStyle) {
  let buy = 0, skip = 0, sCount = 0, aCount = 0, totalEv = 0, totalProb = 0, holes = 0;
  let buyTotalStake = 0, buyTotalExpReturn = 0;
  for (const rec of Object.values(recsForStyle || {})) {
    if (rec?.decision === "buy") {
      buy++;
      const main = rec.main;
      if (main) {
        if (main.ev >= 1.30) sCount++;
        else if (main.ev >= 1.15) aCount++;
        totalEv += main.ev;
        totalProb += main.prob;
        if (main.combo && parseInt(main.combo[0]) >= 4) holes++;
      }
      buyTotalStake += rec.total || 0;
      buyTotalExpReturn += (main?.stake || 0) * (main?.odds || 0);
    } else if (rec?.decision === "skip") skip++;
  }
  const avgEv = buy > 0 ? totalEv / buy : 0;
  const avgProb = buy > 0 ? totalProb / buy : 0;
  return {
    buy, skip, sCount, aCount, holes,
    avgEv: +avgEv.toFixed(2),
    avgProb: +avgProb.toFixed(3),
    buyTotalStake,
    estReturnIfMainHits: buyTotalExpReturn,
  };
}

/* スコア化:
 *   ・買い候補が多い + S級多い + avgEv 高い → 高スコア
 *   ・aggressive のみ holes ボーナス
 */
function scoreStyle(style, sum) {
  let score = 0;
  score += sum.buy * 10;          // 買い候補数
  score += sum.sCount * 30;       // S 級ボーナス
  score += sum.aCount * 15;       // A 級ボーナス
  score += (sum.avgEv - 1) * 100; // 平均 EV プラス分 (e.g. avgEv=1.20 → +20)
  if (style === "aggressive") score += sum.holes * 20; // 穴狙い型は穴ヒット数で加点
  return Math.round(score);
}

/* 採用理由を生成 */
function reasonsFor(style, sum, allSums) {
  const r = [];
  if (sum.buy === 0) {
    r.push("買い候補なし — このスタイルでは本日見送り");
    return r;
  }
  r.push(`${sum.buy} レースで買い判定`);
  if (sum.sCount > 0) r.push(`S級 (期待回収率130%以上) ${sum.sCount} 件`);
  if (sum.aCount > 0) r.push(`A級 (期待回収率115-129%) ${sum.aCount} 件`);
  r.push(`平均期待回収率 ${Math.round(sum.avgEv * 100)}%`);
  if (style === "aggressive" && sum.holes > 0) {
    r.push(`根拠ある穴候補 ${sum.holes} 件`);
  }
  // 他スタイルとの比較
  const others = Object.entries(allSums).filter(([k]) => k !== style);
  const maxOtherBuy = Math.max(...others.map(([, s]) => s.buy));
  if (sum.buy > maxOtherBuy) r.push("他スタイルより買い候補が多い → 今日のメイン戦略");
  return r;
}

/* メインエントリ: 戦略ランキングを返す */
export function computeStrategyRanking(allStyleRecommendations) {
  const styles = ["steady", "balanced", "aggressive"];
  const sums = {};
  for (const s of styles) sums[s] = summarizeStyle(allStyleRecommendations?.[s]);

  const ranking = styles.map((s) => ({
    style: s,
    label: STYLE_LABELS[s],
    score: scoreStyle(s, sums[s]),
    summary: sums[s],
    reasons: reasonsFor(s, sums[s], sums),
  })).sort((a, b) => b.score - a.score);

  // 全スタイルが「買いゼロ」 なら、 「買えない日」
  const noOneBuys = ranking.every((r) => r.summary.buy === 0);
  // トップとボトムの差が大きいなら明確 (gap >= 50)
  const gap = ranking[0].score - ranking[2].score;
  const decisive = gap >= 50;

  let summary;
  if (noOneBuys) {
    summary = { kind: "skip-all", text: "📊 本日は見送り日 — どのスタイルも厳選見送りを推奨", emoji: "📊" };
  } else if (ranking[0].style === "aggressive" && decisive) {
    summary = { kind: "aggressive", text: "🎯 今日は『穴の日』 — 荒れ要素強・穴狙い有利", emoji: "🎯" };
  } else if (ranking[0].style === "steady" && decisive) {
    summary = { kind: "steady", text: "🛡️ 今日は『本命の日』 — イン逃げ濃厚・絞って勝負", emoji: "🛡️" };
  } else if (ranking[0].style === "balanced" && decisive) {
    summary = { kind: "balanced", text: "⚖️ 今日は『バランスの日』 — 中穴決着が中心", emoji: "⚖️" };
  } else {
    summary = { kind: "mixed", text: "🤔 戦略は拮抗 — レースごとに判断", emoji: "🤔" };
  }

  return { ranking, summary };
}
