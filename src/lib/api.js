/**
 * Vercel Serverless Functions (/api/*) を呼ぶフェッチヘルパ。
 * いずれも例外を投げず、失敗時は { ok:false, error, stale?, lastFetchedAt? } を返す。
 *
 * Round 34: 開催中に「データ不足」 で逃げないための強化:
 *   ・最大 5 回リトライ (指数バックオフ + ジッター)
 *   ・直前成功キャッシュ (_lastSuccess) を URL 単位で保持
 *   ・最終リトライも失敗したら、キャッシュがあれば stale データを返す
 *   ・呼び出し側は data.stale=true で「更新中 (最終取得 12:34)」 表示が可能
 */

const MEMO_TTL_MS = 1000;
const _memo = new Map();         // url → { ts, promise } (in-flight 重複呼び出し抑制)
const _lastSuccess = new Map();  // url → { ts, data } (リトライ全敗時のフォールバック)

const MAX_RETRIES = 5;

/* リトライ進捗を UI に伝えるためのコールバック (グローバル) */
let _retryListener = null;
export function setRetryListener(fn) { _retryListener = fn; }

function emitRetry(url, attempt, max) {
  if (_retryListener) try { _retryListener({ url, attempt, max }); } catch {}
}

export async function fetchJSON(url, opts = {}) {
  const now = Date.now();
  const cached = _memo.get(url);
  if (cached && now - cached.ts < MEMO_TTL_MS) {
    return cached.promise;
  }
  const p = doFetchWithRetry(url, opts, MAX_RETRIES);
  _memo.set(url, { ts: now, promise: p });
  setTimeout(() => { _memo.delete(url); }, MEMO_TTL_MS + 100);
  return p;
}

async function doFetchWithRetry(url, opts = {}, retriesLeft = MAX_RETRIES) {
  const attempt = MAX_RETRIES - retriesLeft + 1;
  emitRetry(url, attempt, MAX_RETRIES);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", ...(opts.headers || {}) },
      signal: opts.signal,
    });
    if (r.status === 429) {
      if (retriesLeft > 0) {
        await sleep(2000 + Math.random() * 1500);
        return doFetchWithRetry(url, opts, retriesLeft - 1);
      }
      return staleFallback(url, "Rate limited (429)");
    }
    if (r.status >= 500 && retriesLeft > 0) {
      await sleep((MAX_RETRIES - retriesLeft) * 800 + Math.random() * 400);
      return doFetchWithRetry(url, opts, retriesLeft - 1);
    }
    if (!r.ok) {
      // 4xx は即諦め、ただし stale fallback あれば返す
      return staleFallback(url, `HTTP ${r.status}`);
    }
    const data = await r.json();
    if (data?.ok !== false) {
      // 成功 → last-success キャッシュ更新
      _lastSuccess.set(url, { ts: Date.now(), data });
    }
    return data;
  } catch (e) {
    if (retriesLeft > 0) {
      await sleep((MAX_RETRIES - retriesLeft) * 600 + Math.random() * 400);
      return doFetchWithRetry(url, opts, retriesLeft - 1);
    }
    return staleFallback(url, String(e?.message || e || "fetch failed"));
  }
}

function staleFallback(url, error) {
  const last = _lastSuccess.get(url);
  if (last) {
    return { ...last.data, stale: true, lastFetchedAt: last.ts, error };
  }
  return { ok: false, error };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchTodaySchedule() {
  return fetchJSON("/api/today");
}

export async function fetchRaceProgram(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/program?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j?.ok !== false ? j : null;
}

export async function fetchRaceOdds(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/odds?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j?.ok !== false ? j : null;
}

export async function fetchRaceResult(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/result?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j?.ok !== false ? j : null;
}

export async function fetchBeforeInfo(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/beforeinfo?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j?.ok !== false ? j : null;
}

/* デバッグ用: stale キャッシュ件数を確認 */
export function getCacheStats() {
  return { lastSuccessCount: _lastSuccess.size, inflightCount: _memo.size };
}
