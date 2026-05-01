/**
 * 実戦シナリオ サニティテスト (Round 23 検証)
 *
 * 12 種類のシナリオを合成し、predict / buildBuyRecommendation の
 * 振る舞いに極端な偏りや危険な振る舞いがないかを定量チェックする。
 *
 * 実行: node scripts/sanity-check.mjs
 */
import { evaluateRace, buildBuyRecommendation, computeOverallGrade, MIN_PROB_BY_KIND } from "../src/lib/predict.js";

/* === 合成オッズ (Plackett-Luce 風 — 確率の逆数 × ハウスエッジ) === */
function buildOdds(probs) {
  const exacta = {}, trifecta = {}, quinella = {}, trio = {};
  const HOUSE = 0.75; // 75% の払戻率
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i === j) continue;
    const p = probs[i] * probs[j] / Math.max(1e-6, 1 - probs[i]);
    exacta[`${i+1}-${j+1}`] = +(HOUSE / Math.max(0.001, p)).toFixed(1);
    for (let k = 0; k < 6; k++) {
      if (k === i || k === j) continue;
      const p3 = p * probs[k] / Math.max(1e-6, 1 - probs[i] - probs[j]);
      trifecta[`${i+1}-${j+1}-${k+1}`] = +(HOUSE / Math.max(0.0005, p3)).toFixed(1);
    }
  }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const p = (probs[i] * probs[j] / Math.max(1e-6, 1 - probs[i]))
            + (probs[j] * probs[i] / Math.max(1e-6, 1 - probs[j]));
    quinella[`${i+1}=${j+1}`] = +(HOUSE / Math.max(0.001, p)).toFixed(1);
  }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) {
    let p = 0;
    const perms = [[i,j,k],[i,k,j],[j,i,k],[j,k,i],[k,i,j],[k,j,i]];
    for (const [a,b,c] of perms) {
      p += probs[a] * probs[b] / Math.max(1e-6, 1 - probs[a])
           * probs[c] / Math.max(1e-6, 1 - probs[a] - probs[b]);
    }
    trio[`${i+1}=${j+1}=${k+1}`] = +(HOUSE / Math.max(0.0005, p)).toFixed(1);
  }
  return { exacta, trifecta, quinella, trio };
}

function makeBoats(profile) {
  // 各艇のテンプレ (motor2/exTime/ST/winRate/boat2)
  const templates = {
    "本命": [
      { motor2: 50, exTime: 6.70, ST: 0.14, winRate: 6.5, boat2: 50 },
      { motor2: 38, exTime: 6.85, ST: 0.17, winRate: 5.5, boat2: 35 },
      { motor2: 32, exTime: 6.92, ST: 0.18, winRate: 5.0, boat2: 32 },
      { motor2: 30, exTime: 6.95, ST: 0.19, winRate: 4.7, boat2: 30 },
      { motor2: 28, exTime: 7.00, ST: 0.20, winRate: 4.3, boat2: 28 },
      { motor2: 26, exTime: 7.05, ST: 0.22, winRate: 4.0, boat2: 26 },
    ],
    "拮抗": [
      { motor2: 35, exTime: 6.85, ST: 0.16, winRate: 5.5, boat2: 35 },
      { motor2: 38, exTime: 6.85, ST: 0.16, winRate: 5.6, boat2: 38 },
      { motor2: 36, exTime: 6.86, ST: 0.16, winRate: 5.5, boat2: 36 },
      { motor2: 34, exTime: 6.88, ST: 0.17, winRate: 5.4, boat2: 34 },
      { motor2: 33, exTime: 6.90, ST: 0.17, winRate: 5.3, boat2: 33 },
      { motor2: 30, exTime: 6.95, ST: 0.18, winRate: 4.8, boat2: 30 },
    ],
    "荒れ": [
      { motor2: 28, exTime: 6.95, ST: 0.21, winRate: 4.5, boat2: 28 },
      { motor2: 45, exTime: 6.78, ST: 0.14, winRate: 6.5, boat2: 45 },
      { motor2: 42, exTime: 6.80, ST: 0.15, winRate: 6.0, boat2: 42 },
      { motor2: 40, exTime: 6.82, ST: 0.15, winRate: 5.5, boat2: 40 },
      { motor2: 35, exTime: 6.88, ST: 0.17, winRate: 5.0, boat2: 35 },
      { motor2: 32, exTime: 6.92, ST: 0.18, winRate: 4.7, boat2: 32 },
    ],
    "6号艇強": [
      { motor2: 28, exTime: 7.00, ST: 0.22, winRate: 4.3, boat2: 28 },
      { motor2: 30, exTime: 6.95, ST: 0.20, winRate: 4.7, boat2: 30 },
      { motor2: 32, exTime: 6.92, ST: 0.19, winRate: 5.0, boat2: 32 },
      { motor2: 34, exTime: 6.88, ST: 0.18, winRate: 5.2, boat2: 34 },
      { motor2: 36, exTime: 6.85, ST: 0.17, winRate: 5.5, boat2: 36 },
      { motor2: 50, exTime: 6.70, ST: 0.13, winRate: 6.8, boat2: 50, entryHistory: [1,2,1,3,1,2] }, // 内側進入歴
    ],
    "事故ST": [
      { motor2: 35, exTime: 6.88, ST: 0.13, winRate: 5.5, boat2: 35 },
      { motor2: 36, exTime: 6.86, ST: 0.16, winRate: 5.6, boat2: 36 },
      { motor2: 34, exTime: 6.88, ST: 0.18, winRate: 5.4, boat2: 34 },
      { motor2: 33, exTime: 6.90, ST: 0.20, winRate: 5.3, boat2: 33 },
      { motor2: 32, exTime: 6.92, ST: 0.22, winRate: 5.0, boat2: 32 },
      { motor2: 30, exTime: 6.95, ST: 0.25, winRate: 4.7, boat2: 30 }, // ST 0.13〜0.25 ばらつき大
    ],
    "事故Motor": [
      { motor2: 60, exTime: 6.70, ST: 0.14, winRate: 6.5, boat2: 60 },
      { motor2: 55, exTime: 6.75, ST: 0.16, winRate: 6.0, boat2: 55 },
      { motor2: 50, exTime: 6.80, ST: 0.16, winRate: 5.8, boat2: 50 },
      { motor2: 28, exTime: 7.05, ST: 0.20, winRate: 4.5, boat2: 28 },
      { motor2: 22, exTime: 7.10, ST: 0.22, winRate: 4.0, boat2: 22 }, // 22% vs 60% = 38pt 差
      { motor2: 20, exTime: 7.15, ST: 0.24, winRate: 3.8, boat2: 20 },
    ],
  };
  return (templates[profile] || templates["本命"]).map((t, i) => ({
    boatNo: i + 1,
    racer: ["A田太郎","B山次郎","C川三郎","D野四郎","E海五郎","F島六郎"][i],
    class: ["A1","A2","A2","B1","B1","B2"][i],
    ...t,
  }));
}

const scenarios = [
  { name: "本命レース (大村)",                  jcd: "24", venue: "大村",   profile: "本命",   wind: 2, wave: 2, windDir: "向かい風", startTime: "11:30" },
  { name: "本命レース (徳山)",                  jcd: "18", venue: "徳山",   profile: "本命",   wind: 1, wave: 1, windDir: "",         startTime: "12:30" },
  { name: "拮抗レース (児島)",                  jcd: "16", venue: "児島",   profile: "拮抗",   wind: 3, wave: 3, windDir: "横風",     startTime: "14:00" },
  { name: "荒れレース (戸田・強風)",            jcd: "02", venue: "戸田",   profile: "荒れ",   wind: 7, wave: 5, windDir: "横風",     startTime: "15:00" },
  { name: "荒れレース (びわこ)",                jcd: "11", venue: "びわこ", profile: "荒れ",   wind: 5, wave: 6, windDir: "追い風",   startTime: "16:00" },
  { name: "6号艇強い (進入歴あり)",             jcd: "12", venue: "住之江", profile: "6号艇強", wind: 3, wave: 3, windDir: "",        startTime: "20:30" },
  { name: "事故レース (ST ばらつき)",           jcd: "03", venue: "江戸川", profile: "事故ST", wind: 4, wave: 5, windDir: "",         startTime: "13:00" },
  { name: "事故レース (モーター差極端)",        jcd: "07", venue: "蒲郡",   profile: "事故Motor", wind: 2, wave: 2, windDir: "",     startTime: "21:00" },
  { name: "本命レース (ナイター・住之江)",      jcd: "12", venue: "住之江", profile: "本命",   wind: 1, wave: 1, windDir: "",         startTime: "20:00" },
  { name: "本命レース (ナイター・桐生)",        jcd: "01", venue: "桐生",   profile: "本命",   wind: 4, wave: 3, windDir: "横風",     startTime: "20:30" },
  { name: "拮抗 + 大荒れ水面 (鳴門)",           jcd: "14", venue: "鳴門",   profile: "拮抗",   wind: 9, wave: 10, windDir: "横風",    startTime: "15:00" },
  { name: "本命 (オッズなし)",                  jcd: "24", venue: "大村",   profile: "本命",   wind: 2, wave: 2, windDir: "",         startTime: "11:30", noOdds: true },
];

const PROFILES = ["steady", "balanced", "aggressive"];

/* ベース確率 (本命=0.55、拮抗=平均、荒れ=2号艇本命、6号艇強=6号艇本命) */
function buildProbsForOdds(profile) {
  if (profile === "本命")     return [0.55, 0.16, 0.12, 0.09, 0.06, 0.02];
  if (profile === "拮抗")     return [0.30, 0.22, 0.18, 0.15, 0.10, 0.05];
  if (profile === "荒れ")     return [0.18, 0.30, 0.22, 0.16, 0.10, 0.04];
  if (profile === "6号艇強")  return [0.20, 0.18, 0.15, 0.12, 0.10, 0.25];
  if (profile === "事故ST")   return [0.25, 0.20, 0.18, 0.15, 0.12, 0.10];
  if (profile === "事故Motor") return [0.45, 0.20, 0.15, 0.10, 0.06, 0.04];
  return [0.55, 0.16, 0.12, 0.09, 0.06, 0.02];
}

console.log("\n========== Round 23: 実戦サニティテスト ==========\n");
let passCount = 0, failCount = 0;
const failures = [];
const aggregate = { byProfile: {}, byScenario: {} };

for (const sc of scenarios) {
  const boats = makeBoats(sc.profile);
  const probs = buildProbsForOdds(sc.profile);
  const apiOdds = sc.noOdds ? null : buildOdds(probs);
  // 締切前 (closedNow=false) になるよう、明日の日付を使う
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const race = { id: `t_${sc.name}`, jcd: sc.jcd, venue: sc.venue, raceNo: 1, date: tomorrow,
    startTime: sc.startTime, wind: sc.wind, wave: sc.wave, windDir: sc.windDir, weather: "晴",
    boats, apiOdds: apiOdds || {} };
  const ev = evaluateRace(race, [], null);

  console.log(`▶ ${sc.name}`);
  console.log(`  inProb=${(ev.probs?.[0] * 100 || 0).toFixed(1)}%  inTrust=${ev.inTrust?.level || "—"}  topGrade=${ev.topGrade}  maxEV=${(ev.maxEV || 0).toFixed(2)}  accident=${ev.accident?.isAccident ? "YES (" + ev.accident.severity + ")" : "no"}`);
  if (ev.warnings?.length) console.log(`  warn: ${ev.warnings.map(w => w.text).slice(0, 2).join(" / ")}`);

  for (const profile of PROFILES) {
    const cap = 1000;
    const rec = buildBuyRecommendation(ev, profile, cap, false);
    const items = rec.items || [];
    const sixHeads = items.filter(it => it.combo.startsWith("6")).length;
    const honmeiCount = items.length;

    aggregate.byProfile[profile] = aggregate.byProfile[profile] || { decisions: { buy: 0, skip: 0, "no-odds": 0 }, sixHeads: 0, totalItems: 0 };
    aggregate.byProfile[profile].decisions[rec.decision] = (aggregate.byProfile[profile].decisions[rec.decision] || 0) + 1;
    aggregate.byProfile[profile].sixHeads += sixHeads;
    aggregate.byProfile[profile].totalItems += items.length;

    let summary = `    [${profile.padEnd(10)}] ${rec.decision.padEnd(8)}`;
    if (rec.decision === "buy") {
      summary += `  pts=${honmeiCount}  本命=${rec.main.combo} (確率${(rec.main.prob*100).toFixed(1)}% ${rec.main.odds.toFixed(1)}倍 ER ${(rec.main.expectedReturn*100).toFixed(0)}%)`;
      if (sixHeads > 0) summary += `  ⚠️6頭=${sixHeads}`;
    } else {
      summary += `  ${rec.reason}`;
    }
    console.log(summary);

    /* === アサーション === */
    const isHonmei = ev.probs?.[0] >= 0.50 && !ev.accident?.isAccident;
    const isAccident = ev.accident?.isAccident;
    const tags = [];
    // 1. 本命レース → 点数 ≤ 2 (aggressive 例外: ≤ 3)
    if (isHonmei && rec.decision === "buy") {
      const cap = profile === "aggressive" ? 3 : 2;
      if (honmeiCount > cap) {
        failCount++; tags.push(`✗ 本命レースで点数超過 (${honmeiCount} > ${cap})`);
      } else passCount++;
    }
    // 2. 危険レース (aggressive 以外) → 見送り
    if (isAccident && profile !== "aggressive") {
      if (rec.decision !== "skip") { failCount++; tags.push(`✗ 危険レースで買い (skip 期待)`); }
      else passCount++;
    }
    // 3. オッズなし → no-odds
    if (sc.noOdds) {
      if (rec.decision !== "no-odds") { failCount++; tags.push(`✗ オッズなしで no-odds 期待`); }
      else passCount++;
    }
    // 4. 1号艇逃げ濃厚 → 6頭の本線採用なし (本線=役割「本命」のみ)
    if (ev.inTrust?.level === "イン逃げ濃厚" && rec.decision === "buy") {
      const main = rec.main;
      if (main && main.combo.startsWith("6")) {
        failCount++; tags.push(`✗ イン濃厚なのに本命=6頭`);
      } else passCount++;
    }
    // 5. 全買い目の的中確率が MIN_PROB_BY_KIND を下回らない
    if (rec.decision === "buy") {
      for (const it of items) {
        const minP = MIN_PROB_BY_KIND[it.kind] ?? 0.005;
        if (it.prob < minP) { failCount++; tags.push(`✗ 確率がフィルタを下回る ${it.combo} ${it.prob.toFixed(4)} < ${minP}`); break; }
      }
      passCount++;
    }
    if (tags.length) console.log(`        ${tags.join(" | ")}`);
  }
  console.log("");
}

console.log("\n========== サマリ ==========");
for (const [p, a] of Object.entries(aggregate.byProfile)) {
  console.log(`${p}: buy ${a.decisions.buy}, skip ${a.decisions.skip}, no-odds ${a.decisions["no-odds"] || 0}, 6頭=${a.sixHeads}/${a.totalItems}`);
}
console.log(`\nパス: ${passCount}  失敗: ${failCount}`);
if (failures.length) {
  console.log("\n失敗詳細:");
  failures.forEach(f => console.log(`  ${f}`));
}
process.exit(failCount === 0 ? 0 : 1);
