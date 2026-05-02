/**
 * Round 75: 改ざん防止ログ + 公開検証 検証
 *
 * 検証項目:
 *  ① quickHash — 同 input は同 output、 異 input は異 output
 *  ② appendPublicLog — finalized=false は拒否
 *  ③ appendPublicLog — 同 key 重複は skip
 *  ④ verifyIntegrity — 正常チェインは valid=true
 *  ⑤ verifyIntegrity — entry を改ざんしたら brokenAt が検出される
 *  ⑥ verifyIntegrity — hash を改ざんしたら検出される
 *  ⑦ verifyIntegrity — prevHash を改ざんしたら検出される
 *  ⑧ syncPublicLog — predictions 全 finalized を一括追記
 *  ⑨ summarizePublicLog — version 別 / 日別の集計
 *  ⑩ exportPublicLogJson — JSON 形式で全件 + 整合性
 */

// localStorage polyfill
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};

const {
  quickHash, loadPublicLog, appendPublicLog, syncPublicLog,
  verifyIntegrity, summarizePublicLog, exportPublicLogJson,
} = await import("../src/lib/immutableLog.js");

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

console.log("\n========== Round 75 改ざん防止ログ 検証 ==========\n");

/* === 1. quickHash === */
console.log("▶ 1. quickHash");
{
  expectTrue("同 input は同 output", quickHash("hello") === quickHash("hello"));
  expectTrue("異 input は異 output", quickHash("hello") !== quickHash("hellz"));
  expectTrue("8 文字 hex", /^[0-9a-f]{8}$/.test(quickHash("test")));
}

function makeFinalizedPred(key, opts = {}) {
  return {
    key, date: opts.date || "2026-05-01",
    venue: opts.venue || "桐生", raceNo: opts.raceNo || 1, startTime: "10:00",
    profile: opts.profile || "balanced",
    decision: opts.decision || "buy",
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65, stake: 500 }],
    totalStake: 500,
    confidence: 75,
    verificationVersion: opts.version || "v2.preclose-strict.r70",
    preCloseTarget: true, isGoCandidate: true,
    snapshotAt: opts.ts || `2026-05-01T10:0${key.slice(-1)}:00.000Z`,
    result: opts.hit !== undefined ? { first: 1, second: 2, third: 3 } : null,
    payout: opts.hit ? 2750 : 0,
    hit: !!opts.hit,
    pnl: opts.hit ? 2250 : -500,
    finalized: opts.finalized !== false,
  };
}

/* === 2. appendPublicLog — finalized=false は拒否 === */
console.log("\n▶ 2. appendPublicLog — finalized=false 拒否");
{
  _store.clear();
  const r = appendPublicLog({ key: "k1", finalized: false });
  expect("ok=false", r.ok, false);
  expectTrue("reason に finalized 含む", /finalized/.test(r.reason || ""));
}

/* === 3. 同 key 重複は skip === */
console.log("\n▶ 3. 同 key の確定エントリ重複は skip");
{
  _store.clear();
  const p1 = makeFinalizedPred("k1", { hit: true });
  const r1 = appendPublicLog(p1);
  expectTrue("初回 ok + entry あり", r1.ok && !!r1.entry);
  const r2 = appendPublicLog(p1);
  expectTrue("2 回目 ok だが entry=null (skip)", r2.ok && r2.entry === null);
  expect("ログは 1 件のみ", loadPublicLog().length, 1);
}

/* === 4. verifyIntegrity 正常チェイン === */
console.log("\n▶ 4. verifyIntegrity — 正常チェイン");
{
  _store.clear();
  for (let i = 0; i < 5; i++) {
    appendPublicLog(makeFinalizedPred(`k${i}`, { hit: i % 2 === 0 }));
  }
  const log = loadPublicLog();
  expect("5 件", log.length, 5);
  const integ = verifyIntegrity(log);
  expect("valid=true", integ.valid, true);
  expect("brokenAt=null", integ.brokenAt, null);
}

/* === 5. entry 改ざん検出 === */
console.log("\n▶ 5. entry の改ざんを検出");
{
  const log = loadPublicLog();
  const tampered = JSON.parse(JSON.stringify(log));
  tampered[2].entry.payout = 99999; // 改ざん
  const integ = verifyIntegrity(tampered);
  expect("valid=false", integ.valid, false);
  expect("brokenAt=2", integ.brokenAt, 2);
}

/* === 6. hash 改ざん検出 === */
console.log("\n▶ 6. hash の改ざんを検出");
{
  const log = loadPublicLog();
  const tampered = JSON.parse(JSON.stringify(log));
  tampered[1].hash = "deadbeef";
  const integ = verifyIntegrity(tampered);
  expectTrue("valid=false", integ.valid === false);
  expect("brokenAt=1", integ.brokenAt, 1);
}

/* === 7. prevHash 改ざん検出 === */
console.log("\n▶ 7. prevHash の改ざんを検出");
{
  const log = loadPublicLog();
  const tampered = JSON.parse(JSON.stringify(log));
  tampered[3].prevHash = "00000000";
  const integ = verifyIntegrity(tampered);
  expectTrue("valid=false", integ.valid === false);
  expect("brokenAt=3", integ.brokenAt, 3);
}

/* === 8. syncPublicLog 一括追記 === */
console.log("\n▶ 8. syncPublicLog");
{
  _store.clear();
  const preds = {};
  for (let i = 0; i < 5; i++) {
    preds[`k${i}`] = makeFinalizedPred(`k${i}`, { hit: i % 2 === 0 });
  }
  // 1 件は finalized=false (除外される)
  preds.k5 = makeFinalizedPred("k5", { finalized: false });
  // 1 件は result なし (除外される)
  preds.k6 = makeFinalizedPred("k6", { hit: undefined });
  const r = syncPublicLog(preds);
  expectTrue("added >= 5", r.added >= 5);
  expect("total = 5", r.total, 5);
  // 再 sync は全 skip
  const r2 = syncPublicLog(preds);
  expect("再 sync added=0", r2.added, 0);
}

/* === 9. summarizePublicLog 集計 === */
console.log("\n▶ 9. summarizePublicLog");
{
  _store.clear();
  appendPublicLog(makeFinalizedPred("a", { hit: true, version: "v1.test" }));
  appendPublicLog(makeFinalizedPred("b", { hit: false, version: "v1.test" }));
  appendPublicLog(makeFinalizedPred("c", { hit: true, version: "v2.test" }));
  const sum = summarizePublicLog();
  expectTrue("v1.test 集計あり", !!sum.byVersion["v1.test"]);
  expectTrue("v2.test 集計あり", !!sum.byVersion["v2.test"]);
  expect("v1.test count=2", sum.byVersion["v1.test"].count, 2);
  expect("v1.test hits=1", sum.byVersion["v1.test"].hits, 1);
  expect("v2.test count=1", sum.byVersion["v2.test"].count, 1);
}

/* === 10. exportPublicLogJson === */
console.log("\n▶ 10. exportPublicLogJson");
{
  const json = exportPublicLogJson();
  const obj = JSON.parse(json);
  expectTrue("entries フィールドあり", typeof obj.entries === "number");
  expectTrue("integrity フィールドあり", obj.integrity != null);
  expectTrue("log は配列", Array.isArray(obj.log));
  expectTrue("exportedAt は ISO 文字列", typeof obj.exportedAt === "string");
}

/* === 11. Round 76: 仮データ (isSampleData=true) は append されない === */
console.log("\n▶ 11. Round 76 — 仮データは公開ログから絶対除外");
{
  _store.clear();
  const sample = makeFinalizedPred("sample1", { hit: true });
  sample.isSampleData = true;
  const r = appendPublicLog(sample);
  expectTrue("append 拒否 (ok=false)", r.ok === false);
  expectTrue("理由に「仮データ」", /仮データ/.test(r.reason || ""));
  expect("ログは 0 件のまま", loadPublicLog().length, 0);
  // 実データは通常通り追記される
  const real = makeFinalizedPred("real1", { hit: true });
  const r2 = appendPublicLog(real);
  expectTrue("実データは通る", r2.ok && !!r2.entry);
  expect("ログは 1 件", loadPublicLog().length, 1);
  // syncPublicLog でも仮データはスキップされる
  const preds = {
    s1: { ...makeFinalizedPred("s1", { hit: true }), isSampleData: true },
    s2: { ...makeFinalizedPred("s2", { hit: true }), isSampleData: true },
    r1: makeFinalizedPred("r1", { hit: false }),
  };
  const syncRes = syncPublicLog(preds);
  expect("sync added=1 (実データのみ)", syncRes.added, 1);
}

/* === 12. Round 76: summarize に overall + 連敗 + 連勝 === */
console.log("\n▶ 12. Round 76 — overall 集計 + 最大連敗 / 連勝");
{
  _store.clear();
  // 5 戦: 勝 勝 負 負 負 → 連勝 2、 連敗 3
  const wins = [true, true, false, false, false];
  for (let i = 0; i < wins.length; i++) {
    appendPublicLog(makeFinalizedPred(`w${i}`, { hit: wins[i], ts: `2026-05-01T10:0${i}:00.000Z` }));
  }
  const sum = summarizePublicLog();
  expectTrue("overall.count=5", sum.overall.count === 5);
  expectTrue("overall.hits=2", sum.overall.hits === 2);
  expectTrue("overall.maxLossStreak=3", sum.overall.maxLossStreak === 3);
  expectTrue("overall.maxWinStreak=2", sum.overall.maxWinStreak === 2);
  expectTrue("overall.hitRate=0.4", sum.overall.hitRate === 0.4);
  expectTrue("overall.avgOdds 数値", typeof sum.overall.avgOdds === "number");
}

/* === 13. Round 76: byMonth 集計 === */
console.log("\n▶ 13. Round 76 — byMonth 集計");
{
  _store.clear();
  appendPublicLog(makeFinalizedPred("m1", { hit: true, date: "2026-05-01", ts: "2026-05-01T10:00:00.000Z" }));
  appendPublicLog(makeFinalizedPred("m2", { hit: false, date: "2026-05-15", ts: "2026-05-15T10:00:00.000Z" }));
  appendPublicLog(makeFinalizedPred("m3", { hit: true, date: "2026-06-01", ts: "2026-06-01T10:00:00.000Z" }));
  const sum = summarizePublicLog();
  expectTrue("byMonth に 2026-05", !!sum.byMonth["2026-05"]);
  expectTrue("byMonth に 2026-06", !!sum.byMonth["2026-06"]);
  expect("2026-05 は 2 件", sum.byMonth["2026-05"].count, 2);
  expect("2026-06 は 1 件", sum.byMonth["2026-06"].count, 1);
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
