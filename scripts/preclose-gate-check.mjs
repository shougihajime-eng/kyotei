/**
 * Round 67: 直前判定ゲート 検証
 *
 * 検証内容:
 *  ① isPreCloseTarget — 締切まで時間で対象/対象外を正しく判定
 *  ② データ完全性チェック — 出走表/オッズ/展示/モーター/スタートが揃っていること
 *  ③ computeGoMode — 直前判定対象外レースは Go 候補に出さない
 *  ④ 「直前判定では見送り」 のメッセージ生成
 *  ⑤ 件数制限ではなく条件で抽出 (preCloseOnly=true → 0 件もあり得る)
 */

const { isPreCloseTarget, computeGoMode, PRE_CLOSE_WINDOW_MIN, PRE_CLOSE_WINDOW_MAX, PRE_CLOSE_MIN_EV, PRE_CLOSE_MIN_CONFIDENCE } =
  await import("../src/lib/styleAllocation.js");

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

console.log("\n========== Round 67 直前判定ゲート 検証 ==========\n");

// 完全データのレース fixture を生成
function makeFullRace(startTime, today) {
  const date = today || new Date().toISOString().slice(0, 10);
  return {
    id: "venue1_R1",
    date, startTime,
    venue: "桐生", jcd: "01", raceNo: 1,
    boats: Array.from({ length: 6 }, (_, i) => ({
      boatNo: i + 1, name: `選手${i+1}`,
      winRate: 5.5, motor2: 38, exTime: 6.85, avgST: 0.16, exST: 0.16, tilt: 0.5,
    })),
    odds: { trifecta: { "1-2-3": 5.5 }, exacta: { "1-2": 2.5 } },
    wind: 2, wave: 2,
  };
}

/* === 1. 締切まで時間に応じて対象/対象外を判定 === */
console.log("▶ 1. isPreCloseTarget — 時間ウィンドウ判定");
{
  const now = new Date(2026, 4, 2, 14, 0, 0); // 14:00
  // 14:10 → 締切まで 10 分 → 対象 (5〜15 分窓内)
  const r1 = makeFullRace("14:10", "2026-05-02");
  const pc1 = isPreCloseTarget(r1, now);
  expectTrue("締切 10 分前 → isTarget=true", pc1.isTarget === true);
  expect("minutesToClose=10", pc1.minutesToClose, 10);
  expectTrue("dataReady=true (全データ揃い)", pc1.dataReady === true);

  // 14:30 → 締切まで 30 分 → 対象外 (まだ早い)
  const r2 = makeFullRace("14:30", "2026-05-02");
  const pc2 = isPreCloseTarget(r2, now);
  expectTrue("締切 30 分前 → isTarget=false", pc2.isTarget === false);

  // 14:03 → 締切まで 3 分 → 対象外 (既に締切間際)
  const r3 = makeFullRace("14:03", "2026-05-02");
  const pc3 = isPreCloseTarget(r3, now);
  expectTrue("締切 3 分前 → isTarget=false (既に間際)", pc3.isTarget === false);

  // 14:14 → 締切まで 14 分 → 対象 (上限ぎりぎり)
  const r4 = makeFullRace("14:14", "2026-05-02");
  const pc4 = isPreCloseTarget(r4, now);
  expectTrue("締切 14 分前 → isTarget=true", pc4.isTarget === true);
}

/* === 2. データ不足検出 === */
console.log("\n▶ 2. isPreCloseTarget — データ不足検出");
{
  const now = new Date(2026, 4, 2, 14, 0, 0);
  // オッズなし
  const r1 = makeFullRace("14:10", "2026-05-02");
  delete r1.odds;
  const pc1 = isPreCloseTarget(r1, now);
  expectTrue("オッズなし → dataReady=false", pc1.dataReady === false);
  expectTrue("missing にオッズ", pc1.missing.includes("オッズ"));

  // 展示なし
  const r2 = makeFullRace("14:10", "2026-05-02");
  r2.boats.forEach((b) => { delete b.exTime; });
  const pc2 = isPreCloseTarget(r2, now);
  expectTrue("展示なし → dataReady=false", pc2.dataReady === false);
  expectTrue("missing に展示", pc2.missing.includes("展示"));

  // モーターなし
  const r3 = makeFullRace("14:10", "2026-05-02");
  r3.boats.forEach((b) => { delete b.motor2; });
  const pc3 = isPreCloseTarget(r3, now);
  expectTrue("モーターなし → dataReady=false", pc3.dataReady === false);
  expectTrue("missing にモーター", pc3.missing.includes("モーター"));

  // ST なし
  const r4 = makeFullRace("14:10", "2026-05-02");
  r4.boats.forEach((b) => { delete b.avgST; delete b.exST; });
  const pc4 = isPreCloseTarget(r4, now);
  expectTrue("ST なし → dataReady=false", pc4.dataReady === false);
  expectTrue("missing にスタート", pc4.missing.includes("スタート"));
}

/* === 3. 閾値定数の正当性 === */
console.log("\n▶ 3. 閾値定数 — 直前判定は通常より厳しい");
{
  expectTrue(`PRE_CLOSE_MIN_EV (${PRE_CLOSE_MIN_EV}) > GO_MIN_EV (1.20)`, PRE_CLOSE_MIN_EV >= 1.20);
  expectTrue(`PRE_CLOSE_MIN_CONFIDENCE (${PRE_CLOSE_MIN_CONFIDENCE}) > GO_MIN_CONFIDENCE (65)`, PRE_CLOSE_MIN_CONFIDENCE >= 65);
  expect("PRE_CLOSE_WINDOW_MAX = 15", PRE_CLOSE_WINDOW_MAX, 15);
  expectTrue("PRE_CLOSE_WINDOW_MIN >= 5", PRE_CLOSE_WINDOW_MIN >= 5);
}

/* === 4. computeGoMode preCloseOnly=true で対象外レースは除外 === */
console.log("\n▶ 4. computeGoMode preCloseOnly=true — 対象外レース除外");
{
  const now = new Date(2026, 4, 2, 14, 0, 0);
  // 締切 30 分前 のレース (対象外 — 時間で除外)
  const r1 = makeFullRace("14:30", "2026-05-02");
  // 締切 10 分前 のレース (対象だが eval ok=false → データ不足扱い)
  const r2 = makeFullRace("14:10", "2026-05-02");
  r2.id = "venue2_R2";
  const races = [r1, r2];
  // ev は ok:true で渡す → preCloseOnly ゲートが効く
  const evals = {
    [r1.id]: { ok: true, items: [], maxEV: 0, probs: [0.55] },
    [r2.id]: { ok: true, items: [], maxEV: 0, probs: [0.55] },
  };
  const recs = { steady: {}, balanced: {}, aggressive: {} };
  const result = computeGoMode(races, evals, recs, "balanced", 12, { preCloseOnly: true, now: now.toISOString() });
  expect("goPicks 0 件", result.goPicks.length, 0);
  expectTrue("preCloseMode=true", result.preCloseMode === true);
  expectTrue("excludedReasons に「直前判定では見送り」 が含まれる",
    result.excludedReasons.some((r) => /直前判定では見送り/.test(r.reason || ""))
  );
}

/* === 5. 「対象レース 0 件」 メッセージ === */
console.log("\n▶ 5. 直前判定対象 0 件 → 専用メッセージ");
{
  const now = new Date(2026, 4, 2, 14, 0, 0);
  // 全部対象外 (まだ早い)
  const r1 = makeFullRace("15:00", "2026-05-02");
  const r2 = makeFullRace("15:30", "2026-05-02");
  const races = [r1, r2];
  const evals = {
    [r1.id]: { ok: true, items: [], maxEV: 0, probs: [0.55] },
    [r2.id]: { ok: true, items: [], maxEV: 0, probs: [0.55] },
  };
  const recs = { steady: {}, balanced: {}, aggressive: {} };
  const result = computeGoMode(races, evals, recs, "balanced", 12, { preCloseOnly: true, now: now.toISOString() });
  expect("preCloseRaceCount=0", result.preCloseRaceCount, 0);
  expect("goPicks 0", result.goPicks.length, 0);
  expectTrue("confidenceLabel=見送り推奨", result.confidenceLabel === "見送り推奨");
  expectTrue("confidenceReason に 直前判定対象レースなし",
    /直前判定対象レースなし/.test(result.confidenceReason || "")
  );
}

/* === 6. preCloseOnly=false で従来動作 (互換) === */
console.log("\n▶ 6. preCloseOnly=false — 従来 GO_MIN_* 閾値で評価 (互換)");
{
  const now = new Date(2026, 4, 2, 14, 0, 0);
  const r1 = makeFullRace("16:00", "2026-05-02");
  const races = [r1];
  const evals = { [r1.id]: { ok: true, items: [], maxEV: 0, probs: [0.55] } };
  const recs = { steady: {}, balanced: {}, aggressive: {} };
  const result = computeGoMode(races, evals, recs, "balanced", 12, { preCloseOnly: false, now: now.toISOString() });
  expectTrue("preCloseMode=false", result.preCloseMode === false);
  // 直前判定外でも 「直前判定では見送り」 が出ない (preCloseOnly=false)
  const hasPCMsg = (result.excludedReasons || []).some((r) => /直前判定では見送り/.test(r.reason || ""));
  expectTrue("excludedReasons に「直前判定」 メッセージ含まれない", !hasPCMsg);
}

/* === 7. 件数制限ではなく「条件抽出」 — 結果は 0〜複数 OK === */
console.log("\n▶ 7. 件数制限なし — topN=12 でも条件未達なら 0 件");
{
  const now = new Date(2026, 4, 2, 14, 0, 0);
  // 12 レース全部対象だが、 ev は全部 ok=false → 全部除外
  const races = [];
  for (let i = 0; i < 12; i++) {
    const r = makeFullRace("14:10", "2026-05-02");
    r.id = `venue${i}_R1`;
    races.push(r);
  }
  const evals = {};
  for (const r of races) evals[r.id] = { ok: false, reason: "no-odds" };
  const recs = { steady: {}, balanced: {}, aggressive: {} };
  const result = computeGoMode(races, evals, recs, "balanced", 12, { preCloseOnly: true, now: now.toISOString() });
  expect("topN=12 でも 0 件", result.goPicks.length, 0);
  expect("excludedCount=12 (全部除外)", result.excludedCount, 12);
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
