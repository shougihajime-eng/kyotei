/**
 * Round 75: 改ざん防止検証ログ (Immutable Log)
 *
 * 目的: 「このアプリは本当に勝てるのか？」 を第三者が検証できる状態にする。
 *
 * 設計:
 *   ・予想と結果が確定したら append-only でログに追加
 *   ・各エントリにハッシュ (簡易 djb2) を付与し、 改ざん検出可能
 *   ・前のエントリのハッシュをチェイン (= ブロックチェーン的)
 *   ・編集・削除 API 提供しない (storage キー も別)
 *   ・ログは公開ページで全件表示 (read-only)
 *
 * localStorage キー: kyoteiPublicLog (本体とは分離)
 *
 * Round 73 の predictions と異なり、 これは検証専用の append-only。
 * ロジック変更前の成績も verificationVersion で残るので、 比較可能。
 */

const PUBLIC_LOG_KEY = "kyoteiPublicLog";

/* === 簡易ハッシュ (改ざん検出用、 暗号強度はない) === */
export function quickHash(s) {
  let h = 5381;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  // 32-bit 整数 → unsigned hex
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* === ログエントリ正規化 === */
function normalizeEntry(prediction) {
  if (!prediction) return null;
  // 公開する最小フィールドのみ抽出 (個人情報や内部状態は除く)
  return {
    key: prediction.key,
    date: prediction.date,
    venue: prediction.venue,
    raceNo: prediction.raceNo,
    startTime: prediction.startTime,
    profile: prediction.profile,
    decision: prediction.decision,
    main: prediction.combos?.[0] ? {
      kind: prediction.combos[0].kind,
      combo: prediction.combos[0].combo,
      odds: prediction.combos[0].odds,
      prob: prediction.combos[0].prob,
      ev: prediction.combos[0].ev,
    } : null,
    totalStake: prediction.totalStake || 0,
    confidence: prediction.confidence,
    verificationVersion: prediction.verificationVersion,
    preCloseTarget: !!prediction.preCloseTarget,
    isGoCandidate: !!prediction.isGoCandidate,
    isSampleData: !!prediction.isSampleData,   // Round 76: 仮データ起源フラグ (公開ログでは除外)
    snapshotAt: prediction.snapshotAt,
    // 結果 (確定後のみ)
    result: prediction.result?.first ? {
      first: prediction.result.first,
      second: prediction.result.second,
      third: prediction.result.third,
    } : null,
    payout: prediction.payout || 0,
    hit: !!prediction.hit,
    pnl: prediction.pnl != null ? prediction.pnl : (prediction.payout - (prediction.totalStake || 0)),
    finalized: !!prediction.finalized,
  };
}

/* === ログ読込 === */
export function loadPublicLog() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(PUBLIC_LOG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

/* === 整合性チェック (前後ハッシュのチェイン検証) === */
export function verifyIntegrity(log) {
  if (!Array.isArray(log) || log.length === 0) return { valid: true, brokenAt: null };
  let prevHash = "0";
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e || !e.hash || !e.entry) return { valid: false, brokenAt: i, reason: "形式不正" };
    if (e.prevHash !== prevHash) return { valid: false, brokenAt: i, reason: `prevHash 不一致 (${e.prevHash} vs ${prevHash})` };
    const calc = quickHash(JSON.stringify(e.entry) + e.prevHash + (e.appendedAt || ""));
    if (calc !== e.hash) return { valid: false, brokenAt: i, reason: `hash 不一致 (${calc} vs ${e.hash})` };
    prevHash = e.hash;
  }
  return { valid: true, brokenAt: null };
}

/* === append-only 追記 ===
   ・既に同 key の確定エントリがあれば追記しない
   ・finalized=true のエントリのみ受け付ける
   ・Round 76: 仮データ起源 (isSampleData=true) は絶対に追記しない (信用毀損防止) */
export function appendPublicLog(prediction) {
  if (!prediction || !prediction.finalized) return { ok: false, reason: "未確定 (finalized=false)" };
  if (prediction.isSampleData) return { ok: false, reason: "仮データ起源 — 公開ログには追記しません" };
  const entry = normalizeEntry(prediction);
  if (!entry || !entry.key) return { ok: false, reason: "key 欠落" };
  const log = loadPublicLog();
  // 同 key の確定エントリ既存ならスキップ
  if (log.some((e) => e.entry?.key === entry.key && e.entry?.finalized)) {
    return { ok: true, reason: "既存 (skip)", entry: null, total: log.length };
  }
  const prevHash = log.length > 0 ? log[log.length - 1].hash : "0";
  const appendedAt = new Date().toISOString();
  const hash = quickHash(JSON.stringify(entry) + prevHash + appendedAt);
  const block = { entry, prevHash, hash, appendedAt };
  log.push(block);
  try {
    localStorage.setItem(PUBLIC_LOG_KEY, JSON.stringify(log));
    return { ok: true, entry: block, total: log.length };
  } catch (e) {
    return { ok: false, reason: "書込失敗 — " + (e?.message || e) };
  }
}

/* === predictions から finalized 全件を一括 sync ===
   起動時等に呼ぶ。 既に追加済の key はスキップされる。 */
export function syncPublicLog(predictions) {
  let added = 0, skipped = 0;
  const items = Object.values(predictions || {})
    .filter((p) => p?.finalized && p?.result?.first)
    // 安定 order: snapshotAt 順
    .sort((a, b) => (a.snapshotAt || "").localeCompare(b.snapshotAt || ""));
  for (const p of items) {
    const r = appendPublicLog(p);
    if (r.ok && r.entry) added++;
    else skipped++;
  }
  return { added, skipped, total: loadPublicLog().length };
}

/* === エクスポート (JSON) — 第三者検証用に整合性ハッシュ付き === */
export function exportPublicLogJson() {
  const log = loadPublicLog();
  const integrity = verifyIntegrity(log);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    entries: log.length,
    integrity,
    log,
  }, null, 2);
}

/* === ログ要約 (全体 + バージョン別 + 日別) === */
export function summarizePublicLog(log = null) {
  const list = log || loadPublicLog();
  const byVersion = {};
  const byDay = {};
  // Round 76: 全体集計 + 連敗の最大値 + 最大連勝
  const overall = { count: 0, hits: 0, stake: 0, ret: 0 };
  // 時系列で最大連敗 / 最大連勝 を計算
  const sorted = list
    .filter((b) => b.entry?.decision === "buy" && b.entry?.result)
    .sort((a, b) => (a.entry.snapshotAt || "").localeCompare(b.entry.snapshotAt || ""));
  let curLossStreak = 0, maxLossStreak = 0;
  let curWinStreak = 0, maxWinStreak = 0;
  let avgOddsSum = 0, avgOddsCount = 0;

  for (const block of list) {
    const e = block.entry;
    if (!e) continue;
    // バージョン別
    const v = e.verificationVersion || "(unknown)";
    if (!byVersion[v]) byVersion[v] = { count: 0, hits: 0, stake: 0, ret: 0 };
    // 日別
    const d = e.date || "(unknown)";
    if (!byDay[d]) byDay[d] = { count: 0, hits: 0, stake: 0, ret: 0 };
    if (e.decision === "buy" && e.result) {
      byVersion[v].count++;
      byVersion[v].stake += e.totalStake || 0;
      byVersion[v].ret += e.payout || 0;
      if (e.hit) byVersion[v].hits++;
      byDay[d].count++;
      byDay[d].stake += e.totalStake || 0;
      byDay[d].ret += e.payout || 0;
      if (e.hit) byDay[d].hits++;
      // 全体
      overall.count++;
      overall.stake += e.totalStake || 0;
      overall.ret += e.payout || 0;
      if (e.hit) overall.hits++;
      if (e.main?.odds != null) {
        avgOddsSum += e.main.odds;
        avgOddsCount++;
      }
    }
  }
  // 連敗 / 連勝 (時系列順で計算)
  for (const block of sorted) {
    if (block.entry.hit) {
      curWinStreak++;
      if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
      curLossStreak = 0;
    } else {
      curLossStreak++;
      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
      curWinStreak = 0;
    }
  }
  // ROI 計算
  for (const v in byVersion) {
    const b = byVersion[v];
    b.roi = b.stake > 0 ? +(b.ret / b.stake).toFixed(3) : null;
    b.hitRate = b.count > 0 ? +(b.hits / b.count).toFixed(3) : null;
    b.pnl = b.ret - b.stake;
  }
  for (const d in byDay) {
    const b = byDay[d];
    b.roi = b.stake > 0 ? +(b.ret / b.stake).toFixed(3) : null;
    b.hitRate = b.count > 0 ? +(b.hits / b.count).toFixed(3) : null;
    b.pnl = b.ret - b.stake;
  }
  overall.roi = overall.stake > 0 ? +(overall.ret / overall.stake).toFixed(3) : null;
  overall.hitRate = overall.count > 0 ? +(overall.hits / overall.count).toFixed(3) : null;
  overall.pnl = overall.ret - overall.stake;
  overall.avgOdds = avgOddsCount > 0 ? +(avgOddsSum / avgOddsCount).toFixed(2) : null;
  overall.maxLossStreak = maxLossStreak;
  overall.maxWinStreak = maxWinStreak;

  // 月別 (検証期間の可視化)
  const byMonth = {};
  for (const block of list) {
    const e = block.entry;
    if (!e || e.decision !== "buy" || !e.result) continue;
    const m = (e.date || "").slice(0, 7); // YYYY-MM
    if (!m) continue;
    if (!byMonth[m]) byMonth[m] = { count: 0, hits: 0, stake: 0, ret: 0 };
    byMonth[m].count++;
    byMonth[m].stake += e.totalStake || 0;
    byMonth[m].ret += e.payout || 0;
    if (e.hit) byMonth[m].hits++;
  }
  for (const m in byMonth) {
    const b = byMonth[m];
    b.roi = b.stake > 0 ? +(b.ret / b.stake).toFixed(3) : null;
    b.hitRate = b.count > 0 ? +(b.hits / b.count).toFixed(3) : null;
    b.pnl = b.ret - b.stake;
  }

  return { overall, byVersion, byDay, byMonth, total: list.length };
}
