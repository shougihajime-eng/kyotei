/**
 * Round 73 Phase 1: 検証ログ + KPI 計算 検証
 *
 * 検証項目:
 *  ① CURRENT_VERIFICATION_VERSION の存在
 *  ② filterForVerification — preCloseOnly / style / dateRange / version でフィルタ
 *  ③ computeKpiSummary — ROI / 的中率 / 平均オッズ / 最大連敗 を正しく算出
 *  ④ computeMaxLossStreak — 連続外しを正しくカウント
 *  ⑤ estimateLossStreakProbability — 二項近似で連敗確率を返す
 *  ⑥ evaluateWinnability — サンプル不足/勝てる/微妙/致命的 を返す
 *  ⑦ buildReasoningSummary — buy 時に whyBuy 3行 + whyNot 2行 + maxRisk 1行
 *  ⑧ buildReasoningSummary — skip 時には whyBuy 空、 maxRisk に見送り理由
 */
const {
  CURRENT_VERIFICATION_VERSION, filterForVerification, computeKpiSummary,
  computeMaxLossStreak, estimateLossStreakProbability, evaluateWinnability,
} = await import("../src/lib/verificationLog.js");
const { buildReasoningSummary } = await import("../src/lib/reasoningSummary.js");

let pass = 0, fail = 0;
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}\n     期待: ${JSON.stringify(expected)}\n     実際: ${JSON.stringify(actual)}`); }
}
function expectTrue(label, cond) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

console.log("\n========== Round 73 検証ログ + KPI 検証 ==========\n");

/* === 1. バージョン定数 === */
console.log("▶ 1. CURRENT_VERIFICATION_VERSION");
{
  expectTrue("v2 で始まる", typeof CURRENT_VERIFICATION_VERSION === "string" && CURRENT_VERIFICATION_VERSION.startsWith("v2"));
}

/* === 2. フィルタ === */
console.log("\n▶ 2. filterForVerification");
{
  const preds = {
    a: { date: "2026-05-01", profile: "balanced", decision: "buy", preCloseTarget: true, verificationVersion: CURRENT_VERIFICATION_VERSION, hit: true, totalStake: 100, payout: 200, combos: [{ odds: 5 }] },
    b: { date: "2026-05-02", profile: "steady", decision: "buy", preCloseTarget: true, verificationVersion: CURRENT_VERIFICATION_VERSION, hit: false, totalStake: 100, payout: 0, combos: [{ odds: 3 }] },
    c: { date: "2026-05-02", profile: "aggressive", decision: "skip", preCloseTarget: true, verificationVersion: CURRENT_VERIFICATION_VERSION },
    // 直前判定対象外 (検証から除外)
    d: { date: "2026-05-02", profile: "balanced", decision: "buy", preCloseTarget: false, verificationVersion: CURRENT_VERIFICATION_VERSION, hit: true, totalStake: 100, payout: 200 },
    // 古いバージョン (検証から除外)
    e: { date: "2026-05-02", profile: "balanced", decision: "buy", preCloseTarget: true, verificationVersion: "v1.something", hit: true, totalStake: 100, payout: 200 },
  };
  const filtered = filterForVerification(preds, {
    preCloseOnly: true, verificationVersion: CURRENT_VERIFICATION_VERSION,
  });
  expect("3 件のみ通過 (a/b/c)", filtered.length, 3);
  // style フィルタ — version 指定なしなら e も通る (a + e = 2 件)
  const onlyBalanced = filterForVerification(preds, {
    preCloseOnly: true, style: "balanced",
  });
  expect("balanced のみ 2 件 (a+e)", onlyBalanced.length, 2);
  // decision=buy + version 指定で v2 のみ
  const onlyBuy = filterForVerification(preds, {
    preCloseOnly: true, decision: "buy", verificationVersion: CURRENT_VERIFICATION_VERSION,
  });
  expect("buy + v2 で 2 件 (a+b)", onlyBuy.length, 2);
  // onlySettled
  const settled = filterForVerification(preds, {
    preCloseOnly: true, decision: "buy", onlySettled: true,
  });
  // a と b は両方 hit/result はあるが result.first フィールドで判定
  // 上記 fixture には result が無いため 0 件
  expect("onlySettled は result.first 必須 → 0 件", settled.length, 0);
}

/* === 3. computeMaxLossStreak === */
console.log("\n▶ 3. computeMaxLossStreak — 連続外しを正しくカウント");
{
  const arr = [
    { hit: true }, { hit: false }, { hit: false }, { hit: false }, { hit: true }, { hit: false }, { hit: false },
  ];
  expect("最大連敗 3", computeMaxLossStreak(arr), 3);
  expect("空配列 = 0", computeMaxLossStreak([]), 0);
  expect("全勝 = 0", computeMaxLossStreak([{ hit: true }, { hit: true }]), 0);
}

/* === 4. estimateLossStreakProbability === */
console.log("\n▶ 4. estimateLossStreakProbability");
{
  // 的中率 50%, 50 戦中 5 連敗以上の確率
  const p5 = estimateLossStreakProbability(0.5, 50, 5);
  expectTrue("的中率 50% / 50 戦 / 5 連敗確率 > 0.5", p5 > 0.5);
  expectTrue("確率は [0,1] 範囲内", p5 >= 0 && p5 <= 1);
  // 的中率高ければ連敗確率は下がる
  const pHi = estimateLossStreakProbability(0.9, 50, 5);
  expectTrue("的中率 90% は 50% より低い連敗確率", pHi < p5);
}

/* === 5. computeKpiSummary === */
console.log("\n▶ 5. computeKpiSummary");
{
  const today = "2026-05-01";
  const preds = {};
  // 5 戦 3 勝 2 敗
  for (let i = 0; i < 5; i++) {
    preds[`k${i}`] = {
      date: today, startTime: `${10 + i}:00`,
      profile: "balanced", decision: "buy",
      preCloseTarget: true, verificationVersion: CURRENT_VERIFICATION_VERSION,
      totalStake: 1000, payout: i < 3 ? 3000 : 0, hit: i < 3,
      combos: [{ odds: 3.0 + i * 0.5 }],
      result: { first: 1 }, // settled
    };
  }
  const kpi = computeKpiSummary(preds, { preCloseOnly: true });
  expect("count = 5", kpi.overall.count, 5);
  expect("hits = 3", kpi.overall.hits, 3);
  expect("hitRate = 0.6", kpi.overall.hitRate, 0.6);
  expect("stake = 5000", kpi.overall.stake, 5000);
  expect("ret = 9000", kpi.overall.ret, 9000);
  expect("pnl = 4000", kpi.overall.pnl, 4000);
  expect("roi = 1.8", kpi.overall.roi, 1.8);
  expectTrue("avgOdds 数値", typeof kpi.overall.avgOdds === "number");
  expectTrue("byStyle.balanced 5 件", kpi.byStyle.balanced.count === 5);
}

/* === 6. evaluateWinnability === */
console.log("\n▶ 6. evaluateWinnability");
{
  // サンプル不足
  const v1 = evaluateWinnability({ overall: { count: 5, roi: 1.5 } });
  expect("count<30 → 未検証", v1.level, "未検証");
  // 勝てる可能性
  const v2 = evaluateWinnability({ overall: { count: 50, roi: 1.15, hitRate: 0.4 } });
  expect("ROI 1.15 → 勝てる可能性あり", v2.level, "勝てる可能性あり");
  // 致命的
  const v3 = evaluateWinnability({ overall: { count: 50, roi: 0.6, hitRate: 0.2 } });
  expect("ROI 0.60 → 致命的", v3.level, "致命的");
  // 微妙
  const v4 = evaluateWinnability({ overall: { count: 50, roi: 1.02, hitRate: 0.3 } });
  expect("ROI 1.02 → 微妙", v4.level, "微妙");
}

/* === 7. buildReasoningSummary — buy 時 === */
console.log("\n▶ 7. buildReasoningSummary — buy 時に 3+2+1 行");
{
  const ev = {
    race: {
      boats: Array.from({ length: 6 }, (_, i) => ({
        boatNo: i + 1, winRate: 5.5, motor2: 38, exTime: 6.85, avgST: 0.16,
      })),
      wind: 2, wave: 2,
    },
    items: [], maxEV: 1.5, probs: [0.55, 0.18, 0.10, 0.07, 0.06, 0.04],
    scores: Array.from({ length: 6 }, (_, i) => ({
      boatNo: i + 1,
      factors: { inAdvantage: i === 0 ? 0.7 : 0.3, motor: i === 0 ? 0.7 : 0.4, exhibition: i === 0 ? 0.7 : 0.4, startPower: i === 0 ? 0.7 : 0.4, winRate: i === 0 ? 0.6 : 0.4 },
    })),
    inTrust: { level: "イン逃げ濃厚" },
  };
  const rec = {
    decision: "buy",
    profile: "balanced",
    main: { kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65 },
    items: [{ kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65 }],
  };
  const r = buildReasoningSummary(rec, ev);
  expect("whyBuy 3 行", r.whyBuy.length, 3);
  expectTrue("whyNot >= 1 行", r.whyNot.length >= 1);
  expectTrue("maxRisk 文字列", typeof r.maxRisk === "string" && r.maxRisk.length > 0);
  expectTrue("oneLine 含む 1-2-3", typeof r.oneLine === "string" && r.oneLine.includes("1-2-3"));
  // 1 号艇有利が文言化される
  expectTrue("whyBuy[0] に 1号艇 含む", /1号艇/.test(r.whyBuy[0]));
}

/* === 8. buildReasoningSummary — skip 時 === */
console.log("\n▶ 8. buildReasoningSummary — skip 時");
{
  const rec = {
    decision: "skip",
    reason: "本命型ゲート: 1号艇勝率不足",
    reasons: ["本命型ゲート: 1号艇勝率 5.30 < 5.50", "風 5m が強い"],
  };
  const r = buildReasoningSummary(rec, null);
  expect("whyBuy = []", r.whyBuy.length, 0);
  expectTrue("whyNot に 2 件", r.whyNot.length === 2);
  expectTrue("maxRisk に 見送り 含む", /見送り/.test(r.maxRisk));
  expectTrue("oneLine に ❌ 含む", r.oneLine.startsWith("❌"));
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
