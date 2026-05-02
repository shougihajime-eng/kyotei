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

/* === Round 63: ラベル定義表 (優先順位順) ===
   priority: 数値が小さいほど優先 (1 が最高)
   各ラベルは triggers (発動条件) と severity を保持し、
   後から「なぜこのラベルになったか」 を追跡可能。 */
export const LABEL_PRIORITY = {
  win: {
    "高配当ヒット":     { priority: 1, severity: "high",   text: "💎 高配当ヒット" },
    "強気の妙味通過":   { priority: 2, severity: "high",   text: "🏆 強気の妙味 通過" },
    "想定通り中確率":   { priority: 3, severity: "medium", text: "🎯 想定通り (中確率)" },
    "想定通り高確率":   { priority: 4, severity: "low",    text: "✅ 想定通り (高確率)" },
    "ラッキー的中":     { priority: 5, severity: "low",    text: "🍀 ラッキー的中 (低確率)" },
    "安定勝利":         { priority: 6, severity: "low",    text: "✅ 安定勝利" },
  },
  loss: {
    "差され":           { priority: 1, severity: "high",   text: "💧 イン信頼過剰 (差され)" },
    "まくり負け":       { priority: 2, severity: "high",   text: "💨 イン信頼過剰 (まくり負け)" },
    "外艇まくり":       { priority: 3, severity: "high",   text: "🌊 イン信頼過剰 (外艇まくり)" },
    "イン崩壊":         { priority: 4, severity: "high",   text: "🌪️ イン信頼過剰 (イン崩壊)" },
    "オッズ過信":       { priority: 5, severity: "medium", text: "🎰 オッズ過信" },
    "コース適性誤判断": { priority: 6, severity: "medium", text: "🛡️ コース適性誤判断" },
    "外艇想定外":       { priority: 7, severity: "medium", text: "⚠️ 外艇想定外" },
    "風誤差":           { priority: 8, severity: "medium", text: "🌬️ 風の影響誤差" },
    "モーター軽視":     { priority: 9, severity: "low",    text: "🔧 モーター/展示の軽視" },
    "単純不調":         { priority: 10, severity: "low",   text: "📉 単純不調" },
  },
};

/* === 単一レースの勝敗を自動ラベル化 (Round 63 強化版) ===
   出力: { kind, primaryLabel, secondaryLabels, allTriggers, why, isManual }
   ・優先順位で primary 1 + secondary 最大 2 (過剰ラベル化防止)
   ・allTriggers で発動条件の完全ログを保持 (監査用)
   ・labelOverride 付き予測は手動ラベルを最優先 */
export function classifyOutcome(prediction) {
  if (!prediction || prediction.decision !== "buy" || !prediction.result?.first) return null;
  const main = prediction.combos?.[0];
  if (!main) return null;
  const result = prediction.result;
  const winnerHead = result.first;
  const expectedHead = parseInt(main.combo?.[0] || "0");

  // ユーザー手動ラベル修正 — 自動判定より優先
  if (prediction.labelOverride) {
    return {
      kind: prediction.hit ? "win" : "loss",
      primaryLabel: { key: "manual", text: `📝 手動: ${prediction.labelOverride}`, severity: "manual", priority: 0, triggers: [{ name: "manualOverride", value: prediction.labelOverride }] },
      secondaryLabels: [],
      allTriggers: [{ label: "manual", severity: "manual", triggers: [{ name: "manualOverride", value: prediction.labelOverride, source: "user" }] }],
      why: `手動修正: ${prediction.labelOverride}`,
      isManual: true,
      rawLabels: [{ key: "manual", text: `📝 ${prediction.labelOverride}`, severity: "manual" }],
      severities: ["manual"],
    };
  }

  /* 候補ラベル収集 (発動条件 triggers 付き) */
  const candidates = [];
  function addLabel(key, kind, triggers) {
    const def = LABEL_PRIORITY[kind][key];
    if (!def) return;
    candidates.push({ key, kind, ...def, triggers });
  }

  if (prediction.hit) {
    if (main.odds != null && main.odds >= 30) {
      addLabel("高配当ヒット", "win", [{ name: "odds", value: main.odds, threshold: 30, op: ">=" }]);
    }
    if (main.ev != null && main.ev >= 1.50) {
      addLabel("強気の妙味通過", "win", [{ name: "ev", value: main.ev, threshold: 1.50, op: ">=" }]);
    }
    if (main.prob != null && main.prob >= 0.10 && main.prob < 0.40) {
      addLabel("想定通り中確率", "win", [{ name: "prob", value: main.prob, range: "0.10-0.40" }]);
    }
    if (main.prob != null && main.prob >= 0.40) {
      addLabel("想定通り高確率", "win", [{ name: "prob", value: main.prob, threshold: 0.40, op: ">=" }]);
    }
    if (main.prob != null && main.prob < 0.05) {
      addLabel("ラッキー的中", "win", [{ name: "prob", value: main.prob, threshold: 0.05, op: "<" }]);
    }
    if (candidates.length === 0) {
      addLabel("安定勝利", "win", [{ name: "fallback", value: "no-special-condition" }]);
    }
  } else {
    // (a) イン信頼過剰系
    if (expectedHead === 1 && winnerHead !== 1) {
      if (winnerHead === 2) {
        addLabel("差され", "loss", [{ name: "expectedHead", value: 1 }, { name: "winnerHead", value: 2 }]);
      } else if (winnerHead === 3) {
        addLabel("まくり負け", "loss", [{ name: "expectedHead", value: 1 }, { name: "winnerHead", value: 3 }]);
      } else if (winnerHead >= 4) {
        addLabel("外艇まくり", "loss", [{ name: "expectedHead", value: 1 }, { name: "winnerHead", value: winnerHead, op: ">=4" }]);
      } else {
        addLabel("イン崩壊", "loss", [{ name: "expectedHead", value: 1 }, { name: "winnerHead", value: winnerHead }]);
      }
    }
    // (b) オッズ過信
    if (main.ev != null && main.ev >= 1.30 && main.prob != null && main.prob < 0.05) {
      addLabel("オッズ過信", "loss", [
        { name: "ev", value: main.ev, threshold: 1.30, op: ">=" },
        { name: "prob", value: main.prob, threshold: 0.05, op: "<" },
      ]);
    }
    // (c) 風誤差
    const wind = prediction.race?.wind ?? prediction.wind ?? 0;
    if (wind >= 5) {
      addLabel("風誤差", "loss", [{ name: "wind", value: wind, threshold: 5, op: ">=" }]);
    }
    // (d) 外艇想定外
    if (winnerHead >= 4 && expectedHead !== winnerHead) {
      addLabel("外艇想定外", "loss", [
        { name: "winnerHead", value: winnerHead, threshold: 4, op: ">=" },
        { name: "expectedHead", value: expectedHead, op: "!=winner" },
      ]);
    }
    // (e) コース適性誤判断 (大村/徳山等のイン強水面で外艇本命が外れ)
    if (expectedHead >= 2 && expectedHead <= 3 && winnerHead === 1) {
      const v = prediction.venue || "";
      if (/大村|徳山|住之江|尼崎|芦屋/.test(v)) {
        addLabel("コース適性誤判断", "loss", [
          { name: "venue", value: v, kind: "イン強水面" },
          { name: "expectedHead", value: expectedHead, range: "2-3" },
          { name: "winnerHead", value: 1 },
        ]);
      }
    }
    // (f) モーター軽視
    if (main.prob != null && main.prob < 0.08 && main.ev != null && main.ev >= 1.20) {
      addLabel("モーター軽視", "loss", [
        { name: "prob", value: main.prob, threshold: 0.08, op: "<" },
        { name: "ev", value: main.ev, threshold: 1.20, op: ">=" },
      ]);
    }
    // (g) 単純不調 — 上記いずれにも該当せず
    if (candidates.length === 0) {
      addLabel("単純不調", "loss", [{ name: "fallback", value: "no-other-trigger" }]);
    }
  }

  // 優先順位でソート (priority 小 = 高優先)
  candidates.sort((a, b) => a.priority - b.priority);
  const primary = candidates[0];
  // 過剰ラベル化防止: secondary は最大 2 つ (補助情報のみ — 学習対象外)
  const secondary = candidates.slice(1, 3);

  // === Round 63: ラベル confidence (0-1) ===
  // ・トリガー数が多いほど高い (max 1.0)
  // ・データ完全性: prob/odds/ev が揃っているか
  // ・severity が high なら +0.2 ボーナス (重要因子)
  function computeLabelConfidence(c) {
    if (!c) return 0;
    let conf = 0.4; // ベース
    const trigCount = (c.triggers || []).length;
    if (trigCount >= 3) conf += 0.30;
    else if (trigCount >= 2) conf += 0.20;
    else if (trigCount >= 1) conf += 0.10;
    // データ完全性
    if (main?.prob != null && main?.ev != null && main?.odds != null) conf += 0.15;
    // severity ボーナス
    if (c.severity === "high") conf += 0.15;
    else if (c.severity === "medium") conf += 0.05;
    return Math.max(0, Math.min(1, conf));
  }
  const primaryConfidence = computeLabelConfidence(primary);
  const isReliable = primaryConfidence >= 0.6; // 0.6 未満は学習・動的ガードから除外

  const allTriggers = candidates.map((c) => ({
    label: c.key, severity: c.severity, triggers: c.triggers,
  }));

  return {
    kind: prediction.hit ? "win" : "loss",
    primaryLabel: primary,
    secondaryLabels: secondary,
    allTriggers,
    why: primary?.text || "❌ 不的中",
    isManual: false,
    // Round 63: 信頼度
    confidence: primaryConfidence,
    isReliable,
    // 後方互換
    rawLabels: candidates.map((c) => ({ key: c.key, text: c.text, severity: c.severity })),
    severities: candidates.map((c) => c.severity),
  };
}

/* === Round 63: ラベル分布の集計 ===
   入力: predictions, n=10 (直近), m=30 (過去ベースライン)
   出力: { recentDist, baselineDist, anomalies: [{label, recentRate, baselineRate, change}] } */
export function computeLabelDistribution(predictions, n = 10, m = 30) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first)
    .sort((a, b) => {
      const ka = (a.date || "") + (a.startTime || "");
      const kb = (b.date || "") + (b.startTime || "");
      return kb.localeCompare(ka);
    });
  function countLabels(arr) {
    const m = {};
    for (const p of arr) {
      const out = classifyOutcome(p);
      if (!out?.primaryLabel) continue;
      const k = out.primaryLabel.key;
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }
  const recent = all.slice(0, n);
  const baseline = all.slice(0, Math.min(m, all.length));
  const recentCount = countLabels(recent);
  const baselineCount = countLabels(baseline);
  const recentSize = recent.length;
  const baselineSize = baseline.length;
  // 異常検知: 直近の発生率 > ベースラインの 1.5 倍 + 0.10 (ノイズ閾値)
  const anomalies = [];
  for (const [label, cnt] of Object.entries(recentCount)) {
    const recentRate = recentSize > 0 ? cnt / recentSize : 0;
    const baseCnt = baselineCount[label] || 0;
    const baseRate = baselineSize > 0 ? baseCnt / baselineSize : 0;
    if (recentRate >= 0.30 && recentRate > baseRate * 1.5 + 0.10) {
      anomalies.push({
        label,
        recentRate: +recentRate.toFixed(3),
        baselineRate: +baseRate.toFixed(3),
        recentCount: cnt,
        baselineCount: baseCnt,
        change: +(recentRate - baseRate).toFixed(3),
        message: `「${label}」 が直近 ${cnt}/${recentSize} 件 (${Math.round(recentRate * 100)}%) — 過去 ${Math.round(baseRate * 100)}% から増加中`,
      });
    }
  }
  return {
    recentSize, baselineSize,
    recentCount, baselineCount,
    anomalies,
    hasAnomaly: anomalies.length > 0,
  };
}

/* === Round 63: 手動ラベル修正 — predictions の labelOverride field をセット ===
   ユーザーが「これは違う」 と思ったら手動でラベルを上書き可能。 */
export function applyLabelOverride(predictions, key, overrideText) {
  const next = { ...predictions };
  const p = next[key];
  if (!p) return predictions;
  next[key] = { ...p, labelOverride: overrideText };
  return next;
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
