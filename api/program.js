/**
 * GET /api/program?jcd=XX&rno=N&date=YYYYMMDD
 *
 *   boatrace.jp の公開「出走表」ページから、6 艇分の選手情報を取得。
 *   選手名・級別・全国勝率・全国2連対率・当地勝率・当地2連対率・モーター2連率・ボート2連率
 *   を可能な範囲で抽出。HTML 構造の変化に備え、防御的な抽出。
 *
 *   返却形:
 *     { ok, jcd, name, raceNo, date, startTime, weather, wind, windDir, wave,
 *       boats: [{ boatNo, racer, class, winRate, placeRate, localWinRate, localPlaceRate,
 *                 motor2, boat2, ST? }],
 *       fetchedAt }
 */
import * as cheerio from "cheerio";
import { fetchHtml, jstDateString, validateJcd, validateRno, VENUE_NAMES, setCache, fail } from "./_lib.js";

const RACELIST = (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/racelist?jcd=${jcd}&rno=${rno}&hd=${hd}`;

function parseFloatOrNull(s) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * racelist HTML から 6 艇分のデータを抽出。
 *
 *   実構造 (boatrace.jp): 1艇 = 4 行の連続する <tr>。
 *     1行目 (stats): "１ 4075 / A1 中野 次郎 東京/東京 44歳/54.5kg F1 L0 0.13
 *                     6.38 42.40 60.80 7.10 53.13 72.92 71 40.00 50.00 61 0.00 0.00 7 12 7 7 7R"
 *     2行目: 進入コース履歴 (4 整数)
 *     3行目: 平均ST 履歴 (.19 .17 .23 .09 形式)
 *     4行目: 着順履歴 (全角数字)
 *
 *   1行目だけで全データが取れる。級別 (A1/A2/B1/B2) を含む行で識別。
 *   艇番は全角 "１"-"６" (boatrace.jp の表示仕様) なので半角化が必要。
 *
 *   stats 行の decimal は次の 12 個が固定順:
 *     [体重, 平均ST, 全国勝率, 全国2連率, 全国3連率,
 *      当地勝率, 当地2連率, 当地3連率,
 *      モーター2連率, モーター3連率, ボート2連率, ボート3連率]
 *   → 必要なのは index [2, 3, 5, 6, 8, 10]。
 */
function parseBoats(html) {
  const $ = cheerio.load(html);
  const boats = [];
  const seen = new Set();

  // 全角数字 → 半角
  const fwToHw = (s) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  $("tr").each((_, tr) => {
    const rawText = $(tr).text();
    const text = rawText.replace(/[ 　\s]+/g, " ").trim();
    const cls = (text.match(/\b(A1|A2|B1|B2)\b/) || [])[1];
    if (!cls) return;

    // 行頭の文字を半角化、1〜6 でなければスキップ
    const head = text.charAt(0);
    const hwHead = fwToHw(head);
    if (!/^[1-6]$/.test(hwHead)) return;
    const boatNo = +hwHead;
    if (seen.has(boatNo)) return;

    // 全 decimal を順序通りに収集 (整数は除外)
    const decimals = (text.match(/\d+\.\d+/g) || []).map(s => +s);
    if (decimals.length < 11) return; // 11個未満なら別レイアウトとみなしスキップ

    // canonical positions
    const winRate        = decimals[2];
    const placeRate      = decimals[3];
    const localWinRate   = decimals[5];
    const localPlaceRate = decimals[6];
    const motor2         = decimals[8];
    const boat2          = decimals[10];

    // 妥当性チェック
    if (!(winRate >= 0 && winRate <= 9 &&
          placeRate >= 0 && placeRate <= 100 &&
          localWinRate >= 0 && localWinRate <= 9 &&
          localPlaceRate >= 0 && localPlaceRate <= 100 &&
          motor2 >= 0 && motor2 <= 100 &&
          boat2 >= 0 && boat2 <= 100)) return;

    // 選手名: 漢字 2-4 + 空白 + 漢字 1-4 で最初に現れるもの
    let racer = "";
    const nameMatch = text.match(/[一-龯々ヶ]{1,4}\s+[一-龯々ヶ]{1,4}/);
    if (nameMatch) racer = nameMatch[0];

    seen.add(boatNo);
    boats.push({
      boatNo, racer, class: cls,
      winRate, placeRate, localWinRate, localPlaceRate, motor2, boat2,
    });
  });

  return boats.sort((a, b) => a.boatNo - b.boatNo);
}

/** ヘッダ部 (天候・風・波) を拾う best-effort */
function parseWeather(html) {
  const $ = cheerio.load(html);
  const text = $("body").text();
  const w = {};
  const wm = text.match(/(晴|曇|雨|雪)/);
  if (wm) w.weather = wm[1];
  const wn = text.match(/風速[\s　]*(\d+(?:\.\d+)?)\s*m/);
  if (wn) w.wind = parseFloat(wn[1]);
  const wd = text.match(/(追い風|向かい風|横風|無風)/);
  if (wd) w.windDir = wd[1];
  const wv = text.match(/波高[\s　]*(\d+(?:\.\d+)?)\s*cm/);
  if (wv) w.wave = parseFloat(wv[1]);
  const st = text.match(/締切[\s　]*(\d{1,2}:\d{2})/);
  if (st) w.startTime = st[1];
  return w;
}

export default async function handler(req, res) {
  try {
    const jcd = req.query.jcd;
    const rno = req.query.rno;
    const date = (req.query.date && /^\d{8}$/.test(req.query.date)) ? req.query.date : jstDateString();
    if (!validateJcd(jcd)) return fail(res, 400, "invalid jcd");
    if (!validateRno(rno)) return fail(res, 400, "invalid rno");

    let html;
    try { html = await fetchHtml(RACELIST(jcd, rno, date)); }
    catch (e) { return fail(res, 502, `racelist fetch failed: ${e.message}`, { url: RACELIST(jcd, rno, date) }); }

    const boats = parseBoats(html);
    const meta = parseWeather(html);

    // 出走表は当日朝に確定し、当日中はあまり変わらないので長めキャッシュ。
    setCache(res, 600, 1800);
    const body = {
      ok: true,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      ...meta,
      boats,
      counts: { boats: boats.length },
      fetchedAt: new Date().toISOString(),
      source: "boatrace.jp 公開出走表",
    };
    if (req.query.debug === "1") {
      // テーブル構造を要約 (boat rowを特定するため)
      const $$ = cheerio.load(html);
      const tables = $$("table").toArray();
      body.debug = {
        htmlLength: html.length,
        tableCount: tables.length,
        tables: tables.map((t, ti) => {
          const trs = $$(t).find("tr").toArray();
          return {
            tableIdx: ti,
            trCount: trs.length,
            // 各 tr のテキスト (空白圧縮、200字)
            rowsText: trs.slice(0, 20).map(tr => $$(tr).text().replace(/\s+/g, " ").trim().slice(0, 200)),
            // 級別 + 艇番らしき行の HTML を 1件だけ
            boatRowHtml: (() => {
              for (const tr of trs) {
                const txt = $$(tr).text();
                if (/(A1|A2|B1|B2)/.test(txt) && /\b[1-6]\b/.test(txt)) {
                  return $$.html(tr).slice(0, 2500);
                }
              }
              return null;
            })(),
          };
        }),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
