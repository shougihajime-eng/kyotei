/**
 * Vercel Serverless Functions (/api/*) を呼ぶフェッチヘルパ。
 * いずれも例外を投げず、失敗時は { ok:false, error } を返す。
 */

export async function fetchJSON(url) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
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
