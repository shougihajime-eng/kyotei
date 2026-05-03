/**
 * Round 85: Supabase round-trip でスタイル分離 + 検証フィールドが保持されるか
 *
 * 検証項目:
 *  ① toRow → fromRow の round-trip で 3 スタイルが各々保持される
 *  ② key (= ${dateKey}_${raceId}_${style}) が round-trip で保たれる
 *  ③ profile (steady/balanced/aggressive) が round-trip で保たれる
 *  ④ 検証メタ (verificationVersion / preCloseTarget / isGoCandidate / isSampleData / finalized) が round-trip
 *  ⑤ 判断材料 (boatsSnapshot / weatherSnapshot / reasoning / inTrust / development) が round-trip
 *  ⑥ details=null (旧スキーマ互換) でも fromRow が落ちない
 *  ⑦ mergeLocalAndCloud で 3 スタイルが衝突せず保持される
 */
const { mergeLocalAndCloud, toRow, fromRow } = await import("../src/lib/cloudSync.js");

// toRow / fromRow は内部関数なのでファイルから抽出してテストするため、
// ここでは 同等のロジックを再現してテスト。 実装は cloudSync.js を参照。
// 代わりに mergeLocalAndCloud + 仮想 cloud 行で round-trip を simulate する。

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

console.log("\n========== Round 85 Supabase round-trip スタイル分離検証 ==========\n");

const STYLES = ["steady", "balanced", "aggressive"];
const dateKey = "20260503";
const raceId = "kr2";

// === 仮想 mergeLocalAndCloud round-trip ===
// local 予想を 3 スタイル分作る → 「cloud に push して pull した結果」 として
// localStorage 形式の cloud オブジェクトを作る → mergeLocalAndCloud で統合
function makeLocalBuy(style) {
  return {
    key: `${dateKey}_${raceId}_${style}`,
    date: "2026-05-03", raceId, venue: "桐生", jcd: "01", raceNo: 2,
    startTime: "14:00",
    decision: "buy", profile: style,
    combos: [{ kind: "3連単", combo: style === "steady" ? "1-2-3" : style === "balanced" ? "1-2-4" : "1-3-5", odds: 5.5, prob: 0.30, ev: 1.65, stake: 500 }],
    totalStake: 500, virtual: false,
    confidence: 75, grade: "A",
    snapshotAt: `2026-05-03T13:5${STYLES.indexOf(style)}:00.000Z`,
    version: "v2",
    verificationVersion: "v2.preclose-strict.r70",
    preCloseTarget: true, isGoCandidate: true, isSampleData: false, finalized: false,
    boatsSnapshot: [{ boatNo: 1, racer: "A", winRate: 5.5, motor2: 38, exTime: 6.85, avgST: 0.16 }],
    weatherSnapshot: { weather: "晴", wind: 2, wave: 2 },
    reasoning: { whyBuy: ["A", "B", "C"], whyNot: ["D"], maxRisk: "リスク" },
    inTrust: { level: "イン逃げ濃厚" },
    development: { scenario: "逃げ" },
  };
}

/* === 1. mergeLocalAndCloud で 3 スタイルが衝突せず保持 === */
console.log("▶ 1. mergeLocalAndCloud — 3 スタイルが衝突なく保持される");
{
  const local = {};
  const cloud = {};
  for (const s of STYLES) {
    local[`${dateKey}_${raceId}_${s}`] = makeLocalBuy(s);
    cloud[`${dateKey}_${raceId}_${s}`] = makeLocalBuy(s);
  }
  const result = mergeLocalAndCloud(local, cloud);
  expectTrue("merged は object", result && typeof result === "object");
  const mergedPreds = result.merged || {};
  expectTrue("steady key 残存", !!mergedPreds[`${dateKey}_${raceId}_steady`]);
  expectTrue("balanced key 残存", !!mergedPreds[`${dateKey}_${raceId}_balanced`]);
  expectTrue("aggressive key 残存", !!mergedPreds[`${dateKey}_${raceId}_aggressive`]);
  // 各スタイルの combo が独立
  expect("steady combo 1-2-3", mergedPreds[`${dateKey}_${raceId}_steady`].combos[0].combo, "1-2-3");
  expect("balanced combo 1-2-4", mergedPreds[`${dateKey}_${raceId}_balanced`].combos[0].combo, "1-2-4");
  expect("aggressive combo 1-3-5", mergedPreds[`${dateKey}_${raceId}_aggressive`].combos[0].combo, "1-3-5");
  // profile が key と一致
  expect("steady profile", mergedPreds[`${dateKey}_${raceId}_steady`].profile, "steady");
  expect("balanced profile", mergedPreds[`${dateKey}_${raceId}_balanced`].profile, "balanced");
  expect("aggressive profile", mergedPreds[`${dateKey}_${raceId}_aggressive`].profile, "aggressive");
}

/* === 2. local のみ存在、 cloud に無い場合 → local 優先 === */
console.log("\n▶ 2. local のみ → local 完全保持");
{
  const local = {};
  for (const s of STYLES) local[`${dateKey}_${raceId}_${s}`] = makeLocalBuy(s);
  const result = mergeLocalAndCloud(local, {});
  const mp = result.merged || {};
  expect("3 件保持", Object.keys(mp).length, 3);
  // 検証メタも保持される
  expect("preCloseTarget=true 保持", mp[`${dateKey}_${raceId}_steady`].preCloseTarget, true);
  expectTrue("verificationVersion 保持", typeof mp[`${dateKey}_${raceId}_steady`].verificationVersion === "string");
}

/* === 3. cloud に無いキーがある + local に無いキーが cloud にある (両方マージ) === */
console.log("\n▶ 3. local + cloud で異なる key → 全件マージ");
{
  const local = { [`${dateKey}_${raceId}_steady`]: makeLocalBuy("steady") };
  const cloud = { [`${dateKey}_${raceId}_balanced`]: makeLocalBuy("balanced") };
  const result = mergeLocalAndCloud(local, cloud);
  const mp = result.merged || {};
  expect("マージ後 2 件", Object.keys(mp).length, 2);
  expectTrue("steady (local 由来) 残存", !!mp[`${dateKey}_${raceId}_steady`]);
  expectTrue("balanced (cloud 由来) 取り込み", !!mp[`${dateKey}_${raceId}_balanced`]);
}

/* === 4. 同 key で local と cloud に差 → snapshotAt 新しい方を採用 === */
console.log("\n▶ 4. 同 key の重複 → 新しい snapshotAt が勝つ");
{
  const oldOne = { ...makeLocalBuy("balanced"), snapshotAt: "2026-05-01T10:00:00.000Z", confidence: 60 };
  const newOne = { ...makeLocalBuy("balanced"), snapshotAt: "2026-05-03T15:00:00.000Z", confidence: 80 };
  const local = { [`${dateKey}_${raceId}_balanced`]: oldOne };
  const cloud = { [`${dateKey}_${raceId}_balanced`]: newOne };
  const result = mergeLocalAndCloud(local, cloud);
  const mp = result.merged || {};
  expect("balanced 1 件のみ", Object.keys(mp).length, 1);
  // newer (cloud) 採用
  expect("confidence は 80 (新しい方)", mp[`${dateKey}_${raceId}_balanced`].confidence, 80);
}

/* === 5. profile が混入しない (key の suffix で隔離) === */
console.log("\n▶ 5. profile 混入防止: 異なる profile は別 key なので絶対に上書きしない");
{
  // 同じ raceId で 3 スタイル
  const local = {};
  const cloud = {};
  // local では steady だけ古い snapshot
  local[`${dateKey}_${raceId}_steady`] = { ...makeLocalBuy("steady"), snapshotAt: "2026-05-01T10:00:00.000Z" };
  // cloud では balanced と aggressive が新しい
  cloud[`${dateKey}_${raceId}_balanced`] = { ...makeLocalBuy("balanced"), snapshotAt: "2026-05-03T15:00:00.000Z" };
  cloud[`${dateKey}_${raceId}_aggressive`] = { ...makeLocalBuy("aggressive"), snapshotAt: "2026-05-03T15:00:00.000Z" };
  const result = mergeLocalAndCloud(local, cloud);
  const mp = result.merged || {};
  expect("3 件全部マージされる", Object.keys(mp).length, 3);
  expect("steady profile", mp[`${dateKey}_${raceId}_steady`].profile, "steady");
  expect("balanced profile", mp[`${dateKey}_${raceId}_balanced`].profile, "balanced");
  expect("aggressive profile", mp[`${dateKey}_${raceId}_aggressive`].profile, "aggressive");
  // 各スタイルが独立した combo を保持
  expect("steady combo 不変", mp[`${dateKey}_${raceId}_steady`].combos[0].combo, "1-2-3");
  expect("balanced combo 不変", mp[`${dateKey}_${raceId}_balanced`].combos[0].combo, "1-2-4");
  expect("aggressive combo 不変", mp[`${dateKey}_${raceId}_aggressive`].combos[0].combo, "1-3-5");
}

/* === 7. toRow → fromRow round-trip で全フィールドが保持される === */
console.log("\n▶ 7. toRow → fromRow round-trip — 検証フィールド完全保持");
{
  // 詳細フィールドを盛った買い推奨レコード
  const original = {
    ...makeLocalBuy("balanced"),
    finalized: true,
    result: { first: 1, second: 2, third: 3 },
    payout: 2750, hit: true, pnl: 2250,
    boatsSnapshot: Array.from({ length: 6 }, (_, i) => ({
      boatNo: i + 1, racer: `選手${i+1}`, class: "A1", winRate: 5.5, motor2: 38, exTime: 6.85, avgST: 0.16,
    })),
    weatherSnapshot: { weather: "晴", wind: 2, windDir: "北", wave: 2, temp: 20 },
    reasoning: { whyBuy: ["A","B","C"], whyNot: ["D"], maxRisk: "リスク", oneLine: "1-2-3" },
    inTrust: { level: "イン逃げ濃厚" },
    development: { scenario: "逃げ" },
    accident: null,
    probConsistency: { oneFirstSum: 1.0 },
    probs: [0.55, 0.18, 0.10, 0.07, 0.06, 0.04],
    maxEV: 1.65,
  };
  // push: localStorage → Supabase row
  const row = toRow("user_xyz", original);
  expectTrue("row.user_id 設定", row.user_id === "user_xyz");
  expectTrue("row.key 設定 (style 含む)", row.key.endsWith("_balanced"));
  expectTrue("row.profile = balanced", row.profile === "balanced");
  expectTrue("row.details JSONB 存在", row.details != null && typeof row.details === "object");
  expectTrue("details.boatsSnapshot 6 艇", Array.isArray(row.details.boatsSnapshot) && row.details.boatsSnapshot.length === 6);
  expectTrue("details.weatherSnapshot あり", row.details.weatherSnapshot != null);
  expectTrue("details.reasoning あり", row.details.reasoning != null);
  expectTrue("details.preCloseTarget=true", row.details.preCloseTarget === true);
  expectTrue("details.verificationVersion 文字列", typeof row.details.verificationVersion === "string");
  expectTrue("details.finalized=true", row.details.finalized === true);
  expectTrue("details.inTrust あり", row.details.inTrust != null);

  // pull: Supabase row → localStorage
  const restored = fromRow(row);
  expectTrue("restored は object", restored != null);
  expect("key 復元", restored.key, original.key);
  expect("profile 復元", restored.profile, "balanced");
  expect("decision 復元", restored.decision, "buy");
  expect("totalStake 復元", restored.totalStake, original.totalStake);
  // 検証メタ復元
  expect("verificationVersion 復元", restored.verificationVersion, original.verificationVersion);
  expect("preCloseTarget 復元", restored.preCloseTarget, true);
  expect("isGoCandidate 復元", restored.isGoCandidate, true);
  expect("finalized 復元", restored.finalized, true);
  expect("isSampleData 復元", restored.isSampleData, false);
  // 判断材料スナップショット復元
  expectTrue("boatsSnapshot 6 艇", Array.isArray(restored.boatsSnapshot) && restored.boatsSnapshot.length === 6);
  expect("各艇の class 復元", restored.boatsSnapshot.map(b => b.class), Array(6).fill("A1"));
  expect("weatherSnapshot.wind 復元", restored.weatherSnapshot.wind, 2);
  expectTrue("reasoning.whyBuy 復元", Array.isArray(restored.reasoning.whyBuy) && restored.reasoning.whyBuy.length === 3);
  expect("reasoning.maxRisk 復元", restored.reasoning.maxRisk, "リスク");
  expect("inTrust.level 復元", restored.inTrust.level, "イン逃げ濃厚");
  expect("development.scenario 復元", restored.development.scenario, "逃げ");
  // 結果も round-trip
  expectTrue("result 復元", restored.result?.first === 1);
  expect("payout 復元", restored.payout, 2750);
  expect("hit 復元", restored.hit, true);
  expect("pnl 復元", restored.pnl, 2250);
}

/* === 8. 旧スキーマ互換: details なし行でも fromRow が動く === */
console.log("\n▶ 8. 旧スキーマ互換 — details=null の行でも落ちない");
{
  const oldRow = {
    key: "20260101_old_balanced", date: "2026-01-01", race_id: "old",
    venue: "桐生", race_no: 1, start_time: "10:00",
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", odds: 5.5 }],
    total_stake: 500, profile: "balanced", virtual: false,
    payout: 0, hit: false, pnl: -500,
    snapshot_at: "2026-01-01T09:50:00.000Z",
    details: null, // 旧スキーマ
  };
  const restored = fromRow(oldRow);
  expectTrue("fromRow が落ちない", restored != null);
  expect("key 復元", restored.key, oldRow.key);
  expect("profile 復元", restored.profile, "balanced");
  expect("verificationVersion = undefined (details なし)", restored.verificationVersion, undefined);
  expect("preCloseTarget = false (デフォルト)", restored.preCloseTarget, false);
  expect("boatsSnapshot = undefined (details なし)", restored.boatsSnapshot, undefined);
}

/* === 9. 3 スタイル全て round-trip で保持される === */
console.log("\n▶ 9. 3 スタイル round-trip 完全保持");
{
  const localPreds = {};
  for (const s of STYLES) localPreds[`${dateKey}_${raceId}_${s}`] = makeLocalBuy(s);
  // 全部 toRow で push 形式に
  const rows = Object.values(localPreds).map((p) => toRow("u1", p));
  expect("3 行生成", rows.length, 3);
  // 全部 fromRow で local 形式に戻す
  const restored = rows.map(fromRow);
  // 各 profile の combo 一致
  expect("steady combo 復元", restored.find(r => r.profile === "steady").combos[0].combo, "1-2-3");
  expect("balanced combo 復元", restored.find(r => r.profile === "balanced").combos[0].combo, "1-2-4");
  expect("aggressive combo 復元", restored.find(r => r.profile === "aggressive").combos[0].combo, "1-3-5");
  // 全 key が style suffix で異なる
  const keys = restored.map(r => r.key);
  const uniqueKeys = new Set(keys);
  expect("key の一意性 (3 件全て異なる)", uniqueKeys.size, 3);
}

/* === 10. Round 86: frozen レコード保護 === */
console.log("\n▶ 10. Round 86 — 結果ありレコード保護 (frozen-wins-over-newer-non-frozen)");
{
  // local: snapshotAt 新しい / 結果なし
  const localNonFrozen = { ...makeLocalBuy("balanced"), snapshotAt: "2026-05-03T15:00:00.000Z" };
  // cloud: snapshotAt 古い / 結果あり (Device A で確定済)
  const cloudFrozen = {
    ...makeLocalBuy("balanced"),
    snapshotAt: "2026-05-03T14:00:00.000Z",
    result: { first: 1, second: 2, third: 3 },
    payout: 2750, hit: true, pnl: 2250,
    finalized: true,
  };
  const local = { [`${dateKey}_${raceId}_balanced`]: localNonFrozen };
  const cloud = { [`${dateKey}_${raceId}_balanced`]: cloudFrozen };
  const result = mergeLocalAndCloud(local, cloud);
  const mp = result.merged;
  expectTrue("frozen レコードが採用される (snapshotAt が古くても)", !!mp[`${dateKey}_${raceId}_balanced`]?.result?.first);
  expect("payout = 2750 (cloud 由来)", mp[`${dateKey}_${raceId}_balanced`].payout, 2750);
  expect("hit = true (cloud 由来)", mp[`${dateKey}_${raceId}_balanced`].hit, true);
}

/* === 11. Round 86: 逆方向 — local frozen / cloud newer non-frozen → local 保持 === */
console.log("\n▶ 11. Round 86 — local frozen + cloud newer non-frozen → local 結果消えない");
{
  const localFrozen = {
    ...makeLocalBuy("balanced"),
    snapshotAt: "2026-05-03T14:00:00.000Z",
    result: { first: 1, second: 2, third: 3 },
    payout: 2750, hit: true, pnl: 2250,
    finalized: true,
  };
  // cloud に別の "より新しい snapshot" があるが結果なし (= 別端末の偽更新)
  const cloudNewerNonFrozen = { ...makeLocalBuy("balanced"), snapshotAt: "2026-05-03T15:00:00.000Z" };
  const local = { [`${dateKey}_${raceId}_balanced`]: localFrozen };
  const cloud = { [`${dateKey}_${raceId}_balanced`]: cloudNewerNonFrozen };
  const result = mergeLocalAndCloud(local, cloud);
  const mp = result.merged;
  expectTrue("local frozen が保持される", !!mp[`${dateKey}_${raceId}_balanced`]?.result?.first);
  expect("payout 不変 = 2750 (local 由来、 cloud に潰されない)", mp[`${dateKey}_${raceId}_balanced`].payout, 2750);
  expect("hit 不変 = true (local 由来)", mp[`${dateKey}_${raceId}_balanced`].hit, true);
}

/* === 12. Round 86: 両方 frozen → snapshotAt 新しい方 === */
console.log("\n▶ 12. Round 86 — 両方 frozen → snapshotAt 新しい方が勝つ");
{
  const localFrozen = {
    ...makeLocalBuy("balanced"), snapshotAt: "2026-05-03T14:00:00.000Z",
    result: { first: 1, second: 2, third: 3 }, payout: 1000, hit: true, pnl: 500, finalized: true,
  };
  const cloudFrozen = {
    ...makeLocalBuy("balanced"), snapshotAt: "2026-05-03T15:00:00.000Z",
    result: { first: 2, second: 1, third: 3 }, payout: 0, hit: false, pnl: -500, finalized: true,
  };
  const local = { [`${dateKey}_${raceId}_balanced`]: localFrozen };
  const cloud = { [`${dateKey}_${raceId}_balanced`]: cloudFrozen };
  const result = mergeLocalAndCloud(local, cloud);
  const mp = result.merged;
  expect("cloud frozen 採用 (snapshotAt 新しい)", mp[`${dateKey}_${raceId}_balanced`].payout, 0);
  expect("hit = false (cloud 由来)", mp[`${dateKey}_${raceId}_balanced`].hit, false);
}

/* === 6. profile が key の suffix と一致するか (整合性チェック) === */
console.log("\n▶ 6. key の suffix と profile が一致");
{
  for (const s of STYLES) {
    const rec = makeLocalBuy(s);
    const keyParts = rec.key.split("_");
    const styleSuffix = keyParts[keyParts.length - 1];
    expect(`${s}: key suffix = profile`, styleSuffix, rec.profile);
  }
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
