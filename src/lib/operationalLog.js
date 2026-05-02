/**
 * Round 60: 運用ロジック (精度向上ループ)
 *
 *   ・computeRollingStats(predictions, n)       - 直近 N 件の ROI / 的中率 / 平均 EV 推移
 *   ・computeAdjustmentSuggestions(rolling)     - EV 閾値 / confidence 重み / 抑制条件 の提案
 *   ・computePatternStrength(predictions)       - 日別 / 場別 / スタイル別 勝率 → 強いパターン抽出
 *   ・computeAccuracyHealth(rollingShort, longTerm) - 「精度低下中」 警告判定
 *
 * 全て純粋関数 — visibleData の派生として App.jsx で計算。
 */

/* === 1. 直近 N 件 ローリング統計 === */
export function computeRollingStats(predictions, n = 30) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first)
    .sort((a, b) => {
      const ka = (a.date || "") + (a.startTime || "");
      const kb = (b.date || "") + (b.startTime || "");
      return kb.localeCompare(ka);
    });
  const recent = all.slice(0, n);
  if (recent.length === 0) {
    return {
      sampleSize: 0, n, hitRate: null, roi: null, avgEv: null,
      avgConfidence: null, pnl: 0, label: "実績なし",
    };
  }
  let stake = 0, ret = 0, hits = 0, evSum = 0, confSum = 0, evCount = 0, confCount = 0;
  for (const p of recent) {
    stake += p.totalStake || 0;
    ret += p.payout || 0;
    if (p.hit) hits++;
    const main = p.combos?.[0];
    if (main?.ev) { evSum += main.ev; evCount++; }
    if (typeof p.confidence === "number") { confSum += p.confidence; confCount++; }
  }
  return {
    sampleSize: recent.length, n,
    hitRate: hits / recent.length,
    roi: stake > 0 ? ret / stake : null,
    avgEv: evCount > 0 ? evSum / evCount : null,
    avgConfidence: confCount > 0 ? confSum / confCount : null,
    pnl: ret - stake,
    stake, ret, hits, misses: recent.length - hits,
  };
}

/* === 2. ロジック調整提案 ===
   直近成績から EV 閾値 / confidence 下限を提案。
   user 設定で「自動適用」 にすれば適用される (現状は手動推奨)。 */
export function computeAdjustmentSuggestions(rollingShort, rollingLong, currentSettings) {
  const suggestions = [];
  if (!rollingShort || rollingShort.sampleSize < 5) {
    return { suggestions, ready: false, reason: "サンプル不足 (5 件未満)" };
  }
  // (a) ROI が極端に低い (< 80%) → EV 閾値を厳しく
  if (rollingShort.roi != null && rollingShort.roi < 0.85) {
    suggestions.push({
      key: "evThreshold",
      kind: "raise",
      severity: "high",
      message: `直近 ${rollingShort.sampleSize} 件の ROI が ${Math.round(rollingShort.roi * 100)}% — EV 閾値を上げる`,
      currentValue: currentSettings?.evMin || 1.20,
      suggestedValue: Math.min(1.40, (currentSettings?.evMin || 1.20) + 0.05),
    });
  }
  // (b) ROI 良好 (>= 110%) → 緩和を検討
  else if (rollingShort.roi != null && rollingShort.roi >= 1.10 && rollingShort.sampleSize >= 20) {
    suggestions.push({
      key: "evThreshold",
      kind: "lower",
      severity: "low",
      message: `直近 ${rollingShort.sampleSize} 件の ROI ${Math.round(rollingShort.roi * 100)}% — 良好。 EV 閾値を緩めて候補数増を検討`,
      currentValue: currentSettings?.evMin || 1.20,
      suggestedValue: Math.max(1.10, (currentSettings?.evMin || 1.20) - 0.02),
    });
  }
  // (c) 自信スコア平均が低い (<60) → confidence 重みを上げる
  if (rollingShort.avgConfidence != null && rollingShort.avgConfidence < 60) {
    suggestions.push({
      key: "confidenceWeight",
      kind: "raise",
      severity: "medium",
      message: `自信スコア平均 ${Math.round(rollingShort.avgConfidence)}/100 — 自信不足のレースが買われている`,
      currentValue: 1.0,
      suggestedValue: 1.2,
    });
  }
  // (d) 短期 vs 長期の悪化 → 抑制条件強化
  if (rollingShort && rollingLong &&
      rollingShort.roi != null && rollingLong.roi != null &&
      rollingLong.sampleSize >= 30 &&
      (rollingLong.roi - rollingShort.roi) > 0.20) {
    suggestions.push({
      key: "suppressionThreshold",
      kind: "raise",
      severity: "high",
      message: `直近 ${rollingShort.sampleSize} 件 ROI ${Math.round(rollingShort.roi*100)}% < 過去 ${rollingLong.sampleSize} 件 ROI ${Math.round(rollingLong.roi*100)}% — 抑制を強化`,
      currentValue: 60,
      suggestedValue: 70,
    });
  }
  return { suggestions, ready: true };
}

/* === 3. 強いパターン抽出 (日別 / 場別 / スタイル別) === */
export function computePatternStrength(predictions) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first);
  // 場別
  const byVenue = {};
  // スタイル別
  const byStyle = {};
  // 曜日別
  const byWeekday = {};
  for (const p of all) {
    if (p.venue) {
      byVenue[p.venue] = byVenue[p.venue] || { count: 0, hits: 0, stake: 0, ret: 0 };
      byVenue[p.venue].count++;
      byVenue[p.venue].stake += p.totalStake || 0;
      byVenue[p.venue].ret += p.payout || 0;
      if (p.hit) byVenue[p.venue].hits++;
    }
    const style = p.profile || "balanced";
    byStyle[style] = byStyle[style] || { count: 0, hits: 0, stake: 0, ret: 0 };
    byStyle[style].count++;
    byStyle[style].stake += p.totalStake || 0;
    byStyle[style].ret += p.payout || 0;
    if (p.hit) byStyle[style].hits++;
    // 曜日 (date から)
    if (p.date) {
      const d = new Date(p.date);
      const wd = ["日","月","火","水","木","金","土"][d.getDay()];
      byWeekday[wd] = byWeekday[wd] || { count: 0, hits: 0, stake: 0, ret: 0 };
      byWeekday[wd].count++;
      byWeekday[wd].stake += p.totalStake || 0;
      byWeekday[wd].ret += p.payout || 0;
      if (p.hit) byWeekday[wd].hits++;
    }
  }
  function rankTop(map, minSample = 3) {
    return Object.entries(map)
      .map(([k, v]) => ({
        key: k,
        count: v.count,
        hitRate: v.count > 0 ? v.hits / v.count : null,
        roi: v.stake > 0 ? v.ret / v.stake : null,
        pnl: v.ret - v.stake,
      }))
      .filter((x) => x.count >= minSample)
      .sort((a, b) => (b.roi || 0) - (a.roi || 0));
  }
  return {
    venues: rankTop(byVenue),
    styles: rankTop(byStyle, 1),
    weekdays: rankTop(byWeekday, 1),
  };
}

/* === 4. 精度低下警告 (Accuracy Health) ===
   短期と長期の比較から「ロジック調整中 / 精度低下中」 を判定。
   ・healthy: 短期 ROI >= 0.95 かつ 長期との差が小さい
   ・degrading: 短期 ROI < 長期 ROI - 15pt
   ・critical: 短期 ROI < 0.7 かつ 5+ 件
*/
export function computeAccuracyHealth(rollingShort, rollingLong) {
  if (!rollingShort || rollingShort.sampleSize < 5) {
    return {
      level: "unknown",
      label: "サンプル不足",
      tone: "mute",
      message: "5 件以上の確定データが必要です",
    };
  }
  const sR = rollingShort.roi;
  const lR = rollingLong?.roi;
  if (sR != null && sR < 0.7) {
    return {
      level: "critical",
      label: "🚨 精度低下中",
      tone: "neg",
      message: `直近 ${rollingShort.sampleSize} 件 ROI ${Math.round(sR * 100)}% — 大きく負け越し。 ロジック見直し中`,
    };
  }
  if (lR != null && sR != null && (lR - sR) > 0.15 && rollingLong.sampleSize >= 20) {
    return {
      level: "degrading",
      label: "⚠️ ロジック調整中",
      tone: "warn",
      message: `短期 ROI ${Math.round(sR*100)}% < 長期 ROI ${Math.round(lR*100)}% — 精度低下傾向`,
    };
  }
  if (sR != null && sR >= 1.05) {
    return {
      level: "healthy",
      label: "✅ 精度良好",
      tone: "ok",
      message: `直近 ${rollingShort.sampleSize} 件 ROI ${Math.round(sR * 100)}%`,
    };
  }
  return {
    level: "neutral",
    label: "📊 精度通常",
    tone: "info",
    message: `直近 ${rollingShort.sampleSize} 件 ROI ${sR != null ? Math.round(sR*100) + "%" : "—"}`,
  };
}
