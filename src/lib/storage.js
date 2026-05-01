/**
 * localStorage が壊れている / 利用不可 / quota 超過 でも落ちないラッパー。
 * 失敗時は console.warn で通知し、ステータスを返す。アプリは続行する。
 *
 * Round 43: 保存失敗の検知 + GC (90日以上前の AI スナップショットを削除)
 *           手動記録は GC 対象外 (永続保持)
 */
const KEY = "kyoteiAssistantV2";

/* 保存ステータス listener (UI でバナー表示用) */
let _statusListener = null;
export function setStorageStatusListener(fn) { _statusListener = fn; }
function emit(status) { if (_statusListener) try { _statusListener(status); } catch {} }

/* 最終保存試行と結果 */
let _lastSaveStatus = { ok: true, lastSavedAt: null, error: null };

export function loadState() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[storage] loadState failed:", e);
    _lastSaveStatus = { ok: false, lastSavedAt: null, error: "読込失敗 — データが壊れている可能性" };
    emit(_lastSaveStatus);
    return null;
  }
}

export function saveState(state) {
  try {
    if (typeof localStorage === "undefined") {
      _lastSaveStatus = { ok: false, lastSavedAt: null, error: "localStorage が利用不可" };
      emit(_lastSaveStatus);
      return false;
    }
    const json = JSON.stringify(state);
    localStorage.setItem(KEY, json);
    _lastSaveStatus = { ok: true, lastSavedAt: Date.now(), error: null, sizeBytes: json.length };
    emit(_lastSaveStatus);
    return true;
  } catch (e) {
    // QuotaExceededError 等
    console.warn("[storage] saveState failed:", e);
    const isQuota = e?.name === "QuotaExceededError" || /quota/i.test(String(e?.message));
    _lastSaveStatus = {
      ok: false,
      lastSavedAt: _lastSaveStatus.lastSavedAt,
      error: isQuota
        ? "ストレージ上限を超えました — 古いデータを削除してください"
        : "保存失敗 — " + (e?.message || String(e)),
    };
    emit(_lastSaveStatus);
    return false;
  }
}

export function clearState() {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.removeItem(KEY);
    localStorage.removeItem("kyoteiAssistantStateV3");
    localStorage.removeItem("kyoteiAssistantStateV2");
    _lastSaveStatus = { ok: true, lastSavedAt: Date.now(), error: null };
    emit(_lastSaveStatus);
    return true;
  } catch (e) {
    console.warn("[storage] clearState failed:", e);
    return false;
  }
}

/* === Round 43: 保存件数・期間統計 === */
export function getStorageStats(predictions) {
  const all = Object.values(predictions || {});
  const today = new Date().toISOString().slice(0, 10);
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const inPeriod = (cutoff) => all.filter((p) => (p.date || "0000-00-00") >= cutoff);
  const air = (arr) => arr.filter((p) => p.virtual !== false);
  const real = (arr) => arr.filter((p) => p.virtual === false);
  const manual = all.filter((p) => p.manuallyRecorded);
  const dates = all.map((p) => p.date).filter(Boolean).sort();
  const oldestDate = dates[0] || null;
  const newestDate = dates[dates.length - 1] || null;
  return {
    total: all.length,
    last7days: inPeriod(ago(6)).length,
    last30days: inPeriod(ago(29)).length,
    today: all.filter((p) => p.date === today).length,
    air: air(all).length,
    real: real(all).length,
    manual: manual.length,
    oldestDate,
    newestDate,
    settled: all.filter((p) => p.result?.first).length,
    pending: all.filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && !p.result?.first).length,
  };
}

/* === Round 43: 古い AI スナップショットを GC ===
   ・90 日以上前の AI 自動記録を削除 (手動記録は永続保持)
   ・直近 30 日は確実に保持 (ユーザーが見たい期間)
   ・GC 後の predictions オブジェクトを返す */
export const GC_RETAIN_DAYS = 90;
export function gcOldPredictions(predictions, retainDays = GC_RETAIN_DAYS) {
  const cutoff = new Date(Date.now() - retainDays * 86400000).toISOString().slice(0, 10);
  const next = {};
  let removed = 0;
  for (const [key, p] of Object.entries(predictions || {})) {
    // 手動記録は永続保持 (ユーザーが入れた大事な記録)
    if (p.manuallyRecorded) {
      next[key] = p;
      continue;
    }
    // 日付不明は安全側で残す
    if (!p.date) {
      next[key] = p;
      continue;
    }
    if (p.date >= cutoff) {
      next[key] = p;
    } else {
      removed++;
    }
  }
  return { next, removed, cutoff };
}

/* localStorage の現在容量 (おおよそ) を見積もる */
export function estimateStorageSize() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY) || "";
    return { bytes: raw.length, kb: (raw.length / 1024).toFixed(1) };
  } catch {
    return null;
  }
}

/* デバッグ用 */
export function getLastSaveStatus() {
  return _lastSaveStatus;
}
