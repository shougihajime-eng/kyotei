/**
 * GET /api/news
 *
 *   競艇ニュースを集約。boatrace.jp 公式は RSS フィードを公開しているのでこれを利用。
 *
 *   情報源 (公式):
 *     ピックアップ:     /owpc/pc/site/news/feed/rss.xml
 *     レース場情報:     /owpc/pc/site/stadium_info/feed/rss.xml
 *     キャンペーン:     /owpc/pc/site/campaign_info/feed/rss.xml
 *
 *   返却形:
 *     { ok, items: [{ id, title, source, date, link, summary, keywords }],
 *       fetchedAt, sources: [...] }
 *
 *   キャッシュ s-maxage=600 (10分)
 */
import * as cheerio from "cheerio";
import { fetchHtml, setCache, fail } from "./_lib.js";

const FEEDS = [
  { id: "news",     name: "ピックアップ",     url: "https://www.boatrace.jp/owpc/pc/site/news/feed/rss.xml" },
  { id: "stadium",  name: "レース場情報",     url: "https://www.boatrace.jp/owpc/pc/site/stadium_info/feed/rss.xml" },
  { id: "campaign", name: "キャンペーン",     url: "https://www.boatrace.jp/owpc/pc/site/campaign_info/feed/rss.xml" },
];

/* RSS XML をパース (cheerio の xmlMode で <item> を抽出) */
async function fetchRssFeed(feed) {
  let xml;
  try { xml = await fetchHtml(feed.url); }
  catch (e) { return { ok: false, source: feed.name, error: String(e?.message || e), items: [] }; }

  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];
  $("item").each((_, el) => {
    const $el = $(el);
    const title = $el.find("title").first().text().replace(/\s+/g, " ").trim();
    const link = $el.find("link").first().text().trim();
    const pubDate = $el.find("pubDate").first().text().trim();
    const description = $el.find("description").first().text().replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!title || !link) return;
    let date = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    }
    items.push({
      id: link,
      title,
      source: `boatrace.jp ${feed.name}`,
      date,
      link,
      summary: description.slice(0, 240),
      keywords: extractKeywords(title + " " + description),
    });
  });
  return { ok: true, source: feed.name, items };
}

/* タイトル+本文から予想反映用キーワードを抽出 */
function extractKeywords(text) {
  const kws = new Set();
  const venues = ["桐生","戸田","江戸川","平和島","多摩川","浜名湖","蒲郡","常滑","津","三国","びわこ","住之江","尼崎","鳴門","丸亀","児島","宮島","徳山","下関","若松","芦屋","福岡","唐津","大村"];
  for (const v of venues) if (text.includes(v)) kws.add(`venue:${v}`);
  const positives = ["優勝", "好調", "復帰", "新人", "若手", "ルーキー", "G1", "SG", "PG1", "卒業", "デビュー"];
  const negatives = ["欠場", "事故", "落水", "失格", "引退", "停止", "中止"];
  for (const k of positives) if (text.includes(k)) kws.add(`pos:${k}`);
  for (const k of negatives) if (text.includes(k)) kws.add(`neg:${k}`);
  const themes = ["モーター", "プロペラ", "整備", "気象", "強風", "波高"];
  for (const k of themes) if (text.includes(k)) kws.add(`theme:${k}`);
  return [...kws];
}

export default async function handler(req, res) {
  try {
    const requested = (req.query.sources || "news,stadium,campaign").split(",");
    const targets = FEEDS.filter((f) => requested.includes(f.id));
    const results = await Promise.all(targets.map(fetchRssFeed));

    const allItems = [];
    const failures = [];
    for (const r of results) {
      if (r.ok) allItems.push(...r.items);
      else failures.push({ source: r.source, error: r.error });
    }

    // 日付降順
    allItems.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    setCache(res, 600, 1800);
    const body = {
      ok: true,
      items: allItems.slice(0, 50),
      counts: { total: allItems.length, returned: Math.min(50, allItems.length) },
      sources: targets.map((t) => t.id),
      failures: failures.length > 0 ? failures : undefined,
      fetchedAt: new Date().toISOString(),
    };
    if (req.query.debug === "1") {
      body.debug = {
        feedResults: results.map((r) => ({ source: r.source, ok: r.ok, count: r.items?.length || 0, error: r.error })),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e?.message || e), { stack: e.stack });
  }
}
