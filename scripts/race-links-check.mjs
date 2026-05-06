/**
 * Race Links URL 生成 サニティテスト (Round 108)
 *
 * - jcd / 場名 / 日付フォーマット (YYYY-MM-DD / YYYYMMDD / Date) の正規化
 * - 出走表 / リプレイ / 結果 URL が公式仕様を満たすか
 * - リプレイ未公開判定 (未来日 / 当日でレース前) が機能するか
 *
 * 実行: node scripts/race-links-check.mjs
 */
import {
  buildRaceCardUrl,
  buildReplayUrl,
  buildRaceResultUrl,
  buildRaceLinks,
  resolveVenueCode,
  normalizeHd,
  isReplayLikelyAvailable,
} from "../src/lib/raceLinks.js";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else      { fail++; console.error("  ✗ " + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, `${label} → ${JSON.stringify(actual)} == ${JSON.stringify(expected)}`);
}

console.log("\n========== Race Links URL 生成チェック ==========\n");

console.log("[1] resolveVenueCode (場コード解決)");
eq(resolveVenueCode("01", null), "01", "数値 jcd そのまま");
eq(resolveVenueCode(1, null), "01", "1 桁 → 2 桁ゼロ埋め");
eq(resolveVenueCode(null, "桐生"), "01", "場名 → jcd 逆引き (桐生)");
eq(resolveVenueCode(null, "大村"), "24", "場名 → jcd 逆引き (大村)");
eq(resolveVenueCode(null, "存在しない場"), null, "未知の場名は null");
eq(resolveVenueCode("99", null), null, "未知の jcd は null");
eq(resolveVenueCode(null, null), null, "両方 null は null");

console.log("\n[2] normalizeHd (日付正規化)");
eq(normalizeHd("2026-05-06"), "20260506", "YYYY-MM-DD");
eq(normalizeHd("2026/05/06"), "20260506", "YYYY/MM/DD");
eq(normalizeHd("20260506"), "20260506", "YYYYMMDD そのまま");
eq(normalizeHd("2026-5-6"), "20260506", "1 桁月日もゼロ埋め");
eq(normalizeHd(new Date("2026-05-06T10:00:00Z")), "20260506", "Date オブジェクト (UTC)");
eq(normalizeHd(""), null, "空文字は null");
eq(normalizeHd(null), null, "null は null");
eq(normalizeHd("2026-05-06T10:00:00Z"), "20260506", "ISO datetime");

console.log("\n[3] buildRaceCardUrl (出走表)");
const card = buildRaceCardUrl("12", "2026-05-06", 7);
ok(card?.startsWith("https://www.boatrace.jp/owpc/pc/race/racelist?"), "出走表 URL ベース");
ok(card?.includes("rno=7"), "rno クエリ");
ok(card?.includes("jcd=12"), "jcd クエリ");
ok(card?.includes("hd=20260506"), "hd クエリ");
eq(buildRaceCardUrl(null, "2026-05-06", 7), null, "場コード無しは null");
eq(buildRaceCardUrl("12", null, 7), null, "日付無しは null");
eq(buildRaceCardUrl("12", "2026-05-06", null), null, "R番号無しは null");
eq(buildRaceCardUrl("12", "2026-05-06", 13), null, "R番号 13 (範囲外) は null");
eq(buildRaceCardUrl("12", "2026-05-06", 0), null, "R番号 0 は null");

console.log("\n[4] buildRaceResultUrl (結果)");
const result = buildRaceResultUrl("01", "2026-04-01", 12);
ok(result?.startsWith("https://www.boatrace.jp/owpc/pc/race/raceresult?"), "結果 URL ベース");
ok(result?.includes("rno=12&jcd=01&hd=20260401"), "クエリ並び");

console.log("\n[5] isReplayLikelyAvailable (リプレイ公開判定)");
const fixedNow = new Date("2026-05-06T15:00:00+09:00");
ok(isReplayLikelyAvailable("2026-05-05", null, fixedNow) === true, "昨日のレース → 公開済み");
ok(isReplayLikelyAvailable("2026-05-07", null, fixedNow) === false, "明日のレース → 未公開");
ok(isReplayLikelyAvailable("2026-05-06", "10:00", fixedNow) === true, "当日 10:00 発走 + 15:00 → 公開済み (≥30 分経過)");
ok(isReplayLikelyAvailable("2026-05-06", "14:45", fixedNow) === false, "当日 14:45 発走 + 15:00 → 未公開 (15 分しか経過してない)");
ok(isReplayLikelyAvailable("2026-05-06", null, fixedNow) === false, "当日 + startTime 不明 → 控えめに未公開");
ok(isReplayLikelyAvailable("2026-05-06", "broken", fixedNow) === false, "壊れた startTime → false");
ok(isReplayLikelyAvailable(null, "10:00", fixedNow) === false, "日付無しは false");

console.log("\n[6] buildReplayUrl (リプレイ — 公開判定 + 会場/日付 URL)");
const replayPast = buildReplayUrl("12", "2026-05-05", 7, { now: fixedNow });
ok(replayPast?.startsWith("https://race.boatcast.jp/?"), "過去レース → race.boatcast.jp ベース URL");
ok(replayPast?.includes("jo=12"), "リプレイ URL は jo (場コード)");
ok(replayPast?.includes("hd=20260505"), "リプレイ URL は hd (日付)");
ok(!replayPast?.includes("rno="), "公式が rno を受けないため URL に含めない");
const replayFuture = buildReplayUrl("12", "2026-05-07", 7, { now: fixedNow });
eq(replayFuture, null, "未来レース → null");
const replayBeforeStart = buildReplayUrl("12", "2026-05-06", 7, { startTime: "20:00", now: fixedNow });
eq(replayBeforeStart, null, "当日レース前 → null");
const replayDifferentVenue = buildReplayUrl("24", "2026-05-05", 12, { now: fixedNow });
ok(replayDifferentVenue?.includes("jo=24"), "別会場 (大村=24) で正しい jo を出力");
ok(replayDifferentVenue !== replayPast, "場違いで違う URL");
const replayDifferentDate = buildReplayUrl("12", "2026-04-30", 7, { now: fixedNow });
ok(replayDifferentDate?.includes("hd=20260430"), "日付違いで正しい hd を出力");
ok(replayDifferentDate !== replayPast, "日付違いで違う URL");

console.log("\n[7] buildRaceLinks (1 レース まとめ取得)");
const links = buildRaceLinks({ date: "2026-05-05", venue: "桐生", raceNo: 1, startTime: "10:00" }, fixedNow);
ok(links.raceCardUrl?.includes("jcd=01"), "場名 → jcd 解決して 出走表 URL");
ok(links.replayUrl?.includes("jo=01"), "場名 → jo 解決して リプレイ URL (boatcast 仕様)");
ok(links.resultUrl?.includes("jcd=01"), "場名 → jcd 解決して 結果 URL");
ok(links.replayPending === false, "過去レース → replayPending=false");

const linksFuture = buildRaceLinks({ date: "2026-05-07", venue: "桐生", raceNo: 1 }, fixedNow);
eq(linksFuture.replayUrl, null, "未来 → replayUrl=null");
ok(linksFuture.replayPending === true, "未来 → replayPending=true");
ok(linksFuture.raceCardUrl != null, "未来でも 出走表 URL は生成可");

const linksMissing = buildRaceLinks({ venue: "桐生", raceNo: 1 }, fixedNow);
eq(linksMissing.raceCardUrl, null, "日付無し → raceCardUrl=null");
ok(typeof linksMissing.reason === "string", "reason 文字列で返す");

const linksUnknownVenue = buildRaceLinks({ date: "2026-05-05", venue: "未知会場", raceNo: 1 }, fixedNow);
eq(linksUnknownVenue.raceCardUrl, null, "未知の場名 → raceCardUrl=null");
ok(linksUnknownVenue.reason === "場コード不明", "reason=場コード不明");

const linksNull = buildRaceLinks(null, fixedNow);
eq(linksNull.raceCardUrl, null, "race=null → raceCardUrl=null");

console.log("\n[8] 既存データ構造との互換性 (jcd 優先 / venue fallback)");
const rWithJcd = { date: "2026-05-05", venue: "適当な名前", jcd: "12", raceNo: 7 };
const linksWithJcd = buildRaceLinks(rWithJcd, fixedNow);
ok(linksWithJcd.raceCardUrl?.includes("jcd=12"), "jcd が優先される (venue 名は無視)");

const rOnlyVenue = { date: "2026-05-05", venue: "住之江", raceNo: 7 };
const linksOnlyVenue = buildRaceLinks(rOnlyVenue, fixedNow);
ok(linksOnlyVenue.raceCardUrl?.includes("jcd=12"), "venue 名 (住之江) → jcd=12 解決");

/* ============================================================
 * Round 109: 実機シナリオ 6 件 (ユーザーの厳しめチェックを反映)
 * ============================================================ */
console.log("\n[9] 実機シナリオ 6 件 (ユーザー指定)");
const NOW = new Date("2026-05-06T15:00:00+09:00");

// Scenario 1: 予想済みレース (昨日の桐生 1R) → 出走表ボタン
{
  const r = { date: "2026-05-05", venue: "桐生", raceNo: 1, startTime: "10:30" };
  const l = buildRaceLinks(r, NOW);
  ok(l.raceCardUrl === "https://www.boatrace.jp/owpc/pc/race/racelist?rno=1&jcd=01&hd=20260505",
    "S1: 桐生 5/5 1R → 出走表 URL が一意 (rno=1 jcd=01 hd=20260505)");
}

// Scenario 2: 予想済みレース → リプレイボタン (昨日 → 公開済み)
{
  const r = { date: "2026-05-05", venue: "桐生", raceNo: 1, startTime: "10:30" };
  const l = buildRaceLinks(r, NOW);
  ok(l.replayUrl === "https://race.boatcast.jp/?jo=01&hd=20260505",
    "S2: 桐生 5/5 1R → リプレイ URL が会場+日付指定 (jo=01 hd=20260505)");
  ok(l.replayPending === false, "S2: replayPending=false");
}

// Scenario 3: 終了前でリプレイ未公開 (発走 30 分以内)
{
  const r = { date: "2026-05-06", venue: "住之江", raceNo: 12, startTime: "14:50" }; // NOW=15:00 なので 10 分しか経ってない
  const l = buildRaceLinks(r, NOW);
  eq(l.replayUrl, null, "S3: 当日 14:50 発走 + 15:00 → リプレイ null");
  ok(l.replayPending === true, "S3: replayPending=true");
  ok(l.raceCardUrl?.includes("hd=20260506"), "S3: 出走表は当日でも開ける");
}

// Scenario 4: 日付違いを正しく区別
{
  const r1 = { date: "2026-05-05", venue: "桐生", raceNo: 7 };
  const r2 = { date: "2026-05-04", venue: "桐生", raceNo: 7 };
  const l1 = buildRaceLinks(r1, NOW);
  const l2 = buildRaceLinks(r2, NOW);
  ok(l1.raceCardUrl !== l2.raceCardUrl, "S4: 日付違い → 出走表 URL が違う");
  ok(l1.replayUrl !== l2.replayUrl, "S4: 日付違い → リプレイ URL が違う");
  ok(l1.raceCardUrl?.includes("hd=20260505"), "S4: 5/5 → hd=20260505");
  ok(l2.raceCardUrl?.includes("hd=20260504"), "S4: 5/4 → hd=20260504");
}

// Scenario 5: 場違いを正しく区別
{
  const r1 = { date: "2026-05-05", venue: "桐生", raceNo: 7 };  // jcd=01
  const r2 = { date: "2026-05-05", venue: "大村", raceNo: 7 };  // jcd=24
  const l1 = buildRaceLinks(r1, NOW);
  const l2 = buildRaceLinks(r2, NOW);
  ok(l1.raceCardUrl?.includes("jcd=01"), "S5: 桐生 → jcd=01");
  ok(l2.raceCardUrl?.includes("jcd=24"), "S5: 大村 → jcd=24");
  ok(l1.replayUrl?.includes("jo=01"), "S5: 桐生リプレイ → jo=01");
  ok(l2.replayUrl?.includes("jo=24"), "S5: 大村リプレイ → jo=24");
  ok(l1.raceCardUrl !== l2.raceCardUrl, "S5: 場違い → 出走表 URL が違う");
  ok(l1.replayUrl !== l2.replayUrl, "S5: 場違い → リプレイ URL が違う");
}

// Scenario 6: 既存データ (jcd 無し / venue 名のみ) でも正しい URL
{
  const r = { date: "2026-05-05", venue: "住之江", raceNo: 7 };
  const l = buildRaceLinks(r, NOW);
  ok(l.raceCardUrl?.includes("jcd=12"), "S6: jcd 欠損 + venue 名 → jcd=12 解決");
  ok(l.replayUrl?.includes("jo=12"), "S6: リプレイも jo=12 で正しく解決");
}

// 追加: 全 24 場 ✕ が正しく解決すること
console.log("\n[10] 全 24 場の URL 生成 (会場名→jcd 解決)");
const VENUES = [
  ["桐生", "01"], ["戸田", "02"], ["江戸川", "03"], ["平和島", "04"],
  ["多摩川", "05"], ["浜名湖", "06"], ["蒲郡", "07"], ["常滑", "08"],
  ["津", "09"],   ["三国", "10"], ["びわこ", "11"], ["住之江", "12"],
  ["尼崎", "13"], ["鳴門", "14"], ["丸亀", "15"], ["児島", "16"],
  ["宮島", "17"], ["徳山", "18"], ["下関", "19"], ["若松", "20"],
  ["芦屋", "21"], ["福岡", "22"], ["唐津", "23"], ["大村", "24"],
];
for (const [name, code] of VENUES) {
  const l = buildRaceLinks({ date: "2026-05-05", venue: name, raceNo: 1 }, NOW);
  ok(l.raceCardUrl?.includes(`jcd=${code}`), `${name} → jcd=${code}`);
}

console.log("\n========== 結果 ==========");
console.log(`成功: ${pass} / 失敗: ${fail}`);
if (fail > 0) process.exit(1);
console.log("✅ Race Links URL 生成テスト全件 OK");
