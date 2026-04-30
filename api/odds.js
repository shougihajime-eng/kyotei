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
  // 2連複は odds2tf に併記 (タイトル「オッズ (2連単・2連複)」)
  quinella: (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/odds2tf?jcd=${jcd}&rno=${rno}&hd=${hd}`,
  trio:     (jcd, rno, hd) => `https://www.boatrace.jp/owpc/pc/race/odds3f?jcd=${jcd}&rno=${rno}&hd=${hd}`,
};

/* 連複 (2連複 / 3連複) のオッズを抽出
   ページ表記は「=」 または「-」両方ありうるため、両方を許容。
   キーは正規化して "X=Y" / "X=Y=Z" (小→大) で返す。

   2連複は odds2tf に併記されており「2連複オッズ」 ラベル以降を対象に絞る。
   3連複は odds3f 専用ページ。 */
function parseFukuOdds(html, depth /* 2 or 3 */) {
  const $ = cheerio.load(html);
  const out = {};
  let scanText = $("body").text().replace(/[ 　\s]+/g, " ");

  // 2連複は「2連複オッズ」セクション以降のみ対象に絞る (2連単と混在するため)
  if (depth === 2) {
    const idx = scanText.indexOf("2連複");
    if (idx < 0) return out;
    scanText = scanText.slice(idx);
  }

  // 全角→半角
  scanText = scanText.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // パターン: [1-6](=|-)[1-6](=|-)[1-6]? + decimal
  // ¥ 記号や空白を挟んでもマッチする
  const re = depth === 2
    ? /([1-6])\s*[=\-]\s*([1-6])[\s¥]+(\d+(?:\.\d+)?)/g
    : /([1-6])\s*[=\-]\s*([1-6])\s*[=\-]\s*([1-6])[\s¥]+(\d+(?:\.\d+)?)/g;

  let m;
  while ((m = re.exec(scanText)) !== null) {
    const odds = parseFloat(m[depth + 1]);
    if (!Number.isFinite(odds) || odds < 1.0 || odds > 1e6) continue;
    const nums = depth === 2 ? [+m[1], +m[2]] : [+m[1], +m[2], +m[3]];
    if (new Set(nums).size !== nums.length) continue;
    const sorted = [...nums].sort((a, b) => a - b);
    const key = sorted.join("=");
    if (!out[key]) out[key] = odds;
  }
  return out;
}

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
 *   実構造 (boatrace.jp odds2tf / odds3t):
 *   - 1着の列ヘッダ (1〜6) を持つテーブルが 1〜2 個ある (1個目が連単、2個目は連複なので無視)
 *   - 各データ行は 6 列分のセルが横並び (各列は同じ 1着固定)
 *
 *   2連単 (odds2tf):
 *     データ行 = 6 ペア (2着, オッズ) → 行内テキストに 12 トークン
 *     5 データ行 × 6 列 = 30 通り (1着 6 × 2着 5)
 *
 *   3連単 (odds3t):
 *     2着が変わる行は 6 トリプレット (2着, 3着, オッズ) → 18 トークン
 *     2着が同じ (rowspan continuation) 行は 6 ペア (3着, オッズ) → 12 トークン
 *     20 データ行 × 6 列 = 120 通り (1着 6 × 2着 5 × 3着 4)
 *
 *   実装: 各行の text を正規化してトークン化 (整数 1-6 / 単独 decimal)。
 *   行の長さで「ペア (12)」「トリプレット (18)」を判定し、列順で combo に割り付ける。
 */
function parseComboOdds(html, depth /* 2 or 3 */) {
  const $ = cheerio.load(html);
  const out = {};

  // ナビゲーションテーブル (締切予定時刻一覧) を除外
  const dataTables = $("table").toArray().filter(t => {
    const txt = $(t).text();
    return !/締切予定時刻/.test(txt) && /([1-6])[^0-9]+\d+\.\d/.test(txt);
  });
  if (dataTables.length === 0) return out;
  // 連単マトリクスは最初のデータテーブル (2 番目以降は連複等)
  const tbl = dataTables[0];

  // 列の 1着 = 1〜6 と固定 (boatrace.jp は左から 1, 2, 3, 4, 5, 6 の順で固定)
  const COLS = ["1", "2", "3", "4", "5", "6"];

  // 行の 2着 を depth=3 のときに記憶 (rowspan continuation)
  const carry2nd = { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null };

  // トークン化: 数字 (整数 or decimal) のみを順序付きで返す
  // ※ 大穴オッズは "1263" のように decimal が無いことがある (boatrace.jp の表示仕様)
  function tokenize(txt) {
    const normalized = txt.replace(/[ 　\s]+/g, " ").trim();
    return normalized.split(" ").filter(t => /^\d+(\.\d+)?$/.test(t));
  }

  $(tbl).find("tr").each((rIdx, tr) => {
    if (rIdx === 0) return; // ヘッダ行
    const txt = $(tr).text();
    if (!txt) return;
    // 選手名 (漢字) を含む行はヘッダ — スキップ
    if (/[一-龯]/.test(txt)) return;

    const tokens = tokenize(txt);

    if (depth === 2) {
      // 期待: 12 トークン = [2着, odds] × 6
      if (tokens.length !== 12) return;
      for (let k = 0; k < 6; k++) {
        const second = tokens[2*k];
        const odds = parseFloat(tokens[2*k + 1]);
        const first = COLS[k];
        if (!/^[1-6]$/.test(second) || second === first) continue;
        if (!Number.isFinite(odds) || odds < 1.0 || odds > 100000) continue;
        out[`${first}-${second}`] = odds;
      }
    } else {
      // depth === 3
      if (tokens.length === 18) {
        // 6 トリプレット: [2着, 3着, odds] × 6 — この行で 2着 が変わる
        for (let k = 0; k < 6; k++) {
          const second = tokens[3*k];
          const third  = tokens[3*k + 1];
          const odds   = parseFloat(tokens[3*k + 2]);
          const first = COLS[k];
          if (!/^[1-6]$/.test(second) || !/^[1-6]$/.test(third)) continue;
          if (second === first || third === first || third === second) continue;
          if (!Number.isFinite(odds) || odds < 1.0 || odds > 1000000) continue;
          out[`${first}-${second}-${third}`] = odds;
          carry2nd[first] = second;
        }
      } else if (tokens.length === 12) {
        // 6 ペア: [3着, odds] × 6 (2着 は前行から rowspan continuation)
        for (let k = 0; k < 6; k++) {
          const third = tokens[2*k];
          const odds  = parseFloat(tokens[2*k + 1]);
          const first  = COLS[k];
          const second = carry2nd[first];
          if (!second || !/^[1-6]$/.test(third)) continue;
          if (third === first || third === second) continue;
          if (!Number.isFinite(odds) || odds < 1.0 || odds > 1000000) continue;
          out[`${first}-${second}-${third}`] = odds;
        }
      }
      // それ以外 (空行や注釈) は黙ってスキップ
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

    const [winHtml, exHtml, trHtml, qHtml, fHtml] = await Promise.all([
      fetchHtml(URLS.win(jcd, rno, date)).catch(e => null),
      fetchHtml(URLS.exacta(jcd, rno, date)).catch(e => null),
      fetchHtml(URLS.trifecta(jcd, rno, date)).catch(e => null),
      fetchHtml(URLS.quinella(jcd, rno, date)).catch(e => null),
      fetchHtml(URLS.trio(jcd, rno, date)).catch(e => null),
    ]);

    const win      = winHtml ? parseWinOdds(winHtml)        : {};
    const exacta   = exHtml  ? parseComboOdds(exHtml, 2)    : {};
    const trifecta = trHtml  ? parseComboOdds(trHtml, 3)    : {};
    const quinella = qHtml   ? parseFukuOdds(qHtml, 2)      : {};
    const trio     = fHtml   ? parseFukuOdds(fHtml, 3)      : {};

    // 直前オッズは 20 秒キャッシュ (上流負荷軽減と直前更新の両立)
    setCache(res, 20, 60);
    const counts = {
      win: Object.keys(win).length,
      exacta: Object.keys(exacta).length,
      trifecta: Object.keys(trifecta).length,
      quinella: Object.keys(quinella).length,
      trio: Object.keys(trio).length,
    };
    const body = {
      ok: true,
      jcd, name: VENUE_NAMES[jcd], raceNo: +rno, date,
      win, exacta, trifecta, quinella, trio,
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
      function fukuSnippet(html, depth) {
        if (!html) return null;
        const $$ = cheerio.load(html);
        let txt = $$("body").text().replace(/[ 　\s]+/g, " ");
        const label = depth === 2 ? "2連複" : "3連複";
        const i = txt.indexOf(label);
        if (i < 0) return { found: false, htmlLength: html.length };
        return { found: true, idx: i, snippet: txt.slice(i, i + 1500) };
      }
      body.debug = {
        win:      summarize(winHtml, "win"),
        exacta:   summarize(exHtml, "exacta"),
        trifecta: summarize(trHtml, "trifecta"),
        quinella: fukuSnippet(qHtml, 2),
        trio:     fukuSnippet(fHtml, 3),
      };
    }
    return res.status(200).json(body);
  } catch (e) {
    return fail(res, 500, String(e.message || e), { stack: e.stack });
  }
}
