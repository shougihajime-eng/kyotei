/**
 * Round 114: ブラウザ通知 — 買い判定が出た瞬間に気付ける
 *
 * 設計方針:
 *   ・ユーザーが他タブ/他アプリ作業中でも見逃さない
 *   ・"odds-pending → buy" 等の 「予想が確定 + 買い」 への遷移を検知
 *   ・通知許可は明示的にユーザーが押した時のみリクエスト (突然 popup を出さない)
 *   ・1 レースにつき 1 回だけ通知 (連打防止)
 *   ・タブを開いている時 (document.visibilityState === "visible") は通知しない
 *     → 画面で見えてるなら通知不要 (二重表示の煩わしさを避ける)
 */

const STORAGE_KEY = "kyoteiNotifyEnabled";
const sentRaceIds = new Set();

/** ブラウザが Notification API をサポートしているか */
export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** 現在の通知許可状態 ("granted" / "denied" / "default" / "unsupported") */
export function getPermissionState() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

/** ユーザーが通知 ON にしたかどうかの localStorage フラグ */
export function isNotificationEnabled() {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** 通知許可をリクエストして、 granted なら ON フラグを立てる */
export async function enableNotifications() {
  if (!isNotificationSupported()) {
    return { ok: false, reason: "このブラウザは通知に対応していません" };
  }
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      return { ok: false, reason: `通知許可リクエストに失敗: ${e?.message || e}` };
    }
  }
  if (permission !== "granted") {
    return { ok: false, reason: "通知が拒否されました (ブラウザ設定で再度許可できます)" };
  }
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  return { ok: true };
}

/** ユーザーが通知 OFF にしたい時 */
export function disableNotifications() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** 買い判定通知を送る (重複防止 + visibility ガード付き)
 *  @param {object} race - { id, venue, raceNo, startTime }
 *  @param {object} rec  - { decision, main: { kind, combo, ev }, grade }
 *  @param {number} minutesToStart
 *  @returns {boolean} 通知を実際に送ったか
 */
export function sendBuyNotification(race, rec, minutesToStart) {
  if (!isNotificationEnabled()) return false;
  if (!race?.id) return false;
  if (rec?.decision !== "buy") return false;
  // 同じレースで 1 回だけ
  if (sentRaceIds.has(race.id)) return false;
  // タブが見えている (visible) なら通知不要 — 画面で見えるので
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    sentRaceIds.add(race.id); // 表示中も 「送った」 扱いで再送防止
    return false;
  }
  try {
    const grade = rec.grade ? `[${rec.grade}] ` : "";
    const headline = rec.grade === "S" ? "🔥 勝負レース" : "🟢 買い判定";
    const main = rec.main;
    const body = main
      ? `${grade}${race.venue} ${race.raceNo}R ${main.kind} ${main.combo}\nEV ${main.ev?.toFixed(2)} / 発走 ${Math.max(0, Math.ceil(minutesToStart))} 分前`
      : `${grade}${race.venue} ${race.raceNo}R / 発走 ${Math.max(0, Math.ceil(minutesToStart))} 分前`;
    const n = new Notification(headline, {
      body,
      tag: `kyotei-buy-${race.id}`, // 同じ tag は上書き → 通知センターで複数並ばない
      icon: "/favicon.ico", // フォールバック
      badge: "/favicon.ico",
      requireInteraction: false,
    });
    // クリックでアプリにフォーカスを戻す
    n.onclick = () => {
      try { window.focus(); } catch {}
      try { n.close(); } catch {}
    };
    sentRaceIds.add(race.id);
    return true;
  } catch (e) {
    console.error("[notifyBuy] failed:", e);
    return false;
  }
}

/** 過去通知履歴をリセット (新しい日 / 設定変更時用) */
export function resetSentRaces() {
  sentRaceIds.clear();
}
