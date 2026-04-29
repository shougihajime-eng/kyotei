/**
 * GET /api/racer?toban=NNNN
 *
 *   boatrace.jp の選手プロフィールページから 1 選手の近況を取得。
 *     - 氏名 / 級別 / 支部 / 年齢 / 体重 / 出身地
 *     - 直近成績 (勝率 / 2連率 / 3連率 / 出走数)
 *     - 通算記録 (簡易)
 *
 *   キャッシュ s-maxage=3600 (1時間) — 選手情報は頻繁に変わらない
 */
import * as cheerio from "cheerio";
import { fetchHtml, setCache, fail } from "./_lib.js";

const URL_FN = (toban) => `https://www.boatrace.jp/owpc/pc/data/racersearch/profile?toban=${toban}`;

const fwToHw = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

function parseProfile(html) {
  const $ = cheerio.load(html);
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));
  const out = { stats: {} };

  // 氏名 (h2 や h3 のタイトル付近)
  const nameEl = $("h2, h3, .heading2_titleNm").first();
  if (nameEl.length) {
    const nameTxt = nameEl.text().replace(/\s+/g, " ").trim();
    if (/[一-龯]/.test(nameTxt)) out.name = nameTxt.slice(0, 30);
  }

  // 級別 (A1/A2/B1/B2)
  const cls = (text.match(/\b(A1|A2|B1|B2)\b/) || [])[1];
  if (cls) out.class = cls;

  // 支部 / 出身地
  const m1 = text.match(/支部[\s　]*([一-龯]+)/);
  if (m1) out.branch = m1[1];
  const m2 = text.match(/出身地[\s　]*([一-龯]+)/);
  if (m2) out.birthplace = m2[1];

  // 年齢 / 体重
  const m3 = text.match(/(\d{2,3})\s*歳/);
  if (m3) out.age = +m3[1];
  const m4 = text.match(/(\d{2,3}\.\d)\s*kg/);
  if (m4) out.weight = +m4[1];

  // 直近成績: "勝率 X.XX" "2連率 XX.XX%" などのパターン
  const re = (label) => {
    const r = new RegExp(`${label}[\\s　]*(\\d+(?:\\.\\d+)?)`);
    const m = text.match(r);
    return m ? +m[1] : null;
  };
  out.stats.winRate = re("勝率");
  out.stats.placeRate2 = re("2連[対率]?");
  out.stats.placeRate3 = re("3連[対率]?");

  return out;
}

export default async function handler(req, res) {
  try {
    const toban = req.query.toban;
    if (!toban || !/^\d{3,5}$/.test(toban)) return fail(res, 400, "invalid toban (3-5 digits)");

    let html;
    try { html = await fetchHtml(URL_FN(toban)); }
    catch (e) { return fail(res, 502, `racer fetch failed: ${e.message}`, { url: URL_FN(toban) }); }

    const profile = parseProfile(html);
    setCache(res, 3600, 7200);
    const body = {
      ok: !!profile.name,
      toban: +toban,
      ...profile,
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 選手プロフィール",
    };
    if (req.query.debug === "1") {
      body.debug = {
        htmlLength: html.length,
        bodySnippet: cheerio.load(html)("body").text().replace(/\s+/g, " ").slice(0, 1500),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e?.message || e), { stack: e.stack });
  }
}
