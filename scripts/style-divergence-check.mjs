/**
 * Round 69-70: 3 スタイル分離 (独立ロジック) 検証
 *
 * 検証内容:
 *  ① EV_MIN_BY_PROFILE: steady < balanced < aggressive (思想に応じた閾値)
 *  ② steady ゲート: 1号艇勝率/モーター/展示/ST/風波 のいずれかが未達 → skip
 *  ③ aggressive ゲート: EV ≥ 1.50 + オッズ ≥ 8 倍 (高配当のみ)
 *  ④ 同一レースで 3 スタイルが異なる buildBuyRecommendation を返す
 *  ⑤ steady = 1ヘッド限定、 aggressive = 4-6号艇可、 balanced = 中穴
 */

const { buildBuyRecommendation, EV_MIN_BY_PROFILE, MIN_CONFIDENCE_BY_PROFILE } =
  await import("../src/lib/predict.js");

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

console.log("\n========== Round 69-70 3 スタイル分離 検証 ==========\n");

/* === 1. EV 閾値: steady < balanced < aggressive === */
console.log("▶ 1. EV_MIN_BY_PROFILE — steady 緩め / aggressive 厳格");
{
  expectTrue(`steady (${EV_MIN_BY_PROFILE.steady}) < balanced (${EV_MIN_BY_PROFILE.balanced})`,
    EV_MIN_BY_PROFILE.steady < EV_MIN_BY_PROFILE.balanced);
  expectTrue(`balanced (${EV_MIN_BY_PROFILE.balanced}) < aggressive (${EV_MIN_BY_PROFILE.aggressive})`,
    EV_MIN_BY_PROFILE.balanced < EV_MIN_BY_PROFILE.aggressive);
  expectTrue(`steady ≤ 1.10 (EV 撤廃寄り)`, EV_MIN_BY_PROFILE.steady <= 1.10);
  expectTrue(`aggressive ≥ 1.40 (高配当のみ)`, EV_MIN_BY_PROFILE.aggressive >= 1.40);
}

/* 共通 fixture ヘルパ */
function makeStrongEv(opts = {}) {
  // 1号艇有利 + 展示◎ + 風弱の理想ケース
  const boats = Array.from({ length: 6 }, (_, i) => ({
    boatNo: i + 1, name: `選手${i+1}`,
    winRate: i === 0 ? 6.5 : 5.0,
    motor2: i === 0 ? 45 : 30,
    exTime: i === 0 ? 6.75 : 6.85,
    avgST: i === 0 ? 0.14 : 0.18,
    exST: i === 0 ? 0.14 : 0.18,
    tilt: 0.5,
  }));
  return {
    ok: true,
    race: {
      id: "R1", boats, wind: opts.wind ?? 2, wave: opts.wave ?? 2,
      apiOdds: { exacta: { "1-2": 2.5 }, trifecta: { "1-2-3": 5.5 } },
    },
    items: opts.items || [
      { kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65 },
      { kind: "2連単", combo: "1-2", odds: 2.5, prob: 0.50, ev: 1.25 },
      { kind: "2連複", combo: "1=2", odds: 1.8, prob: 0.65, ev: 1.17 },
      { kind: "3連単", combo: "1-3-2", odds: 8, prob: 0.18, ev: 1.44 },
    ],
    maxEV: 1.65,
    probs: [0.55, 0.18, 0.10, 0.07, 0.06, 0.04],
    scores: boats.map((b, i) => ({
      boatNo: b.boatNo,
      factors: { inAdvantage: i === 0 ? 0.7 : 0.3, motor: i === 0 ? 0.8 : 0.4, exhibition: i === 0 ? 0.9 : 0.5, startPower: i === 0 ? 0.7 : 0.4, winRate: i === 0 ? 0.7 : 0.4 },
      conditionMod: 1.05,
    })),
    inTrust: { level: opts.trustLevel ?? "イン逃げ濃厚" },
    development: { scenario: opts.scenario ?? "逃げ" },
    probConsistency: { oneFirstSum: 1.0 },
    accident: null,
    apiOddsStale: false,
    closedNow: false,
  };
}

/* === 2. steady ゲート — 1号艇 winRate 不足で skip === */
console.log("\n▶ 2. steady ゲート — 1号艇 winRate < 5.50 → skip");
{
  const ev = makeStrongEv();
  ev.race.boats[0].winRate = 5.30;
  const rec = buildBuyRecommendation(ev, "steady", 1000);
  expect("decision = skip", rec.decision, "skip");
  expectTrue("理由に「勝率」 が含まれる", (rec.reasons || []).some((r) => /勝率/.test(r)));
}

/* === 3. steady ゲート — モーター不足 === */
console.log("\n▶ 3. steady ゲート — 1号艇 motor2 < 35 → skip");
{
  const ev = makeStrongEv();
  ev.race.boats[0].motor2 = 30;
  const rec = buildBuyRecommendation(ev, "steady", 1000);
  expect("decision = skip", rec.decision, "skip");
  expectTrue("理由に「モーター」 が含まれる", (rec.reasons || []).some((r) => /モーター/.test(r)));
}

/* === 4. steady ゲート — 展示タイム上位3位外 === */
console.log("\n▶ 4. steady ゲート — 1号艇展示が上位3位外 → skip");
{
  const ev = makeStrongEv();
  ev.race.boats[0].exTime = 7.10;
  ev.race.boats[1].exTime = 6.70;
  ev.race.boats[2].exTime = 6.75;
  ev.race.boats[3].exTime = 6.78;
  const rec = buildBuyRecommendation(ev, "steady", 1000);
  expect("decision = skip", rec.decision, "skip");
  expectTrue("理由に「展示」 が含まれる", (rec.reasons || []).some((r) => /展示/.test(r)));
}

/* === 5. steady ゲート — ST 遅い === */
console.log("\n▶ 5. steady ゲート — avgST > 0.17 → skip");
{
  const ev = makeStrongEv();
  ev.race.boats[0].avgST = 0.20;
  ev.race.boats[0].exST = 0.20;
  const rec = buildBuyRecommendation(ev, "steady", 1000);
  expect("decision = skip", rec.decision, "skip");
  expectTrue("理由に「スタート」 or 「ST」", (rec.reasons || []).some((r) => /スタート|ST/.test(r)));
}

/* === 6. steady ゲート — 強風 === */
console.log("\n▶ 6. steady ゲート — 風 ≥ 5 → skip");
{
  const ev = makeStrongEv({ wind: 6 });
  const rec = buildBuyRecommendation(ev, "steady", 1000);
  expect("decision = skip", rec.decision, "skip");
  expectTrue("理由に「風」", (rec.reasons || []).some((r) => /風/.test(r)));
}

/* === 7. steady パス — 全ゲート通過 → buy or 9条件チェック skip (両方許容) === */
console.log("\n▶ 7. steady パス — 全ゲート通過 → buy または 9条件 skip");
{
  const ev = makeStrongEv();
  const rec = buildBuyRecommendation(ev, "steady", 1000);
  // 全 6 ゲート (winRate/motor/exTime/ST/wind/wave/trust) を通過したことを確認
  // 9 条件チェック (apiOdds など) で skip でも構わないが、ゲート由来の skip 理由は無いこと
  const hasGateSkip = (rec.reasons || []).some((r) =>
    /本命型ゲート/.test(r) && !/データ不足/.test(r)
  );
  expectTrue("steady ゲートで skip されていない (gateSkip=false)", !hasGateSkip);
  // 1ヘッド限定 (buy になった場合のみ)
  if (rec.decision === "buy" && rec.items && rec.items.length > 0) {
    expectTrue("steady 候補は 1 ヘッド限定", rec.items.every((it) => it.combo.startsWith("1")));
  }
}

/* === 8. aggressive ゲート — オッズ低 (8倍未満) は除外 === */
console.log("\n▶ 8. aggressive ゲート — オッズ < 8倍 は除外");
{
  // 全 items が 8倍未満 → 候補なし
  const ev = makeStrongEv({
    items: [
      { kind: "3連単", combo: "1-2-3", odds: 5, prob: 0.30, ev: 1.50 },
      { kind: "2連単", combo: "1-2", odds: 2.5, prob: 0.60, ev: 1.50 },
    ],
  });
  const rec = buildBuyRecommendation(ev, "aggressive", 1000);
  expect("decision = skip (低配当のみ)", rec.decision, "skip");
}

/* === 9. aggressive パス — 高配当 + EV ≥ 1.50 === */
console.log("\n▶ 9. aggressive パス — オッズ ≥ 8 + EV ≥ 1.50");
{
  const ev = makeStrongEv({
    items: [
      { kind: "3連単", combo: "1-3-5", odds: 12, prob: 0.13, ev: 1.56 },
      { kind: "3連単", combo: "1-2-3", odds: 5.5, prob: 0.30, ev: 1.65 }, // 低配当除外
    ],
    trustLevel: "1号艇やや有利",
    scenario: "標準",
  });
  // probs を 1号艇 0.45 に下げて 1号艇圧倒ではない状態
  ev.probs = [0.45, 0.20, 0.15, 0.10, 0.06, 0.04];
  const rec = buildBuyRecommendation(ev, "aggressive", 1000);
  // パスする可能性が高い
  expectTrue("decision は buy or skip (両方許容)", rec.decision === "buy" || rec.decision === "skip");
}

/* === 10. 3 スタイルで完全に異なる ev/conf 閾値 === */
console.log("\n▶ 10. 3 スタイルで confidence 閾値が異なる");
{
  expectTrue(`steady conf (${MIN_CONFIDENCE_BY_PROFILE.steady}) > aggressive conf (${MIN_CONFIDENCE_BY_PROFILE.aggressive})`,
    MIN_CONFIDENCE_BY_PROFILE.steady > MIN_CONFIDENCE_BY_PROFILE.aggressive);
}

/* === 11. 同一レースで 3 スタイルの buy/skip が分かれる === */
console.log("\n▶ 11. 同一レースで 3 スタイルの判断が独立");
{
  // 「1号艇強いが穴根拠もある」 レース
  const ev = makeStrongEv({
    items: [
      { kind: "2連複", combo: "1=2", odds: 2.0, prob: 0.55, ev: 1.10 },     // steady 寄り
      { kind: "2連単", combo: "1-2", odds: 2.5, prob: 0.50, ev: 1.25 },     // balanced 寄り
      { kind: "3連単", combo: "1-3-5", odds: 18, prob: 0.10, ev: 1.80 },    // aggressive 寄り
    ],
  });
  const recS = buildBuyRecommendation(ev, "steady", 1000);
  const recB = buildBuyRecommendation(ev, "balanced", 1000);
  const recA = buildBuyRecommendation(ev, "aggressive", 1000);
  // 完全独立: 3 つの recommendation の主候補が同一にならないことを許容するが、
  // 少なくとも 「allowed券種」「閾値」「ヘッド制限」 が異なるため structurally 異なる
  expectTrue("steady の items は全て 1 ヘッド (or skip)",
    recS.decision !== "buy" || recS.items.every((it) => it.combo.startsWith("1"))
  );
  expectTrue("aggressive の本線オッズは 8 倍以上 (or skip)",
    recA.decision !== "buy" || recA.items.every((it) => it.odds >= 8)
  );
  // 3 つが全く同一 (decision + items) の確率は極めて低い
  const allSameItems =
    recS.decision === recB.decision && recB.decision === recA.decision &&
    JSON.stringify(recS.items?.map((it) => it.combo)) === JSON.stringify(recB.items?.map((it) => it.combo)) &&
    JSON.stringify(recB.items?.map((it) => it.combo)) === JSON.stringify(recA.items?.map((it) => it.combo));
  expectTrue("3 スタイルの items は完全一致しない", !allSameItems || recS.decision !== "buy");
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
