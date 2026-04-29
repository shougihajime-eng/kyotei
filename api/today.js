/**
 * GET /api/today?date=YYYYMMDD (省略時は今日 JST)
 *
 *   boatrace.jp の公開「本日のレース一覧」から、開催中の会場と各レースの発走時刻を取得。
 *   返却形は { ok, date, venues:[{jcd,name,races:[{raceNo,startTime}]}] }。
 *   会場ごとに raceindex ページを 1 回叩くため、1 リクエスト最大 24 fetch。
 *   Vercel エッジで s-maxage=120 sec / SWR=300 sec のキャッシュを効かせる。
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateDate, VENUE_NAMES, setCache, fail } from "./_lib.js";

async function loadVenueRaces(jcd, dateStr) {
  const url = `https://www.boatrace.jp/owpc/pc/race/raceindex?jcd=${jcd}&hd=${dateStr}`;
  let html;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    return { jcd, name: VENUE_NAMES[jcd], races: [], error: String(e.message || e) };
  }
  const $ = cheerio.load(html);
  const races = [];
  // raceindex には 1〜12R のリンクが <a href="racelist?rno=N&jcd=XX&hd=YYYYMMDD"> で並ぶ
  // 各 R のセル付近に発走時刻 (HH:MM) が表示される。
  // セレクタが将来変わる可能性に備え、複数戦略でフォールバックする。
  const seen = new Set();

  $("a[href*='racelist?rno=']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/rno=(\d{1,2})/);
    if (!m) return;
    const rno = +m[1];
    if (rno < 1 || rno > 12) return;
    if (seen.has(rno)) return;
    // 発走時刻: 周辺テキストから HH:MM を拾う
    // a の祖先の tr 内に発走時刻が含まれていることが多い
    const tr = $(a).closest("tr");
    let txt = tr.text() || "";
    // 直前のセル等も見る
    if (!/\d{1,2}:\d{2}/.test(txt)) txt += " " + $(a).parent().text();
    const tm = txt.match(/(\d{1,2}):(\d{2})/);
    const startTime = tm ? `${tm[1].padStart(2, "0")}:${tm[2]}` : "";
    seen.add(rno);
    races.push({ raceNo: rno, startTime });
  });

  races.sort((a, b) => a.raceNo - b.raceNo);
  return { jcd, name: VENUE_NAMES[jcd], races };
}

export default async function handler(req, res) {
  try {
    const date = (req.query.date && validateDate(req.query.date)) ? req.query.date : jstDateString();
    const indexUrl = `https://www.boatrace.jp/owpc/pc/race/index?hd=${date}`;
    let html;
    try {
      html = await fetchHtml(indexUrl);
    } catch (e) {
      return fail(res, 502, `boatrace.jp index fetch failed: ${e.message}`, { url: indexUrl });
    }
    const $ = cheerio.load(html);
    // index ページには各会場ブロックがあり、開催中のものは raceindex へのリンクを持つ。
    const openJcds = new Set();
    $("a[href*='raceindex?jcd=']").each((_, a) => {
      const href = $(a).attr("href") || "";
      const m = href.match(/jcd=(\d{2})/);
      if (m && VENUE_NAMES[m[1]]) openJcds.add(m[1]);
    });

    const jcds = [...openJcds].sort();
    if (jcds.length === 0) {
      // 開催0は本来稀。HTML 構造変化を疑って 200 で空を返す。
      setCache(res, 60, 120);
      return res.status(200).json({
        ok: true, date, venues: [],
        note: "no open venues parsed — boatrace.jp HTML 構造の変化の可能性",
        upstreamUrl: indexUrl,
      });
    }

    // 並列取得 (24会場までなので問題なし)
    const venues = await Promise.all(jcds.map(j => loadVenueRaces(j, date)));
    // races が0件の会場は除外 (開催情報なし)
    const filtered = venues.filter(v => v.races && v.races.length > 0);

    setCache(res, 120, 300);
    return res.status(200).json({
      ok: true,
      date,
      venues: filtered,
      total_venues: filtered.length,
      total_races: filtered.reduce((a, b) => a + b.races.length, 0),
      generatedAt: new Date().toISOString(),
      source: "boatrace.jp 公開ページ (出走表/レース一覧)",
    });
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
