/**
 * GET /api/racer-course?toban=NNNN
 *
 *   boatrace.jp の選手コース別成績ページから、 各コース (1-6) の
 *   進入率 / 3連対率 を抽出。 予想ロジックの「コース別実績補正」 に使用。
 *
 *   Round 121: 「世界一を目指す」 ロードマップの最初の精度向上施策。
 *   ・進入率: その選手がこのコースに何 % 入るか (前付け検知に使える)
 *   ・3連対率: そのコースから 1-3 着内に何 % 入るか (純粋な勝率の代用)
 *
 *   返却形:
 *     { ok, toban, courses: [{ course, entryRate, showRate }, ...], fetchedAt }
 *
 *   キャッシュ s-maxage=86400 (1日) — コース別実績は日中変化しない
 */
import * as cheerio from "cheerio";
import { fetchHtml, setCache, fail } from "./_lib.js";

const URL_FN = (toban) => `https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${toban}`;
const fwToHw = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

/**
 * boatrace.jp のコース別成績ページから 6 コース分のデータを抽出。
 *
 * ページ構造 (推定):
 *   コース別進入率 (table) — 各 td に "X.X%" 形式で 1コース〜6コース が並ぶ
 *   コース別3連対率 (table) — 同様
 *
 * パース戦略:
 *   ・全 body テキストを連結して 「Nコース[非数字]+X.X%」 形式の 2 段階マッチ
 *   ・進入率と3連対率がどちらも 6 個並ぶ前提で、 抽出後にどちらか割り当て
 *   ・どちらかが取れなければ null を埋めて失敗にしない (部分成功)
 */
function parseCourseStats(html) {
  const $ = cheerio.load(html);
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));

  // 「進入率」 セクションの直後にある 6 つの百分率
  const entrySeg = text.match(/(進入率|入率)[\s　]*[^%]*?((?:\d+(?:\.\d+)?[%％][\s　]*){6})/);
  // 「3連対率」 (3連体率含む表記揺れ) セクションの直後にある 6 つの百分率
  const showSeg = text.match(/(3連[対体]率|３連[対体]率)[\s　]*[^%]*?((?:\d+(?:\.\d+)?[%％][\s　]*){6})/);

  const extract6 = (segMatch) => {
    if (!segMatch) return [null, null, null, null, null, null];
    const nums = (segMatch[2].match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const out = [null, null, null, null, null, null];
    for (let i = 0; i < 6 && i < nums.length; i++) out[i] = nums[i];
    return out;
  };
  const entries = extract6(entrySeg);
  const shows = extract6(showSeg);

  const courses = [];
  for (let i = 0; i < 6; i++) {
    courses.push({
      course: i + 1,
      entryRate: entries[i],
      showRate: shows[i],
    });
  }
  return { courses, parseHits: { entry: !!entrySeg, show: !!showSeg } };
}

export default async function handler(req, res) {
  try {
    const toban = req.query.toban;
    if (!toban || !/^\d{3,5}$/.test(toban)) return fail(res, 400, "invalid toban (3-5 digits)");

    let html;
    try { html = await fetchHtml(URL_FN(toban)); }
    catch (e) { return fail(res, 502, `racer-course fetch failed: ${e.message}`, { url: URL_FN(toban) }); }

    const data = parseCourseStats(html);
    const ok = data.courses.some((c) => c.showRate != null || c.entryRate != null);

    setCache(res, 86400, 172800); // 1 日キャッシュ + 2 日 swr
    const body = {
      ok,
      toban: +toban,
      courses: data.courses,
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 選手コース別成績",
    };
    if (req.query.debug === "1") {
      body.debug = {
        htmlLength: html.length,
        parseHits: data.parseHits,
        bodySnippet: cheerio.load(html)("body").text().replace(/\s+/g, " ").slice(0, 1500),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e?.message || e), { stack: e.stack });
  }
}
