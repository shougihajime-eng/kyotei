/**
 * Round 73: 検証ログ (Verification Log)
 *
 * 「勝てるか検証」 モードで使う KPI 計算 + 検証バージョン管理。
 *
 * 検証バージョン (verificationVersion):
 *   ・予想ロジック / 閾値が変わるたびに incrementing する文字列
 *   ・例: "v2.preclose-strict.r70" (= Round 70 でロジック確定)
 *   ・予測レコードに verificationVersion を保存し、 期間別に分離可能
 *
 * KPI 関数:
 *   computeKpiSummary(predictions, opts) — ROI / 的中率 / 平均オッズ / 最大連敗 / スタイル別 / 連敗確率
 *
 * 「直前判定型のみ」 などの条件固定:
 *   filterForVerification(predictions, opts) — preCloseOnly / dateRange / style / version でフィルタ
 *
 * 連敗確率推定:
 *   estimateLossStreakProbability(hitRate, n=10) — 期待される連敗確率 (二項分布)
 */

/* === 現在の検証バージョン (ロジック更新ごとに incrementing) === */
export const CURRENT_VERIFICATION_VERSION = "v2.preclose-strict.r70";

/* === 検証フィルタ === */
export function filterForVerification(predictions, opts = {}) {
  const {
    preCloseOnly = true,           // 直前判定型のみ
    style = null,                   // null = all
    dateFrom = null,                // YYYY-MM-DD or null
    dateTo = null,
    verificationVersion = null,     // null = all versions
    decision = null,                // "buy" / "skip" / null=all
    onlySettled = false,            // 結果出ているもののみ
  } = opts;
  const out = [];
  for (const p of Object.values(predictions || {})) {
    if (!p) continue;
    if (preCloseOnly && p.preCloseTarget !== true) continue;
    if (style && (p.profile || "balanced") !== style) continue;
    if (dateFrom && (p.date || "") < dateFrom) continue;
    if (dateTo && (p.date || "") > dateTo) continue;
    if (verificationVersion && p.verificationVersion !== verificationVersion) continue;
    if (decision && p.decision !== decision) continue;
    if (onlySettled && !p.result?.first) continue;
    out.push(p);
  }
  return out;
}

/* === 最大連敗を計算 === */
export function computeMaxLossStreak(settled) {
  // settled: 日付/時刻順に sort された 結果出ている buy
  let cur = 0, max = 0;
  for (const p of settled) {
    if (p.hit === false) { cur++; if (cur > max) max = cur; }
    else cur = 0;
  }
  return max;
}

/* === 二項分布で「N 戦中 X 連敗以上」 確率を概算 ===
   hitRate=p, 試行 n, 連続 k 回外す確率 (近似) */
export function estimateLossStreakProbability(hitRate, n = 50, k = 10) {
  const q = 1 - Math.max(0.01, Math.min(0.99, hitRate));
  // 「k 連敗が n 試行中に少なくとも 1 回起きる」 確率の近似
  // P(k 連敗 starting at i) ≒ q^k, 開始位置 (n - k + 1) 通り
  const positions = Math.max(0, n - k + 1);
  // 独立近似 (実際は重複あり) → 上限見積りとして 1 - (1 - q^k)^positions
  const pStreakAtPos = Math.pow(q, k);
  const pNoStreak = Math.pow(1 - pStreakAtPos, positions);
  return Math.max(0, Math.min(1, 1 - pNoStreak));
}

/* === KPI サマリ === */
export function computeKpiSummary(predictions, opts = {}) {
  const { preCloseOnly = true, dateFrom = null, dateTo = null, verificationVersion = null } = opts;
  const buys = filterForVerification(predictions, {
    preCloseOnly, dateFrom, dateTo, verificationVersion,
    decision: "buy", onlySettled: true,
  });
  const skips = filterForVerification(predictions, {
    preCloseOnly, dateFrom, dateTo, verificationVersion,
    decision: "skip",
  });

  // 全体 KPI
  const overall = aggregateKpi(buys);
  overall.skipCount = skips.length;
  overall.skipCorrect = skips.filter((p) => p.skipCorrect === true).length;
  overall.skipMissed = skips.filter((p) => p.skipMissed === true).length;
  overall.skipDecisionRate = skips.length > 0 ? overall.skipCorrect / skips.length : null;

  // スタイル別 KPI
  const byStyle = {};
  for (const s of ["steady", "balanced", "aggressive"]) {
    const arr = buys.filter((p) => (p.profile || "balanced") === s);
    byStyle[s] = aggregateKpi(arr);
  }

  // 連敗確率
  if (overall.hitRate != null && overall.count >= 10) {
    overall.lossStreakProb_10 = estimateLossStreakProbability(overall.hitRate, 50, 10);
    overall.lossStreakProb_5 = estimateLossStreakProbability(overall.hitRate, 50, 5);
  }

  return {
    overall,
    byStyle,
    samples: { buyCount: buys.length, skipCount: skips.length },
    filter: { preCloseOnly, dateFrom, dateTo, verificationVersion },
    healthSignals: detectHealthSignals(overall, byStyle),
  };
}

function aggregateKpi(arr) {
  let stake = 0, ret = 0, hits = 0, oddsSum = 0, oddsCount = 0;
  // sort 時系列
  const sorted = [...arr].sort((a, b) =>
    (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || ""))
  );
  for (const p of sorted) {
    stake += p.totalStake || 0;
    ret += p.payout || 0;
    if (p.hit) hits++;
    // 平均オッズ (本線 combo の odds)
    const main = (p.combos || [])[0];
    if (main?.odds != null) {
      oddsSum += main.odds;
      oddsCount++;
    }
  }
  const maxLossStreak = computeMaxLossStreak(sorted);
  return {
    count: sorted.length,
    hits,
    miss: sorted.length - hits,
    stake, ret, pnl: ret - stake,
    roi: stake > 0 ? +(ret / stake).toFixed(3) : null,
    hitRate: sorted.length > 0 ? +(hits / sorted.length).toFixed(3) : null,
    avgOdds: oddsCount > 0 ? +(oddsSum / oddsCount).toFixed(2) : null,
    maxLossStreak,
  };
}

/* === 健全性シグナル ===
   ・サンプル不足、 ROI 低下、 偏った勝ち負け 等を警告 */
function detectHealthSignals(overall, byStyle) {
  const signals = [];
  if (overall.count < 30) {
    signals.push({ level: "info", text: `サンプル ${overall.count} 件 — 検証には 30 件以上必要 (現在 ${30 - overall.count} 件不足)` });
  }
  if (overall.count >= 10 && overall.roi != null && overall.roi < 0.85) {
    signals.push({ level: "critical", text: `ROI ${Math.round(overall.roi * 100)}% — 大幅に負け越し、 ロジック見直し必要` });
  } else if (overall.count >= 30 && overall.roi != null && overall.roi < 1.0) {
    signals.push({ level: "warning", text: `ROI ${Math.round(overall.roi * 100)}% (1.0 未満) — エアでも改善余地あり` });
  } else if (overall.count >= 30 && overall.roi != null && overall.roi >= 1.05) {
    signals.push({ level: "good", text: `ROI ${Math.round(overall.roi * 100)}% — エアで安定的にプラス、 リアル少額試行 OK` });
  }
  if (overall.maxLossStreak >= 8) {
    signals.push({ level: "warning", text: `最大連敗 ${overall.maxLossStreak} 戦 — 資金管理を厳格に` });
  }
  // スタイル間ばらつき
  const rois = ["steady", "balanced", "aggressive"]
    .map((s) => byStyle[s]?.roi)
    .filter((v) => v != null);
  if (rois.length >= 2) {
    const max = Math.max(...rois);
    const min = Math.min(...rois);
    if (max - min >= 0.30) {
      signals.push({ level: "info", text: `スタイル間 ROI 差 ${Math.round((max - min) * 100)}pt — 良スタイルに集中検討` });
    }
  }
  return signals;
}

/* === 「勝てる可能性」 評価 (3 段階) === */
export function evaluateWinnability(kpi) {
  const o = kpi?.overall;
  if (!o) return { level: "unknown", text: "データなし" };
  if (o.count < 30) {
    return {
      level: "未検証",
      text: `サンプル ${o.count} 件 (30 件未満) — 判定不能。 まずエアで蓄積を`,
      ok: false,
    };
  }
  if (o.roi == null) return { level: "unknown", text: "結果未確定" };
  if (o.roi >= 1.10) {
    return {
      level: "勝てる可能性あり",
      text: `${o.count} 戦 ROI ${Math.round(o.roi * 100)}%・的中率 ${Math.round((o.hitRate || 0) * 100)}% — エアで継続検証 OK`,
      ok: true,
    };
  }
  if (o.roi >= 1.0) {
    return {
      level: "微妙",
      text: `${o.count} 戦 ROI ${Math.round(o.roi * 100)}% — 控除率超えるが安全圏ではない、 様子見`,
      ok: null,
    };
  }
  if (o.roi >= 0.85) {
    return {
      level: "負け越し",
      text: `${o.count} 戦 ROI ${Math.round(o.roi * 100)}% — 改善余地あり、 ロジック調整推奨`,
      ok: false,
    };
  }
  return {
    level: "致命的",
    text: `${o.count} 戦 ROI ${Math.round(o.roi * 100)}% — ロジック根本見直し必要`,
    ok: false,
  };
}
