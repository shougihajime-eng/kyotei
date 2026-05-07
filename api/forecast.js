/**
 * GET /api/forecast?jcd=XX&rno=N&date=YYYYMMDD
 *
 *   boatrace.jp の「予想」 (PC予想 / pcexpect) ページから公式予想印を取得。
 *
 *   取得対象:
 *     - 予想印 (◎本命 / ○対抗 / ▲単穴 / △連下 / ×ヒモ薄)
 *
 *   返却形:
 *     { ok, jcd, name, raceNo, date,
 *       marks: { "1": "◎", "2": "○", ... },
 *       hasMarks, fetchedAt, source }
 *
 *   キャッシュ s-maxage=300 (5分) — 予想は早期発表後はあまり変わらない。
 *
 *   防御的 best-effort パース:
 *     ・印は HTML 構造に依存せず、 全文 + 隣接艇番パターンで抽出
 *     ・複数の予想者印が混在する場合は最も上位 (◎ > ○ > ▲ > △ > ×) を残す
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateJcd, validateRno, VENUE_NAMES, setCache, fail } from "./_lib.js";

const URL_FN = (jcd, rno, hd) =>
  `https://www.boatrace.jp/owpc/pc/race/pcexpect?rno=${rno}&jcd=${jcd}&hd=${hd}`;

/* 全角→半角 */
const fwToHw = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

const MARK_PRIORITY = { "◎": 5, "○": 4, "▲": 3, "△": 2, "×": 1 };

/**
 * 公式予想印を解析する。
 *
 * パターン:
 *   "◎1" のように予想印の直後に艇番 (1-6) が続く形式が標準。
 *   全角空白や半角空白が間に入っていても拾う。
 */
function parseForecast(html) {
  const $ = cheerio.load(html);
  const marks = {};

  // 全文を取って 印+艇番 パターンをスキャン
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));

  const markRegex = /([◎○▲△×])\s*([1-6])(?!\d)/g;
  let m;
  while ((m = markRegex.exec(text)) !== null) {
    const mark = m[1];
    const boatNo = parseInt(m[2], 10);
    if (!marks[boatNo] || MARK_PRIORITY[mark] > MARK_PRIORITY[marks[boatNo]]) {
      marks[boatNo] = mark;
    }
  }

  return { marks };
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
    catch (e) { return fail(res, 502, `forecast fetch failed: ${e.message}`, { url: URL_FN(jcd, rno, date) }); }

    const { marks } = parseForecast(html);
    const hasMarks = Object.keys(marks).length;

    // 印が 2 個以上取れていれば成功 (1 個だけは別文字列の誤検出の可能性あり)
    setCache(res, 300, 600);
    const body = {
      ok: hasMarks >= 2,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      marks,
      hasMarks,
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開予想ページ",
    };

    if (req.query.debug === "1") {
      const $ = cheerio.load(html);
      body.debug = {
        htmlLength: html.length,
        bodySnippet: $("body").text().replace(/\s+/g, " ").slice(0, 1500),
      };
    }

    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
