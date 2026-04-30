/**
 * Vercel Serverless Functions (/api/*) を呼ぶフェッチヘルパ。
 * いずれも例外を投げず、失敗時は { ok:false, error } を返す。
 *
 * リトライ機構:
 *   ・5xx / network エラー時のみ最大 2 回リトライ (指数バックオフ)
 *   ・4xx は再試行しない (URL ミス / 引数誤り)
 *   ・連続呼び出し抑制: 同一 URL は 1 秒以内に再 fetch しない (in-memory cache)
 */

const MEMO_TTL_MS = 1000;
const _memo = new Map(); // url → { ts, promise }

export async function fetchJSON(url, opts = {}) {
  const now = Date.now();
  const cached = _memo.get(url);
  if (cached && now - cached.ts < MEMO_TTL_MS) {
    return cached.promise;
  }
  const p = doFetchWithRetry(url, opts);
  _memo.set(url, { ts: now, promise: p });
  // 成功 / 失敗どちらでも 1 秒で memo expire
  setTimeout(() => { _memo.delete(url); }, MEMO_TTL_MS + 100);
  return p;
}

async function doFetchWithRetry(url, opts = {}, retriesLeft = 2) {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", ...(opts.headers || {}) },
      signal: opts.signal,
    });
    if (r.status === 429) {
      // Rate limit → 待ってリトライ
      if (retriesLeft > 0) {
        await sleep(1500 + Math.random() * 1000);
        return doFetchWithRetry(url, opts, retriesLeft - 1);
      }
      return { ok: false, error: "Rate limited (429) — 一時的に混雑しています" };
    }
    if (r.status >= 500 && retriesLeft > 0) {
      // サーバーエラーは指数バックオフでリトライ
      await sleep((3 - retriesLeft) * 800 + Math.random() * 400);
      return doFetchWithRetry(url, opts, retriesLeft - 1);
    }
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    // ネットワークエラー → 指数バックオフでリトライ
    if (retriesLeft > 0) {
      await sleep((3 - retriesLeft) * 600 + Math.random() * 400);
      return doFetchWithRetry(url, opts, retriesLeft - 1);
    }
    return { ok: false, error: String(e?.message || e || "fetch failed") };
  }
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
  return j.ok ? j : null;
}

export async function fetchRaceOdds(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/odds?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j.ok ? j : null;
}

export async function fetchRaceResult(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/result?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j.ok ? j : null;
}

export async function fetchBeforeInfo(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/beforeinfo?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j.ok ? j : null;
}
