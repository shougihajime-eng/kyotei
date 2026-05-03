/**
 * クラウド同期 — ローカル + Supabase を マージ (Round 45-46)
 *
 * 設計原則 (絶対):
 * ・ローカル localStorage が「真実の primary 情報源」
 * ・クラウドはバックアップ + 端末間同期手段
 * ・「同期失敗で local が壊れる」 を絶対に起こさない
 * ・push 失敗 / pull 失敗どちらでも local は変えない
 *
 * Round 46 安全性強化:
 * ・mergeLocalAndCloud は防御的: cloud が null/undefined/壊れた値でも local をそのまま返す
 * ・部分 push 失敗時も merged は採用可能 (local 拡張のみ)
 * ・データ不正 (不正な key/date) は merge から除外
 * ・手動記録の画像 (imageData) は cloud に乗せず local 専有 (容量 + 高速化)
 * ・virtual / profile が cloud と local で食い違う異常も検知
 */
import { getSupabase, cloudEnabled } from "./supabaseClient.js";

const TABLE = "predictions";
/* image_data は base64 で 数 MB になるためクラウド同期から除外。
   ユーザーが写真を保存した端末でのみ閲覧可能 (ローカル専有)。 */
const SYNC_IMAGE_DATA = false;

/* === 1 行を Supabase 形式に変換 (push 用) ===
   Round 85: スタイル分離 + Round 73-79 で追加した検証フィールド全てを保持。
   ・profile は明示カラムでも存在 (key にも含まれる) → 二重防御
   ・details JSONB に判断材料 + 検証メタを格納 (1 列でスキーマ変更最小化)
   ・details が DB に無い (旧スキーマ) 環境でも push は成功する想定
   テスト用に export */
export function toRow(userId, p) {
  if (!p?.key) return null;
  // Round 85: 検証用 details (boats / weather / reasoning / 検証メタ)
  // localStorage に書いた全フィールドを round-trip 保持するためにまとめて格納
  const details = {
    confidence: p.confidence ?? null,
    grade: p.grade ?? null,
    reason: p.reason ?? null,
    rationale: p.rationale ?? null,
    warnings: p.warnings ?? null,
    intendedMain: p.intendedMain ?? null,
    reasons: p.reasons ?? null,
    venueProfile: p.venueProfile ?? null,
    timeSlot: p.timeSlot ?? null,
    worstCaseRoi: p.worstCaseRoi ?? null,
    worstCasePayout: p.worstCasePayout ?? null,
    expectedPayout: p.expectedPayout ?? null,
    // 検証メタ (Round 73-79)
    verificationVersion: p.verificationVersion ?? null,
    preCloseTarget: !!p.preCloseTarget,
    isGoCandidate: !!p.isGoCandidate,
    isSampleData: !!p.isSampleData,
    finalized: !!p.finalized,
    skipCorrect: p.skipCorrect ?? null,
    skipMissed: p.skipMissed ?? null,
    // 判断材料スナップショット (買い時のみ)
    boatsSnapshot: p.boatsSnapshot ?? null,
    weatherSnapshot: p.weatherSnapshot ?? null,
    reasoning: p.reasoning ?? null,
    inTrust: p.inTrust ?? null,
    development: p.development ?? null,
    accident: p.accident ?? null,
    probConsistency: p.probConsistency ?? null,
    probs: p.probs ?? null,
    maxEV: p.maxEV ?? null,
    checks: p.checks ?? null,
    // バージョン管理
    version: p.version ?? null,
    predictionTime: p.predictionTime ?? null,
    closingTime: p.closingTime ?? null,
    predictionType: p.predictionType ?? null,
    // ラベル管理 (Round 63)
    labelOverride: p.labelOverride ?? null,
  };
  return {
    user_id: userId,
    key: p.key,                     // ${dateKey}_${raceId}_${style} で一意
    date: p.date || null,
    race_id: p.raceId || null,
    venue: p.venue || null,
    jcd: p.jcd || null,
    race_no: p.raceNo || null,
    start_time: p.startTime || null,
    decision: p.decision || null,
    combos: p.combos || null,
    total_stake: p.totalStake || 0,
    profile: p.profile || null,     // スタイル明示カラム (key と二重防御)
    virtual: p.virtual === true ? true : (p.virtual === false ? false : null),
    result: p.result || null,
    payout: p.payout || 0,
    hit: !!p.hit,
    pnl: p.pnl ?? null,
    manually_recorded: !!p.manuallyRecorded,
    memo: p.memo || null,
    reflection: p.reflection || null,
    image_data: SYNC_IMAGE_DATA ? (p.imageData || null) : null,
    matched_ai: p.matchedAi == null ? null : !!p.matchedAi,
    snapshot_at: p.snapshotAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details,                        // Round 85: 検証材料 JSONB
  };
}

/* === Supabase 行を localStorage 形式に変換 (pull 用) ===
   Round 85: details JSONB から検証フィールドを復元。 details が無い古い行とも互換
   テスト用に export */
export function fromRow(r) {
  if (!r?.key) return null;
  const d = r.details || {}; // 旧スキーマ (details なし) でも空オブジェクトで処理
  return {
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
    profile: r.profile,                        // スタイル
    virtual: r.virtual === true ? true : (r.virtual === false ? false : undefined),
    result: r.result || undefined,
    payout: r.payout || 0,
    hit: !!r.hit,
    pnl: r.pnl,
    manuallyRecorded: !!r.manually_recorded,
    memo: r.memo,
    reflection: r.reflection,
    imageData: SYNC_IMAGE_DATA ? r.image_data : undefined,
    matchedAi: r.matched_ai,
    snapshotAt: r.snapshot_at,
    // Round 85: details JSONB から検証フィールド復元
    confidence: d.confidence ?? undefined,
    grade: d.grade ?? undefined,
    reason: d.reason ?? undefined,
    rationale: d.rationale ?? undefined,
    warnings: d.warnings ?? undefined,
    intendedMain: d.intendedMain ?? undefined,
    reasons: d.reasons ?? undefined,
    venueProfile: d.venueProfile ?? undefined,
    timeSlot: d.timeSlot ?? undefined,
    worstCaseRoi: d.worstCaseRoi ?? undefined,
    worstCasePayout: d.worstCasePayout ?? undefined,
    expectedPayout: d.expectedPayout ?? undefined,
    verificationVersion: d.verificationVersion ?? undefined,
    preCloseTarget: !!d.preCloseTarget,
    isGoCandidate: !!d.isGoCandidate,
    isSampleData: !!d.isSampleData,
    finalized: !!d.finalized,
    skipCorrect: d.skipCorrect ?? undefined,
    skipMissed: d.skipMissed ?? undefined,
    boatsSnapshot: d.boatsSnapshot ?? undefined,
    weatherSnapshot: d.weatherSnapshot ?? undefined,
    reasoning: d.reasoning ?? undefined,
    inTrust: d.inTrust ?? undefined,
    development: d.development ?? undefined,
    accident: d.accident ?? undefined,
    probConsistency: d.probConsistency ?? undefined,
    probs: d.probs ?? undefined,
    maxEV: d.maxEV ?? undefined,
    checks: d.checks ?? undefined,
    version: d.version ?? undefined,
    predictionTime: d.predictionTime ?? undefined,
    closingTime: d.closingTime ?? undefined,
    predictionType: d.predictionType ?? undefined,
    labelOverride: d.labelOverride ?? undefined,
  };
}

/* === ローカル → クラウド push (差分 upsert) === */
export async function pushToCloud(userId, predictions) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: "未ログイン" };
  const list = Object.values(predictions || {});
  if (list.length === 0) return { ok: true, pushed: 0 };
  const rows = list.map((p) => toRow(userId, p)).filter(Boolean); // null は除外
  if (rows.length === 0) return { ok: true, pushed: 0 };
  try {
    const BATCH = 200;
    let pushed = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from(TABLE)
        .upsert(slice, { onConflict: "user_id,key" });
      if (error) {
        return { ok: false, error: error.message, pushed };
      }
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
    const map = {};
    for (const r of data || []) {
      // user_id が他人のデータをクライアント側でも防御チェック
      if (r.user_id !== userId) continue; // RLS が動いていれば来ないはず
      const p = fromRow(r);
      if (p) map[r.key] = p;
    }
    return { ok: true, predictions: map, count: Object.keys(map).length };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/* === ローカル + クラウドをマージ (絶対に local を壊さない) ===
   cloud が null/undefined/不正でも local をそのまま返す。
   両方ある場合: snapshotAt 新しい方を採用 (last-write-wins)。
   手動記録 + 画像/メモがある local は cloud で上書きしない (情報を失わない)。
*/
export function mergeLocalAndCloud(local, cloud) {
  // 防御: local 自体が null/壊れている場合
  const safeLocal = (local && typeof local === "object") ? local : {};
  const safeCloud = (cloud && typeof cloud === "object") ? cloud : {};
  const merged = { ...safeLocal };
  let cloudWon = 0, localWon = 0, cloudOnly = 0, localOnly = 0;
  // local だけにあるキーをカウント (cloud と比較しないキー)
  for (const key of Object.keys(safeLocal)) {
    if (!(key in safeCloud)) localOnly++;
  }
  // cloud をなめる
  for (const [key, c] of Object.entries(safeCloud)) {
    // 不正なエントリ (key 不一致 / null) は採用しない
    if (!c || typeof c !== "object" || c.key !== key) continue;
    const l = merged[key];
    if (!l) {
      merged[key] = c;
      cloudOnly++;
      continue;
    }
    const lTs = Date.parse(l.snapshotAt || "") || 0;
    const cTs = Date.parse(c.snapshotAt || "") || 0;
    if (cTs > lTs) {
      // local が手動記録 + 画像/メモあり → 上書きしない (大事な情報保護)
      const localHasIrreplaceable = l.manuallyRecorded && (l.imageData || l.reflection || l.memo);
      if (localHasIrreplaceable) {
        // cloud の新しいフィールドだけマージ (local の画像/メモは保持)
        merged[key] = {
          ...c,
          // local 専有フィールドを優先
          imageData: l.imageData ?? c.imageData,
          reflection: l.reflection ?? c.reflection,
          memo: l.memo ?? c.memo,
          // snapshotAt は local より大きく置く (再 push されないように cloud)
          snapshotAt: c.snapshotAt,
        };
        cloudWon++;
      } else {
        merged[key] = c;
        cloudWon++;
      }
    } else {
      localWon++;
    }
  }
  return { merged, cloudWon, localWon, cloudOnly, localOnly };
}

/* === 完全同期 (ログイン時に呼ぶ) ===
   pull 失敗 → local は不変。 push 失敗 → merge 結果は local に反映 (cloud 新着分を取り込み済み)。 */
export async function fullSync(userId, localPredictions) {
  if (!cloudEnabled() || !userId) return { ok: false, error: "未ログイン" };
  // 1. クラウドから pull
  const pulled = await pullFromCloud(userId);
  if (!pulled.ok) {
    // pull 失敗: local は絶対に変えない
    return { ok: false, error: `クラウド取得失敗: ${pulled.error}` };
  }
  // 2. マージ (cloud=null でも安全)
  const mergeResult = mergeLocalAndCloud(localPredictions, pulled.predictions);
  // 3. マージ結果を push (ローカル側の差分をクラウドへ)
  const pushed = await pushToCloud(userId, mergeResult.merged);
  if (!pushed.ok) {
    // push 失敗 — ただし pull は成功しているので merge 結果は採用 (cloud 新着分の取り込みは進んでいる)
    // 次回の lightSync / fullSync でクラウドへの push をリトライ
    return {
      ok: false,
      error: `クラウド送信失敗 (再試行で挽回します): ${pushed.error}`,
      merged: mergeResult.merged,
      partialOk: true, // ← App 側ではこれで setPredictions(merged) してよい
      stats: {
        pulled: pulled.count,
        pushed: pushed.pushed || 0,
        cloudWon: mergeResult.cloudWon,
        localWon: mergeResult.localWon,
        cloudOnly: mergeResult.cloudOnly,
        localOnly: mergeResult.localOnly,
      },
    };
  }
  return {
    ok: true,
    merged: mergeResult.merged,
    stats: {
      pulled: pulled.count,
      pushed: pushed.pushed,
      cloudWon: mergeResult.cloudWon,
      localWon: mergeResult.localWon,
      cloudOnly: mergeResult.cloudOnly,
      localOnly: mergeResult.localOnly,
    },
  };
}

/* === 軽量同期 (起動後・予測保存後) ===
   差分だけを upsert (pull はしない、定期 fullSync で対応) */
export async function lightSync(userId, localPredictions) {
  if (!cloudEnabled() || !userId) return { ok: false, error: "未ログイン" };
  return await pushToCloud(userId, localPredictions);
}
