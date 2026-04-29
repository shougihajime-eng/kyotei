/**
 * GET /api/beforeinfo?jcd=XX&rno=N&date=YYYYMMDD
 *
 *   boatrace.jp の「直前情報」ページから、レース直前のコンディションを取得。
 *   予想ロジックの「整備状況補正」に使う情報源。
 *
 *   取得対象:
 *     - 展示タイム (各艇)
 *     - チルト (各艇 / -0.5〜2.0)
 *     - 部品交換 (ペラ / プロペラ / エンジン / キャブ 等)
 *     - 展示気配メモ ("足が良い" "重い" "伸び" 等のテキスト)
 *     - スタート展示 ST
 *     - 気象 (風速 / 風向 / 波高 / 気温 / 水温)
 *
 *   返却形:
 *     { ok, jcd, name, raceNo, date,
 *       boats: [{ boatNo, exTime, tilt, partsExchange:[], note, startEx, lapTime }],
 *       weather: { wind, windDir, wave, temp, waterTemp, weather },
 *       fetchedAt, source }
 *
 *   キャッシュ: 直前情報は 5-10 分単位で更新されるので s-maxage=120 で短め。
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateJcd, validateRno, VENUE_NAMES, setCache, fail } from "./_lib.js";

const URL_FN = (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=${jcd}&rno=${rno}&hd=${hd}`;

/* 全角→半角 */
const fwToHw = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

/**
 * 6 艇分の直前情報を抽出。
 *
 * 構造の傾向 (boatrace.jp beforeinfo):
 *   テーブルの各行に: 艇番(全角), 写真, 選手名, 体重, 調整重量, 展示タイム, チルト, プロペラ, 部品交換
 *   その下/別ブロックに スタート展示 + 気象
 *
 * 防御的 best-effort: 級別 (A1/A2/B1/B2) を含む行を「艇行」と判断し、行内の数値を順序で拾う。
 */
function parseBoats(html) {
  const $ = cheerio.load(html);
  const boats = [];
  const seen = new Set();

  $("tr").each((_, tr) => {
    const rawText = $(tr).text();
    const text = rawText.replace(/[ 　\s]+/g, " ").trim();
    // 級別がない行はスキップ
    if (!/\b(A1|A2|B1|B2)\b/.test(text)) return;

    // 艇番: 行頭の全角 1〜6
    const head = text.charAt(0);
    const hw = fwToHw(head);
    if (!/^[1-6]$/.test(hw)) return;
    const boatNo = +hw;
    if (seen.has(boatNo)) return;
    seen.add(boatNo);

    // 数値の収集 (decimal を順に)
    const decimals = (text.match(/-?\d+\.\d+/g) || []).map(Number);

    // 体重 / 調整重量 / 展示タイム / チルト の典型順を仮定:
    //   [体重(50.5など), 調整重量? (51.5), 展示タイム(6.85), チルト(0.5)]
    // 防御的に: 展示タイムは 6.5〜7.5 の範囲、チルトは -0.5 〜 2.0 を抽出
    let exTime = null, tilt = null, weight = null;
    for (const v of decimals) {
      if (v >= 6.4 && v <= 7.6 && exTime == null) { exTime = v; continue; }
      if (v >= -0.6 && v <= 2.1 && Number.isInteger(v * 2) && tilt == null) { tilt = v; continue; }
      if (v >= 45 && v <= 60 && weight == null) { weight = v; continue; }
    }

    // 部品交換: 「ペラ」「プロペラ」「エンジン」「キャブ」「電気」「ギヤケース」「クランクシャフト」「シリンダー」 等
    const partsKeywords = [
      "ペラ", "プロペラ", "エンジン", "キャブ", "電気", "ギヤケース",
      "クランクシャフト", "シリンダー", "ピストン", "カムシャフト",
    ];
    const partsExchange = partsKeywords.filter((k) => text.includes(k));

    // 展示気配メモ: 一般的なキーワード
    const noteKeywords = [
      "足が良い", "足良", "出足良", "伸び", "ターン良", "気配良", "上昇",
      "重い", "重め", "伸びない", "出足悪", "気配悪", "下降",
    ];
    const matchedNotes = noteKeywords.filter((k) => text.includes(k));
    const note = matchedNotes.length > 0 ? matchedNotes[0] : "";

    boats.push({ boatNo, exTime, tilt, weight, partsExchange, note });
  });

  return boats.sort((a, b) => a.boatNo - b.boatNo);
}

/* スタート展示 ST を取得 */
function parseStartExhibition(html) {
  const $ = cheerio.load(html);
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));
  // パターン: "スタート展示" の周辺で 1-6 の艇番 + ST 値 (.NN または 0.NN)
  const idx = text.indexOf("スタート展示");
  if (idx < 0) return {};
  const slice = text.slice(idx, idx + 800);
  const out = {};
  // 「1 .12」のような艇番 + ST の組
  const re = /([1-6])\s+(?:F)?\.?(\d{2})\b/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    const bno = m[1];
    const stRaw = `0.${m[2]}`;
    const st = parseFloat(stRaw);
    if (st >= 0.05 && st <= 0.40 && out[bno] == null) out[bno] = st;
  }
  return out;
}

/* 気象 (風 / 波 / 気温 / 水温) を取得 */
function parseWeather(html) {
  const $ = cheerio.load(html);
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));
  const out = {};
  const m1 = text.match(/(晴|曇|雨|雪)/);
  if (m1) out.weather = m1[1];
  const m2 = text.match(/風速[\s　]*(\d+(?:\.\d+)?)\s*m/);
  if (m2) out.wind = parseFloat(m2[1]);
  const m3 = text.match(/(追い風|向かい風|横風|無風)/);
  if (m3) out.windDir = m3[1];
  const m4 = text.match(/波高[\s　]*(\d+(?:\.\d+)?)\s*cm/);
  if (m4) out.wave = parseFloat(m4[1]);
  const m5 = text.match(/気温[\s　]*(\d+(?:\.\d+)?)/);
  if (m5) out.temp = parseFloat(m5[1]);
  const m6 = text.match(/水温[\s　]*(\d+(?:\.\d+)?)/);
  if (m6) out.waterTemp = parseFloat(m6[1]);
  return out;
}

export default async function handler(req, res) {
  try {
    const jcd = req.query.jcd;
    const rno = req.query.rno;
    const date = (req.query.date && /^\d{8}$/.test(req.query.date)) ? req.query.date : jstDateString();
    if (!validateJcd(jcd)) return fail(res, 400, "invalid jcd");
    if (!validateRno(rno)) return fail(res, 400, "invalid rno");
    if (!/^\d{8}$/.test(date)) return fail(res, 400, "invalid date");

    let html;
    try { html = await fetchHtml(URL_FN(jcd, rno, date)); }
    catch (e) { return fail(res, 502, `beforeinfo fetch failed: ${e.message}`, { url: URL_FN(jcd, rno, date) }); }

    const boats = parseBoats(html);
    const startEx = parseStartExhibition(html);
    const weather = parseWeather(html);
    // スタート展示 ST を boats にマージ
    boats.forEach((b) => { b.startEx = startEx[String(b.boatNo)] ?? null; });

    setCache(res, 120, 300);
    const body = {
      ok: boats.length > 0,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      boats, weather,
      counts: { boats: boats.length },
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開直前情報ページ",
    };
    if (req.query.debug === "1") {
      const $ = cheerio.load(html);
      body.debug = {
        htmlLength: html.length,
        bodySnippet: $("body").text().replace(/\s+/g, " ").slice(0, 1500),
        rowsHavingClass: $("tr").toArray()
          .filter((tr) => /\b(A1|A2|B1|B2)\b/.test($(tr).text()))
          .slice(0, 8)
          .map((tr) => $(tr).text().replace(/\s+/g, " ").trim().slice(0, 250)),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
