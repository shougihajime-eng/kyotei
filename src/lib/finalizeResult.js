/**
 * Round 110: 予想 → 結果 → finalize を一元化するヘルパー
 *
 * 背景:
 *   App.jsx の refreshAll は当日のレースしか結果を取りに行かないため、
 *   過去のレース (昨日以前) の予想が永遠に「未確定」 のまま残るバグがあった。
 *
 *   構造的に直すには:
 *   ① finalize ロジックを純粋関数化 (App.jsx から抽出)
 *   ② 任意の予想セット + 結果 から最新化する backfillResults を提供
 *   ③ App.jsx の refreshAll でも同じ関数を呼び、 重複コードを排除
 *   ④ Verify 画面の「結果を取得」 ボタンからも同じ関数で更新
 *
 * これにより 「終わっているレースなのに、 まだ未確定」 という状態は
 * バックフィル機能の有無に依存せず、 起動時 + 手動更新で必ず解消される。
 */

import { fetchRaceResult } from "./api.js";
import { resolveJcd } from "./venueBias.js";

/**
 * 1 レース分の結果オブジェクトから 1 つの予想 record を最新化する。
 *
 * @param {object} prediction - localStorage から読んだ予想 (decision: buy/skip/...)
 * @param {object} apiResult  - { first, second, third, payouts }
 * @param {string} stamp      - ISO datetime
 * @returns {object} 更新済み prediction (元の参照は変更しない)
 */
export function applyResultToPrediction(prediction, apiResult, stamp) {
  if (!prediction || !apiResult?.first) return prediction;
  if (prediction.result?.first) return prediction; // 反映済はスキップ

  const winnerTri = `${apiResult.first}-${apiResult.second}-${apiResult.third}`;
  const winnerEx = `${apiResult.first}-${apiResult.second}`;
  const winnerWin = String(apiResult.first);

  const resultObj = {
    first: apiResult.first,
    second: apiResult.second,
    third: apiResult.third,
    payouts: apiResult.payouts,
    fetchedAt: stamp,
  };

  if (prediction.decision === "buy") {
    let payout = 0, hit = false;
    for (const c of (prediction.combos || [])) {
      const yenPer100 =
          c.kind === "3連単" ? apiResult.payouts?.trifecta?.[winnerTri]
        : c.kind === "2連単" ? apiResult.payouts?.exacta?.[winnerEx]
        : c.kind === "2連複" ? apiResult.payouts?.quinella?.[
            [apiResult.first, apiResult.second].sort((a, b) => a - b).join("=")
          ]
        : c.kind === "3連複" ? apiResult.payouts?.trio?.[
            [apiResult.first, apiResult.second, apiResult.third].sort((a, b) => a - b).join("=")
          ]
        : c.kind === "単勝"  ? apiResult.payouts?.tan?.[winnerWin]
        : 0;
      const winnerForKind =
          c.kind === "3連単" ? winnerTri
        : c.kind === "2連単" ? winnerEx
        : c.kind === "2連複" ? [apiResult.first, apiResult.second].sort((a, b) => a - b).join("=")
        : c.kind === "3連複" ? [apiResult.first, apiResult.second, apiResult.third].sort((a, b) => a - b).join("=")
        : winnerWin;
      const matched = c.combo === winnerForKind;
      if (matched && yenPer100) {
        payout += (c.stake / 100) * yenPer100;
        hit = true;
      }
    }
    return {
      ...prediction,
      result: resultObj,
      payout,
      hit,
      pnl: payout - (prediction.totalStake || 0),
      finalized: true,
    };
  }

  if (prediction.decision === "skip") {
    const im = prediction.intendedMain;
    let skipCorrect = true;
    let skipMissed = false;
    if (im?.combo && im.kind) {
      const winnerForKind =
          im.kind === "3連単" ? winnerTri
        : im.kind === "2連単" ? winnerEx
        : im.kind === "2連複" ? [apiResult.first, apiResult.second].sort((a, b) => a - b).join("=")
        : im.kind === "3連複" ? [apiResult.first, apiResult.second, apiResult.third].sort((a, b) => a - b).join("=")
        : winnerWin;
      if (im.combo === winnerForKind) { skipCorrect = false; skipMissed = true; }
    }
    return {
      ...prediction,
      result: resultObj,
      skipCorrect,
      skipMissed,
      finalized: true,
    };
  }

  return {
    ...prediction,
    result: resultObj,
    finalized: true,
  };
}

/**
 * predictions から 「結果がまだ未確定 + 日付が今日以前 + jcd / raceNo / date が判別可能」
 * を抽出し、 (date, jcd, raceNo) でグループ化して返す。
 *
 * @param {object} predictions - { key: prediction, ... }
 * @param {{ todayKey: string }} ctx - 例: "20260506"
 * @returns {Array<{ jcd, rno, date, hd, keys: string[] }>}
 */
export function findUnresolvedRaces(predictions, { todayKey }) {
  const groups = new Map(); // `${jcd}-${rno}-${hd}` → { jcd, rno, date, hd, keys: [] }
  for (const [key, p] of Object.entries(predictions || {})) {
    if (!p) continue;
    if (p.result?.first) continue; // 既に確定済
    if (p.virtual === false && p.manuallyRecorded && !p.intendedMain) continue; // 手動リアル舟券で結果未確定 → 手動入力前は触らない

    const jcd = p.jcd || resolveJcd(null, p.venue);
    const rno = +p.raceNo;
    const date = p.date;
    if (!jcd || !rno || !date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const hd = date.replace(/-/g, "");
    if (hd > todayKey) continue; // 未来日 → 結果無し

    const groupKey = `${jcd}-${rno}-${hd}`;
    let g = groups.get(groupKey);
    if (!g) {
      g = { jcd, rno, date, hd, keys: [] };
      groups.set(groupKey, g);
    }
    g.keys.push(key);
  }
  return Array.from(groups.values());
}

/**
 * 過去 + 今日の未確定予想に対して結果を取得し、 finalize する。
 *
 * @param {object} predictions
 * @param {{
 *   todayKey: string,
 *   onProgress?: (done, total, label) => void,
 *   maxFetch?: number,            // 最大何件まで API を叩くか (default 80)
 *   nocache?: boolean,             // result API のキャッシュをバイパス
 *   fetchFn?: (jcd, rno, dateK, opts) => Promise<object|null>, // テスト注入用
 *   now?: () => Date,
 * }} opts
 * @returns {Promise<{
 *   nextPredictions: object,
 *   updated: number,
 *   attempted: number,
 *   failed: number,
 *   skipped: number,
 *   errors: Array<{ key, error }>,
 * }>}
 */
export async function backfillResults(predictions, opts = {}) {
  const {
    todayKey,
    onProgress,
    maxFetch = 80,
    nocache = false,
    fetchFn = fetchRaceResult,
    now = () => new Date(),
  } = opts;

  if (!todayKey) throw new Error("backfillResults: todayKey is required");

  const groups = findUnresolvedRaces(predictions, { todayKey });
  const targets = groups.slice(0, maxFetch);
  const skipped = Math.max(0, groups.length - targets.length);

  const stamp = now().toISOString();
  let updated = 0, failed = 0;
  const errors = [];
  const next = { ...predictions };

  for (let i = 0; i < targets.length; i++) {
    const g = targets[i];
    if (onProgress) {
      try { onProgress(i, targets.length, `${g.date} jcd=${g.jcd} ${g.rno}R`); } catch {}
    }
    let apiResult = null;
    try {
      // dateK: API の hd は YYYYMMDD なので g.hd を渡す
      apiResult = await fetchFn(g.jcd, g.rno, g.hd, { nocache });
    } catch (e) {
      errors.push({ key: g.keys.join(","), error: String(e?.message || e) });
      failed++;
      continue;
    }
    if (!apiResult?.first) {
      // 結果未公開 (まだレース終わってない / API から取れない) → 失敗扱い (リトライ可能)
      failed++;
      continue;
    }
    let groupUpdated = false;
    for (const key of g.keys) {
      const before = next[key];
      const after = applyResultToPrediction(before, apiResult, stamp);
      if (after !== before) {
        next[key] = after;
        groupUpdated = true;
      }
    }
    if (groupUpdated) updated++;
  }
  if (onProgress) {
    try { onProgress(targets.length, targets.length, "完了"); } catch {}
  }

  return {
    nextPredictions: next,
    updated,
    attempted: targets.length,
    failed,
    skipped,
    errors,
  };
}
