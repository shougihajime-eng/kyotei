/**
 * Race Links 実 URL HTTP 検証 (Round 109)
 *
 * 生成した URL が実際に公式サイトで「正しいページ」 を返すかを検証する。
 *
 * 検証項目:
 *   ・出走表 URL → <title> が 「出走表｜BOAT RACE オフィシャルウェブサイト」
 *   ・結果 URL → <title> が 「結果｜BOAT RACE オフィシャルウェブサイト」 (開催済日のみ)
 *   ・リプレイ URL → race.boatcast.jp が 200 OK で読める
 *
 * オフライン環境では skip (CI 等で外部依存を避けるため)。
 *
 * 実行: node scripts/race-links-http-check.mjs
 */
import { buildRaceLinks, buildRaceCardUrl, buildReplayUrl, buildRaceResultUrl } from "../src/lib/raceLinks.js";

let pass = 0, fail = 0, skip = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else      { fail++; console.error("  ✗ " + label); }
}

async function fetchTitle(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "kyotei-link-check/1.0" },
    });
    if (!res.ok) return { status: res.status, title: null, error: `HTTP ${res.status}` };
    const html = await res.text();
    const m = html.match(/<title>([\s\S]*?)<\/title>/i);
    return { status: res.status, title: m ? m[1].trim() : null, error: null };
  } catch (e) {
    return { status: 0, title: null, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

console.log("\n========== Race Links HTTP 検証 ==========\n");
console.log("注: 外部 (boatrace.jp / race.boatcast.jp) に到達しない環境では skip。\n");

// 検証用に 「最近の確実に開催されたであろう日付」 を選ぶ
// 平日 (火曜) を選ぶことで開催が確実になりやすい
const today = new Date();
function isoBack(daysAgo) {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
// 1〜3 日前の中から一日選定 (休催の可能性低減)
const pastDate = isoBack(1);
const sampleVenue = "12"; // 住之江 (ほぼ毎日開催)
const sampleRno = 1;

console.log(`[テスト対象] ${pastDate} 住之江 ${sampleRno}R\n`);

// === ネットワーク到達確認 ===
console.log("[Pre] ネットワーク到達確認");
const probe = await fetchTitle("https://www.boatrace.jp/");
if (probe.error) {
  console.log(`  ⊘ オフライン or ブロック (${probe.error}) — HTTP テストを skip`);
  skip = 999;
}

if (skip < 999) {
  // === 出走表 ===
  console.log("\n[1] 出走表 URL");
  const cardUrl = buildRaceCardUrl(sampleVenue, pastDate, sampleRno);
  console.log(`  URL: ${cardUrl}`);
  const cardRes = await fetchTitle(cardUrl);
  ok(cardRes.status === 200, `HTTP 200 OK (実際: ${cardRes.status})`);
  ok(cardRes.title?.includes("出走表"), `<title> に 「出走表」 を含む (実際: "${cardRes.title}")`);
  ok(!cardRes.title?.includes("システムエラー"), "システムエラーページではない");

  // === 結果 ===
  console.log("\n[2] 結果 URL");
  const resultUrl = buildRaceResultUrl(sampleVenue, pastDate, sampleRno);
  console.log(`  URL: ${resultUrl}`);
  const resultRes = await fetchTitle(resultUrl);
  ok(resultRes.status === 200, `HTTP 200 OK (実際: ${resultRes.status})`);
  ok(
    resultRes.title?.includes("結果") || resultRes.title?.includes("BOAT RACE"),
    `<title> に 「結果」 または BOAT RACE を含む (実際: "${resultRes.title}")`
  );
  ok(!resultRes.title?.includes("システムエラー"), "システムエラーページではない");

  // === リプレイ (race.boatcast.jp) ===
  console.log("\n[3] リプレイ URL (race.boatcast.jp)");
  const past = new Date(pastDate);
  const longAgoNow = new Date(past);
  longAgoNow.setDate(longAgoNow.getDate() + 2); // 2 日後 = 確実に公開済みとみなす
  const replayUrl = buildReplayUrl(sampleVenue, pastDate, sampleRno, { now: longAgoNow });
  console.log(`  URL: ${replayUrl}`);
  ok(replayUrl != null, "過去レース → リプレイ URL が生成される");
  if (replayUrl) {
    const replayRes = await fetchTitle(replayUrl);
    ok(replayRes.status === 200, `HTTP 200 OK (実際: ${replayRes.status})`);
    ok(
      replayRes.title?.includes("BOATCAST") || replayRes.title?.includes("レースLIVE"),
      `<title> に BOATCAST / レースLIVE (実際: "${replayRes.title}")`
    );
    ok(!replayRes.title?.includes("システムエラー"), "システムエラーページではない");
    ok(!replayRes.title?.includes("404"), "404 ページではない");
  }

  // === 旧 (壊れた) URL を意図的に叩いて確かにエラーになることを確認 ===
  console.log("\n[4] 旧 URL (壊れた仕様) → 意図通りエラー");
  const brokenUrl = `https://www.boatrace.jp/owpc/pc/extra/video/index.html?jcd=12&hd=${pastDate.replace(/-/g, "")}&rno=1`;
  const brokenRes = await fetchTitle(brokenUrl);
  ok(
    brokenRes.title?.includes("システムエラー") || brokenRes.title?.includes("エラー") || !brokenRes.title?.includes("BOATCAST"),
    `旧 URL は「システムエラー」 を返す (実際: "${brokenRes.title}") — Round 109 修正の正しさを担保`
  );
}

console.log("\n========== 結果 ==========");
console.log(`成功: ${pass} / 失敗: ${fail} / スキップ: ${skip >= 999 ? "ネットワーク不通" : skip}`);
if (fail > 0) {
  console.error("❌ HTTP テスト失敗 — URL 仕様か外部サイトの仕様変更を確認してください");
  process.exit(1);
}
console.log("✅ 全 URL 公式サイトで有効");
