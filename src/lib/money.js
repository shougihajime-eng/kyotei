/**
 * 資金管理ロジック (破産しない設計)
 *   ・資産の N% (デフォルト 5%) しか 1 日に使わない
 *   ・1 レース上限 (1日予算の 1/3 程度を推奨)
 *   ・3 連敗 → その日は強制見送り
 *   ・1 日損失上限 (例: 資産の 10%) 到達 → 強制見送り
 */

export function defaultSettings() {
  return {
    bankroll: 50000,
    dailyBudget: 2500,    // 5% of bankroll
    perRaceLimit: 1000,   // dailyBudget の 1/3〜1/2 目安
    dailyLossStop: 5000,  // 10% of bankroll
    consecLossStop: 3,    // 3 連敗で停止
    riskProfile: "balanced", // steady / balanced / aggressive
    evMin: 1.10,          // 買い候補とする最小 EV
    onboardingDone: false,
    autoRefresh: false,
  };
}

/** 本日の累計を集計 */
export function summarizeToday(predictions) {
  const today = new Date().toISOString().slice(0, 10);
  let stake = 0, ret = 0, count = 0, hits = 0, losses = 0, consec = 0;
  // 確定済みの予想を時系列順に
  const settled = Object.values(predictions || {})
    .filter((p) => p.date === today && p.decision === "buy" && p.result?.first)
    .sort((a, b) => (a.result.fetchedAt || "").localeCompare(b.result.fetchedAt || ""));
  for (const p of settled) {
    stake += p.totalStake || 0;
    ret += p.payout || 0;
    count += 1;
    if (p.hit) { hits += 1; consec = 0; }
    else       { losses += 1; consec += 1; }
  }
  return { stake, ret, pnl: ret - stake, count, hits, losses, consec };
}

/** 資金管理状態 (今日の予算 / 上限 / 強制見送りか) */
export function moneyState(settings, today) {
  const remainingDaily = Math.max(0, (settings.dailyBudget || 0) - (today.stake || 0));
  const dailyLossHit = (today.pnl || 0) <= -(settings.dailyLossStop || 0);
  const consecHit = (today.consec || 0) >= (settings.consecLossStop || 99);
  const forcedSkip = dailyLossHit || consecHit;
  const reasons = [];
  if (dailyLossHit) reasons.push(`本日損失 ${Math.abs(Math.round(today.pnl)).toLocaleString()}円 ≧ 上限 ${(settings.dailyLossStop || 0).toLocaleString()}円`);
  if (consecHit) reasons.push(`${today.consec} 連敗 ≧ ${settings.consecLossStop} 連敗ストップ`);
  return {
    remainingDaily,
    forcedSkip,
    reasons,
    dailyLossHit,
    consecHit,
  };
}

/** 1 レースに使える金額 = min(perRaceLimit, remainingDaily) */
export function perRaceCap(settings, today) {
  const m = moneyState(settings, today);
  if (m.forcedSkip) return 0;
  return Math.max(0, Math.min(settings.perRaceLimit || 0, m.remainingDaily));
}
