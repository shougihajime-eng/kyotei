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
 *   実構造: <tr><td>艇番(1-6)</td><td>選手名</td><td>単勝オッズ</td><td>複勝オッズ</td></tr>
 *   行ごとに、艇番セルと「単勝オッズらしい decimal」を拾うことで取得する。
 *   選手名のような非数値セルは挟まっていても無視する。
 */
function parseWinOdds(html) {
  const $ = cheerio.load(html);
  const out = {};
  $("tr").each((_, tr) => {
    // 行全体のテキスト (艇番抽出用) と、td の値リスト
    const cells = $(tr).find("td").toArray().map(td => $(td).text().trim());
    if (cells.length < 2) return;
    // 艇番 (単独で 1〜6)
    let boatNo = null;
    for (const c of cells) {
      if (/^[1-6]$/.test(c)) { boatNo = c; break; }
    }
    if (!boatNo) return;
    // この行で最初に出てくる decimal で、1.0 以上 9999 未満の値 = 単勝オッズ
    for (const c of cells) {
      if (/^\d+\.\d+$/.test(c)) {
        const v = parseFloat(c);
        if (v >= 1.0 && v < 10000 && out[boatNo] == null) {
          out[boatNo] = v;
          break;
        }
      }
    }
  });
  return out;
}

/**
 * 連単 (2連単 / 3連単) のマトリクス型オッズページからオッズを抽出
 *
 *   2連単 (odds2tf): 6行 × 6列の matrix。row=1着, col=2着。同番セルは "-" 表示で空。
 *   3連単 (odds3t):  1着ごとに 6つのテーブル(?)、または 1着セクション内に 5x4 のサブmatrix。
 *
 *   ここでは「全テーブルの全行で 1着行ヘッダ + 数値群」を試す best-effort 方式。
 *   失敗時は空 {} を返す。フロントエンド (predict) が確率からオッズを合成して fallback。
 */
function parseComboOdds(html, depth /* 2 or 3 */) {
  const $ = cheerio.load(html);
  const out = {};

  $("table").each((_, tbl) => {
    // テーブルの先頭行に 1〜6 の列ヘッダがあるか
    const headTr = $(tbl).find("tr").first();
    const headCells = headTr.find("th, td").toArray().map(td => $(td).text().trim());
    const colBoats = []; // index → 2着艇番
    headCells.forEach(c => { if (/^[1-6]$/.test(c)) colBoats.push(c); });

    if (colBoats.length < 4) return; // 列ヘッダが揃わないテーブルは対象外

    // 残りの行を走査
    $(tbl).find("tr").slice(1).each((rIdx, tr) => {
      const cells = $(tr).find("th, td").toArray().map(td => $(td).text().trim());
      // 行頭セルから 1着艇番を拾う
      let firstBoat = null;
      for (const c of cells) {
        if (/^[1-6]$/.test(c)) { firstBoat = c; break; }
      }
      if (!firstBoat) return;

      // この行の decimal セル列を順に拾い、列順 (colBoats) と対応付ける
      const decimals = cells
        .map(c => /^\d+\.\d+$/.test(c) ? parseFloat(c) : null)
        .filter(v => v !== null);

      if (depth === 2) {
        // 2連単: row=1着 / col=2着 (同番は除外)
        // colBoats から firstBoat を除いた順序で decimals に対応する想定
        const seconds = colBoats.filter(b => b !== firstBoat);
        for (let i = 0; i < Math.min(decimals.length, seconds.length); i++) {
          const v = decimals[i];
          if (v >= 1.0 && v < 100000) out[`${firstBoat}-${seconds[i]}`] = v;
        }
      } else {
        // 3連単: 1着固定の中で 2着×3着 のサブmatrix。
        //   ここでは「行内 decimal 数 = 2着候補数 × 3着候補数」となる前提で best-effort に展開。
        //   セルが正しくマッピングできない場合は何もせずスキップ。
        const seconds = colBoats.filter(b => b !== firstBoat);
        if (decimals.length === seconds.length * (colBoats.length - 2)) {
          // (seconds.length) × (colBoats.length-2 = 3着候補) 想定
          let k = 0;
          for (const s of seconds) {
            const thirds = colBoats.filter(b => b !== firstBoat && b !== s);
            for (const t of thirds) {
              if (k >= decimals.length) break;
              const v = decimals[k++];
              if (v >= 1.0 && v < 1000000) out[`${firstBoat}-${s}-${t}`] = v;
            }
          }
        }
      }
    });
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
    const counts = { win: Object.keys(win).length, exacta: Object.keys(exacta).length, trifecta: Object.keys(trifecta).length };
    const body = {
      ok: true,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      win, exacta, trifecta,
      counts,
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開オッズページ",
    };
    if (req.query.debug === "1") {
      // 解析失敗時の診断用: 各テーブルの全行 HTML(短縮) を返す
      function summarize(html, name) {
        if (!html) return null;
        const $$ = cheerio.load(html);
        const tables = $$("table").toArray();
        const tableSummaries = tables.map((t, ti) => {
          const trs = $$(t).find("tr").toArray();
          // 各 <tr> のテキストを 1 行に圧縮 (空白潰し)
          const rowsText = trs.map(tr => $$(tr).text().replace(/\s+/g, " ").trim().slice(0, 200));
          // boat# らしい行 (短い 1-6 を含み、decimal もある行) の outerHTML を最大3つ
          const candidateRowsHtml = [];
          for (const tr of trs) {
            const txt = $$(tr).text();
            if (/\b[1-6]\b/.test(txt) && /\d+\.\d+/.test(txt) && candidateRowsHtml.length < 3) {
              candidateRowsHtml.push($$.html(tr).slice(0, 1200));
            }
          }
          return {
            tableIdx: ti, trCount: trs.length,
            rowsText: rowsText.slice(0, 12),
            candidateRowsHtml,
          };
        });
        return {
          name, htmlLength: html.length, tableCount: tables.length,
          totalTr: $$("tr").length, totalTd: $$("td").length,
          tables: tableSummaries,
        };
      }
      body.debug = {
        win:      summarize(winHtml, "win"),
        exacta:   summarize(exHtml, "exacta"),
        trifecta: summarize(trHtml, "trifecta"),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
