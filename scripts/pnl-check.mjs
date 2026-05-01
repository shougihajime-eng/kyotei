/**
 * 収支ロジック サニティテスト (Round 23)
 *
 * 「エア/リアル分離」 「期間フィルタ (今日/週/月/全期間)」
 * 「結果反映後の hit/payout/pnl」 が正しく計算されるかを定量検証。
 */

const today  = new Date().toISOString().slice(0, 10);
const yest   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tenAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
const monAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

/* テストデータ: 13 レース (エア 8 / リアル 5)、結果あり 10 / なし 3 */
const predictions = {
  // 今日
  t1: { date: today, decision: "buy", totalStake: 1000, virtual: true,  payout: 5000, hit: true,  pnl: 4000, profile: "balanced",   result: { first: 1 } },
  t2: { date: today, decision: "buy", totalStake: 1500, virtual: true,  payout:    0, hit: false, pnl:-1500, profile: "aggressive", result: { first: 4 } },
  t3: { date: today, decision: "buy", totalStake: 2000, virtual: false, payout: 8000, hit: true,  pnl: 6000, profile: "steady",     result: { first: 1 } },
  t4: { date: today, decision: "skip", totalStake:    0, virtual: true },
  t5: { date: today, decision: "buy", totalStake: 1000, virtual: false, payout:    0, hit: false, pnl:-1000, profile: "balanced",   result: { first: 5 } },

  // 今週内 (3日前)
  w1: { date: yest, decision: "buy", totalStake: 1000, virtual: true,  payout: 3000, hit: true,  pnl: 2000, profile: "steady",     result: { first: 1 } },
  w2: { date: yest, decision: "buy", totalStake: 1000, virtual: true,  payout:    0, hit: false, pnl:-1000, profile: "balanced",   result: { first: 2 } },
  w3: { date: yest, decision: "buy", totalStake:  500, virtual: false, payout: 2000, hit: true,  pnl: 1500, profile: "aggressive", result: { first: 6 } },

  // 10 日前 (今月内、今週外)
  m1: { date: tenAgo, decision: "buy", totalStake: 1500, virtual: true,  payout:    0, hit: false, pnl:-1500, profile: "aggressive", result: { first: 3 } },
  m2: { date: tenAgo, decision: "buy", totalStake: 1000, virtual: false, payout: 4000, hit: true,  pnl: 3000, profile: "balanced",   result: { first: 1 } },

  // 60 日前 (全期間のみ)
  o1: { date: monAgo, decision: "buy", totalStake: 2000, virtual: true,  payout: 9000, hit: true,  pnl: 7000, profile: "steady", result: { first: 1 } },

  // 未確定 (今日)
  p1: { date: today, decision: "buy", totalStake: 1000, virtual: true, profile: "balanced" },

  // 見送り (today)
  s1: { date: today, decision: "skip", totalStake: 0, virtual: true },
};

console.log("\n========== Round 23: 収支ロジック検証 ==========\n");

/* 期間 cutoff 計算 */
function cutoffFor(period) {
  const d = new Date();
  if (period === "today") return d.toISOString().slice(0, 10);
  if (period === "week")  return new Date(d.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  if (period === "month") return new Date(d.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return "0000-00-00";
}

/* ヘルパ: 期間 + virtual で集計 */
function aggregate(predictions, period, isVirtual) {
  const co = cutoffFor(period);
  const list = Object.values(predictions).filter((p) => (p.date || "") >= co);
  const buys = list.filter((p) => p.decision === "buy" && p.totalStake > 0);
  const settled = buys.filter((p) => p.result?.first);
  const target = settled.filter((p) => isVirtual ? p.virtual !== false : p.virtual === false);
  const stake = target.reduce((s, p) => s + (p.totalStake || 0), 0);
  const ret   = target.reduce((s, p) => s + (p.payout || 0), 0);
  const hits  = target.filter((p) => p.hit).length;
  return { count: target.length, hits, stake, ret, pnl: ret - stake, roi: stake > 0 ? ret / stake : 0 };
}

let pass = 0, fail = 0;
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✅ ${label} = ${JSON.stringify(actual)}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
    console.log(`     期待: ${JSON.stringify(expected)}`);
    console.log(`     実際: ${JSON.stringify(actual)}`);
  }
}

// === 今日 (エア) ===
console.log("▶ 今日 / エア");
const todayAir = aggregate(predictions, "today", true);
// t1 hit (+4000) + t2 miss (-1500) = pnl 2500, stake 2500, ret 5000
expect("count", todayAir.count, 2);
expect("hits",  todayAir.hits,  1);
expect("stake", todayAir.stake, 2500);
expect("ret",   todayAir.ret,   5000);
expect("pnl",   todayAir.pnl,   2500);
expect("roi",   todayAir.roi,   2.0);

// === 今日 (リアル) ===
console.log("\n▶ 今日 / リアル");
const todayReal = aggregate(predictions, "today", false);
// t3 hit (+6000) + t5 miss (-1000)
expect("count", todayReal.count, 2);
expect("hits",  todayReal.hits,  1);
expect("stake", todayReal.stake, 3000);
expect("ret",   todayReal.ret,   8000);
expect("pnl",   todayReal.pnl,   5000);

// === 今週 (エア) ===
console.log("\n▶ 今週 / エア");
const weekAir = aggregate(predictions, "week", true);
// today 2件 + yest w1, w2 = 4件
expect("count", weekAir.count, 4);
expect("stake", weekAir.stake, 2500 + 2000); // 4500
expect("ret",   weekAir.ret,   5000 + 3000); // 8000
expect("pnl",   weekAir.pnl,   3500);

// === 今月 (リアル) ===
console.log("\n▶ 今月 / リアル");
const monthReal = aggregate(predictions, "month", false);
// today t3,t5 + yest w3 + 10日前 m2 = 4件
expect("count", monthReal.count, 4);
expect("stake", monthReal.stake, 3000 + 500 + 1000); // 4500
expect("ret",   monthReal.ret,   8000 + 2000 + 4000); // 14000
expect("pnl",   monthReal.pnl,   9500);

// === 全期間 (エア) ===
console.log("\n▶ 全期間 / エア");
const allAir = aggregate(predictions, "all", true);
// 今日 + 今週 + 10日 + 60日前 = 6件
expect("count", allAir.count, 6);
expect("stake", allAir.stake, 2500 + 2000 + 1500 + 2000); // 8000
expect("ret",   allAir.ret,   5000 + 3000 + 0 + 9000);     // 17000

// === スタイル別集計 (今日) ===
console.log("\n▶ スタイル別集計 (今日)");
function aggregateByStyle(predictions, period) {
  const co = cutoffFor(period);
  const list = Object.values(predictions).filter((p) => (p.date || "") >= co);
  const settled = list.filter((p) => p.decision === "buy" && p.totalStake > 0 && p.result?.first);
  const m = {};
  for (const p of settled) {
    const k = p.profile || "balanced";
    if (!m[k]) m[k] = { stake: 0, ret: 0, count: 0, hits: 0 };
    m[k].stake += p.totalStake; m[k].ret += p.payout || 0; m[k].count++;
    if (p.hit) m[k].hits++;
  }
  return m;
}
const byStyleToday = aggregateByStyle(predictions, "today");
// t1 balanced miss, t2 aggressive miss, t3 steady hit, t5 balanced miss
expect("steady.count",     byStyleToday.steady?.count,     1);
expect("steady.hits",      byStyleToday.steady?.hits,      1);
expect("balanced.count",   byStyleToday.balanced?.count,   2);
expect("balanced.hits",    byStyleToday.balanced?.hits,    1);
expect("aggressive.count", byStyleToday.aggressive?.count, 1);
expect("aggressive.hits",  byStyleToday.aggressive?.hits,  0);

// === 見送りは集計から除外される ===
console.log("\n▶ 見送り除外確認");
expect("見送り (s1) は totalStake=0 なので除外", todayAir.count, 2);

// === 未確定は除外される ===
console.log("\n▶ 未確定除外確認");
const todayUnsettled = Object.values(predictions).filter(p => p.date === today && p.decision === "buy" && p.totalStake > 0 && !p.result?.first);
expect("未確定 (p1) は集計から除外", todayUnsettled.length, 1);
expect("settled エア", todayAir.count, 2);

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
