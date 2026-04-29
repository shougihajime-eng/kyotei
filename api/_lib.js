/**
 * 共通ヘルパ: boatrace.jp 公開ページから JST 日付の整形 / 会場 jcd 名 / fetch 補助
 *
 * boatrace.jp の公開ページのみを利用。ログイン・有料コンテンツ・高頻度アクセスは行わない。
 * Vercel エッジで s-maxage キャッシュを効かせて、上流負荷を抑える。
 */

export const VENUE_NAMES = {
  "01":"桐生","02":"戸田","03":"江戸川","04":"平和島","05":"多摩川","06":"浜名湖",
  "07":"蒲郡","08":"常滑","09":"津","10":"三国","11":"びわこ","12":"住之江",
  "13":"尼崎","14":"鳴門","15":"丸亀","16":"児島","17":"宮島","18":"徳山",
  "19":"下関","20":"若松","21":"芦屋","22":"福岡","23":"唐津","24":"大村"
};

/** 「今日 (JST)」を YYYYMMDD で返す */
export function jstDateString(date) {
  const d = date || new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

/** 簡易バリデーション: 8桁の YYYYMMDD */
export function validateDate(s) {
  return typeof s === "string" && /^\d{8}$/.test(s);
}

/** 2桁の jcd (会場コード) */
export function validateJcd(s) {
  return typeof s === "string" && /^\d{2}$/.test(s) && VENUE_NAMES[s] != null;
}

/** 1〜12 のレース番号 */
export function validateRno(s) {
  const n = +s;
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

/** boatrace.jp から HTML を取得 (UTF-8 想定 / ブラウザ風 UA) */
export async function fetchHtml(url, opts = {}) {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; kyotei-ev-assistant/1.0; +https://github.com/shougihajime-eng/kyotei)",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.5",
    },
    ...opts,
  });
  if (!r.ok) {
    const err = new Error(`upstream ${r.status} ${r.statusText} (${url})`);
    err.status = r.status;
    err.upstreamUrl = url;
    throw err;
  }
  return await r.text();
}

/** Vercel エッジキャッシュ用ヘッダ (s-maxage 秒) */
export function setCache(res, sMaxAge, swr = sMaxAge * 2) {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
  );
}

/** 共通エラーレスポンス */
export function fail(res, status, message, extra = {}) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ok: false, error: message, ...extra });
}
