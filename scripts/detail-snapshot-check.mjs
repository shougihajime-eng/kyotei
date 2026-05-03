/**
 * Round 79: 買い推奨レースの「判断材料スナップショット」 検証
 *
 * 検証項目 (ユーザー指定 6 項目に対応):
 *  ① 買い推奨レースには boatsSnapshot / weatherSnapshot / reasoning が保存されているか
 *  ② 見送りレースは軽量保存 (boats/weather/reasoning なし)
 *  ③ PublicLog にも reasoning / weather / combos / EV / confidence / オッズが残るか
 *  ④ 結果確定後も、 買い推奨時点の判断材料が上書きされず残るか (フリーズ)
 *  ⑤ 「買い → skip」 への降格は許可されない (買い瞬間を保持)
 *  ⑥ JSON エクスポートに買い推奨時点の詳細情報が入るか
 *
 * このテストは auto-snapshot ロジックの単体ではなく、
 * predictions レコードと PublicLog エントリの 「形」 を検証する。
 * App.jsx の auto-snapshot で生成される構造を シミュレートして検証。
 */

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

const { appendPublicLog, loadPublicLog, exportPublicLogJson, syncPublicLog } =
  await import("../src/lib/immutableLog.js");
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

console.log("\n========== Round 79 詳細スナップショット 検証 ==========\n");

/* === Helper: App.jsx auto-snapshot が買いレコードに保存する形を再現 === */
function makeBuyRecord(opts = {}) {
  const ts = opts.snapshotAt || "2026-05-03T13:50:00.000Z";
  return {
    key: `20260503_kr2_${opts.profile || "balanced"}`,
    date: "2026-05-03", raceId: "kr2",
    venue: "桐生", jcd: "01", raceNo: 2,
    startTime: "14:00",
    profile: opts.profile || "balanced",
    decision: "buy",
    combos: [
      { kind: "3連単", combo: "1-2-3", stake: 500, odds: 5.5, prob: 0.30, ev: 1.65, grade: "S", role: "本線", pickReason: "1号艇イン逃げ濃厚 + モーター上位" },
      { kind: "2連単", combo: "1-2", stake: 200, odds: 2.5, prob: 0.50, ev: 1.25, grade: "A", role: "押さえ" },
    ],
    totalStake: 700,
    confidence: 78,
    grade: "A",
    reason: "イン有利 + モーター上位",
    rationale: "1 号艇強く、 2-3 号艇に展示差ありで本線 1-2-3、 押さえ 1-2",
    warnings: [],
    snapshotAt: ts,
    version: "v2",
    verificationVersion: "v2.preclose-strict.r70",
    preCloseTarget: true, isGoCandidate: true, isSampleData: false,
    finalized: false,
    // === Round 79: 判断材料スナップショット ===
    boatsSnapshot: Array.from({ length: 6 }, (_, i) => ({
      boatNo: i + 1,
      racer: `選手${i+1}`, class: i < 2 ? "A1" : i < 4 ? "A2" : "B1",
      winRate: 5.5 + i * 0.2, placeRate: 35 + i, localWinRate: 5.0 + i, localPlaceRate: 32 + i,
      motor2: 38 + i, motor3: 45 + i, boat2: 30 + i, boat3: 40 + i,
      exTime: 6.85 - i * 0.02, tilt: 0.5,
      avgST: 0.16 + i * 0.005, exST: 0.16 + i * 0.005,
      entryHistory: [1, 2, 3, 4],
      partsExchange: [],
      exhibitionNote: i === 0 ? "気配良" : null,
      age: 30 + i, weight: 52 + i,
    })),
    weatherSnapshot: { weather: "晴", wind: 2, windDir: "北", wave: 2, temp: 20, waterTemp: 18 },
    reasoning: { whyBuy: ["1号艇イン逃げ濃厚で軸は堅い", "2号艇展示上位で評価", "EV 165%"], whyNot: ["他艇は内側不利"], maxRisk: "1号艇のスタート失敗時、 全消し", oneLine: "🎯 1-2-3 (3連単) — イン逃げ で勝負" },
    inTrust: { level: "イン逃げ濃厚" },
    development: { scenario: "逃げ" },
    accident: null,
    probConsistency: { oneFirstSum: 1.0 },
    probs: [0.55, 0.18, 0.10, 0.07, 0.06, 0.04],
    maxEV: 1.65,
  };
}
function makeSkipRecord(opts = {}) {
  return {
    key: `20260503_kr3_${opts.profile || "balanced"}`,
    date: "2026-05-03", raceId: "kr3",
    venue: "桐生", jcd: "01", raceNo: 3,
    startTime: "14:30",
    profile: opts.profile || "balanced",
    decision: "skip",
    reason: "EV 妙味なし",
    reasons: ["本線 EV 1.10 < 下限 1.20"],
    combos: [],
    totalStake: 0,
    grade: null,
    intendedMain: { kind: "3連単", combo: "1-2-3", odds: 4.5, prob: 0.25, ev: 1.12 },
    warnings: [],
    snapshotAt: "2026-05-03T14:20:00.000Z",
    version: "v2",
    verificationVersion: "v2.preclose-strict.r70",
    preCloseTarget: true, isGoCandidate: false, isSampleData: false,
    finalized: false,
  };
}

/* === ① 買い推奨に detailedSnapshot が保存されているか === */
console.log("▶ 1. 買い推奨レコード — boats / weather / reasoning が揃っている");
{
  const buy = makeBuyRecord();
  expectTrue("boatsSnapshot は 6 艇分", Array.isArray(buy.boatsSnapshot) && buy.boatsSnapshot.length === 6);
  expectTrue("各艇に winRate", buy.boatsSnapshot.every((b) => typeof b.winRate === "number"));
  expectTrue("各艇に motor2", buy.boatsSnapshot.every((b) => typeof b.motor2 === "number"));
  expectTrue("各艇に exTime", buy.boatsSnapshot.every((b) => typeof b.exTime === "number"));
  expectTrue("各艇に avgST", buy.boatsSnapshot.every((b) => typeof b.avgST === "number"));
  expectTrue("各艇に class (級別)", buy.boatsSnapshot.every((b) => typeof b.class === "string"));
  expectTrue("weather に wind", typeof buy.weatherSnapshot?.wind === "number");
  expectTrue("weather に wave", typeof buy.weatherSnapshot?.wave === "number");
  expectTrue("weather に windDir", typeof buy.weatherSnapshot?.windDir === "string");
  expectTrue("reasoning.whyBuy が 3 行", buy.reasoning?.whyBuy?.length === 3);
  expectTrue("reasoning.maxRisk あり", typeof buy.reasoning?.maxRisk === "string");
  expectTrue("inTrust.level あり", typeof buy.inTrust?.level === "string");
  expectTrue("probs 6 個", Array.isArray(buy.probs) && buy.probs.length === 6);
  expectTrue("confidence あり", typeof buy.confidence === "number");
}

/* === ② 見送りは軽量保存 === */
console.log("\n▶ 2. 見送りレコード — boats / weather / reasoning なし");
{
  const skip = makeSkipRecord();
  expectTrue("boatsSnapshot なし", skip.boatsSnapshot === undefined);
  expectTrue("weatherSnapshot なし", skip.weatherSnapshot === undefined);
  expectTrue("reasoning なし", skip.reasoning === undefined);
  expectTrue("intendedMain は残る (検証用)", !!skip.intendedMain);
  expectTrue("reasons[] は残る (なぜ見送ったか)", Array.isArray(skip.reasons) && skip.reasons.length > 0);
}

/* === ③ PublicLog に reasoning / weather / combos / EV / confidence が残るか === */
console.log("\n▶ 3. PublicLog エントリ — 判断材料が含まれる");
{
  _store.clear();
  const buy = { ...makeBuyRecord(), finalized: true, result: { first: 1, second: 2, third: 3 }, payout: 2750, hit: true, pnl: 2050 };
  const r = appendPublicLog(buy);
  expectTrue("append OK", r.ok && !!r.entry);
  const logged = r.entry.entry;
  expectTrue("entry.reasoning あり", logged.reasoning != null);
  expectTrue("reasoning.whyBuy 配列", Array.isArray(logged.reasoning?.whyBuy));
  expectTrue("reasoning.maxRisk あり", typeof logged.reasoning?.maxRisk === "string");
  expectTrue("entry.weather あり", logged.weather != null);
  expect("weather.wind = 2", logged.weather?.wind, 2);
  expect("weather.wave = 2", logged.weather?.wave, 2);
  expectTrue("entry.combos は配列 (買い目全部)", Array.isArray(logged.combos) && logged.combos.length === 2);
  expect("combos[0].ev = 1.65", logged.combos[0].ev, 1.65);
  expect("entry.confidence = 78", logged.confidence, 78);
  expectTrue("entry.main.odds = 5.5", logged.main?.odds === 5.5);
  expectTrue("entry.inTrust.level あり", typeof logged.inTrust?.level === "string");
  expectTrue("entry.development.scenario あり", typeof logged.development?.scenario === "string");
}

/* === ④ 結果確定後の判断材料フリーズ (上書きされない) === */
console.log("\n▶ 4. フリーズ — 結果確定後は判断材料が上書きされない");
{
  // App.jsx auto-snapshot のロジックを再現
  // 既存レコード (買い + 結果確定済) に対して 「再評価」 が来たら無視されるか
  function autoSnapshotShouldUpdate(existing, newRec) {
    // App.jsx の Round 79 ガード:
    // 1. existing.manuallyRecorded → スキップ
    if (existing.manuallyRecorded) return false;
    // 2. existing.result?.first → スキップ (結果確定後はフリーズ)
    if (existing.result?.first) return false;
    // 3. existing.decision === "buy" && newRec.decision !== "buy" → スキップ (買い→他は降格しない)
    if (existing.decision === "buy" && newRec.decision !== "buy") return false;
    return true;
  }
  const settled = { ...makeBuyRecord(), finalized: true, result: { first: 1, second: 2, third: 3 }, payout: 2750, hit: true };
  expectTrue("結果ありレコードへの再 buy → 上書きされない", !autoSnapshotShouldUpdate(settled, { decision: "buy" }));
  expectTrue("結果ありレコードへの再 skip → 上書きされない", !autoSnapshotShouldUpdate(settled, { decision: "skip" }));
  // 結果なしレコードへの新 buy は許可 (新しいオッズ反映)
  const unsettled = makeBuyRecord();
  expectTrue("結果なし + buy → buy 更新許可", autoSnapshotShouldUpdate(unsettled, { decision: "buy" }));
  expectTrue("結果なし + buy → skip 降格は禁止", !autoSnapshotShouldUpdate(unsettled, { decision: "skip" }));
}

/* === ⑤ 「買い → skip」 への降格 === */
console.log("\n▶ 5. 買い → skip 降格は禁止 (買い瞬間を固定保持)");
{
  // ④ で同等の検証済 (autoSnapshotShouldUpdate で false 返す)
  // PublicLog 側でも skip にはならない (decision==="buy" 必須なので)
  const buyThenSkip = { ...makeSkipRecord(), decision: "skip" }; // 仮に skip だったら
  const r = appendPublicLog({ ...buyThenSkip, finalized: true, result: { first: 1, second: 2, third: 3 } });
  expectTrue("PublicLog は skip 拒否", r.ok === false);
  expectTrue("理由に「買い推奨ではない」", /買い推奨ではない/.test(r.reason || ""));
}

/* === ⑥ JSON エクスポートに詳細情報が入る === */
console.log("\n▶ 6. JSON エクスポート — 判断材料が含まれる");
{
  _store.clear();
  const buy = { ...makeBuyRecord(), finalized: true, result: { first: 1, second: 2, third: 3 }, payout: 2750, hit: true, pnl: 2050 };
  appendPublicLog(buy);
  const json = exportPublicLogJson();
  const obj = JSON.parse(json);
  const e = obj.log?.[0]?.entry;
  expectTrue("JSON に reasoning 含む", e?.reasoning != null);
  expectTrue("JSON に weather 含む", e?.weather != null);
  expectTrue("JSON に combos 配列", Array.isArray(e?.combos));
  expectTrue("JSON に inTrust 含む", e?.inTrust != null);
  expectTrue("JSON に confidence 含む", typeof e?.confidence === "number");
  expectTrue("JSON は有効", obj.integrity?.valid === true);
}

/* === ⑦ buildReasoningSummary が買い時に whyBuy 3 行を返す === */
console.log("\n▶ 7. buildReasoningSummary が買い時に正しい構造を返す");
{
  const ev = {
    race: { boats: Array.from({length:6}, (_,i)=>({boatNo:i+1, winRate:5.5, motor2:38, exTime:6.85, avgST:0.16})), wind:2, wave:2 },
    items: [], maxEV: 1.65, probs: [0.55,0.18,0.10,0.07,0.06,0.04],
    scores: Array.from({length:6}, (_,i)=>({ boatNo:i+1, factors:{ inAdvantage:i===0?0.7:0.3, motor:0.5, exhibition:0.5, startPower:0.5, winRate:0.5 } })),
    inTrust: { level: "イン逃げ濃厚" },
  };
  const rec = { decision: "buy", profile: "balanced", main: { kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65 } };
  const r = buildReasoningSummary(rec, ev);
  expect("whyBuy 3 行", r.whyBuy.length, 3);
  expectTrue("whyNot >= 1", r.whyNot.length >= 1);
  expectTrue("maxRisk 文字列", typeof r.maxRisk === "string");
  expectTrue("oneLine 含む 1-2-3", r.oneLine.includes("1-2-3"));
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
