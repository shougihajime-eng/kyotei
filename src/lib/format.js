/* 表示用フォーマッタ */

export function yen(n) {
  const v = Math.round(Number(n) || 0);
  return "¥" + v.toLocaleString("ja-JP");
}

export function pct(p, digits = 1) {
  if (p == null || isNaN(p)) return "—";
  return (p * 100).toFixed(digits) + "%";
}

export function timeJST(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export function todayDate() {
  const d = new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function todayKey() {
  return todayDate().replace(/-/g, "");
}

/* "YYYY-MM-DD" + "HH:MM" → epoch ms (JST) */
export function startEpoch(dateStr, startTime) {
  if (!dateStr || !startTime) return null;
  try {
    const d = new Date(`${dateStr}T${startTime}:00+09:00`);
    return isNaN(d.getTime()) ? null : d.getTime();
  } catch { return null; }
}
