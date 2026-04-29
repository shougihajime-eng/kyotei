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

/* 名前を綺麗にする — 「（出場予定）」「ボートレーサー検索へ」等の余分を削る */
function cleanName(s) {
  if (!s) return s;
  // ① 全空白を半角空白に正規化
  let n = s.replace(/[\s　]+/g, " ").trim();
  // ② 括弧と中身を除去
  n = n.replace(/[（(][^）)]*[）)]/g, "");
  // ③ 余計なテキスト類 (順次)
  n = n.replace(/ボートレーサー[^\n]*$/, "");
  n = n.replace(/検索[^\n]*$/, "");
  n = n.replace(/プロフィール[^\n]*$/, "");
  n = n.replace(/(出場予定|出走予定|データ|レーサー一覧)/g, "");
  // ④ 再正規化 + 切り詰め
  return n.replace(/\s+/g, " ").trim().slice(0, 20);
}

function parseProfile(html) {
  const $ = cheerio.load(html);
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));
  const out = { stats: {} };

  // 氏名 (h2 や .heading2_titleNm)
  const nameEl = $("h2, h3, .heading2_titleNm").first();
  if (nameEl.length) {
    const nameTxt = cleanName(nameEl.text());
    if (/[一-龯]/.test(nameTxt)) out.name = nameTxt;
  }

  // 級別
  const cls = (text.match(/\b(A1|A2|B1|B2)\b/) || [])[1];
  if (cls) out.class = cls;

  // 支部 / 出身地 (登録番号付近にあることが多い)
  const m1 = text.match(/支部[\s　]*([一-龯]+)/);
  if (m1) out.branch = m1[1].slice(0, 8);
  const m2 = text.match(/出身地[\s　]*([一-龯]+)/);
  if (m2) out.birthplace = m2[1].slice(0, 8);

  // 年齢 / 体重 / 身長
  const m3 = text.match(/(\d{2,3})\s*歳/);
  if (m3) out.age = +m3[1];
  const m4 = text.match(/(\d{2,3}\.\d)\s*kg/);
  if (m4) out.weight = +m4[1];

  // 直近成績テーブル: 「全国」「当地」セクションの行を抽出
  // boatrace.jp のプロフィールは 「期別成績」 の表があり、勝率 / 2連率 / 3連率 が並ぶ
  const stats = {};
  // パターン: "全国 ... X.XX XX.XX% XX.XX%" の数列から win/2連/3連 を順に拾う
  const segNat = text.match(/全国[\s　]*[\d.%\s]{20,80}/);
  if (segNat) {
    const nums = segNat[0].match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (nums[0] != null && nums[0] >= 0 && nums[0] <= 9) stats.winRate = nums[0];
    if (nums[1] != null && nums[1] >= 0 && nums[1] <= 100) stats.placeRate2 = nums[1];
    if (nums[2] != null && nums[2] >= 0 && nums[2] <= 100) stats.placeRate3 = nums[2];
  }
  // 当地 (会場別) はオプショナル
  const segLoc = text.match(/当地[\s　]*[\d.%\s]{20,80}/);
  if (segLoc) {
    const nums = segLoc[0].match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (nums[0] != null && nums[0] >= 0 && nums[0] <= 9) stats.localWinRate = nums[0];
    if (nums[1] != null && nums[1] >= 0 && nums[1] <= 100) stats.localPlaceRate2 = nums[1];
    if (nums[2] != null && nums[2] >= 0 && nums[2] <= 100) stats.localPlaceRate3 = nums[2];
  }
  out.stats = stats;
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
