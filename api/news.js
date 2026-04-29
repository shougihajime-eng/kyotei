/**
 * GET /api/news
 *
 *   競艇ニュースを集約して返す。複数情報源:
 *     ① boatrace.jp 公式トピックス (お知らせ)
 *     ② [将来] スポーツ紙の競艇 RSS (報知 / 日刊 / スポニチ)
 *
 *   返却形:
 *     { ok, items: [{ id, title, source, date, link, summary, keywords }],
 *       fetchedAt, sources: [...] }
 *
 *   キャッシュ s-maxage=600 (10分) — ニュースは頻繁に更新されないため。
 */
import * as cheerio from "cheerio";
import { fetchHtml, setCache, fail } from "./_lib.js";

const TOPICS_URL = "https://www.boatrace.jp/owpc/pc/extra/info/topics";

/* boatrace.jp 公式トピックスを取得 */
async function fetchBoatraceTopics() {
  let html;
  try { html = await fetchHtml(TOPICS_URL); }
  catch (e) { return { ok: false, error: String(e?.message || e), items: [] }; }

  const $ = cheerio.load(html);
  const items = [];

  // パターン: <li> や <tr> でトピックスが並ぶ。日付 + タイトル + リンクを拾う。
  // 防御的: a タグで href が "/owpc/pc/extra/info/" を含むものを候補にする。
  $('a[href*="/owpc/pc/extra/info/"]').each((_, a) => {
    const $a = $(a);
    const title = $a.text().replace(/\s+/g, " ").trim();
    if (!title || title.length < 4) return;
    const href = $a.attr("href") || "";
    const link = href.startsWith("http")
      ? href
      : "https://www.boatrace.jp" + (href.startsWith("/") ? href : "/" + href);
    // 周辺テキストから日付を推定 (YYYY/MM/DD or YYYY-MM-DD or M月D日)
    const around = ($a.parent().text() || "").replace(/\s+/g, " ").slice(0, 120);
    let date = null;
    const m1 = around.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    const m2 = around.match(/(\d{1,2})月(\d{1,2})日/);
    if (m1) date = `${m1[1]}-${String(m1[2]).padStart(2, "0")}-${String(m1[3]).padStart(2, "0")}`;
    else if (m2) {
      const y = new Date().getFullYear();
      date = `${y}-${String(m2[1]).padStart(2, "0")}-${String(m2[2]).padStart(2, "0")}`;
    }
    items.push({
      id: link,
      title,
      source: "boatrace.jp 公式",
      date,
      link,
      summary: around,
      keywords: extractKeywords(title + " " + around),
    });
  });

  // 重複除去 (link で)
  const seen = new Set();
  const unique = items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  return { ok: true, items: unique.slice(0, 30) };
}

/* タイトルからキーワードを抽出 — predict に反映するため */
function extractKeywords(text) {
  const kws = new Set();
  // 会場名
  const venues = ["桐生","戸田","江戸川","平和島","多摩川","浜名湖","蒲郡","常滑","津","三国","びわこ","住之江","尼崎","鳴門","丸亀","児島","宮島","徳山","下関","若松","芦屋","福岡","唐津","大村"];
  for (const v of venues) if (text.includes(v)) kws.add(`venue:${v}`);
  // 選手系キーワード (一般的な好調/不調語)
  const positives = ["優勝", "好調", "復帰", "新人", "若手", "ルーキー", "G1", "SG", "PG1"];
  const negatives = ["欠場", "事故", "落水", "失格", "引退", "停止"];
  for (const k of positives) if (text.includes(k)) kws.add(`pos:${k}`);
  for (const k of negatives) if (text.includes(k)) kws.add(`neg:${k}`);
  // テーマ
  const themes = ["モーター", "プロペラ", "整備", "気象", "強風", "波高"];
  for (const k of themes) if (text.includes(k)) kws.add(`theme:${k}`);
  return [...kws];
}

export default async function handler(req, res) {
  try {
    const sources = (req.query.sources || "official").split(",");
    const tasks = [];
    if (sources.includes("official")) tasks.push(fetchBoatraceTopics());
    // (将来) sources.includes("press") で RSS 集約

    const results = await Promise.all(tasks);
    const allItems = [];
    for (const r of results) if (r.ok) allItems.push(...(r.items || []));

    // 日付降順 (date があるもの優先)
    allItems.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    setCache(res, 600, 1800);
    const body = {
      ok: true,
      items: allItems,
      counts: { total: allItems.length },
      sources: sources,
      fetchedAt: new Date().toISOString(),
    };
    if (req.query.debug === "1") {
      body.debug = {
        rawCounts: results.map((r) => r.ok ? r.items.length : -1),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e?.message || e), { stack: e.stack });
  }
}
