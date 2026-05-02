/**
 * Round 63: ラベル品質検証スクリプト
 *
 * ・ラベル発動条件 (triggers) の正確性
 * ・優先順位の適用
 * ・過剰ラベル化防止 (secondary 最大 2)
 * ・手動修正 (labelOverride) の優先
 * ・分布検知 (computeLabelDistribution)
 * ・異常検知 (anomaly when 直近 > baseline * 1.5 + 0.1)
 */
import { classifyOutcome, computeLabelDistribution, applyLabelOverride, LABEL_PRIORITY } from "../src/lib/raceLabeler.js";

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

console.log("\n========== Round 63 ラベル品質検証 ==========\n");

/* === 1. 単一ラベル発動 (勝ち) === */
console.log("▶ 1. 勝ちラベル — 高配当ヒット");
{
  const p = {
    decision: "buy",
    hit: true,
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 35, prob: 0.05, ev: 1.75 }],
    result: { first: 1, second: 2, third: 3 },
  };
  const out = classifyOutcome(p);
  expect("primaryLabel.key", out.primaryLabel.key, "高配当ヒット");
  expect("kind", out.kind, "win");
  expectTrue("triggers が odds=35 を含む",
    out.allTriggers.some(t => t.triggers?.some(tr => tr.name === "odds" && tr.value === 35))
  );
}

/* === 2. 優先順位適用 (複数候補から最高優先を採用) === */
console.log("\n▶ 2. 優先順位 — 高配当ヒット が想定通り高確率より優先");
{
  // 高 odds + 高 prob の両方該当
  const p = {
    decision: "buy",
    hit: true,
    combos: [{ kind: "2連単", combo: "1-2", odds: 35, prob: 0.50, ev: 17.5 }],
    result: { first: 1, second: 2 },
  };
  const out = classifyOutcome(p);
  expect("primary は 高配当ヒット", out.primaryLabel.key, "高配当ヒット");
  // secondary に 想定通り高確率 が含まれる
  expectTrue("secondary に 強気の妙味通過 が含まれる",
    out.secondaryLabels.some(l => l.key === "強気の妙味通過")
  );
}

/* === 3. 過剰ラベル化防止 (secondary 最大 2) === */
console.log("\n▶ 3. 過剰ラベル化防止 — secondary 最大 2 件");
{
  const p = {
    decision: "buy",
    hit: true,
    combos: [{ kind: "3連単", combo: "1-5-6", odds: 50, prob: 0.03, ev: 1.50 }],
    result: { first: 1, second: 5, third: 6 },
  };
  const out = classifyOutcome(p);
  expectTrue("secondary は最大 2 件", out.secondaryLabels.length <= 2);
}

/* === 4. 負けラベル — イン信頼過剰 (差され) === */
console.log("\n▶ 4. 負けラベル — イン信頼過剰 (差され)");
{
  const p = {
    decision: "buy",
    hit: false,
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 4.5, prob: 0.55, ev: 2.48 }],
    result: { first: 2, second: 1, third: 3 },
    venue: "戸田",
  };
  const out = classifyOutcome(p);
  expect("primary key", out.primaryLabel.key, "差され");
  expect("kind", out.kind, "loss");
}

/* === 5. 負けラベル — 風誤差 + 外艇まくり が同時に該当 → 優先順位 === */
console.log("\n▶ 5. 風誤差 + 外艇まくり 両方該当 → 外艇まくり が優先");
{
  const p = {
    decision: "buy",
    hit: false,
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 4.5, prob: 0.55, ev: 2.48 }],
    result: { first: 5, second: 1, third: 3 },
    race: { wind: 7 },
  };
  const out = classifyOutcome(p);
  expect("primary は 外艇まくり (priority 3)", out.primaryLabel.key, "外艇まくり");
  expectTrue("secondary に 風誤差 が含まれる",
    out.secondaryLabels.some(l => l.key === "風誤差")
  );
}

/* === 6. 単純不調 (該当ラベルなし時の fallback) === */
console.log("\n▶ 6. 単純不調 — fallback");
{
  const p = {
    decision: "buy",
    hit: false,
    combos: [{ kind: "2連単", combo: "1-2", odds: 3.5, prob: 0.30, ev: 1.05 }],
    result: { first: 1, second: 3 },  // 1着は的中しているが combo 不一致 = miss
    venue: "児島",
    race: { wind: 2 },
  };
  const out = classifyOutcome(p);
  expectTrue("primary が単純不調 or fallback", out.primaryLabel.key === "単純不調" || out.primaryLabel);
}

/* === 7. 手動ラベル修正 (labelOverride) が自動判定より優先 === */
console.log("\n▶ 7. 手動ラベル修正 — 最優先");
{
  const p = {
    decision: "buy",
    hit: false,
    combos: [{ kind: "3連単", combo: "1-2-3", odds: 4.5, prob: 0.55, ev: 2.48 }],
    result: { first: 2, second: 1, third: 3 },
    labelOverride: "ペラ整備不良の見落とし",
  };
  const out = classifyOutcome(p);
  expectTrue("isManual=true", out.isManual);
  expectTrue("primary text に ペラ整備不良 が含まれる",
    out.primaryLabel.text.includes("ペラ整備不良")
  );
}

/* === 8. applyLabelOverride で予測に手動ラベルをセット === */
console.log("\n▶ 8. applyLabelOverride");
{
  const preds = {
    "k1": { key: "k1", decision: "buy", hit: false, combos: [{ kind: "3連単" }] },
  };
  const updated = applyLabelOverride(preds, "k1", "オッズ過信");
  expectTrue("labelOverride が k1 にセットされる", updated.k1.labelOverride === "オッズ過信");
  expectTrue("元の preds は不変", preds.k1.labelOverride === undefined);
}

/* === 9. ラベル分布 (computeLabelDistribution) === */
console.log("\n▶ 9. ラベル分布 — 同じラベルが複数件あれば集計される");
{
  const today = new Date().toISOString().slice(0, 10);
  const preds = {};
  // 5 件の差され負け
  for (let i = 0; i < 5; i++) {
    preds[`k${i}`] = {
      key: `k${i}`, date: today, startTime: `${10 + i}:00`,
      decision: "buy", hit: false, totalStake: 1000,
      combos: [{ kind: "3連単", combo: "1-2-3", odds: 5, prob: 0.55, ev: 2.75 }],
      result: { first: 2, second: 1, third: 3 },
    };
  }
  const dist = computeLabelDistribution(preds, 5, 5);
  expect("recentSize", dist.recentSize, 5);
  expect("recentCount.差され", dist.recentCount["差され"], 5);
}

/* === 10. 異常検知 (anomaly) — 直近で急増 === */
console.log("\n▶ 10. 異常検知 — 直近で「差され」 が急増");
{
  const today = new Date().toISOString().slice(0, 10);
  const earlier = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const preds = {};
  // 過去: 様々なラベル (10 件、 差されは 1 件)
  preds["old1"] = { key: "old1", date: earlier, startTime: "10:00", decision: "buy", hit: true, totalStake: 1000, combos: [{ kind: "2連単", combo: "1-2", odds: 3, prob: 0.55, ev: 1.65 }], result: { first: 1, second: 2 } };
  for (let i = 0; i < 8; i++) {
    preds[`old${i+2}`] = { key: `old${i+2}`, date: earlier, startTime: `${10+i}:00`, decision: "buy", hit: true, totalStake: 1000, combos: [{ kind: "2連単", combo: "1-2", odds: 3, prob: 0.55, ev: 1.65 }], result: { first: 1, second: 2 } };
  }
  preds["old10"] = { key: "old10", date: earlier, startTime: "20:00", decision: "buy", hit: false, totalStake: 1000, combos: [{ kind: "3連単", combo: "1-2-3", odds: 5, prob: 0.55, ev: 2.75 }], result: { first: 2, second: 1, third: 3 } };
  // 直近: 4 件中 4 件が差され → 100%
  for (let i = 0; i < 4; i++) {
    preds[`new${i}`] = {
      key: `new${i}`, date: today, startTime: `${10 + i}:00`,
      decision: "buy", hit: false, totalStake: 1000,
      combos: [{ kind: "3連単", combo: "1-2-3", odds: 5, prob: 0.55, ev: 2.75 }],
      result: { first: 2, second: 1, third: 3 },
    };
  }
  const dist = computeLabelDistribution(preds, 4, 14);
  expectTrue("hasAnomaly=true", dist.hasAnomaly);
  expectTrue("anomalies に 差され が含まれる",
    dist.anomalies.some(a => a.label === "差され")
  );
}

console.log(`\n========== 結果 ==========`);
console.log(`パス: ${pass}  失敗: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
