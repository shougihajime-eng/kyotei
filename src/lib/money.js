/**
 * 資金管理 (シンプル版 — 安全装置は廃止)
 *   ・bankroll: 現在の資金 (表示のみ)
 *   ・dailyBudget: 1日の予算
 *   ・perRaceLimit: 1レース上限
 *
 * 過去の dailyLossStop / consecLossStop / forcedSkip 等の自動停止機能は廃止。
 * 判断はユーザーに委ねる。アプリは買い目提案 + EV + オッズ を出すのみ。
 */

export function defaultSettings() {
  return {
    bankroll: 50000,
    // Round 161: 万舟研究所 — 「買う場合は 5,000 円固定」 仕様
    dailyBudget: 25000,        // 1 日 5 レース分 (5,000 × 5)
    perRaceLimit: 5000,        // 1 レース上限 = 固定額
    fixedRaceStake: 5000,      // 1 レース合計の固定額 (Round 161)
    riskProfile: "balanced", // 安全 (steady) / バランス (balanced) / 攻め (aggressive)
    evMin: 1.10,
    virtualMode: true,       // エア舟券モード
    onboardingDone: false,
    autoRefresh: false,
  };
}

/* 本日の累計を集計 (エア/リアル を区別) */
export function summarizeToday(predictions) {
  const today = new Date().toISOString().slice(0, 10);
  const air = { stake: 0, ret: 0, count: 0, hits: 0 };
  const real = { stake: 0, ret: 0, count: 0, hits: 0 };
  const settled = Object.values(predictions || {})
    .filter((p) => p.date === today && p.decision === "buy" && p.result?.first);
  for (const p of settled) {
    const target = p.virtual === false ? real : air;
    target.stake += p.totalStake || 0;
    target.ret += p.payout || 0;
    target.count += 1;
    if (p.hit) target.hits += 1;
  }
  air.pnl = air.ret - air.stake;
  real.pnl = real.ret - real.stake;
  return { air, real };
}

/* 1 レースに使える金額 = min(perRaceLimit, dailyBudget - todayStake)
   Round 161: fixedRaceStake が設定されていれば固定額を優先 (買う場合 5,000 円固定) */
export function perRaceCap(settings, today) {
  const total = (today.air?.stake || 0) + (today.real?.stake || 0);
  const remaining = Math.max(0, (settings.dailyBudget || 0) - total);
  // fixedRaceStake が指定されていれば、 残予算が足りる範囲でそれを返す
  if (settings.fixedRaceStake && settings.fixedRaceStake > 0) {
    return Math.min(settings.fixedRaceStake, remaining);
  }
  return Math.max(0, Math.min(settings.perRaceLimit || 0, remaining));
}
