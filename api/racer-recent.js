/**
 * GET /api/racer-recent?toban=NNNN
 *
 *   boatrace.jp の選手「過去 3 節成績」 ページから直近の着順データを抽出。
 *
 *   Round 123: 直近の好調/不調を予想に反映するため。
 *   ・直近着順の羅列 (例: "33524211644") を取得
 *   ・統計計算 (平均着順 / 1 着率 / 連対率 / 3 連対率)
 *   ・F (フライング) / L (レイト) もカウントして失格傾向を見る
 *
 *   返却形:
 *     { ok, toban, recent: { results: [3,3,5,2,...], count, avg, firstRate, showRate, fNum, lNum, last5 }, fetchedAt }
 *
 *   キャッシュ s-maxage=86400 (1日) — 1日中変化しないので長め
 */
import * as cheerio from "cheerio";
import { fetchHtml, setCache, fail } from "./_lib.js";

const URL_FN = (toban) => `https://www.boatrace.jp/owpc/pc/data/racersearch/back3?toban=${toban}`;
const fwToHw = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

/**
 * ページから着順の羅列を抽出 → 統計計算。
 *
 * パース戦略:
 *   ・テーブルの「着」 列または着順表示部分から 1-6 の連続数字を拾う
 *   ・表記揺れ吸収: 全角→半角変換、 F (フライング) → "F"、 L (レイト) → "L"
 *   ・1 ページに複数節 (最大 3 節) のデータがあるので全部統合
 */
function parseRecentResults(html) {
  const $ = cheerio.load(html);
  const text = fwToHw($("body").text().replace(/[ 　\s]+/g, " "));

  // テーブルの各セルを巡回し、 着順 (1-6 / F / L) を順序通りに収集
  const results = [];
  let fNum = 0, lNum = 0;

  // パース対象セルを特定する: 「着順」「結果」「成績」 セクション後の数字列
  // ページ構造: 各節の表があり、 td に 1, 2, 3, F, L 等が並ぶ
  $("td").each((_, td) => {
    const cellRaw = $(td).text().replace(/[\s　]+/g, "").trim();
    const cell = fwToHw(cellRaw);
    if (cell.length === 0 || cell.length > 3) return;
    if (cell === "F" || cell === "Ｆ") { results.push("F"); fNum++; return; }
    if (cell === "L" || cell === "Ｌ") { results.push("L"); lNum++; return; }
    // 単独の 1-6 数字
    if (/^[1-6]$/.test(cell)) {
      results.push(+cell);
      return;
    }
  });

  // 最後の N 件 (最新) と統計
  const numericResults = results.filter((r) => typeof r === "number");
  const count = numericResults.length;
  const sum = numericResults.reduce((a, b) => a + b, 0);
  const avg = count > 0 ? +(sum / count).toFixed(2) : null;
  const firstCount = numericResults.filter((r) => r === 1).length;
  const showCount = numericResults.filter((r) => r >= 1 && r <= 3).length;
  const firstRate = count > 0 ? +(firstCount / count * 100).toFixed(1) : null;
  const showRate = count > 0 ? +(showCount / count * 100).toFixed(1) : null;
  const last5 = results.slice(-5); // 直近 5 走 (F/L 含む)

  return {
    results, count, avg, firstRate, showRate, fNum, lNum, last5,
  };
}

export default async function handler(req, res) {
  try {
    const toban = req.query.toban;
    if (!toban || !/^\d{3,5}$/.test(toban)) return fail(res, 400, "invalid toban (3-5 digits)");

    let html;
    try { html = await fetchHtml(URL_FN(toban)); }
    catch (e) { return fail(res, 502, `racer-recent fetch failed: ${e.message}`, { url: URL_FN(toban) }); }

    const recent = parseRecentResults(html);
    const ok = recent.count > 0;

    setCache(res, 86400, 172800);
    const body = {
      ok,
      toban: +toban,
      recent,
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 選手過去 3 節成績",
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
