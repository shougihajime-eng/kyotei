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
 * racelist HTML から 6 艇分の row を抽出。
 *   ページは 6 行 × 多数列の表で構成され、各行に艇番(色背景) + 選手情報が並ぶ。
 *   級別 (A1/A2/B1/B2)、勝率の数字パターン、当地勝率パターンを使ってフィールドを推定する。
 */
function parseBoats(html) {
  const $ = cheerio.load(html);
  const boats = [];
  // racelist のメインテーブルから艇番1〜6の行を順に拾う。class 名で識別が難しい場合があるため
  // 「行内に '1 ' or '2 ' などの艇番が含まれ、A1/A2/B1/B2 のいずれかが含まれる行」をターゲットにする。
  const tablerows = $("table tr").toArray();
  for (const tr of tablerows) {
    const text = $(tr).text();
    // 級別が含まれない行は skip
    const cls = (text.match(/(A1|A2|B1|B2)/) || [])[1];
    if (!cls) continue;
    // 艇番 (1〜6 の独立した数字)
    const tds = $(tr).find("td").toArray().map(td => $(td).text().trim());
    if (tds.length < 4) continue;
    let boatNo = null;
    for (const t of tds) {
      const n = +t;
      if (Number.isInteger(n) && n >= 1 && n <= 6 && t === String(n)) { boatNo = n; break; }
    }
    if (!boatNo) continue;

    // 数値群を拾う: 全国勝率 / 2連対率 / 当地勝率 / 当地2連対率 / モーター2連率 / ボート2連率
    // 出走表は数値が複数行のセルにまたがるため、tr 内の数値テキストを順序で取得。
    const nums = [];
    $(tr).find("td").each((_, td) => {
      const txt = $(td).text();
      const ms = txt.match(/-?\d+\.\d+|\d+\.\d|\d{1,3}\.\d{2}/g) || [];
      for (const m of ms) nums.push(parseFloatOrNull(m));
    });

    // 選手名: 漢字ひらがなを含む 2〜6 文字
    let racer = "";
    const nameMatch = text.match(/[一-龯々ヶ]{1,4}\s?[一-龯々ヶ]{1,4}/);
    if (nameMatch) racer = nameMatch[0].replace(/\s+/g, " ");

    boats.push({
      boatNo,
      racer,
      class: cls,
      winRate:      nums[0] != null && nums[0] >= 0 && nums[0] <= 9   ? nums[0] : null,
      placeRate:    nums[1] != null && nums[1] >= 0 && nums[1] <= 100 ? nums[1] : null,
      localWinRate: nums[2] != null && nums[2] >= 0 && nums[2] <= 9   ? nums[2] : null,
      localPlaceRate:nums[3] != null && nums[3] >= 0 && nums[3] <= 100 ? nums[3] : null,
      motor2:       nums[4] != null && nums[4] >= 0 && nums[4] <= 100 ? nums[4] : null,
      boat2:        nums[5] != null && nums[5] >= 0 && nums[5] <= 100 ? nums[5] : null,
    });
    if (boats.length >= 6) break;
  }
  // boatNo の重複を除去 (最初に見つかったものを採用)
  const seen = new Set();
  return boats.filter(b => { if (seen.has(b.boatNo)) return false; seen.add(b.boatNo); return true; })
              .sort((a, b) => a.boatNo - b.boatNo);
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
    return res.status(200).json({
      ok: true,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      ...meta,
      boats,
      counts: { boats: boats.length },
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開出走表",
    });
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
