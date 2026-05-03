/**
 * Round 84: 3 スタイル分離 全レイヤー検証
 *
 * ① 同じレースでも 3 スタイルが別レコードとして保存される
 * ② key = ${dateKey}_${raceId}_${style} で一意
 * ③ あるスタイルの記録が他スタイルを上書きしない
 * ④ 集計が完全に分離 (ROI / 的中率 / 収支 / 連敗 / グラフ対象)
 * ⑤ PublicLog (公開検証ログ) でもスタイル別に区別可能
 * ⑥ summarizePublicLog の byVersion / byStyle が存在
 */

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

const { saveAndVerify, loadState, getVisibleData, getStorageStats, CURRENT_VERSION } =
  await import("../src/lib/storage.js");
const { computeKpiSummary, filterForVerification, CURRENT_VERIFICATION_VERSION } =
  await import("../src/lib/verificationLog.js");
const { appendPublicLog, syncPublicLog, summarizePublicLog, loadPublicLog } =
  await import("../src/lib/immutableLog.js");

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

console.log("\n========== Round 84 3 スタイル分離 全レイヤー検証 ==========\n");

const STYLES = ["steady", "balanced", "aggressive"];
const dateKey = "20260503";
const raceId = "kr2";
const date = "2026-05-03";

function makeBuy(style, hit, opts = {}) {
  return {
    key: `${dateKey}_${raceId}_${style}`,
    date, raceId, venue: "桐生", raceNo: 2, startTime: "14:00",
    profile: style,
    decision: "buy",
    combos: [{
      kind: "3連単",
      combo: opts.combo || (style === "steady" ? "1-2-3" : style === "balanced" ? "1-2-4" : "1-3-5"),
      stake: opts.stake || (style === "steady" ? 200 : style === "balanced" ? 500 : 800),
      odds: opts.odds || (style === "steady" ? 3.5 : style === "balanced" ? 5.5 : 12.0),
      prob: 0.30, ev: 1.65,
    }],
    totalStake: opts.stake || (style === "steady" ? 200 : style === "balanced" ? 500 : 800),
    confidence: 75,
    snapshotAt: `2026-05-03T13:5${STYLES.indexOf(style)}:00.000Z`,
    version: CURRENT_VERSION,
    verificationVersion: CURRENT_VERIFICATION_VERSION,
    preCloseTarget: true, isGoCandidate: true, isSampleData: false,
    finalized: hit !== undefined,
    result: hit !== undefined ? { first: 1, second: 2, third: 3 } : null,
    payout: hit ? (opts.stake || 200) * 5.5 : 0,
    hit: !!hit,
    pnl: hit ? ((opts.stake || 200) * 5.5 - (opts.stake || 200)) : -(opts.stake || 200),
  };
}

/* === ① 同レースで 3 スタイル別レコード === */
console.log("▶ 1. 同レース・3 スタイル → 3 つの独立 key");
{
  _store.clear();
  const preds = {};
  for (const s of STYLES) preds[`${dateKey}_${raceId}_${s}`] = makeBuy(s);
  const res = saveAndVerify({ settings: {}, predictions: preds }, Object.keys(preds));
  expectTrue("save ok", res.ok);
  expect("key 数 = 3", res.savedKeys.length, 3);
  // key の一意性
  const reloaded = loadState();
  const keys = Object.keys(reloaded.predictions);
  expectTrue("steady key 存在", keys.includes(`${dateKey}_${raceId}_steady`));
  expectTrue("balanced key 存在", keys.includes(`${dateKey}_${raceId}_balanced`));
  expectTrue("aggressive key 存在", keys.includes(`${dateKey}_${raceId}_aggressive`));
  // 各スタイルが独立 (combo が異なる)
  expect("steady combo 1-2-3", reloaded.predictions[`${dateKey}_${raceId}_steady`].combos[0].combo, "1-2-3");
  expect("balanced combo 1-2-4", reloaded.predictions[`${dateKey}_${raceId}_balanced`].combos[0].combo, "1-2-4");
  expect("aggressive combo 1-3-5", reloaded.predictions[`${dateKey}_${raceId}_aggressive`].combos[0].combo, "1-3-5");
}

/* === ② key 形式の一意性 === */
console.log("\n▶ 2. key = ${dateKey}_${raceId}_${style} で一意");
{
  const k1 = `${dateKey}_${raceId}_steady`;
  const k2 = `${dateKey}_${raceId}_balanced`;
  const k3 = `${dateKey}_${raceId}_aggressive`;
  expectTrue("3 keys 全て異なる", k1 !== k2 && k2 !== k3 && k1 !== k3);
  // 異なる日 / 異なるレースでも分離
  expectTrue("日違いで別 key", `20260503_${raceId}_steady` !== `20260504_${raceId}_steady`);
  expectTrue("レース違いで別 key", `${dateKey}_kr2_steady` !== `${dateKey}_kr3_steady`);
}

/* === ③ 上書きなし — 互いに干渉しない === */
console.log("\n▶ 3. スタイル間の上書きなし");
{
  _store.clear();
  // steady を先に保存
  saveAndVerify({ settings: {}, predictions: { [`${dateKey}_${raceId}_steady`]: makeBuy("steady") } }, []);
  // balanced を追加
  const reloaded1 = loadState();
  const newState = { settings: {}, predictions: { ...reloaded1.predictions, [`${dateKey}_${raceId}_balanced`]: makeBuy("balanced") } };
  saveAndVerify(newState, []);
  // 両方残っているか
  const reloaded2 = loadState();
  expectTrue("steady 残存", !!reloaded2.predictions[`${dateKey}_${raceId}_steady`]);
  expectTrue("balanced 追加", !!reloaded2.predictions[`${dateKey}_${raceId}_balanced`]);
  // steady の combo は変わらない
  expect("steady combo 不変", reloaded2.predictions[`${dateKey}_${raceId}_steady`].combos[0].combo, "1-2-3");
  expect("balanced combo 別", reloaded2.predictions[`${dateKey}_${raceId}_balanced`].combos[0].combo, "1-2-4");
}

/* === ④ 集計分離 (KPI / ROI / 的中率) === */
console.log("\n▶ 4. computeKpiSummary が byStyle で完全分離");
{
  _store.clear();
  const preds = {};
  // 安定: 1 勝 1 敗 (賭 200x2=400, 戻 200*5.5=1100, ROI 275%)
  preds[`${dateKey}_kr1_steady`] = makeBuy("steady", true, { stake: 200 });
  preds[`${dateKey}_kr2_steady`] = makeBuy("steady", false, { stake: 200 });
  // バランス: 0 勝 2 敗 (賭 1000, 戻 0, ROI 0%)
  preds[`${dateKey}_kr1_balanced`] = makeBuy("balanced", false, { stake: 500 });
  preds[`${dateKey}_kr2_balanced`] = makeBuy("balanced", false, { stake: 500 });
  // 攻め: 1 勝 0 敗 (賭 800, 戻 800*5.5=4400)
  preds[`${dateKey}_kr1_aggressive`] = makeBuy("aggressive", true, { stake: 800 });

  // 各レコードに固有 startTime を付与 (同 key 重複を避ける)
  preds[`${dateKey}_kr1_steady`].startTime = "10:00";
  preds[`${dateKey}_kr2_steady`].startTime = "11:00";
  preds[`${dateKey}_kr1_balanced`].startTime = "10:00";
  preds[`${dateKey}_kr2_balanced`].startTime = "11:00";
  preds[`${dateKey}_kr1_aggressive`].startTime = "10:00";

  const kpi = computeKpiSummary(preds, { preCloseOnly: true });
  // スタイル別に独立した数値が出ること
  expectTrue("byStyle.steady 集計あり", !!kpi.byStyle.steady);
  expectTrue("byStyle.balanced 集計あり", !!kpi.byStyle.balanced);
  expectTrue("byStyle.aggressive 集計あり", !!kpi.byStyle.aggressive);
  expect("steady count=2", kpi.byStyle.steady.count, 2);
  expect("steady hits=1", kpi.byStyle.steady.hits, 1);
  expect("balanced count=2", kpi.byStyle.balanced.count, 2);
  expect("balanced hits=0", kpi.byStyle.balanced.hits, 0);
  expect("aggressive count=1", kpi.byStyle.aggressive.count, 1);
  expect("aggressive hits=1", kpi.byStyle.aggressive.hits, 1);
  // ROI が独立計算されている
  expectTrue("steady ROI 計算済", typeof kpi.byStyle.steady.roi === "number");
  expectTrue("balanced ROI 計算済", typeof kpi.byStyle.balanced.roi === "number" || kpi.byStyle.balanced.roi === null);
  expectTrue("aggressive ROI 計算済", typeof kpi.byStyle.aggressive.roi === "number");
  // ROI が異なる値であること (混ざっていないこと)
  const rois = [kpi.byStyle.steady.roi, kpi.byStyle.balanced.roi, kpi.byStyle.aggressive.roi].filter(v => v != null);
  const allSame = rois.every(r => r === rois[0]);
  expectTrue("3 スタイルの ROI は全て同じ値ではない (混ざっていない)", !allSame);
}

/* === ⑤ PublicLog でもスタイル別 === */
console.log("\n▶ 5. PublicLog で profile フィールドが残り、 byVersion/byStyle 集計可");
{
  _store.clear();
  for (const s of STYLES) {
    const rec = makeBuy(s, true);
    rec.startTime = `10:${STYLES.indexOf(s)}0`;
    appendPublicLog(rec);
  }
  const log = loadPublicLog();
  expect("公開ログに 3 件", log.length, 3);
  expect("steady profile 残存", log[0].entry.profile, "steady");
  expect("balanced profile 残存", log[1].entry.profile, "balanced");
  expect("aggressive profile 残存", log[2].entry.profile, "aggressive");
  // sumarize で byVersion (= verificationVersion 単位) もある
  const sum = summarizePublicLog();
  expectTrue("byVersion 集計あり", Object.keys(sum.byVersion).length > 0);
  // 同一 version 内に 3 件 (3 スタイル混在)
  const v = CURRENT_VERIFICATION_VERSION;
  expect(`byVersion[${v}].count = 3`, sum.byVersion[v].count, 3);
}

/* === ⑥ PublicLog で profile filter が動く === */
console.log("\n▶ 6. PublicLog で各 profile のエントリを抽出可能");
{
  const log = loadPublicLog();
  const steady = log.filter((b) => b.entry?.profile === "steady");
  const balanced = log.filter((b) => b.entry?.profile === "balanced");
  const aggressive = log.filter((b) => b.entry?.profile === "aggressive");
  expect("steady 1 件", steady.length, 1);
  expect("balanced 1 件", balanced.length, 1);
  expect("aggressive 1 件", aggressive.length, 1);
}

/* === ⑦ getStorageStats もスタイル別件数 === */
console.log("\n▶ 7. getStorageStats でスタイル別件数 (storage.js byProfile)");
{
  _store.clear();
  const preds = {};
  for (const s of STYLES) {
    preds[`${dateKey}_${raceId}_${s}`] = makeBuy(s, true);
  }
  saveAndVerify({ settings: {}, predictions: preds }, []);
  const stats = getStorageStats(preds);
  expect("steady count = 1", stats.steady, 1);
  expect("balanced count = 1", stats.balanced, 1);
  expect("aggressive count = 1", stats.aggressive, 1);
}

/* === ⑧ getVisibleData の countsByStyle / roiByStyle === */
console.log("\n▶ 8. getVisibleData countsByStyle / roiByStyle");
{
  _store.clear();
  const preds = {};
  for (const s of STYLES) preds[`${dateKey}_${raceId}_${s}`] = makeBuy(s, true);
  saveAndVerify({ settings: {}, predictions: preds }, []);
  const reloaded = loadState();
  const vd = getVisibleData(reloaded.predictions, { currentStyle: "balanced" });
  expect("countsByStyle.steady = 1", vd.countsByStyle.steady, 1);
  expect("countsByStyle.balanced = 1", vd.countsByStyle.balanced, 1);
  expect("countsByStyle.aggressive = 1", vd.countsByStyle.aggressive, 1);
  // bestStyle: ROI 最高のスタイル
  expectTrue("bestStyle 存在 or null", typeof vd.bestStyle === "string" || vd.bestStyle === null);
}

/* === ⑩ Round 84: PublicLog summarize に byStyle + bestStyle === */
console.log("\n▶ 10. Round 84 — summarizePublicLog の byStyle / bestStyle");
{
  _store.clear();
  // steady: 3 戦 1 勝 / balanced: 3 戦 0 勝 / aggressive: 3 戦 2 勝
  for (let i = 0; i < 3; i++) {
    const r1 = makeBuy("steady", i === 0, { stake: 200 });
    r1.startTime = `10:${i}0`;
    r1.key = `${dateKey}_kr${i}_steady`;
    appendPublicLog(r1);
    const r2 = makeBuy("balanced", false, { stake: 500 });
    r2.startTime = `10:${i}0`;
    r2.key = `${dateKey}_kr${i}_balanced`;
    appendPublicLog(r2);
    const r3 = makeBuy("aggressive", i < 2, { stake: 800 });
    r3.startTime = `10:${i}0`;
    r3.key = `${dateKey}_kr${i}_aggressive`;
    appendPublicLog(r3);
  }
  const sum = summarizePublicLog();
  expectTrue("byStyle.steady あり", !!sum.byStyle?.steady);
  expectTrue("byStyle.balanced あり", !!sum.byStyle?.balanced);
  expectTrue("byStyle.aggressive あり", !!sum.byStyle?.aggressive);
  expect("steady count = 3", sum.byStyle.steady.count, 3);
  expect("balanced count = 3", sum.byStyle.balanced.count, 3);
  expect("aggressive count = 3", sum.byStyle.aggressive.count, 3);
  expect("steady hits = 1", sum.byStyle.steady.hits, 1);
  expect("balanced hits = 0", sum.byStyle.balanced.hits, 0);
  expect("aggressive hits = 2", sum.byStyle.aggressive.hits, 2);
  // bestStyle: ROI 最高 (3 戦以上)
  expectTrue("bestStyle 設定済", typeof sum.bestStyle === "string");
  expectTrue("bestRoi 数値", typeof sum.bestRoi === "number");
}

/* === ⑨ filterForVerification で style 指定 === */
console.log("\n▶ 9. filterForVerification で style 別抽出");
{
  _store.clear();
  const preds = {};
  for (const s of STYLES) preds[`${dateKey}_${raceId}_${s}`] = makeBuy(s, true);
  const onlySteady = filterForVerification(preds, { preCloseOnly: true, style: "steady" });
  const onlyBal = filterForVerification(preds, { preCloseOnly: true, style: "balanced" });
  const onlyAgg = filterForVerification(preds, { preCloseOnly: true, style: "aggressive" });
  expect("steady のみ 1 件", onlySteady.length, 1);
  expect("balanced のみ 1 件", onlyBal.length, 1);
  expect("aggressive のみ 1 件", onlyAgg.length, 1);
  expect("steady の profile 一致", onlySteady[0].profile, "steady");
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
