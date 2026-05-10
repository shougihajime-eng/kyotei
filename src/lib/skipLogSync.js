/**
 * 万舟研究所 — 見送りログのクラウド同期 (Supabase manfune_lab.skip_log)
 *
 * 設計原則:
 *   ・localStorage が真実の primary、 cloud は端末間バックアップ
 *   ・push 失敗 / pull 失敗どちらでも local は壊さない
 *   ・finalized=true の行は cloud → local に降りてきても上書きしない
 *     (判断時点を確定させるため)
 *   ・upsert は (user_id, key) コンフリクトキーで idempotent
 *
 * 利用イメージ:
 *   ① ログイン直後 → fullSyncSkipLog(userId)
 *   ② recordBatch 後 → pushSkipLog(userId)
 */

import { getSupabase, cloudEnabled } from "./supabaseClient.js";

const TABLE = "skip_log";

/* === local エントリ → DB row 形 === */
export function toRow(userId, e) {
  if (!userId || !e?.key) return null;
  return {
    user_id: userId,
    key: e.key,
    date: e.date,
    jcd: e.jcd,
    race_no: e.raceNo,
    venue: e.venue || null,
    start_time: e.startTime || null,
    score: e.score ?? null,
    level: e.level || null,
    rating: e.rating || null,
    judgement: e.judgement || null,
    focus: e.focus || null,
    parts: e.parts || null,
    boost: e.boost || 0,
    result: e.result || null,
    is_missed_mansyu: e.isMissedMansyu === true ? true : (e.isMissedMansyu === false ? false : null),
    finalized: !!e.finalized,
    recorded_at: e.recordedAt ? new Date(e.recordedAt).toISOString() : new Date().toISOString(),
    updated_at: e.updatedAt ? new Date(e.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/* === DB row → local エントリ === */
export function fromRow(r) {
  if (!r?.key) return null;
  return {
    key: r.key,
    date: r.date,
    jcd: r.jcd,
    raceNo: r.race_no,
    venue: r.venue,
    startTime: r.start_time,
    score: r.score,
    level: r.level,
    rating: r.rating,
    judgement: r.judgement,
    focus: r.focus || [],
    parts: r.parts || {},
    boost: r.boost || 0,
    result: r.result || null,
    isMissedMansyu: r.is_missed_mansyu,
    finalized: !!r.finalized,
    recordedAt: r.recorded_at ? Date.parse(r.recorded_at) : Date.now(),
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  };
}

/* === ローカル → クラウド push (差分 upsert) === */
export async function pushSkipLog(userId, log) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: "未ログイン or Supabase 未設定" };
  if (!Array.isArray(log) || log.length === 0) return { ok: true, pushed: 0 };
  const rows = log.map((e) => toRow(userId, e)).filter(Boolean);
  if (rows.length === 0) return { ok: true, pushed: 0 };
  try {
    const BATCH = 200;
    let pushed = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from(TABLE)
        .upsert(slice, { onConflict: "user_id,key" });
      if (error) return { ok: false, error: error.message, pushed };
      pushed += slice.length;
    }
    return { ok: true, pushed };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === クラウド → ローカル pull === */
export async function pullSkipLog(userId, opts = {}) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: "未ログイン or Supabase 未設定" };
  const { limit = 5000 } = opts;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(limit);
    if (error) return { ok: false, error: error.message };
    const list = [];
    for (const r of data || []) {
      if (r.user_id !== userId) continue;
      const e = fromRow(r);
      if (e) list.push(e);
    }
    return { ok: true, log: list, count: list.length };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === マージ (local を絶対に壊さない) ===
   ・finalized=true の local 行は cloud で上書きしない
   ・両方 finalized 同士は updated_at 新しい方
   ・両方 non-finalized なら updated_at 新しい方 */
export function mergeSkipLogs(local, cloud) {
  const localArr = Array.isArray(local) ? local : [];
  const cloudArr = Array.isArray(cloud) ? cloud : [];
  const map = new Map();
  for (const e of localArr) {
    if (e?.key) map.set(e.key, e);
  }
  for (const c of cloudArr) {
    if (!c?.key) continue;
    const l = map.get(c.key);
    if (!l) {
      map.set(c.key, c);
      continue;
    }
    if (l.finalized && !c.finalized) {
      // local 確定済 → 必ず local 採用 (結果消えない保護)
      continue;
    }
    if (!l.finalized && c.finalized) {
      // cloud 確定済 → cloud 採用 (別端末で結果埋まった)
      map.set(c.key, c);
      continue;
    }
    // 両方 finalized / 両方 non-finalized → updated_at 新しい方
    const lTs = l.updatedAt || 0;
    const cTs = c.updatedAt || 0;
    map.set(c.key, cTs > lTs ? c : l);
  }
  return Array.from(map.values());
}

/* === 完全同期 (ログイン時に呼ぶ) ===
   pull → merge → push を 1 セット。 pull 失敗時は local 不変。 */
export async function fullSyncSkipLog(userId, localLog) {
  if (!cloudEnabled() || !userId) return { ok: false, error: "未ログイン" };
  const pulled = await pullSkipLog(userId);
  if (!pulled.ok) {
    return { ok: false, error: `クラウド取得失敗: ${pulled.error}` };
  }
  const merged = mergeSkipLogs(localLog, pulled.log);
  const pushed = await pushSkipLog(userId, merged);
  if (!pushed.ok) {
    return {
      ok: false,
      error: `クラウド送信失敗 (再試行で挽回): ${pushed.error}`,
      merged,
      partialOk: true,
      stats: { pulled: pulled.count, pushed: pushed.pushed || 0 },
    };
  }
  return {
    ok: true,
    merged,
    stats: { pulled: pulled.count, pushed: pushed.pushed },
  };
}

/* === 軽量 push (recordBatch 後に呼ぶ) ===
   差分検出はせず全件 upsert (200 件単位なので問題なし)。 */
export async function lightPushSkipLog(userId, localLog) {
  if (!cloudEnabled() || !userId) return { ok: false, error: "未ログイン" };
  return await pushSkipLog(userId, localLog);
}
