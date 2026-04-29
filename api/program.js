/**
 * GET /api/program?jcd=XX&rno=N&date=YYYYMMDD
 *
 *   boatrace.jp の公開「出走表」ページから、6 艇分の選手情報を取得。
 *   選手名・級別・全国勝率・全国2連対率・当地勝率・当地2連対率・モーター2連率・ボート2連率
 *   を可能な範囲で抽出。HTML 構造の変化に備え、防御的な抽出。
 *
 *   返却形:
 *     { ok, jcd, name, raceNo, date, startTime, weather, wind, windDir, wave,
 *       boats: [{ boatNo, racer, class, winRate, placeRate, localWinRate, localPlaceRate,
 *                 motor2, boat2, ST? }],
 *       fetchedAt }
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateJcd, validateRno, VENUE_NAMES, setCache, fail } from "./_lib.js";

const RACELIST = (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/racelist?jcd=${jcd}&rno=${rno}&hd=${hd}`;

function parseFloatOrNull(s) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * racelist HTML から 6 艇分の行を抽出。
 *   実構造 (boatrace.jp): 1艇=1<tr> に「艇番 / 級別 / 選手名 / 登録番号 / 年齢/体重 / F/L/平均ST /
 *                         全国勝率 / 全国2連対率 / 当地勝率 / 当地2連対率 / モーター2連率 / ボート2連率」が並ぶ。
 *   行に「A1/A2/B1/B2」を含み、独立した艇番セル (1〜6) が含まれる行のみを対象にする。
 *   数値抽出: tr 内の <td>テキストから decimal を順に拾い、6つの canonical 統計をスライド窓で当てはめる。
 */
function parseBoats(html) {
  const $ = cheerio.load(html);
  const boats = [];
  const seen = new Set();

  $("tr").each((_, tr) => {
    const text = $(tr).text();
    const cls = (text.match(/\b(A1|A2|B1|B2)\b/) || [])[1];
    if (!cls) return;

    const tds = $(tr).find("td").toArray().map(td => $(td).text().trim());
    if (tds.length < 4) return;

    // 艇番: <td> テキストが 1〜6 の単独数字
    let boatNo = null;
    for (const t of tds) {
      if (/^[1-6]$/.test(t)) { boatNo = +t; break; }
    }
    if (!boatNo || seen.has(boatNo)) return;

    // 全 decimal を順序通りに収集 (各 td の 0+ 個の decimal を flat 化)
    const nums = [];
    for (const t of tds) {
      const ms = t.match(/-?\d+\.\d+/g) || [];
      for (const m of ms) {
        const v = parseFloatOrNull(m);
        if (v !== null) nums.push(v);
      }
    }

    // 期待する 6 stats: [winRate(0-9), placeRate(0-100), localWinRate(0-9),
    //                  localPlaceRate(0-100), motor2(0-100), boat2(0-100)]
    // ST や F/L 値などが先頭にあるため、6 連続するこのパターンを sliding window で探す。
    function fits(start) {
      const a = nums.slice(start, start + 6);
      if (a.length !== 6) return false;
      return a[0] >= 0 && a[0] <= 9 &&
             a[1] >= 0 && a[1] <= 100 &&
             a[2] >= 0 && a[2] <= 9 &&
             a[3] >= 0 && a[3] <= 100 &&
             a[4] >= 0 && a[4] <= 100 &&
             a[5] >= 0 && a[5] <= 100;
    }
    let idx = -1;
    for (let i = 0; i + 6 <= nums.length; i++) {
      if (fits(i)) { idx = i; break; }
    }
    const stats = idx >= 0 ? nums.slice(idx, idx + 6) : [null, null, null, null, null, null];

    // 選手名: 漢字 (and ヶ・々) を 2〜6 文字 + 空白 + 2〜6 文字
    let racer = "";
    const nameMatch = text.match(/[一-龯々ヶ]{1,4}[\s　]+[一-龯々ヶ]{1,4}/);
    if (nameMatch) racer = nameMatch[0].replace(/[\s　]+/g, " ").trim();

    seen.add(boatNo);
    boats.push({
      boatNo, racer, class: cls,
      winRate:        stats[0],
      placeRate:      stats[1],
      localWinRate:   stats[2],
      localPlaceRate: stats[3],
      motor2:         stats[4],
      boat2:          stats[5],
    });
  });

  return boats.sort((a, b) => a.boatNo - b.boatNo);
}

/** ヘッダ部 (天候・風・波) を拾う best-effort */
function parseWeather(html) {
  const $ = cheerio.load(html);
  const text = $("body").text();
  const w = {};
  const wm = text.match(/(晴|曇|雨|雪)/);
  if (wm) w.weather = wm[1];
  const wn = text.match(/風速[\s　]*(\d+(?:\.\d+)?)\s*m/);
  if (wn) w.wind = parseFloat(wn[1]);
  const wd = text.match(/(追い風|向かい風|横風|無風)/);
  if (wd) w.windDir = wd[1];
  const wv = text.match(/波高[\s　]*(\d+(?:\.\d+)?)\s*cm/);
  if (wv) w.wave = parseFloat(wv[1]);
  const st = text.match(/締切[\s　]*(\d{1,2}:\d{2})/);
  if (st) w.startTime = st[1];
  return w;
}

export default async function handler(req, res) {
  try {
    const jcd = req.query.jcd;
    const rno = req.query.rno;
    const date = (req.query.date && /^\d{8}$/.test(req.query.date)) ? req.query.date : jstDateString();
    if (!validateJcd(jcd)) return fail(res, 400, "invalid jcd");
    if (!validateRno(rno)) return fail(res, 400, "invalid rno");

    let html;
    try { html = await fetchHtml(RACELIST(jcd, rno, date)); }
    catch (e) { return fail(res, 502, `racelist fetch failed: ${e.message}`, { url: RACELIST(jcd, rno, date) }); }

    const boats = parseBoats(html);
    const meta = parseWeather(html);

    // 出走表は当日朝に確定し、当日中はあまり変わらないので長めキャッシュ。
    setCache(res, 600, 1800);
    const body = {
      ok: true,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      ...meta,
      boats,
      counts: { boats: boats.length },
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開出走表",
    };
    if (req.query.debug === "1") body.debug = { htmlExcerpt: html.slice(0, 3000) };
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
