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

  // 数値抽出: combo の直後 〜 200 字以内の最初の "[\d]{1,3}(?:,\d{3})+" or "\d+" を払戻として採用
  // ¥ や 円 などのセパレータが混じっても拾える。
  function extractYenAfter(text, startIdx, maxScan = 200) {
    const slice = text.slice(startIdx, startIdx + maxScan);
    const m = slice.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
    if (!m) return null;
    const v = parseInt(m[1].replace(/,/g, ""), 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  // ==== 3連単 ==== (ラベル→combo→払戻 のシーケンスを探す)
  const triLabelIdx = halfText.indexOf("3連単");
  if (triLabelIdx >= 0) {
    const after = halfText.slice(triLabelIdx, triLabelIdx + 300);
    const cm = after.match(/([1-6])-([1-6])-([1-6])/);
    if (cm) {
      first = +cm[1]; second = +cm[2]; third = +cm[3];
      // combo の終端位置から払戻を探す
      const comboEnd = triLabelIdx + cm.index + cm[0].length;
      const yen = extractYenAfter(halfText, comboEnd, 100);
      if (yen) payouts.trifecta[`${first}-${second}-${third}`] = yen;
    }
  }

  // ==== 2連単 ==== first/second が決まっていれば該当 combo の払戻を拾う
  if (first && second) {
    const exLabelIdx = halfText.indexOf("2連単");
    if (exLabelIdx >= 0) {
      const after = halfText.slice(exLabelIdx, exLabelIdx + 300);
      const target = `${first}-${second}`;
      const idx = after.indexOf(target);
      if (idx >= 0) {
        const comboEnd = exLabelIdx + idx + target.length;
        const yen = extractYenAfter(halfText, comboEnd, 100);
        if (yen) payouts.exacta[target] = yen;
      }
    }
  }

  // ==== 単勝 ==== "単勝" ラベルの直後にある first 艇番 + 払戻を拾う
  if (first) {
    const tanLabelIdx = halfText.indexOf("単勝");
    if (tanLabelIdx >= 0) {
      const after = halfText.slice(tanLabelIdx, tanLabelIdx + 200);
      // 艇番 first が単独で現れる位置を探す (前後が数字以外)
      const re = new RegExp(`(?:^|[^0-9])${first}(?:[^0-9-]|$)`);
      const m = after.match(re);
      if (m) {
        const matchEnd = tanLabelIdx + m.index + m[0].length;
        const yen = extractYenAfter(halfText, matchEnd, 100);
        if (yen) payouts.tan[String(first)] = yen;
      }
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
      const fullText = $$("body").text().replace(/\s+/g, " ");
      const fwToHw = (s) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const halfText = fwToHw(fullText);
      // ラベルごとに周辺 300 字を返す
      function around(label) {
        const i = halfText.indexOf(label);
        if (i < 0) return { found: false };
        return { found: true, idx: i, snippet: halfText.slice(i, i + 300) };
      }
      body.debug = {
        htmlLength: html.length,
        bodyLength: fullText.length,
        triArea:    around("3連単"),
        exArea:     around("2連単"),
        exPlArea:   around("2連複"),
        tanArea:    around("単勝"),
        plArea:     around("複勝"),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
