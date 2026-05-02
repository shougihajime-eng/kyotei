/**
 * Round 61: 購入レースの勝敗自動ラベル化
 *
 *   ・classifyOutcome(prediction): 勝敗の理由を分類
 *     - 勝ち: 安定勝利 / 想定通り / 配当ヒット / ラッキー的中
 *     - 負け: 風の影響誤差 / オッズ過信 / イン信頼過剰 / 展示誤差 /
 *             戦法相性誤算 / 単純不調 / 想定外の決まり手
 *
 *   ・computeRecentPurchaseAnalysis(predictions, n=10): 直近 N 件の購入レースのみで
 *     勝ちパターン / 負けパターンを抽出し UI に提示
 */

/* === 単一レースの勝敗を自動ラベル化 ===
   入力: prediction (buy + result 確定済)
   出力: { kind: "win"|"loss", primaryLabel, secondaryLabels, why } */
export function classifyOutcome(prediction) {
  if (!prediction || prediction.decision !== "buy" || !prediction.result?.first) return null;
  const main = prediction.combos?.[0];
  if (!main) return null;
  const result = prediction.result;
  const winnerHead = result.first;
  const expectedHead = parseInt(main.combo?.[0] || "0");

  // 勝ち
  if (prediction.hit) {
    const labels = [];
    if (main.prob != null && main.prob >= 0.40) labels.push("✅ 想定通り (高確率)");
    else if (main.prob != null && main.prob >= 0.10) labels.push("🎯 想定通り (中確率)");
    else if (main.prob != null && main.prob < 0.05) labels.push("🍀 ラッキー的中 (低確率)");
    if (main.odds != null && main.odds >= 30) labels.push("💎 高配当ヒット");
    if (main.ev != null && main.ev >= 1.50) labels.push("🏆 強気の妙味 通過");
    if (labels.length === 0) labels.push("✅ 安定勝利");
    return {
      kind: "win",
      primaryLabel: labels[0],
      secondaryLabels: labels.slice(1),
      why: labels.join(" + "),
    };
  }

  // 負け — 原因をラベル化
  const labels = [];
  // (a) イン信頼過剰: 1号艇本命だったが 1号艇は 1着でない
  if (expectedHead === 1 && winnerHead !== 1) {
    if (winnerHead === 2) labels.push({ key: "差され", text: "💧 イン信頼過剰 (2 号艇に差された)", severity: "high" });
    else if (winnerHead === 3) labels.push({ key: "まくり負け", text: "💨 イン信頼過剰 (3 号艇まくりに屈した)", severity: "high" });
    else if (winnerHead >= 4) labels.push({ key: "外艇まくり", text: "🌊 イン信頼過剰 (外艇まくり/まくり差し)", severity: "high" });
    else labels.push({ key: "イン崩壊", text: "🌪️ イン信頼過剰 (1号艇崩壊)", severity: "high" });
  }
  // (b) オッズ過信: 高 EV だが 低 prob で外れ
  if (main.ev != null && main.ev >= 1.30 && main.prob != null && main.prob < 0.05) {
    labels.push({ key: "オッズ過信", text: "🎰 オッズ過信 (期待値高だが的中確率は宝くじ並)", severity: "medium" });
  }
  // (c) 風の影響誤差: 強風時 + windDir 補正が外れた
  const wind = prediction.race?.wind ?? prediction.wind ?? 0;
  if (wind >= 5) {
    labels.push({ key: "風誤差", text: `🌬️ 風の影響誤差 (風 ${wind}m で予想がブレた可能性)`, severity: "medium" });
  }
  // (d) 戦法相性誤算: 2-3 コースが「まくり型」 配置で見落とし
  // (race の boats 情報がここでは取れないので簡略化)
  // (e) 想定外の決まり手: 4号艇以上が 1着なのに本命じゃなかった
  if (winnerHead >= 4 && expectedHead !== winnerHead) {
    labels.push({ key: "外艇想定外", text: "⚠️ 想定外の決まり手 (4-6 号艇 1 着)", severity: "medium" });
  }
  // (g) モーター軽視: 本命のモーター値が低い (低 motor2) なのに本命選定
  // (race info があれば) ※ 現状 prediction には combos のみ含まれる場合 race 情報が薄いので簡易判定
  // boats 情報が prediction に含まれない設計のため、 ev 高 + low prob を指標で代替
  if (main.prob != null && main.prob < 0.08 && main.ev != null && main.ev >= 1.20) {
    labels.push({ key: "モーター軽視", text: "🔧 モーター/展示の軽視 (低確率買い目)", severity: "low" });
  }
  // (h) コース適性誤判断: 1コース有利な場で 2-3 号艇本命が外れた
  // (場名から推定可能だが prediction.venue から場特性を再推定)
  if (expectedHead >= 2 && expectedHead <= 3 && winnerHead === 1) {
    const v = prediction.venue || "";
    if (/大村|徳山|住之江|尼崎|芦屋/.test(v)) {
      labels.push({ key: "コース適性誤判断", text: `🛡️ コース適性誤判断 (${v}はイン強水面)`, severity: "medium" });
    }
  }
  // (f) 単純不調 — 何も特別な原因なし
  if (labels.length === 0) {
    labels.push({ key: "単純不調", text: "📉 単純不調 (予想構造に大きな問題なし、 確率の振れ幅)", severity: "low" });
  }
  return {
    kind: "loss",
    primaryLabel: labels[0]?.text || "❌ 不的中",
    secondaryLabels: labels.slice(1).map(l => l.text),
    severities: labels.map(l => l.severity),
    why: labels.map(l => l.text).join(" + "),
    rawLabels: labels,
  };
}

/* === Round 62: deepReview — 購入レース徹底検証 ===
   purchaseAnalysis をさらに強化:
   ・各レースの 予想時 EV/confidence/選定理由 と 結果 を突合
   ・頻出ミスから動的ガード (EV 閾値 +5pt 等) を生成
   ・現在の警告メッセージ (例: 「風関連ミスが増加中」)
*/
export function computeDeepReview(predictions, n = 10) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first)
    .sort((a, b) => {
      const ka = (a.date || "") + (a.startTime || "");
      const kb = (b.date || "") + (b.startTime || "");
      return kb.localeCompare(ka);
    });
  const recent = all.slice(0, n);
  const reviews = recent.map((p) => {
    const main = p.combos?.[0];
    const label = classifyOutcome(p);
    return {
      key: p.key,
      date: p.date,
      venue: p.venue,
      raceNo: p.raceNo,
      startTime: p.startTime,
      profile: p.profile,
      hit: p.hit,
      pnl: p.pnl,
      // 予想時データ
      predicted: {
        kind: main?.kind,
        combo: main?.combo,
        ev: main?.ev,
        prob: main?.prob,
        odds: main?.odds,
        pickReason: main?.pickReason,
        confidence: p.confidence,
      },
      // 結果データ
      result: {
        first: p.result?.first,
        second: p.result?.second,
        third: p.result?.third,
        payout: p.payout,
      },
      label, // 自動ラベル
    };
  });

  // 頻出ミス上位 3 件 (rawLabels 経由)
  const lossLabelCounts = {};
  for (const r of reviews) {
    if (r.label?.kind === "loss") {
      for (const ll of r.label.rawLabels || []) {
        lossLabelCounts[ll.key] = (lossLabelCounts[ll.key] || 0) + 1;
      }
    }
  }
  const topMistakes = Object.entries(lossLabelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => ({ key, count, severity: count >= 3 ? "high" : count >= 2 ? "medium" : "low" }));

  // 動的ガードの提案
  const dynamicGuards = [];
  for (const m of topMistakes) {
    if (m.count < 2) continue; // 最低 2 件で発動
    if (m.key === "オッズ過信") {
      dynamicGuards.push({ key: "raise-prob-floor", reason: "オッズ過信ミスが頻発", action: "最低的中確率を 1.5 倍に引き上げ" });
    }
    if (m.key === "風誤差") {
      dynamicGuards.push({ key: "raise-ev-when-windy", reason: "風関連ミスが頻発", action: "風 5m+ 時は EV 閾値 +5pt" });
    }
    if (m.key === "差され" || m.key === "まくり負け" || m.key === "外艇まくり" || m.key === "イン崩壊") {
      dynamicGuards.push({ key: "raise-in-trust", reason: "イン信頼過剰ミスが頻発", action: "1号艇本命は inTrust=「イン逃げ濃厚」 限定" });
    }
    if (m.key === "外艇想定外") {
      dynamicGuards.push({ key: "expand-aggressive", reason: "外艇 1 着の想定外", action: "穴狙い型を相対的に強化" });
    }
  }

  // 現在の警告 (1 行)
  let activeWarning = null;
  if (topMistakes.length > 0 && topMistakes[0].count >= 3) {
    const labels = {
      "オッズ過信": "🎰 オッズ過信ミスが増加中",
      "風誤差": "🌬️ 風関連ミスが増加中",
      "差され": "💧 イン信頼過剰ミスが増加中",
      "まくり負け": "💨 まくり負けが増加中",
      "外艇まくり": "🌊 外艇まくり負けが増加中",
      "イン崩壊": "🌪️ イン崩壊ミスが増加中",
      "外艇想定外": "⚠️ 外艇 1 着の想定外が増加中",
    };
    activeWarning = labels[topMistakes[0].key] || `${topMistakes[0].key} が ${topMistakes[0].count} 件`;
  }

  // 戦績サマリ
  const wins = reviews.filter(r => r.hit).length;
  const losses = reviews.length - wins;
  let stake = 0, ret = 0;
  reviews.forEach(r => { stake += r.predicted ? (r.predicted.odds ? 0 : 0) : 0; });
  // 実際の stake は元データから
  for (const p of recent) { stake += p.totalStake || 0; ret += p.payout || 0; }
  const roi = stake > 0 ? ret / stake : null;

  return {
    sampleSize: reviews.length,
    requestedSize: n,
    reviews,
    topMistakes,
    dynamicGuards,
    activeWarning,
    summary: {
      wins, losses,
      roi,
      pnl: ret - stake,
      hitRate: reviews.length > 0 ? wins / reviews.length : null,
    },
  };
}

/* === 直近 N 件の購入レース分析 (勝ちパターン / 負けパターン) ===
   入力: predictions (visibleData)
   出力: { recent[], winPatterns, lossPatterns, summary } */
export function computeRecentPurchaseAnalysis(predictions, n = 10) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first)
    .sort((a, b) => {
      const ka = (a.date || "") + (a.startTime || "");
      const kb = (b.date || "") + (b.startTime || "");
      return kb.localeCompare(ka);
    });
  const recent = all.slice(0, n);
  const labeled = recent.map((p) => ({
    key: p.key, date: p.date, venue: p.venue, raceNo: p.raceNo, hit: p.hit,
    pnl: p.pnl, profile: p.profile,
    label: classifyOutcome(p),
  })).filter(x => x.label);

  // 集計: 負けの主要因 (key) ごとの発生数
  const lossPatternCounts = {};
  const winPatternCounts = {};
  for (const r of labeled) {
    const lab = r.label;
    if (lab.kind === "loss") {
      for (const ll of (lab.rawLabels || [])) {
        lossPatternCounts[ll.key] = (lossPatternCounts[ll.key] || 0) + 1;
      }
    } else {
      const pri = lab.primaryLabel;
      winPatternCounts[pri] = (winPatternCounts[pri] || 0) + 1;
    }
  }
  const topLossPatterns = Object.entries(lossPatternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => ({ key, count }));
  const topWinPatterns = Object.entries(winPatternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({ label, count }));

  // サマリ (1 行)
  const wins = labeled.filter(x => x.label.kind === "win").length;
  const losses = labeled.filter(x => x.label.kind === "loss").length;
  let summary;
  if (labeled.length === 0) {
    summary = "購入レースがまだありません";
  } else if (topLossPatterns.length > 0 && topLossPatterns[0].count >= 3) {
    summary = `直近 ${labeled.length} 件中、 「${topLossPatterns[0].key}」 が ${topLossPatterns[0].count} 件 — 注意`;
  } else if (wins > losses) {
    summary = `直近 ${labeled.length} 件: ${wins}勝${losses}敗 — 安定`;
  } else {
    summary = `直近 ${labeled.length} 件: ${wins}勝${losses}敗 — 改善余地`;
  }
  return {
    sampleSize: labeled.length,
    recent: labeled,
    winPatterns: topWinPatterns,
    lossPatterns: topLossPatterns,
    summary,
  };
}
