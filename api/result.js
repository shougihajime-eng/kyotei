/**
 * GET /api/result?jcd=XX&rno=N&date=YYYYMMDD
 *
 *   boatrace.jp の公開「レース結果」ページから、確定着順 (1-2-3着) と払戻金 (単勝・2連単・3連単)
 *   を取得して JSON で返す。
 *
 *   返却形:
 *     { ok, jcd, name, raceNo, date,
 *       first, second, third,
 *       payouts: { tan: {"1":160}, exacta: {"1-2":1340}, trifecta: {"1-2-3":17300} },
 *       fetchedAt }
 *
 *   レース結果は確定後ほぼ変わらないので s-maxage=600 (10分) で強めにキャッシュ。
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateJcd, validateRno, VENUE_NAMES, setCache, fail } from "./_lib.js";

const RESULT_URL = (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/raceresult?jcd=${jcd}&rno=${rno}&hd=${hd}`;

/**
 * 着順 (1-2-3 着の艇番) と払戻 (単勝 / 2連単 / 3連単) を抽出。
 *
 * 実構造の傾向 (boatrace.jp raceresult):
 *   - 着順: 1着〜6着 のテーブルがある。各行に「1着 N号艇」(全角艇番)
 *   - 払戻: 「3連単」「2連単」「単勝」などのラベル + combo + 円
 *
 * 実装は防御的: 連単パターン "[1-6]-[1-6]-[1-6]" + 直近の "X,XXX" を組み合わせる。
 */
function parseResult(html) {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/[ 　\s]+/g, " ");

  // 全角→半角 (artist 着順表で全角艇番を使うため)
  const fwToHw = (s) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const halfText = fwToHw(text);

  let first = null, second = null, third = null;
  const payouts = { tan: {}, place: {}, exacta: {}, trifecta: {}, exactaPlace: {} };

  // ==== 3連単 ====
  // パターン: "3連単" <combo "[1-6]-[1-6]-[1-6]"> <数値,数値> <"円"> の順
  // 文脈に依存するため、まずは全文中の trifecta combo + 数値ペアを順次拾う
  const triRe = /([1-6])-([1-6])-([1-6])\s+([\d,]+)\s*円?/g;
  let m;
  while ((m = triRe.exec(halfText)) !== null) {
    const combo = `${m[1]}-${m[2]}-${m[3]}`;
    const yen = parseInt(m[4].replace(/,/g, ""), 10);
    if (Number.isFinite(yen) && yen > 0 && new Set([m[1],m[2],m[3]]).size === 3) {
      // 最初に見つかった 3連単 を採用 (それが当選 combo)
      if (!first) {
        first = +m[1]; second = +m[2]; third = +m[3];
      }
      payouts.trifecta[combo] = yen;
      // 1個取れれば十分 (確定 3連単は 1 通りのみ)
      break;
    }
  }

  // ==== 2連単 ====
  // first / second が決まっていれば、それと一致する 2連単 払戻を拾う
  if (first && second) {
    const exRe = new RegExp(`${first}-${second}\\s+([\\d,]+)\\s*円?`);
    const exMatch = halfText.match(exRe);
    if (exMatch) {
      payouts.exacta[`${first}-${second}`] = parseInt(exMatch[1].replace(/,/g, ""), 10);
    }
  }

  // ==== 単勝 ====
  // first 艇番 → 単勝払戻 を拾う。"単勝 N XXX 円" のパターン or テーブル
  if (first) {
    // テーブルから単勝オッズを推定: 単勝 + 艇番 + 円 のパターン
    const tanRe = new RegExp(`単勝[\\s　]*${first}[\\s　]+([\\d,]+)\\s*円?`);
    const tanMatch = halfText.match(tanRe);
    if (tanMatch) {
      payouts.tan[String(first)] = parseInt(tanMatch[1].replace(/,/g, ""), 10);
    }
  }

  return { first, second, third, payouts };
}

export default async function handler(req, res) {
  try {
    const jcd = req.query.jcd;
    const rno = req.query.rno;
    const date = (req.query.date && /^\d{8}$/.test(req.query.date)) ? req.query.date : jstDateString();
    if (!validateJcd(jcd)) return fail(res, 400, "invalid jcd (期待: 01〜24)");
    if (!validateRno(rno)) return fail(res, 400, "invalid rno (期待: 1〜12)");
    if (!/^\d{8}$/.test(date)) return fail(res, 400, "invalid date (期待: YYYYMMDD)");

    let html;
    try { html = await fetchHtml(RESULT_URL(jcd, rno, date)); }
    catch (e) { return fail(res, 502, `result fetch failed: ${e.message}`, { url: RESULT_URL(jcd, rno, date) }); }

    const parsed = parseResult(html);

    // 結果未確定 (発走前 / 進行中) のレースは first が null になる想定
    const ok = !!parsed.first;
    setCache(res, ok ? 600 : 30, ok ? 1800 : 60);
    const body = {
      ok,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      first: parsed.first, second: parsed.second, third: parsed.third,
      payouts: parsed.payouts,
      counts: {
        tan: Object.keys(parsed.payouts.tan).length,
        exacta: Object.keys(parsed.payouts.exacta).length,
        trifecta: Object.keys(parsed.payouts.trifecta).length,
      },
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開レース結果ページ",
    };
    if (req.query.debug === "1") {
      const $$ = cheerio.load(html);
      body.debug = {
        htmlLength: html.length,
        bodyTextSnippet: $$("body").text().replace(/\s+/g, " ").slice(0, 1500),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
