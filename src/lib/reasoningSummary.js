/**
 * Round 73 Phase 2: 予想理由の自然言語化
 *
 * buildReasoningSummary(rec, ev) → { whyBuy: string[3], whyNot: string[2], maxRisk: string }
 *
 * 例:
 *   whyBuy:  ["イン有利かつモーター上位で軸は堅い",
 *             "展示タイム差ありで2号艇評価",
 *             "確率 30% × オッズ 5.5倍 = EV 165%"]
 *   whyNot:  ["3号艇は展示タイム弱く軸不安",
 *             "4-6号艇は穴根拠 (motor/exhibition) 不足"]
 *   maxRisk: "1号艇のスタート失敗時、2 着流しが外れて全消し"
 */

const TOP3_LABELS = ["1号艇", "2号艇", "3号艇", "4号艇", "5号艇", "6号艇"];

export function buildReasoningSummary(rec, ev) {
  if (!rec) return { whyBuy: [], whyNot: [], maxRisk: "推奨なし", oneLine: "" };
  if (rec.decision !== "buy") {
    const reason = rec.reasons?.[0] || rec.reason || "見送り";
    return {
      whyBuy: [],
      whyNot: (rec.reasons || []).slice(0, 2),
      maxRisk: `見送り判断: ${reason}`,
      oneLine: `❌ 見送り — ${reason.slice(0, 30)}`,
    };
  }

  const main = rec.main || rec.items?.[0];
  if (!main || !ev) return { whyBuy: [], whyNot: [], maxRisk: "データ不足" };

  const mainBoatNo = parseInt(main.combo[0]);
  const mainScore = ev.scores?.find((s) => s.boatNo === mainBoatNo);
  const mainBoat = ev.race?.boats?.[mainBoatNo - 1];
  const f = mainScore?.factors || {};
  const inProb = ev.probs?.[0] || 0;

  /* === whyBuy 3 行: なぜこの買い目か === */
  const whyBuy = [];

  // 1 行目: 軸 (head) の評価
  const headStrengths = [];
  if (f.inAdvantage >= 0.6) headStrengths.push("イン有利");
  if (f.motor >= 0.7) headStrengths.push("モーター上位");
  if (f.exhibition >= 0.7) headStrengths.push("展示◎");
  if (f.startPower >= 0.7) headStrengths.push("ST 速い");
  if (f.winRate >= 0.6) headStrengths.push("選手勝率高");
  if (headStrengths.length >= 2) {
    whyBuy.push(`${TOP3_LABELS[mainBoatNo - 1]}は ${headStrengths.slice(0, 3).join("・")} で軸は堅い`);
  } else if (headStrengths.length === 1) {
    whyBuy.push(`${TOP3_LABELS[mainBoatNo - 1]}は ${headStrengths[0]} を主根拠に評価`);
  } else {
    whyBuy.push(`${TOP3_LABELS[mainBoatNo - 1]}は確率 ${Math.round(inProb * 100)}% で軸候補`);
  }

  // 2 行目: 相手 (流し対象) の評価
  if (main.combo.includes("-") || main.combo.includes("=")) {
    const others = main.combo.replace(/[-=]/g, "").slice(1).split("");
    const otherStrong = others.filter((c) => {
      const n = parseInt(c);
      const s = ev.scores?.find((sc) => sc.boatNo === n);
      return s?.factors?.exhibition >= 0.6 || s?.factors?.motor >= 0.6;
    });
    if (otherStrong.length > 0) {
      const labels = otherStrong.map((c) => TOP3_LABELS[parseInt(c) - 1]);
      whyBuy.push(`相手は ${labels.join("・")} を ${labels.length === 1 ? "展示/モーター差で" : "好材料で"} 評価`);
    } else {
      whyBuy.push(`相手は確率順 (${others.map((c) => `${c}号艇`).join("・")}) で構成`);
    }
  } else {
    whyBuy.push(`本線 1 点に絞り、 妙味のあるオッズを取りに行く`);
  }

  // 3 行目: EV 数値根拠
  const probPct = Math.round((main.prob || 0) * 100);
  const evPct = Math.round((main.ev || 0) * 100);
  whyBuy.push(`確率 ${probPct}% × オッズ ${main.odds?.toFixed(1)}倍 = EV ${evPct}% (基準超え)`);

  /* === whyNot 2 行: なぜ他を切ったか === */
  const whyNot = [];

  // 1 行目: 切った head 候補 (4-6号艇 の評価が低い場合等)
  const skippedHeads = [];
  for (let n = 1; n <= 6; n++) {
    if (n === mainBoatNo) continue;
    const sc = ev.scores?.find((s) => s.boatNo === n);
    const fb = sc?.factors;
    const reasons = [];
    if (fb?.exhibition < 0.4) reasons.push("展示弱");
    if (fb?.motor < 0.4) reasons.push("モーター低");
    if (fb?.startPower < 0.4) reasons.push("ST 遅");
    if (n >= 4 && reasons.length === 0) reasons.push("コース不利");
    if (reasons.length > 0) {
      skippedHeads.push(`${TOP3_LABELS[n - 1]}(${reasons.slice(0, 2).join("/")})`);
    }
  }
  if (skippedHeads.length >= 2) {
    whyNot.push(`軸不安: ${skippedHeads.slice(0, 2).join("、")}`);
  } else if (skippedHeads.length === 1) {
    whyNot.push(`${skippedHeads[0]} は軸切り`);
  } else {
    whyNot.push(`他艇は ${TOP3_LABELS[mainBoatNo - 1]} に対し劣勢で切る`);
  }

  // 2 行目: 切った券種 / 構成
  if (rec.profile === "steady") {
    whyNot.push("高配当狙いは 安定型に合わず除外 (的中率優先)");
  } else if (rec.profile === "aggressive") {
    whyNot.push("オッズ 8 倍未満は 攻め型では除外 (高配当のみ)");
  } else {
    whyNot.push("オッズ 60 倍超の超穴は バランス型では除外");
  }

  /* === maxRisk 1 行 === */
  let maxRisk = "想定通り推移しない場合は当然外れる";
  // 1 号艇有利度が高い場合のリスク
  if (mainBoatNo === 1 && inProb >= 0.55) {
    if (ev.race?.wind >= 4) {
      maxRisk = `1号艇のスタート失敗 + 風 ${ev.race.wind}m で外艇まくり時、 全消し`;
    } else if (mainBoat?.avgST != null && mainBoat.avgST > 0.16) {
      maxRisk = `1号艇 ST ${mainBoat.avgST.toFixed(2)} やや遅め — 出遅れて差される可能性`;
    } else {
      maxRisk = "1号艇の出遅れ + 2-3 号艇まくり時、 軸が崩れて全消し";
    }
  } else if (mainBoatNo >= 4) {
    maxRisk = `${TOP3_LABELS[mainBoatNo - 1]}の進入失敗 + 1号艇逃げ切り時、 軸が崩れる`;
  } else if (ev.accident?.isAccident) {
    maxRisk = `荒れリスク (severity ${ev.accident.severity}) — 想定外の着順あり`;
  } else if (mainBoat?.partsExchange?.length > 0) {
    maxRisk = `部品交換あり (${mainBoat.partsExchange.join("/")}) — 整備リスク`;
  }

  /* === 1 行サマリ (UI バー用) === */
  const oneLine = `🎯 ${main.combo} (${main.kind}) — ${headStrengths.slice(0, 1).join("") || "確率重視"} で勝負`;

  return { whyBuy, whyNot, maxRisk, oneLine };
}
