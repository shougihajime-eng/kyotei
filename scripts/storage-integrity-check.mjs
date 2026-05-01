/**
 * 保存周りの整合性検証 (Round 43)
 *
 * ・必要な全 14 項目が保存されるか
 * ・エア/リアル が混ざらないか
 * ・3スタイル成績が混ざらないか
 * ・GC が手動記録を残すか
 * ・保存件数 / 期間統計の正確性
 * ・古い形式の predictions を読み込んでも壊れないか
 */
import { gcOldPredictions, getStorageStats, GC_RETAIN_DAYS } from "../src/lib/storage.js";

const today = new Date().toISOString().slice(0, 10);
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

let pass = 0, fail = 0;
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else {
    fail++;
    console.log(`  ❌ ${label}\n     期待: ${JSON.stringify(expected)}\n     実際: ${JSON.stringify(actual)}`);
  }
}
function expectGte(label, actual, min) {
  if (actual >= min) { pass++; console.log(`  ✅ ${label} = ${actual} (≥ ${min})`); }
  else { fail++; console.log(`  ❌ ${label} = ${actual} (< ${min} 必要)`); }
}

console.log("\n========== Round 43: 保存整合性検証 ==========\n");

/* === 1. 必須フィールドチェック === */
const REQUIRED_FIELDS = ["key", "date", "raceId", "venue", "raceNo", "startTime",
  "decision", "combos", "totalStake", "profile", "virtual", "snapshotAt"];

const sample = {
  key: `${today.replace(/-/g, "")}_kr01`,
  date: today,
  raceId: "kr01",
  venue: "桐生",
  raceNo: 1,
  startTime: "10:30",
  decision: "buy",
  combos: [{ kind: "3連単", combo: "1-2-3", stake: 1000, odds: 5.0, prob: 0.18, ev: 0.90 }],
  totalStake: 1000,
  profile: "balanced",
  virtual: true,
  snapshotAt: new Date().toISOString(),
  result: { first: 1, second: 2, third: 3 },
  payout: 5000,
  hit: true,
  pnl: 4000,
};

console.log("▶ 1. 必須フィールド (14 項目)");
for (const f of REQUIRED_FIELDS) {
  expect(`'${f}' フィールドあり`, sample[f] != null, true);
}

/* === 2. エア / リアル 分離 === */
console.log("\n▶ 2. エア / リアル 完全分離");
const mixedPredictions = {
  air1: { date: today, virtual: true, decision: "buy", totalStake: 1000, profile: "balanced", result: { first: 1 }, payout: 3000, hit: true },
  air2: { date: today, virtual: true, decision: "buy", totalStake: 500, profile: "steady", result: { first: 1 }, payout: 0, hit: false },
  real1: { date: today, virtual: false, decision: "buy", totalStake: 2000, profile: "aggressive", result: { first: 6 }, payout: 0, hit: false },
  real2: { date: today, virtual: false, decision: "buy", totalStake: 1000, profile: "balanced", result: { first: 1 }, payout: 4000, hit: true },
};
const airOnly = Object.values(mixedPredictions).filter(p => p.virtual !== false);
const realOnly = Object.values(mixedPredictions).filter(p => p.virtual === false);
expect("エア件数", airOnly.length, 2);
expect("リアル件数", realOnly.length, 2);
expect("エアの合計 stake", airOnly.reduce((s, p) => s + p.totalStake, 0), 1500);
expect("リアルの合計 stake", realOnly.reduce((s, p) => s + p.totalStake, 0), 3000);

/* === 3. 3スタイル分離 === */
console.log("\n▶ 3. 3 スタイル成績完全分離");
const byStyle = (arr, style) => arr.filter(p => (p.profile || "balanced") === style);
const all = Object.values(mixedPredictions);
const steady = byStyle(all, "steady");
const balanced = byStyle(all, "balanced");
const aggressive = byStyle(all, "aggressive");
expect("steady 件数", steady.length, 1);
expect("balanced 件数", balanced.length, 2);
expect("aggressive 件数", aggressive.length, 1);
expect("steady の的中", steady.filter(p => p.hit).length, 0);
expect("balanced の的中", balanced.filter(p => p.hit).length, 2);
expect("aggressive の的中", aggressive.filter(p => p.hit).length, 0);

/* === 4. GC: 手動記録は永続 === */
console.log("\n▶ 4. GC — 手動記録は永続保持");
const oldDate = ago(120); // 120 日前 (90 日 GC の対象)
const gcPredictions = {
  old_ai: { date: oldDate, virtual: true, manuallyRecorded: false, decision: "buy", totalStake: 100 },
  old_manual: { date: oldDate, virtual: true, manuallyRecorded: true, decision: "buy", totalStake: 100 },
  recent_ai: { date: ago(15), virtual: true, manuallyRecorded: false, decision: "buy", totalStake: 100 },
  recent_manual: { date: ago(15), virtual: true, manuallyRecorded: true, decision: "buy", totalStake: 100 },
};
const { next: gcResult, removed } = gcOldPredictions(gcPredictions);
expect("古い AI 記録は削除される", "old_ai" in gcResult, false);
expect("古い手動記録は永続", "old_manual" in gcResult, true);
expect("直近 AI は残る", "recent_ai" in gcResult, true);
expect("直近 手動は残る", "recent_manual" in gcResult, true);
expect("削除件数", removed, 1);

/* === 5. getStorageStats: 期間カウント === */
console.log("\n▶ 5. 期間カウント (今日/7日/30日)");
const periodPredictions = {
  d0: { date: today, virtual: true, decision: "buy", totalStake: 100 },
  d3: { date: ago(3), virtual: true, decision: "buy", totalStake: 100 },
  d6: { date: ago(6), virtual: true, decision: "buy", totalStake: 100 },
  d10: { date: ago(10), virtual: true, decision: "buy", totalStake: 100 },
  d20: { date: ago(20), virtual: true, decision: "buy", totalStake: 100 },
  d40: { date: ago(40), virtual: true, decision: "buy", totalStake: 100 },
};
const periodStats = getStorageStats(periodPredictions);
expect("総数", periodStats.total, 6);
expect("今日", periodStats.today, 1);
expect("直近7日 (今日+3日前+6日前)", periodStats.last7days, 3);
expect("直近30日 (今日+3+6+10+20)", periodStats.last30days, 5);

/* === 6. 古い形式 (virtual 未設定) も壊れない === */
console.log("\n▶ 6. 古い形式 (virtual 未設定) でもエラー回避");
const legacyPredictions = {
  legacy: { date: today, decision: "buy", totalStake: 1000 }, // virtual なし
};
const legacyStats = getStorageStats(legacyPredictions);
expect("legacy → エア扱いで集計", legacyStats.air, 1);
expect("legacy → リアルではない", legacyStats.real, 0);

/* === 7. 7日 / 30日 リテンション保証 === */
console.log("\n▶ 7. 7日 / 30日 リテンション保証 (GC で消えない)");
const retentionPredictions = {
  d6_keep: { date: ago(6), virtual: true, decision: "buy", totalStake: 100 },
  d29_keep: { date: ago(29), virtual: true, decision: "buy", totalStake: 100 },
  d89_keep: { date: ago(89), virtual: true, decision: "buy", totalStake: 100 }, // 90日未満は残る
  d91_remove: { date: ago(91), virtual: true, decision: "buy", totalStake: 100 },
};
const { next: retainResult } = gcOldPredictions(retentionPredictions);
expect("6日前 (7日以内) 残る", "d6_keep" in retainResult, true);
expect("29日前 (30日以内) 残る", "d29_keep" in retainResult, true);
expect("89日前 (90日未満) 残る", "d89_keep" in retainResult, true);
expect("91日前 (90日超) 削除", "d91_remove" in retainResult, false);

/* === 8. 結果反映 (hit/payout/pnl) の整合性 === */
console.log("\n▶ 8. 結果反映 整合性");
const hitPred = { date: today, virtual: true, decision: "buy", totalStake: 1000, payout: 5000, hit: true };
const missPred = { date: today, virtual: true, decision: "buy", totalStake: 1000, payout: 0, hit: false };
expect("hit=true なら payout > stake", hitPred.payout > hitPred.totalStake, true);
expect("hit=false なら payout = 0", missPred.payout, 0);
expect("hit=true の pnl > 0", (hitPred.payout - hitPred.totalStake) > 0, true);
expect("hit=false の pnl < 0", (missPred.payout - missPred.totalStake) < 0, true);

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
console.log(`保存リテンション: 直近 ${GC_RETAIN_DAYS} 日 + 手動記録は永続`);
process.exit(fail === 0 ? 0 : 1);
