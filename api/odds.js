/**
 * GET /api/odds?jcd=XX&rno=N&date=YYYYMMDD
 *
 *   boatrace.jp の公開オッズページから、単勝 / 2連単 / 3連単 のオッズを取得。
 *   締切前は数十秒〜数分で更新されるため、Vercel エッジでは s-maxage=20 sec の短期キャッシュ。
 *
 *   返却形:
 *     { ok, jcd, name, raceNo, date,
 *       win:    { "1":1.4, "2":5.2, ... },
 *       exacta: { "1-2":12.5, ... },
 *       trifecta:{ "1-2-3":48.0, ... },
 *       fetchedAt }
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateDate, validateJcd, validateRno,
         VENUE_NAMES, setCache, fail } from "./_lib.js";

const URLS = {
  win:      (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/oddstf?jcd=${jcd}&rno=${rno}&hd=${hd}`,
  exacta:   (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/odds2tf?jcd=${jcd}&rno=${rno}&hd=${hd}`,
  trifecta: (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/odds3t?jcd=${jcd}&rno=${rno}&hd=${hd}`,
};

/**
 * 単勝 ページから艇番→オッズを抽出
 * 「1〜6 の各行に <td>艇番</td> <td>オッズ</td>」の構造を想定。
 * 実装は防御的に: <td> の数値ペアから 1〜6 のキーを推定する。
 */
function parseWinOdds(html) {
  const $ = cheerio.load(html);
  const out = {};
  // 単勝オッズは class 名に "is-fs" 系が含まれることが多い。
  // 防御的に: テーブル内の数値セルを順に見て、1〜6 の値が見つかったら次のセルをオッズとして拾う。
  $("table").each((_, tbl) => {
    const cells = $(tbl).find("td").toArray().map(td => $(td).text().trim());
    for (let i = 0; i < cells.length - 1; i++) {
      const a = cells[i], b = cells[i + 1];
      const ai = +a, bi = parseFloat(b);
      if (Number.isInteger(ai) && ai >= 1 && ai <= 6 && /^\d+(\.\d+)?$/.test(b) && bi >= 1 && bi < 10000) {
        // 既にあるならスキップ (重複ヒット防止)
        if (out[String(ai)] == null) out[String(ai)] = bi;
      }
    }
  });
  return out;
}

/**
 * 連単 (2連単 / 3連単) のオッズを抽出
 *   テーブルセルの中に "数字-数字(-数字)" のキーを持つテキストと、
 *   隣接するオッズ数値が並ぶ構造を想定し、ペアにして拾う。
 */
function parseComboOdds(html, depth /* 2 or 3 */) {
  const $ = cheerio.load(html);
  const out = {};
  const re = depth === 2 ? /^([1-6])-([1-6])$/ : /^([1-6])-([1-6])-([1-6])$/;
  // 全 td を走査、combo っぽいキーの直後/同セル内の数値をオッズと見なす
  $("td, span").each((_, el) => {
    const t = $(el).text().trim();
    if (!re.test(t)) return;
    // 同セルにオッズが含まれるケース: combo + 数値を separate で扱う必要があるため、隣接要素を見る
    let oddsText = "";
    const sib = $(el).next();
    if (sib && sib.length) oddsText = sib.text().trim();
    if (!/^\d+(\.\d+)?$/.test(oddsText)) {
      // closest tr 内の数値セルから拾う
      const tr = $(el).closest("tr");
      const nums = tr.find("td").toArray().map(td => $(td).text().trim()).filter(s => /^\d+(\.\d+)?$/.test(s));
      if (nums.length > 0) oddsText = nums[0];
    }
    const v = parseFloat(oddsText);
    if (Number.isFinite(v) && v >= 1 && v < 100000) {
      if (out[t] == null) out[t] = v;
    }
  });
  return out;
}

export default async function handler(req, res) {
  try {
    const jcd = req.query.jcd;
    const rno = req.query.rno;
    const date = (req.query.date && /^\d{8}$/.test(req.query.date)) ? req.query.date : jstDateString();
    if (!validateJcd(jcd)) return fail(res, 400, "invalid jcd (期待: 01〜24)");
    if (!validateRno(rno)) return fail(res, 400, "invalid rno (期待: 1〜12)");
    if (!/^\d{8}$/.test(date)) return fail(res, 400, "invalid date (期待: YYYYMMDD)");

    const [winHtml, exHtml, trHtml] = await Promise.all([
      fetchHtml(URLS.win(jcd, rno, date)).catch(e => null),
      fetchHtml(URLS.exacta(jcd, rno, date)).catch(e => null),
      fetchHtml(URLS.trifecta(jcd, rno, date)).catch(e => null),
    ]);

    const win      = winHtml ? parseWinOdds(winHtml)        : {};
    const exacta   = exHtml  ? parseComboOdds(exHtml, 2)    : {};
    const trifecta = trHtml  ? parseComboOdds(trHtml, 3)    : {};

    // 直前オッズは 20 秒キャッシュ (上流負荷軽減と直前更新の両立)
    setCache(res, 20, 60);
    return res.status(200).json({
      ok: true,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      win, exacta, trifecta,
      counts: { win: Object.keys(win).length, exacta: Object.keys(exacta).length, trifecta: Object.keys(trifecta).length },
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開オッズページ",
    });
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
