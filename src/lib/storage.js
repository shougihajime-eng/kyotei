/**
 * localStorage が壊れている / 利用不可 / quota 超過 でも落ちないラッパー。
 * 失敗時は console.warn で通知し、ステータスを返す。アプリは続行する。
 *
 * Round 43: 保存失敗の検知 + GC (90日以上前の AI スナップファトを削除)
 *           手動記録は GC 対象外 (このブラウザ内では削除しない)
 *
 * Round 44 — 重要 (誤解させない仕様):
 *   ・ログイン機能なし。 ユーザーごとのクラウド保存はしていない。
 *   ・保存先: このブラウザの localStorage のみ
 *   ・別端末・別ブラウザ・キャッシュクリア・シークレットモードでは消える
 *   ・「永続保持」 という表現は使わず、「このブラウザに保存 (GC 対象外)」 と表現する
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

/* === Round 66: 保存検証 ===
   saveState() 直後に loadState() で読み戻し、 期待 key が存在することを確認。
   { ok, savedKeys, missingKeys, sizeBytes, error } を返す。
   ・ok=true → 保存成功 + 全 expectedKeys が読み戻せた
   ・ok=false → 書き込み失敗 or 読み戻しで欠落 (storageStatus に通知される)
   ・expectedKeys=[] の場合は書き込み成功のみで ok=true (settings 単独保存等)
*/
export function saveAndVerify(state, expectedKeys = []) {
  const writeOk = saveState(state);
  if (!writeOk) {
    return {
      ok: false,
      savedKeys: [],
      missingKeys: Array.from(expectedKeys || []),
      sizeBytes: 0,
      error: _lastSaveStatus?.error || "保存に失敗",
    };
  }
  // 読み戻し
  let readBack;
  try {
    readBack = loadState();
  } catch (e) {
    return {
      ok: false,
      savedKeys: [],
      missingKeys: Array.from(expectedKeys || []),
      sizeBytes: 0,
      error: "読み戻し失敗 — " + (e?.message || String(e)),
    };
  }
  if (!readBack) {
    return {
      ok: false,
      savedKeys: [],
      missingKeys: Array.from(expectedKeys || []),
      sizeBytes: 0,
      error: "読み戻し結果が null",
    };
  }
  const preds = readBack?.predictions || {};
  const savedKeys = [];
  const missingKeys = [];
  for (const k of expectedKeys || []) {
    if (Object.prototype.hasOwnProperty.call(preds, k)) savedKeys.push(k);
    else missingKeys.push(k);
  }
  if (missingKeys.length > 0) {
    const err = `保存検証失敗 — ${missingKeys.length} 件の key が読み戻せませんでした`;
    _lastSaveStatus = { ...(_lastSaveStatus || {}), ok: false, error: err };
    emit(_lastSaveStatus);
    return {
      ok: false,
      savedKeys,
      missingKeys,
      sizeBytes: _lastSaveStatus?.sizeBytes || 0,
      error: err,
    };
  }
  return {
    ok: true,
    savedKeys,
    missingKeys: [],
    sizeBytes: _lastSaveStatus?.sizeBytes || 0,
    error: null,
  };
}

/* === Round 66: visibleData にデータが含まれているか検証 ===
   保存した key が version/legacy/JST フィルタで除外されていないかを確認。
   filteredOut=true なら 「保存はされたが UI で見えない」 状態 → 警告。 */
export function verifyVisible(predictions, expectedKey, options = {}) {
  if (!expectedKey) return { ok: false, present: false, filteredOut: false, reason: "key 未指定" };
  const raw = predictions || {};
  const present = Object.prototype.hasOwnProperty.call(raw, expectedKey);
  if (!present) return { ok: false, present: false, filteredOut: false, reason: "predictions に key が無い" };
  const visible = getVisibleData(raw, options);
  const visiblePresent = Object.prototype.hasOwnProperty.call(visible.predictions || {}, expectedKey);
  if (!visiblePresent) {
    const p = raw[expectedKey];
    const reason = isLegacy(p)
      ? `legacy データのため非表示 (showLegacy=${!!options.showLegacy})`
      : `version=${p?.version || "(none)"} のためフィルタで除外`;
    return { ok: false, present: true, filteredOut: true, reason };
  }
  return { ok: true, present: true, filteredOut: false, reason: null };
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

/* === Round 52: バージョン管理 ===
   Round 52 以降の新ロジックで保存する全レコードに version: "v2" を付与。
   version 無し = legacy (Round 51 以前の不完全データ)。
   Stats / Verify はデフォルトで v2 のみ表示し、legacy を別途分離保存。
*/
export const CURRENT_VERSION = "v2";
export function isLegacy(p) { return !p?.version || p.version === "v1"; }
export function isV2(p) { return p?.version === "v2"; }

/* バージョンでフィルタ (showLegacy=false なら v2 のみ) */
export function filterByVersion(predictions, showLegacy = false) {
  if (showLegacy) return predictions;
  const out = {};
  for (const [k, p] of Object.entries(predictions || {})) {
    if (isV2(p)) out[k] = p;
  }
  return out;
}

/* === Round 52-53: 単一の可視データ取得関数 (UI フラグ統合版) ===
   全 consumer が必ずこの関数経由でデータを参照すること。 storage を直接参照しない。
   返り値:
     predictions: フィルタ済みの予測データ ({ key: pred })
     hasData / isEmpty: 件数フラグ
     isLegacyMixed: showLegacy=true で legacy が混在しているか
     lastUpdated: ISO 文字列 (最終 snapshotAt)
     isReady / isLoading: 状態フラグ
     error: エラー (なければ null)
     countsByStyle: { steady, balanced, aggressive } (買い件数)
     pnlSummary: { air, real } (PnL + ROI)
     bestStyle: 最良 ROI のスタイル
     driftDetected: 選択スタイルと最良スタイルが違う場合 true
     showLegacy / versionInfo: バージョン管理
*/
export function getVisibleData(predictions, options = {}) {
  const { showLegacy = false, currentStyle = null } = typeof options === "object" ? options : { showLegacy: !!options };
  try {
    const filtered = filterByVersion(predictions, showLegacy);
    const all = Object.values(filtered);
    const allRaw = Object.values(predictions || {});
    const hasLegacy = allRaw.some(isLegacy);
    // 最終 snapshotAt
    let lastUpdated = null;
    for (const p of all) {
      if (p?.snapshotAt && (!lastUpdated || p.snapshotAt > lastUpdated)) {
        lastUpdated = p.snapshotAt;
      }
    }
    // スタイル別 件数 + ROI
    const STYLES = ["steady", "balanced", "aggressive"];
    const countsByStyle = {};
    const roiByStyle = {};
    for (const s of STYLES) {
      const arr = all.filter(p => (p.profile || "balanced") === s);
      const buys = arr.filter(p => p.decision === "buy" && (p.totalStake || 0) > 0);
      const settled = buys.filter(p => p.result?.first);
      let stake = 0, ret = 0;
      settled.forEach(p => { stake += p.totalStake; ret += p.payout || 0; });
      countsByStyle[s] = buys.length;
      roiByStyle[s] = stake > 0 ? ret / stake : null;
    }
    // 最良スタイル (3 件以上の実績がある中で ROI 最高)
    let bestStyle = null, bestRoi = -Infinity;
    for (const s of STYLES) {
      if (roiByStyle[s] != null && countsByStyle[s] >= 3 && roiByStyle[s] > bestRoi) {
        bestRoi = roiByStyle[s]; bestStyle = s;
      }
    }
    // ズレ検知
    const driftDetected = !!(currentStyle && bestStyle && currentStyle !== bestStyle);
    // PnL サマリ (エア / リアル)
    const buys = all.filter(p => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first);
    const air = buys.filter(p => p.virtual !== false);
    const real = buys.filter(p => p.virtual === false);
    function pnlOf(arr) {
      let s = 0, r = 0;
      arr.forEach(p => { s += p.totalStake; r += p.payout || 0; });
      return { stake: s, ret: r, pnl: r - s, roi: s > 0 ? r / s : null };
    }
    return {
      predictions: filtered,
      hasData: all.length > 0,
      isEmpty: all.length === 0,
      isLegacyMixed: showLegacy && hasLegacy,
      lastUpdated,
      isReady: true,
      isLoading: false,
      error: null,
      countsByStyle,
      roiByStyle,
      pnlSummary: { air: pnlOf(air), real: pnlOf(real) },
      bestStyle,
      bestRoi: bestStyle ? roiByStyle[bestStyle] : null,
      driftDetected,
      currentStyle,
      showLegacy,
      versionInfo: {
        v2Count: allRaw.filter(isV2).length,
        legacyCount: allRaw.filter(isLegacy).length,
        hasLegacy,
        currentVersion: CURRENT_VERSION,
      },
    };
  } catch (e) {
    return {
      predictions: {},
      hasData: false,
      isEmpty: true,
      isLegacyMixed: false,
      lastUpdated: null,
      isReady: false,
      isLoading: false,
      error: String(e?.message || e),
      countsByStyle: { steady: 0, balanced: 0, aggressive: 0 },
      roiByStyle: { steady: null, balanced: null, aggressive: null },
      pnlSummary: { air: null, real: null },
      bestStyle: null,
      bestRoi: null,
      driftDetected: false,
      currentStyle: null,
      showLegacy: !!showLegacy,
      versionInfo: { v2Count: 0, legacyCount: 0, hasLegacy: false, currentVersion: CURRENT_VERSION },
    };
  }
}

/* バージョン情報サマリ (UI バッジ用) */
export function getVersionInfo(predictions) {
  const all = Object.values(predictions || {});
  const v2 = all.filter(isV2).length;
  const legacy = all.filter(isLegacy).length;
  return {
    currentVersion: CURRENT_VERSION,
    v2Count: v2,
    legacyCount: legacy,
    isFreshStart: v2 === 0 && legacy === 0,
    hasLegacy: legacy > 0,
  };
}

/* === Round 43-52: 保存件数・期間統計 (legacy / v2 分離 + 3 スタイル別) === */
export function getStorageStats(predictions) {
  const all = Object.values(predictions || {});
  const v2 = all.filter(isV2);
  const legacy = all.filter(isLegacy);
  const today = new Date().toISOString().slice(0, 10);
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const inPeriod = (arr, cutoff) => arr.filter((p) => (p.date || "0000-00-00") >= cutoff);
  const air = (arr) => arr.filter((p) => p.virtual !== false);
  const real = (arr) => arr.filter((p) => p.virtual === false);
  const manual = (arr) => arr.filter((p) => p.manuallyRecorded);
  const byProfile = (arr, style) => arr.filter((p) => (p.profile || "balanced") === style);
  const dates = all.map((p) => p.date).filter(Boolean).sort();
  // 件数は v2 をデフォルト集計対象に
  return {
    total: all.length,
    v2: v2.length,
    legacy: legacy.length,
    last7days: inPeriod(v2, ago(6)).length,
    last30days: inPeriod(v2, ago(29)).length,
    today: v2.filter((p) => p.date === today).length,
    air: air(v2).length,
    real: real(v2).length,
    manual: manual(v2).length,
    steady: byProfile(v2, "steady").length,
    balanced: byProfile(v2, "balanced").length,
    aggressive: byProfile(v2, "aggressive").length,
    oldestDate: dates[0] || null,
    newestDate: dates[dates.length - 1] || null,
    settled: v2.filter((p) => p.result?.first).length,
    pending: v2.filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && !p.result?.first).length,
    // legacy 個別カウント (UI 用)
    legacyAir: air(legacy).length,
    legacyReal: real(legacy).length,
    legacyManual: manual(legacy).length,
  };
}

/* === legacy データを完全削除 (任意操作) === */
export function purgeLegacy(predictions) {
  const next = {};
  let removed = 0;
  for (const [k, p] of Object.entries(predictions || {})) {
    if (isV2(p)) next[k] = p;
    else removed++;
  }
  return { next, removed };
}

/* === Round 43-44: 古い AI スナップショットを GC ===
   ・90 日以上前の AI 自動記録を削除 (このブラウザ内のスペース確保)
   ・直近 30 日はこのブラウザ内に保持 (ユーザーが見たい期間)
   ・手動記録は GC しない (ただしブラウザデータ削除されると消える)
   ・GC 後の predictions オブジェクトを返す */
export const GC_RETAIN_DAYS = 90;
export function gcOldPredictions(predictions, retainDays = GC_RETAIN_DAYS) {
  const cutoff = new Date(Date.now() - retainDays * 86400000).toISOString().slice(0, 10);
  const next = {};
  let removed = 0;
  for (const [key, p] of Object.entries(predictions || {})) {
    // 手動記録は GC 対象外 (このブラウザ内では消えない、ただしブラウザクリアでは消える)
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
