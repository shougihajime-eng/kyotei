/**
 * Round 73 Phase 2: 予想理由の自然言語化
 *
 * buildReasoningSummary(rec, ev) → { whyBuy: string[], whyNot: string[2], maxRisk: string }
 *
 * Round 131: Round 121-130 で取得した補助データ (courseStats / recentForm /
 * dailyTrend) を whyBuy に追加で明示。 「なぜこの艇が選ばれたか」 を
 * ユーザーが完全に理解できる形にする。
 *
 * 例:
 *   whyBuy:  ["イン有利かつモーター上位で軸は堅い",
 *             "1号艇選手は1コースで 3連対率 88% (基準+8pt)",
 *             "1号艇選手は直近 平均着順 2.1 で好調",
 *             "今日この会場 7戦中 5回 1号艇1着 (堅い日)",
 *             "確率 30% × オッズ 5.5倍 = EV 165%"]
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

  // === Round 131: 補強根拠 (条件付き、 データある時だけ追加) ===
  // 軸の courseStats: 進入予定コースでの 3 連対率
  if (mainBoat?.courseStats && Array.isArray(mainBoat.courseStats)) {
    const myStat = mainBoat.courseStats.find((c) => c?.course === mainBoatNo);
    if (myStat?.showRate != null) {
      const baselines = [80, 55, 45, 38, 30, 22];
      const baseline = baselines[mainBoatNo - 1] ?? 50;
      const diff = myStat.showRate - baseline;
      if (diff >= 5) {
        whyBuy.push(`${TOP3_LABELS[mainBoatNo - 1]}選手は ${mainBoatNo}コースで 3連対率 ${myStat.showRate.toFixed(1)}% (基準+${diff.toFixed(0)}pt) — このコースが得意`);
      } else if (diff <= -5) {
        // 軸艇のコース実績が低い場合は whyNot に回す (whyBuy には書かない)
      }
    }
  }
  // 軸の recentForm: 直近の好調/不調
  if (mainBoat?.recentForm?.avg != null && mainBoat.recentForm.count >= 5) {
    const avg = mainBoat.recentForm.avg;
    if (avg <= 2.5) {
      whyBuy.push(`${TOP3_LABELS[mainBoatNo - 1]}選手は直近 平均着順 ${avg} で好調 (${mainBoat.recentForm.count}走)`);
    } else if (avg <= 3.0) {
      whyBuy.push(`${TOP3_LABELS[mainBoatNo - 1]}選手は直近 平均着順 ${avg} (やや好調)`);
    }
  }
  // 当日リアルタイム傾向
  if (ev.race?.dailyTrend && ev.race.dailyTrend.sampleSize >= 3) {
    const dt = ev.race.dailyTrend;
    const inPct = Math.round(dt.inWinRate * 100);
    if (dt.isStableDay && mainBoatNo === 1) {
      whyBuy.push(`今日この会場 ${dt.sampleSize}戦で 1号艇1着率 ${inPct}% — 堅い日 (1号艇本命に追い風)`);
    } else if (dt.isRoughDay && mainBoatNo >= 4) {
      whyBuy.push(`今日この会場 ${dt.sampleSize}戦で 1号艇1着率 ${inPct}% — 荒れ気味 (外艇本命に追い風)`);
    }
  }

  // 最後: EV 数値根拠
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

  /* === maxRisk 1 行 (Round 131 強化: 補助データを優先的に評価) === */
  let maxRisk = "想定通り推移しない場合は当然外れる";

  // Round 131: 軸艇のコース別実績が低い場合は最大リスクとして明記
  if (mainBoat?.courseStats && Array.isArray(mainBoat.courseStats)) {
    const myStat = mainBoat.courseStats.find((c) => c?.course === mainBoatNo);
    if (myStat?.showRate != null) {
      const baselines = [80, 55, 45, 38, 30, 22];
      const baseline = baselines[mainBoatNo - 1] ?? 50;
      if (myStat.showRate <= baseline - 5) {
        maxRisk = `${TOP3_LABELS[mainBoatNo - 1]}選手は ${mainBoatNo}コースの 3連対率 ${myStat.showRate.toFixed(1)}% (基準-${(baseline - myStat.showRate).toFixed(0)}pt) — このコース苦手の可能性`;
      }
    }
  }
  // Round 131: 軸艇が直近不調なら最大リスク
  if (maxRisk === "想定通り推移しない場合は当然外れる" &&
      mainBoat?.recentForm?.avg != null && mainBoat.recentForm.count >= 5) {
    if (mainBoat.recentForm.avg >= 4.0) {
      maxRisk = `${TOP3_LABELS[mainBoatNo - 1]}選手は直近 平均着順 ${mainBoat.recentForm.avg} で不調 — 軸として不安定`;
    }
  }
  // Round 131: 当日傾向が逆風なら最大リスク
  if (maxRisk === "想定通り推移しない場合は当然外れる" &&
      ev.race?.dailyTrend && ev.race.dailyTrend.sampleSize >= 3) {
    const dt = ev.race.dailyTrend;
    if (dt.isRoughDay && mainBoatNo === 1) {
      maxRisk = `今日この会場 1号艇1着率 ${Math.round(dt.inWinRate * 100)}% (荒れ気味) — 1号艇本命の信頼度が下がる日`;
    } else if (dt.isStableDay && mainBoatNo >= 4) {
      maxRisk = `今日この会場 1号艇1着率 ${Math.round(dt.inWinRate * 100)}% (堅い日) — 外艇本命は逆風`;
    }
  }

  // (元のリスク判定 — 上記いずれにも該当しない場合のフォールバック)
  if (maxRisk === "想定通り推移しない場合は当然外れる") {
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
  }

  /* === 1 行サマリ (UI バー用) === */
  const oneLine = `🎯 ${main.combo} (${main.kind}) — ${headStrengths.slice(0, 1).join("") || "確率重視"} で勝負`;

  return { whyBuy, whyNot, maxRisk, oneLine };
}
