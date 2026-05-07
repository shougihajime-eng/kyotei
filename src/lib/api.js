/**
 * Vercel Serverless Functions (/api/*) を呼ぶフェッチヘルパ。
 * いずれも例外を投げず、失敗時は { ok:false, error, stale?, lastFetchedAt? } を返す。
 *
 * Round 91: レート制限ハードニング (boatrace.jp の 429 対策)
 *   ・グローバル スロットル (同時 3 + 最小間隔 300ms)
 *   ・指数バックオフ (全エラーケース、 jitter あり、 上限 30s)
 *   ・エンドポイント別 result cache TTL (schedule=5min / odds=10s 等)
 *   ・in-flight dedup (短期 1s)
 *   ・rate-limit イベントを UI へ通知
 *   ・stale fallback で UI を絶対に空にしない
 */

/* === グローバル スロットル ===
 * Round 112: 同時 3→8、 間隔 300→80ms に緩和 (世界一の体感速度を目指す)
 *   ・boatrace.jp 直叩きではなく Vercel エッジ経由 (s-maxage キャッシュあり) なので
 *     上流負荷はほぼキャッシュで吸収される。
 *   ・ブラウザ標準の同時 fetch 上限 (HTTP/2 で 100+) と比べて 8 は十分控えめ。
 *   ・429 が来たら従来通り指数バックオフでリトライするので破綻しない。
 */
const MAX_CONCURRENT = 8;       // 同時実行上限 (旧 3)
const MIN_INTERVAL_MS = 80;      // 連続リクエスト最小間隔 ms (旧 300)
const MAX_BACKOFF_MS = 30 * 1000; // バックオフ上限 30 秒
const MAX_RETRIES = 5;

class Throttle {
  constructor(maxConcurrent, minIntervalMs) {
    this.maxConcurrent = maxConcurrent;
    this.minIntervalMs = minIntervalMs;
    this.active = 0;
    this.queue = [];
    this.lastStart = 0;
  }
  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this._drain();
    });
  }
  _drain() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) return;
    const now = Date.now();
    const wait = Math.max(0, this.lastStart + this.minIntervalMs - now);
    setTimeout(() => {
      if (this.active >= this.maxConcurrent || this.queue.length === 0) return;
      const resolve = this.queue.shift();
      if (!resolve) return;
      this.active++;
      this.lastStart = Date.now();
      resolve();
      if (this.active < this.maxConcurrent && this.queue.length > 0) this._drain();
    }, wait);
  }
  release() {
    this.active = Math.max(0, this.active - 1);
    this._drain();
  }
  stats() {
    return { active: this.active, queued: this.queue.length };
  }
}
const _throttle = new Throttle(MAX_CONCURRENT, MIN_INTERVAL_MS);

/* === キャッシュ層 === */
const _inflight = new Map();      // url → { ts, promise } 同一リクエスト重複防止
const _resultCache = new Map();   // url → { ts, data } 成功結果キャッシュ (TTL 別)
const _lastSuccess = new Map();   // url → { ts, data } stale fallback 用 (TTL 無視)
const INFLIGHT_TTL_MS = 1000;

/* エンドポイント別 result cache TTL */
function getTtlForUrl(url) {
  if (url.startsWith("/api/today")) return 5 * 60 * 1000;       // 5 分 (スケジュールはほぼ不変)
  if (url.startsWith("/api/news")) return 10 * 60 * 1000;       // 10 分
  if (url.startsWith("/api/program")) return 60 * 1000;          // 1 分 (出走表は安定)
  if (url.startsWith("/api/result")) return 5 * 60 * 1000;       // 5 分 (確定後は不変)
  if (url.startsWith("/api/beforeinfo")) return 30 * 1000;       // 30 秒
  if (url.startsWith("/api/odds")) return 10 * 1000;             // 10 秒 (発走前は変動)
  if (url.startsWith("/api/racer")) return 24 * 60 * 60 * 1000;  // 24 時間 (選手情報は静的)
  return 1000;
}

/* === UI 通知 listener === */
let _retryListener = null;
let _rateLimitListener = null;
export function setRetryListener(fn) { _retryListener = fn; }
export function setRateLimitListener(fn) { _rateLimitListener = fn; }

function emitRetry(url, attempt, max) {
  if (_retryListener) try { _retryListener({ url, attempt, max }); } catch {}
}
function emitRateLimit(url, retryAfterMs) {
  if (_rateLimitListener) try { _rateLimitListener({ url, retryAfterMs, ts: Date.now() }); } catch {}
}

/* === 指数バックオフ + jitter (上限 MAX_BACKOFF_MS) === */
function backoffMs(attempt, base = 800) {
  const exp = Math.min(MAX_BACKOFF_MS, base * Math.pow(2, attempt - 1));
  return exp + Math.random() * 400;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* === 公開 API === */
export async function fetchJSON(url, opts = {}) {
  const now = Date.now();

  // nocache オプション: result cache + lastSuccess を無視して必ず fetch する
  // (Round 110: 結果バックフィルのように 「絶対に最新を取りたい」 用途)
  const nocache = !!opts.nocache;

  // Layer 1: in-flight dedup (1 秒以内の同一 URL は同じ Promise を共有)
  if (!nocache) {
    const inflight = _inflight.get(url);
    if (inflight && now - inflight.ts < INFLIGHT_TTL_MS) {
      return inflight.promise;
    }
  }

  // Layer 2: result cache hit (エンドポイント別 TTL)
  if (!nocache) {
    const cached = _resultCache.get(url);
    const ttl = getTtlForUrl(url);
    if (cached && now - cached.ts < ttl) {
      return Promise.resolve(cached.data);
    }
  } else {
    // nocache 時は cache を消して次回以降にも影響しないように
    _resultCache.delete(url);
  }

  // Layer 3: throttled fetch (同時 3 + 間隔 300ms 以上)
  const p = (async () => {
    await _throttle.acquire();
    try {
      const data = await doFetchWithRetry(url, opts, MAX_RETRIES);
      if (data?.ok !== false) {
        _resultCache.set(url, { ts: Date.now(), data });
        _lastSuccess.set(url, { ts: Date.now(), data });
      }
      return data;
    } finally {
      _throttle.release();
    }
  })();
  _inflight.set(url, { ts: now, promise: p });
  setTimeout(() => _inflight.delete(url), INFLIGHT_TTL_MS + 100);
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
    // 429: レート制限 → 指数バックオフ + UI 通知
    if (r.status === 429) {
      const retryAfter = parseInt(r.headers.get("retry-after") || "0", 10);
      const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS) : backoffMs(attempt, 2000);
      emitRateLimit(url, waitMs);
      if (retriesLeft > 0) {
        await sleep(waitMs);
        return doFetchWithRetry(url, opts, retriesLeft - 1);
      }
      return staleFallback(url, "Rate limited (429)");
    }
    // 5xx / ネットワーク等の transient エラー → バックオフ
    if (r.status >= 500 && retriesLeft > 0) {
      await sleep(backoffMs(attempt, 800));
      return doFetchWithRetry(url, opts, retriesLeft - 1);
    }
    if (!r.ok) {
      return staleFallback(url, `HTTP ${r.status}`);
    }
    const data = await r.json();
    return data;
  } catch (e) {
    if (retriesLeft > 0) {
      await sleep(backoffMs(attempt, 600));
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

/* === 公開ラッパ === */
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

export async function fetchRaceResult(jcd, rno, dateStr, opts = {}) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/result?jcd=${jcd}&rno=${rno}&date=${dateStr}`, opts);
  return j?.ok !== false ? j : null;
}

export async function fetchBeforeInfo(jcd, rno, dateStr) {
  if (!jcd || !rno || !dateStr) return null;
  const j = await fetchJSON(`/api/beforeinfo?jcd=${jcd}&rno=${rno}&date=${dateStr}`);
  return j?.ok !== false ? j : null;
}

/* === 手動キャッシュクリア (Settings リセット時に呼ぶ) === */
export function clearApiCaches() {
  _inflight.clear();
  _resultCache.clear();
  _lastSuccess.clear();
}

/* === デバッグ統計 === */
export function getCacheStats() {
  return {
    inflightCount: _inflight.size,
    resultCacheCount: _resultCache.size,
    lastSuccessCount: _lastSuccess.size,
    throttle: _throttle.stats(),
  };
}
