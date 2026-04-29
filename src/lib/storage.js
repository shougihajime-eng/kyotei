/**
 * localStorage が壊れている / 利用不可 / quota 超過 でも落ちないラッパー。
 * 失敗時は console.warn で通知し、null/false を返す。アプリは続行する。
 */
const KEY = "kyoteiAssistantV2";

export function loadState() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[storage] loadState failed:", e);
    return null;
  }
}

export function saveState(state) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("[storage] saveState failed:", e);
    return false;
  }
}

export function clearState() {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.removeItem(KEY);
    // 旧バージョンのキーも一掃
    localStorage.removeItem("kyoteiAssistantStateV3");
    localStorage.removeItem("kyoteiAssistantStateV2");
    return true;
  } catch (e) {
    console.warn("[storage] clearState failed:", e);
    return false;
  }
}
