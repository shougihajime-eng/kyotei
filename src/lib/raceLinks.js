/**
 * 公式ボートレース.jp の 出走表 / リプレイ URL を生成するユーティリティ。
 *
 * 設計方針 (Round 108):
 *   ・場コード (jcd) + 日付 (YYYY-MM-DD or YYYYMMDD) + レース番号 から URL を毎回生成
 *   ・既存データに jcd が無い場合は venueBias.js の resolveJcd で 場名→jcd 変換
 *   ・日付形式のズレ (YYYY-MM-DD / YYYYMMDD / Date) は normalizeHd() で吸収
 *   ・リプレイは レース終了後でないと公開されないため、 開催日が未来 / 当日まだ走っていない場合は
 *     null を返してボタン側で disable する
 *   ・新しい URL を保存するのではなく、 取り出すたびに生成するステートレス設計
 *
 * 公式ボートレース.jp の URL 仕様 (実機検証済 / 2026):
 *   出走表:   https://www.boatrace.jp/owpc/pc/race/racelist?rno={rno}&jcd={jcd}&hd={YYYYMMDD}
 *   オッズ:   https://www.boatrace.jp/owpc/pc/race/oddstf?rno={rno}&jcd={jcd}&hd={YYYYMMDD}
 *   結果:     https://www.boatrace.jp/owpc/pc/race/raceresult?rno={rno}&jcd={jcd}&hd={YYYYMMDD}
 *   リプレイ: https://race.boatcast.jp/?jo={jcd}&hd={YYYYMMDD}
 *
 * リプレイ URL について重要 (Round 109 で修正):
 *   ・公式は per-race deep link を提供しない (公式 boatrace.jp 側の結果ページから 飛ぶ先が
 *     race.boatcast.jp の SPA で、 そこから手動でレース選択する仕様)
 *   ・前バージョンで使用していた boatrace.jp/owpc/pc/extra/video/index.html は
 *     現在「システムエラー」 を返すため使用禁止
 *   ・正規の遷移先は race.boatcast.jp で、 jo (場コード) + hd (日付) を渡すと
 *     その会場 / その日 のリプレイ一覧が出る (R 番号は SPA 内で選択)
 */

import { VENUE_PROFILE, resolveJcd } from "./venueBias.js";

const BOATRACE_BASE = "https://www.boatrace.jp/owpc/pc";
const BOATCAST_BASE = "https://race.boatcast.jp";

/**
 * jcd を導出 (jcd 優先 / fallback で venue 名から検索)
 * @param {string|number|null|undefined} jcd
 * @param {string|null|undefined} venueName
 * @returns {string|null} 2 桁の jcd 文字列 ("01"〜"24") または null
 */
export function resolveVenueCode(jcd, venueName) {
  // 数値 / 1 桁を 2 桁にゼロ埋め
  if (jcd != null && jcd !== "") {
    const s = String(jcd).padStart(2, "0");
    if (VENUE_PROFILE[s]) return s;
  }
  return resolveJcd(null, venueName);
}

/**
 * 日付を YYYYMMDD に正規化
 * @param {string|Date|null|undefined} date - "YYYY-MM-DD" or "YYYYMMDD" or Date
 * @returns {string|null}
 */
export function normalizeHd(date) {
  if (!date) return null;
  if (date instanceof Date && !isNaN(date)) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  const s = String(date).trim();
  if (/^\d{8}$/.test(s)) return s;
  // "YYYY-MM-DD" or "YYYY/MM/DD"
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}${mo}${d}`;
  }
  // ISO datetime
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m2) return `${m2[1]}${m2[2]}${m2[3]}`;
  return null;
}

/**
 * レース番号を 1〜12 に正規化
 * @returns {number|null}
 */
function normalizeRno(raceNo) {
  if (raceNo == null) return null;
  const n = +raceNo;
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return Math.floor(n);
}

/**
 * 出走表 URL を生成
 * @param {string|number} venueCode - jcd ("01"〜"24")
 * @param {string|Date} date - "YYYY-MM-DD" / "YYYYMMDD" / Date
 * @param {number} raceNo - 1〜12
 * @returns {string|null} 生成できなかったら null
 */
export function buildRaceCardUrl(venueCode, date, raceNo) {
  const jcd = resolveVenueCode(venueCode, null);
  const hd = normalizeHd(date);
  const rno = normalizeRno(raceNo);
  if (!jcd || !hd || !rno) return null;
  return `${BOATRACE_BASE}/race/racelist?rno=${rno}&jcd=${jcd}&hd=${hd}`;
}

/**
 * リプレイ URL を生成。 過去のレースでないと公開されないため、
 * 「未開催 / 公開待ち」 と判定できる場合は null を返す。
 *
 * 仕様 (Round 109):
 *   公式は per-race deep link を持たないため、 会場 + 日付 で
 *   race.boatcast.jp/?jo={jcd}&hd={YYYYMMDD} を返す。
 *   ボタン側の title / tooltip で 「{venue} {raceNo}R を選択してください」 と案内する想定。
 *   raceNo はクエリに含まれないが、 引数に rno を取るのは
 *   「将来 deep link 対応された場合に互換」 + 「呼び出し側コードの統一」 のため。
 *
 * @param {string|number} venueCode
 * @param {string|Date} date
 * @param {number} raceNo
 * @param {{startTime?: string, now?: Date}} [opts] - startTime "HH:MM" を渡すとレース後判定が精度向上
 * @returns {string|null}
 */
export function buildReplayUrl(venueCode, date, raceNo, opts = {}) {
  const jcd = resolveVenueCode(venueCode, null);
  const hd = normalizeHd(date);
  const rno = normalizeRno(raceNo);
  if (!jcd || !hd || !rno) return null;

  // 「公開待ち」 判定: 開催日が未来 / 当日でレース時刻前
  if (!isReplayLikelyAvailable(date, opts.startTime, opts.now)) return null;

  return `${BOATCAST_BASE}/?jo=${jcd}&hd=${hd}`;
}

/**
 * レース結果ページ URL を生成 (おまけ)
 */
export function buildRaceResultUrl(venueCode, date, raceNo) {
  const jcd = resolveVenueCode(venueCode, null);
  const hd = normalizeHd(date);
  const rno = normalizeRno(raceNo);
  if (!jcd || !hd || !rno) return null;
  return `${BOATRACE_BASE}/race/raceresult?rno=${rno}&jcd=${jcd}&hd=${hd}`;
}

/**
 * リプレイがそろそろ公開されているか (= レース終了後 ≈ 30分以上経過) を推定。
 * 厳密ではない (公式の公開タイミングは保証されない) が、
 * 未来の日付・当日でレース前 のような明らかな未公開ケースは弾く。
 *
 * @param {string|Date} date
 * @param {string|null} startTime - "HH:MM"
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function isReplayLikelyAvailable(date, startTime, now) {
  const today = now instanceof Date ? now : new Date();
  const hd = normalizeHd(date);
  if (!hd) return false;

  const todayHd = normalizeHd(today);
  // 未来の日付
  if (hd > todayHd) return false;
  // 過去の日付 → 公開済みとみなす
  if (hd < todayHd) return true;

  // 当日: startTime + 余裕 (30 分) を経過していれば公開済みとみなす
  if (!startTime) {
    // 不明 → 当日中は控えめに「公開待ち」 とする
    return false;
  }
  const m = String(startTime).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const startMin = (+m[1]) * 60 + (+m[2]);
  const nowMin = today.getHours() * 60 + today.getMinutes();
  return nowMin >= startMin + 30; // レース後 30 分以上
}

/**
 * 1 レース分の リンクセット を生成 (UI で使いやすいラッパー)
 * @param {{date, venue, jcd?, raceNo, startTime?}} race
 * @param {Date} [now]
 * @returns {{
 *   raceCardUrl: string|null,
 *   replayUrl: string|null,
 *   resultUrl: string|null,
 *   replayPending: boolean,    // リプレイ未公開と推定されるか
 *   reason: string|null,        // null 時の理由 (UI 用)
 * }}
 */
export function buildRaceLinks(race, now) {
  if (!race) {
    return { raceCardUrl: null, replayUrl: null, resultUrl: null, replayPending: false, reason: "レース情報なし" };
  }
  const { date, venue, jcd, raceNo, startTime } = race;
  const code = resolveVenueCode(jcd, venue);
  const hd = normalizeHd(date);
  const rno = normalizeRno(raceNo);

  if (!code || !hd || !rno) {
    return {
      raceCardUrl: null,
      replayUrl: null,
      resultUrl: null,
      replayPending: false,
      reason: !code ? "場コード不明"
            : !hd  ? "日付不明"
            : !rno  ? "レース番号不明"
            : "情報不足",
    };
  }

  const raceCardUrl = `${BOATRACE_BASE}/race/racelist?rno=${rno}&jcd=${code}&hd=${hd}`;
  const resultUrl   = `${BOATRACE_BASE}/race/raceresult?rno=${rno}&jcd=${code}&hd=${hd}`;
  const available   = isReplayLikelyAvailable(date, startTime, now);
  const replayUrl   = available
    ? `${BOATCAST_BASE}/?jo=${code}&hd=${hd}`
    : null;

  return {
    raceCardUrl,
    replayUrl,
    resultUrl,
    replayPending: !available,
    replayDeepLink: false, // 注意: per-race deep link 不可 / 会場 + 日付までしか飛べない
    reason: null,
  };
}
