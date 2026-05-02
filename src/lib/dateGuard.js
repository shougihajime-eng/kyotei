/**
 * Round 59: 日付管理 (JST 固定)
 *
 * すべてのデータ日付は JST タイムゾーンで確定する。
 * ローカル時刻に依存せず「YYYY-MM-DD (JST)」 を唯一の日付キーとする。
 *
 * 日付切り替え:
 *   ・単純な 0:00 切替ではなく、 最終レース時刻 (22:00 JST) を基準に「翌日扱い」
 *   ・つまり 2026-05-02 22:00 JST 以降に開いたら 2026-05-03 として扱う
 *   (深夜帯のデータ混在を避ける配慮)
 */

/* JST 日付文字列を取得 (YYYY-MM-DD) */
export function getJstDateString(date = new Date()) {
  // JST = UTC+9
  const utcMs = date.getTime();
  const jstMs = utcMs + 9 * 60 * 60 * 1000;
  const jstDate = new Date(jstMs);
  // toISOString は UTC を返すので、 jstMs を UTC として扱った文字列を取る
  return jstDate.toISOString().slice(0, 10);
}

/* JST 時刻を取得 (HH:MM) */
export function getJstTimeString(date = new Date()) {
  const utcMs = date.getTime();
  const jstMs = utcMs + 9 * 60 * 60 * 1000;
  const jstDate = new Date(jstMs);
  return jstDate.toISOString().slice(11, 16);
}

/* === 日付の切替判定 (最終レース 22:00 を境に翌日扱い) ===
   ・JST 22:00 〜 翌 8:00 → 「翌日」
   ・JST 8:00 〜 22:00     → 「当日」
*/
export const RACE_DAY_CUTOFF_HOUR_JST = 22;

export function getEffectiveRaceDate(now = new Date()) {
  const utcMs = now.getTime();
  const jstMs = utcMs + 9 * 60 * 60 * 1000;
  const jstDate = new Date(jstMs);
  const hours = jstDate.getUTCHours();
  // 22 時以降は翌日扱い
  if (hours >= RACE_DAY_CUTOFF_HOUR_JST) {
    const tomorrow = new Date(jstMs + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  }
  return jstDate.toISOString().slice(0, 10);
}

/* === N 日前の JST 日付 === */
export function getJstDateAgo(daysBack, now = new Date()) {
  const utcMs = now.getTime();
  const jstMs = utcMs + 9 * 60 * 60 * 1000;
  const past = new Date(jstMs - daysBack * 24 * 60 * 60 * 1000);
  return past.toISOString().slice(0, 10);
}

/* === 日付の整合性チェック ===
   visibleData 生成時に呼ぶ。 現在日付と data の日付が一致するか確認。
   返り値: { match: bool, currentJst, dataDate, message } */
export function validateDateConsistency(predictions, currentJst = null) {
  const now = currentJst || getJstDateString();
  const all = Object.values(predictions || {});
  const todayPreds = all.filter((p) => p.date === now);
  if (all.length === 0) {
    return { match: true, currentJst: now, dataDate: null, message: "データなし (空)" };
  }
  // 直近の予測データの日付を取得
  const dates = all.map((p) => p.date).filter(Boolean).sort();
  const newest = dates[dates.length - 1];
  if (!newest) {
    return { match: false, currentJst: now, dataDate: null, message: "予測データに日付なし" };
  }
  // newest が今日もしくは将来 → OK
  // newest が過去 → 古い (更新が必要)
  if (newest <= now) {
    return {
      match: true,
      currentJst: now,
      dataDate: newest,
      message: newest === now ? "本日のデータ" : `直近データは ${newest}`,
      isStale: newest < now,
    };
  }
  // newest > now (未来日付) — 異常
  return {
    match: false,
    currentJst: now,
    dataDate: newest,
    message: `⚠️ 日付不一致: 現在 ${now} / データ ${newest}`,
  };
}

/* === 日付切替検知 ===
   前回の日付を localStorage から読んで、 現在と違えば切替発生。
   切替時に refreshAll を自動実行するため。 */
const LAST_DATE_KEY = "kyotei_lastDate";

export function detectDateChange() {
  if (typeof localStorage === "undefined") {
    return { changed: false, prevDate: null, currentDate: getJstDateString() };
  }
  const currentDate = getEffectiveRaceDate();
  const prevDate = localStorage.getItem(LAST_DATE_KEY) || null;
  if (!prevDate) {
    localStorage.setItem(LAST_DATE_KEY, currentDate);
    return { changed: false, prevDate: null, currentDate, isFirstLoad: true };
  }
  if (prevDate !== currentDate) {
    localStorage.setItem(LAST_DATE_KEY, currentDate);
    return { changed: true, prevDate, currentDate };
  }
  return { changed: false, prevDate, currentDate };
}
