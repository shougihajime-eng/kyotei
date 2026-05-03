/**
 * Round 66: 保存ラウンドトリップ検証
 *
 * 検証フロー:
 *  ① 空状態で起動 (initial loadState() = null)
 *  ② 手動記録 (handleManualBet 相当): saveAndVerify で書き込み + 読み戻し
 *  ③ 「リロード」 をシミュレート — loadState() で復元
 *  ④ 復元後の predictions に key が存在するか
 *  ⑤ getVisibleData() に含まれるか (JST/version フィルタで除外されないか)
 *  ⑥ Stats/グラフ用集計 (countsByStyle/pnlSummary) に反映されるか
 *  ⑦ verifyVisible() ヘルパが true を返すか
 *
 * localStorage を Map ベースで polyfill する (Node 環境)。
 */

// localStorage polyfill
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};

const { loadState, saveState, saveAndVerify, verifyVisible, getVisibleData, CURRENT_VERSION, getStorageStats } =
  await import("../src/lib/storage.js");

let pass = 0, fail = 0;
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else {
    fail++;
    console.log(`  ❌ ${label}\n     期待: ${JSON.stringify(expected)}\n     実際: ${JSON.stringify(actual)}`);
  }
}
function expectTrue(label, cond) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

console.log("\n========== Round 66 保存ラウンドトリップ検証 ==========\n");

/* ① 空状態確認 */
console.log("▶ 1. 空状態 — loadState() = null");
{
  _store.clear();
  const s = loadState();
  expect("loadState() = null", s, null);
}

/* ② saveAndVerify (1 件保存) */
console.log("\n▶ 2. saveAndVerify — 1 件保存 + 読み戻し検証");
{
  const today = new Date().toISOString().slice(0, 10);
  const rec = {
    key: "20260502_kr2_balanced",
    date: today,
    raceId: "kr2",
    venue: "桐生",
    raceNo: 2,
    profile: "balanced",
    decision: "buy",
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.32, ev: 1.76, stake: 500 }],
    totalStake: 500,
    virtual: false,
    manuallyRecorded: true,
    version: CURRENT_VERSION,
    snapshotAt: new Date().toISOString(),
  };
  const state = { settings: { riskProfile: "balanced" }, predictions: { [rec.key]: rec } };
  const res = saveAndVerify(state, [rec.key]);
  expectTrue("res.ok = true", res.ok === true);
  expect("savedKeys", res.savedKeys, [rec.key]);
  expect("missingKeys = []", res.missingKeys, []);
  expectTrue("sizeBytes > 0", res.sizeBytes > 0);
}

/* ③ リロードシミュレート */
console.log("\n▶ 3. リロードシミュレート — loadState() で復元");
{
  const reloaded = loadState();
  expectTrue("reloaded != null", reloaded != null);
  expectTrue("predictions が存在", !!reloaded?.predictions);
  expectTrue("key 存在", !!reloaded?.predictions?.["20260502_kr2_balanced"]);
  expect("decision 復元", reloaded?.predictions?.["20260502_kr2_balanced"]?.decision, "buy");
  expect("totalStake 復元", reloaded?.predictions?.["20260502_kr2_balanced"]?.totalStake, 500);
  expect("version=v2", reloaded?.predictions?.["20260502_kr2_balanced"]?.version, "v2");
}

/* ④ getVisibleData に含まれる */
console.log("\n▶ 4. getVisibleData() に含まれる (フィルタ除外なし)");
{
  const reloaded = loadState();
  const vis = getVisibleData(reloaded.predictions, { showLegacy: false, currentStyle: "balanced" });
  expectTrue("hasData=true", vis.hasData === true);
  expectTrue("isEmpty=false", vis.isEmpty === false);
  expectTrue("predictions に key あり", !!vis.predictions["20260502_kr2_balanced"]);
  expect("countsByStyle.balanced=1", vis.countsByStyle.balanced, 1);
  expect("countsByStyle.steady=0", vis.countsByStyle.steady, 0);
}

/* ⑤ verifyVisible ヘルパ */
console.log("\n▶ 5. verifyVisible() = ok");
{
  const reloaded = loadState();
  const v = verifyVisible(reloaded.predictions, "20260502_kr2_balanced", { showLegacy: false, currentStyle: "balanced" });
  expectTrue("v.ok=true", v.ok === true);
  expectTrue("v.present=true", v.present === true);
  expectTrue("v.filteredOut=false", v.filteredOut === false);
}

/* ⑥ legacy データの場合は filteredOut */
console.log("\n▶ 6. legacy データは filteredOut (showLegacy=false)");
{
  _store.clear();
  const legacyRec = {
    key: "20260502_kr2_balanced",
    date: "2026-05-02",
    raceId: "kr2", profile: "balanced",
    decision: "buy", totalStake: 500, virtual: false,
    /* version: なし → legacy */
  };
  const state = { settings: {}, predictions: { [legacyRec.key]: legacyRec } };
  saveState(state);
  const reloaded = loadState();
  const v = verifyVisible(reloaded.predictions, "20260502_kr2_balanced", { showLegacy: false });
  expectTrue("v.present=true (raw に存在)", v.present === true);
  expectTrue("v.filteredOut=true (showLegacy=false でフィルタ)", v.filteredOut === true);
  expectTrue("理由メッセージ含む", typeof v.reason === "string" && v.reason.length > 0);
}

/* ⑦ 結果反映 (PnL計算) */
console.log("\n▶ 7. 結果が反映されると pnlSummary に集計される");
{
  _store.clear();
  const rec = {
    key: "20260502_kr2_balanced",
    date: "2026-05-02", raceId: "kr2", profile: "balanced",
    decision: "buy",
    combos: [{ kind: "3連単", combo: "1-2-3", stake: 500, odds: 5.5, prob: 0.32, ev: 1.76 }],
    totalStake: 500, virtual: false,
    version: CURRENT_VERSION,
    result: { first: 1, second: 2, third: 3, payouts: { trifecta: { "1-2-3": 550 } } },
    payout: 2750, hit: true, pnl: 2250,
  };
  const state = { settings: {}, predictions: { [rec.key]: rec } };
  const res = saveAndVerify(state, [rec.key]);
  expectTrue("save ok", res.ok);
  const reloaded = loadState();
  const vis = getVisibleData(reloaded.predictions);
  expect("pnlSummary.real.stake = 500", vis.pnlSummary.real.stake, 500);
  expect("pnlSummary.real.ret = 2750", vis.pnlSummary.real.ret, 2750);
  expect("pnlSummary.real.pnl = 2250", vis.pnlSummary.real.pnl, 2250);
}

/* ⑧ 多 key 保存検証 (3 スタイル分離) */
console.log("\n▶ 8. 3 スタイル分離 — 同一レースで steady/balanced/aggressive 別キー保存");
{
  _store.clear();
  const dateK = "20260502";
  const baseRec = (style) => ({
    key: `${dateK}_kr2_${style}`,
    date: "2026-05-02", raceId: "kr2",
    profile: style, version: CURRENT_VERSION,
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100,
    virtual: false, snapshotAt: new Date().toISOString(),
  });
  const preds = {
    [`${dateK}_kr2_steady`]: baseRec("steady"),
    [`${dateK}_kr2_balanced`]: baseRec("balanced"),
    [`${dateK}_kr2_aggressive`]: baseRec("aggressive"),
  };
  const res = saveAndVerify({ settings: {}, predictions: preds }, Object.keys(preds));
  expectTrue("save ok", res.ok);
  expect("savedKeys 3 件", res.savedKeys.length, 3);
  const reloaded = loadState();
  const vis = getVisibleData(reloaded.predictions, { currentStyle: "balanced" });
  expect("countsByStyle.steady=1", vis.countsByStyle.steady, 1);
  expect("countsByStyle.balanced=1", vis.countsByStyle.balanced, 1);
  expect("countsByStyle.aggressive=1", vis.countsByStyle.aggressive, 1);
}

/* ⑨ Round 79: 買い推奨レースの詳細ログがリロード後も完全復元される */
console.log("\n▶ 9b. Round 79 — 買い詳細ログがリロード後も保持される");
{
  _store.clear();
  const buy = {
    key: "20260503_kr2_balanced",
    date: "2026-05-03", raceId: "kr2",
    venue: "桐生", raceNo: 2, startTime: "14:00",
    profile: "balanced",
    decision: "buy",
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65, stake: 500 }],
    totalStake: 500,
    confidence: 78,
    snapshotAt: new Date().toISOString(),
    version: CURRENT_VERSION,
    verificationVersion: "v2.preclose-strict.r70",
    preCloseTarget: true, isGoCandidate: true, isSampleData: false,
    // 詳細スナップショット
    boatsSnapshot: Array.from({ length: 6 }, (_, i) => ({
      boatNo: i + 1, racer: `選手${i+1}`, class: "A1",
      winRate: 5.5 + i * 0.2, motor2: 38, exTime: 6.85, avgST: 0.16,
    })),
    weatherSnapshot: { weather: "晴", wind: 2, wave: 2 },
    reasoning: { whyBuy: ["A", "B", "C"], whyNot: ["D"], maxRisk: "リスク", oneLine: "1-2-3" },
    inTrust: { level: "イン逃げ濃厚" },
  };
  const state = { settings: {}, predictions: { [buy.key]: buy } };
  const res = saveAndVerify(state, [buy.key]);
  expectTrue("save ok", res.ok);
  // リロード = loadState() で別オブジェクト取得
  const reloaded = loadState();
  const back = reloaded?.predictions?.[buy.key];
  expectTrue("key 復元", !!back);
  expectTrue("boatsSnapshot 復元 (6 艇)", Array.isArray(back?.boatsSnapshot) && back.boatsSnapshot.length === 6);
  expect("各艇の class 復元", back.boatsSnapshot.map(b => b.class), Array(6).fill("A1"));
  expectTrue("weatherSnapshot 復元", back?.weatherSnapshot?.wind === 2);
  expectTrue("reasoning.whyBuy 復元", back?.reasoning?.whyBuy?.length === 3);
  expectTrue("reasoning.maxRisk 復元", back?.reasoning?.maxRisk === "リスク");
  expectTrue("inTrust 復元", back?.inTrust?.level === "イン逃げ濃厚");
  expect("confidence 復元", back?.confidence, 78);
}

/* ⑩ saveAndVerify 失敗検出 (expectedKeys が無い場合) */
console.log("\n▶ 9. saveAndVerify — expected key 欠落で ok=false");
{
  _store.clear();
  const state = { settings: {}, predictions: {} };
  const res = saveAndVerify(state, ["nonexistent_key"]);
  expectTrue("ok=false", res.ok === false);
  expectTrue("missingKeys に nonexistent_key", res.missingKeys.includes("nonexistent_key"));
  expectTrue("error メッセージ含む", typeof res.error === "string" && res.error.length > 0);
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
