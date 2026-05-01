/**
 * クラウド同期 — ローカル + Supabase を マージ (Round 45)
 *
 * 設計方針:
 * ・ローカル localStorage が「真実の primary 情報源」
 * ・ログイン時: ローカル → クラウド push (新規/更新)、クラウド → ローカル pull (他端末記録)
 * ・コンフリクト解決: snapshotAt 新しい方を採用 (last-write-wins)
 * ・ログイン失敗 / 通信失敗 でも localStorage は消えない
 * ・全予測を毎回送らず、変更分だけ upsert
 */
import { getSupabase, cloudEnabled } from "./supabaseClient.js";

const TABLE = "predictions";

/* === ローカル → クラウド push (差分 upsert) === */
export async function pushToCloud(userId, predictions) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: "未ログイン" };
  const list = Object.values(predictions || {});
  if (list.length === 0) return { ok: true, pushed: 0 };
  // Supabase 行に変換
  const rows = list.map((p) => ({
    user_id: userId,
    key: p.key,
    date: p.date || null,
    race_id: p.raceId || null,
    venue: p.venue || null,
    jcd: p.jcd || null,
    race_no: p.raceNo || null,
    start_time: p.startTime || null,
    decision: p.decision || null,
    combos: p.combos || null,
    total_stake: p.totalStake || 0,
    profile: p.profile || null,
    virtual: p.virtual === true ? true : (p.virtual === false ? false : null),
    result: p.result || null,
    payout: p.payout || 0,
    hit: !!p.hit,
    pnl: p.pnl ?? null,
    manually_recorded: !!p.manuallyRecorded,
    memo: p.memo || null,
    reflection: p.reflection || null,
    image_data: p.imageData || null,
    matched_ai: p.matchedAi == null ? null : !!p.matchedAi,
    snapshot_at: p.snapshotAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  try {
    // バッチで分けて upsert (1 リクエスト 200 件まで)
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
export async function pullFromCloud(userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: "未ログイン" };
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(2000);
    if (error) return { ok: false, error: error.message };
    // フォーマット復元
    const map = {};
    for (const r of data || []) {
      map[r.key] = {
        key: r.key,
        date: r.date,
        raceId: r.race_id,
        venue: r.venue,
        jcd: r.jcd,
        raceNo: r.race_no,
        startTime: r.start_time,
        decision: r.decision,
        combos: r.combos || [],
        totalStake: r.total_stake || 0,
        profile: r.profile,
        virtual: r.virtual,
        result: r.result || undefined,
        payout: r.payout || 0,
        hit: !!r.hit,
        pnl: r.pnl,
        manuallyRecorded: !!r.manually_recorded,
        memo: r.memo,
        reflection: r.reflection,
        imageData: r.image_data,
        matchedAi: r.matched_ai,
        snapshotAt: r.snapshot_at,
      };
    }
    return { ok: true, predictions: map, count: Object.keys(map).length };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === ローカル + クラウドをマージ ===
   ・両方にあるキー → snapshotAt 新しい方
   ・片方だけ → そのまま採用
*/
export function mergeLocalAndCloud(local, cloud) {
  const merged = { ...local };
  let cloudWon = 0, localWon = 0, cloudOnly = 0;
  for (const [key, c] of Object.entries(cloud || {})) {
    const l = merged[key];
    if (!l) {
      merged[key] = c;
      cloudOnly++;
    } else {
      const lTs = new Date(l.snapshotAt || 0).getTime();
      const cTs = new Date(c.snapshotAt || 0).getTime();
      if (cTs > lTs) {
        // 手動記録は local 優先 (画像 / 反省メモを失わない)
        if (l.manuallyRecorded && (l.imageData || l.reflection || l.memo)) {
          merged[key] = { ...c, ...l, snapshotAt: l.snapshotAt };
          localWon++;
        } else {
          merged[key] = c;
          cloudWon++;
        }
      } else {
        localWon++;
      }
    }
  }
  return { merged, cloudWon, localWon, cloudOnly };
}

/* === 完全同期 (ログイン時に呼ぶ) === */
export async function fullSync(userId, localPredictions) {
  if (!cloudEnabled() || !userId) return { ok: false, error: "未ログイン" };
  // 1. クラウドから pull
  const pulled = await pullFromCloud(userId);
  if (!pulled.ok) return { ok: false, error: `クラウド取得失敗: ${pulled.error}` };
  // 2. マージ
  const { merged, cloudWon, localWon, cloudOnly } = mergeLocalAndCloud(localPredictions, pulled.predictions);
  // 3. マージ結果を push (ローカル側の差分をクラウドへ)
  const pushed = await pushToCloud(userId, merged);
  if (!pushed.ok) return { ok: false, error: `クラウド送信失敗: ${pushed.error}`, merged };
  return {
    ok: true,
    merged,
    stats: { pulled: pulled.count, pushed: pushed.pushed, cloudWon, localWon, cloudOnly },
  };
}

/* === 軽量同期 (起動後・予測保存後) ===
   差分だけを upsert (pull はしない、定期 fullSync で対応) */
export async function lightSync(userId, localPredictions) {
  if (!cloudEnabled() || !userId) return { ok: false, error: "未ログイン" };
  return await pushToCloud(userId, localPredictions);
}
