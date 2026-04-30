import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { yen } from "../lib/format.js";
import { judgeAIReliability, evaluateSkipQuality } from "../lib/analysis.js";

/**
 * 📈 グラフ画面 — エア/リアル別の累計収支・日別収支・回収率・的中率・券種別成績
 *
 *   ・タブで [エア舟券] [リアル舟券] [比較] を切替
 *   ・最低 1 週間分のデータを時系列でグラフ化
 *   ・アニメーション無し (isAnimationActive=false) で揺れ防止
 *   ・トップに「最終更新: ◯ 秒前」表示
 */
export default function Stats({ predictions, lastRefreshAt }) {
  const [tab, setTab] = useState("air"); // air | real | compare

  const all = useMemo(() => Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && p.totalStake > 0 && p.result?.first)
    .sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || ""))),
  [predictions]);

  const air = useMemo(() => all.filter((p) => p.virtual !== false), [all]);
  const real = useMemo(() => all.filter((p) => p.virtual === false), [all]);

  return (
    <div className="max-w-4xl mx-auto px-4 mt-4 space-y-4">
      {/* タブ */}
      <div className="flex gap-2">
        <button onClick={() => setTab("air")} className={"tab-btn flex-1 " + (tab === "air" ? "active" : "")}>🧪 エア舟券</button>
        <button onClick={() => setTab("real")} className={"tab-btn flex-1 " + (tab === "real" ? "active" : "")}>💰 リアル舟券</button>
        <button onClick={() => setTab("compare")} className={"tab-btn flex-1 " + (tab === "compare" ? "active" : "")}>⚖️ 比較</button>
      </div>

      {/* 最終更新表示 */}
      <div className="text-xs opacity-60 text-right" style={{ minHeight: 16 }}>
        最終更新: {lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString("ja-JP") : "—"}
      </div>

      {/* AI 信頼度パネル — 「このAIを信じていいか」 */}
      <AITrustPanel predictions={predictions} />

      {tab === "compare"
        ? <CompareView air={air} real={real} />
        : <SingleView items={tab === "air" ? air : real} label={tab === "air" ? "エア" : "リアル"} />}
    </div>
  );
}

/* AI 信頼度パネル */
function AITrustPanel({ predictions }) {
  const trust = useMemo(() => judgeAIReliability(predictions), [predictions]);
  const skip = useMemo(() => evaluateSkipQuality(predictions), [predictions]);
  return (
    <section className="card p-4" style={{ minHeight: 140, borderColor: trust.color, borderWidth: 2 }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="font-bold text-sm">🤖 このAIを信じていいか</h3>
        <span className="text-xs opacity-70">{trust.totalRaces || 0} 件のレースから判定</span>
      </div>
      <div className="text-center my-3">
        <div style={{ fontSize: 24, letterSpacing: "0.2em" }}>
          {"★".repeat(trust.stars)}<span style={{ opacity: 0.3 }}>{"☆".repeat(5 - trust.stars)}</span>
        </div>
        <div className="font-bold text-lg mt-1" style={{ color: trust.color }}>{trust.level}</div>
        <div className="text-xs opacity-80 mt-1">{trust.message}</div>
      </div>

      {trust.sampleSize >= 10 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-3">
          <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.25)" }}>
            <div className="opacity-70">回収率</div>
            <div className="num font-bold mt-1" style={{ fontSize: 16, color: trust.roi >= 1 ? "#34d399" : "#f87171" }}>
              {trust.roi != null ? Math.round(trust.roi * 100) + "%" : "—"}
            </div>
          </div>
          <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.25)" }}>
            <div className="opacity-70">的中率</div>
            <div className="num font-bold mt-1" style={{ fontSize: 16 }}>
              {trust.hitRate != null ? Math.round(trust.hitRate * 100) + "%" : "—"}
            </div>
          </div>
          <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.25)" }}>
            <div className="opacity-70">見送り精度</div>
            <div className="num font-bold mt-1" style={{ fontSize: 16 }}>
              {skip.skipQuality != null ? Math.round(skip.skipQuality * 100) + "%" : "—"}
            </div>
            <div className="opacity-60 mt-1" style={{ fontSize: 10 }}>
              ✓{skip.skippedCorrect} ✗{skip.skippedMissed}
            </div>
          </div>
          <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.25)" }}>
            <div className="opacity-70">サンプル</div>
            <div className="num font-bold mt-1" style={{ fontSize: 16 }}>{trust.sampleSize}</div>
          </div>
        </div>
      )}
      {trust.sampleSize < 10 && (
        <div className="text-xs opacity-60 mt-2 text-center">
          💡 信頼度判定にはまず 10 件以上の確定済みレースが必要です。手動記録でデータを増やせます。
        </div>
      )}
    </section>
  );
}

/* === エア or リアル の単独表示 === */
function SingleView({ items, label }) {
  const summary = useMemo(() => summarize(items), [items]);
  const daily = useMemo(() => buildDaily(items), [items]);
  const cumulative = useMemo(() => buildCumulative(daily), [daily]);
  const byKind = useMemo(() => buildByKind(items), [items]);

  // スタイル別集計
  const byStyle = useMemo(() => {
    const m = {};
    for (const p of items) {
      const k = p.profile || "balanced";
      if (!m[k]) m[k] = { profile: k, stake: 0, ret: 0, count: 0, hits: 0 };
      m[k].stake += p.totalStake;
      m[k].ret += p.payout || 0;
      m[k].count += 1;
      if (p.hit) m[k].hits += 1;
    }
    const labels = { steady: "🛡️ 本命党", balanced: "⚖️ 中堅党", aggressive: "🎯 穴党" };
    return ["steady", "balanced", "aggressive"]
      .map((k) => m[k] && {
        ...m[k], label: labels[k],
        roi: m[k].stake > 0 ? m[k].ret / m[k].stake : 0,
        pnl: m[k].ret - m[k].stake,
      })
      .filter(Boolean);
  }, [items]);

  if (items.length === 0) {
    return (
      <section className="card p-6 text-center" style={{ minHeight: 200 }}>
        <div className="opacity-70">{label} 舟券の記録がまだありません</div>
        <div className="text-xs opacity-50 mt-2">レースを記録すると、ここにグラフが表示されます</div>
      </section>
    );
  }

  return (
    <>
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="累計収支" value={(summary.pnl >= 0 ? "+" : "") + yen(summary.pnl)} color={summary.pnl >= 0 ? "#34d399" : "#f87171"} />
        <Kpi label="回収率" value={summary.stake > 0 ? Math.round(summary.roi * 100) + "%" : "—"} color={summary.roi >= 1 ? "#34d399" : "#f87171"} />
        <Kpi label="的中率" value={summary.count > 0 ? Math.round(summary.hitRate * 100) + "%" : "—"} />
        <Kpi label="最高払戻" value={yen(summary.bestPayout)} />
        <Kpi label="一番成績" value={summary.bestKind || "—"} small />
      </div>

      {/* 累計収支 */}
      <Card title="累計収支">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={cumulative} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id="cum" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={summary.pnl >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.6} />
                <stop offset="100%" stopColor={summary.pnl >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#121a2c", border: "1px solid #243154", fontSize: 12 }} formatter={(v) => yen(v)} />
            <ReferenceLine y={0} stroke="#f87171" strokeDasharray="3 3" />
            <Area dataKey="pnl" stroke={summary.pnl >= 0 ? "#10b981" : "#ef4444"} fill="url(#cum)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* 日別収支 (バー) */}
      <Card title="日別収支">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={daily} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#121a2c", border: "1px solid #243154", fontSize: 12 }} formatter={(v) => yen(v)} />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="pnl" isAnimationActive={false}>
              {daily.map((d, i) => (
                <rect key={i} fill={d.pnl >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 回収率推移 */}
      <Card title="回収率の推移 (累計ROI)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={cumulative} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9fb0c9" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "#121a2c", border: "1px solid #243154", fontSize: 12 }} formatter={(v) => v + "%"} />
            <ReferenceLine y={100} stroke="#fbbf24" strokeDasharray="3 3" />
            <Line dataKey="roi" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* スタイル別 (本命党/中堅党/穴党) */}
      {byStyle.length > 0 && (
        <Card title="スタイル別の回収率">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            {byStyle.map((s) => {
              const color = s.roi >= 1 ? "#34d399" : "#f87171";
              return (
                <div key={s.profile} className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.25)", minHeight: 110 }}>
                  <div className="text-sm font-bold">{s.label}</div>
                  <div className="text-xs opacity-70 mt-1">{s.count}件 / 的中 {s.hits}件</div>
                  <div className="num font-bold mt-1" style={{ color, fontSize: 22 }}>
                    {s.stake > 0 ? Math.round(s.roi * 100) + "%" : "—"}
                  </div>
                  <div className={"num text-xs mt-1 " + (s.pnl >= 0 ? "text-pos" : "text-neg")}>
                    {s.pnl >= 0 ? "+" : ""}{yen(s.pnl)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs opacity-70 mt-2">
            💡 一番成績が良いスタイルを参考にしてください (ただしサンプル数が少ない場合は判断保留)
          </div>
        </Card>
      )}

      {/* 券種別成績 */}
      <Card title="券種別成績">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byKind} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="kind" stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#121a2c", border: "1px solid #243154", fontSize: 12 }} formatter={(v) => yen(v)} />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="pnl" isAnimationActive={false}>
              {byKind.map((d, i) => (
                <rect key={i} fill={d.pnl >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="text-xs opacity-70 mt-2">
          一番成績の良い券種: <b className="text-pos">{summary.bestKind || "—"}</b>
        </div>
      </Card>
    </>
  );
}

/* === エア vs リアル 比較 === */
function CompareView({ air, real }) {
  const airSum = useMemo(() => summarize(air), [air]);
  const realSum = useMemo(() => summarize(real), [real]);
  const gap = (airSum.pnl || 0) - (realSum.pnl || 0);

  // 累計を 1 グラフに重ねる
  const merged = useMemo(() => {
    const map = {};
    const add = (arr, key) => {
      let cum = 0;
      const grouped = buildDaily(arr);
      for (const d of grouped) {
        cum += d.pnl;
        map[d.date] = map[d.date] || { date: d.date };
        map[d.date][key] = cum;
      }
    };
    add(air, "air");
    add(real, "real");
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [air, real]);

  return (
    <>
      <section className="card p-4" style={{ minHeight: 140 }}>
        <div className="text-xs opacity-70 uppercase tracking-widest mb-2">エアとリアル の差</div>
        <div className="flex items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-xs opacity-70">エア収支</div>
            <div className={"num " + (airSum.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 26, fontWeight: 800 }}>
              {airSum.pnl >= 0 ? "+" : ""}{yen(airSum.pnl)}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-70">リアル収支</div>
            <div className={"num " + (realSum.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 26, fontWeight: 800 }}>
              {realSum.stake === 0 ? "未入力" : (realSum.pnl >= 0 ? "+" : "") + yen(realSum.pnl)}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-70">乖離 (エア−リアル)</div>
            <div className={"num " + (gap >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 22, fontWeight: 800 }}>
              {gap >= 0 ? "+" : ""}{yen(gap)}
            </div>
          </div>
        </div>
        <div className="text-xs opacity-70 mt-3">
          ※ エアの利益はあくまで仮想結果。リアル成績と並べて、ロジックの実用性を検証してください。
        </div>
      </section>

      <Card title="累計収支の比較">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={merged} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9fb0c9" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#121a2c", border: "1px solid #243154", fontSize: 12 }} formatter={(v) => yen(v)} />
            <ReferenceLine y={0} stroke="#475569" />
            <Line dataKey="air"  name="エア"   stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="real" name="リアル" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </>
  );
}

/* === 部品 === */
function Card({ title, children }) {
  return (
    <section className="card p-4" style={{ minHeight: 220 }}>
      <h3 className="font-bold text-sm mb-3">{title}</h3>
      {children}
    </section>
  );
}
function Kpi({ label, value, color, small }) {
  return (
    <div className="card p-3" style={{ minHeight: 80 }}>
      <div className="text-xs opacity-70">{label}</div>
      <div className={"num font-bold mt-1 " + (small ? "text-sm" : "")}
        style={{ fontSize: small ? 14 : 22, color: color || "#e7eef8" }}>
        {value}
      </div>
    </div>
  );
}

/* === ヘルパ === */
function summarize(items) {
  let stake = 0, ret = 0, hits = 0, bestPayout = 0;
  const byKind = {};
  for (const p of items) {
    stake += p.totalStake;
    ret   += p.payout || 0;
    if (p.hit) {
      hits += 1;
      bestPayout = Math.max(bestPayout, p.payout || 0);
    }
    const main = p.combos?.[0];
    if (main) {
      byKind[main.kind] = byKind[main.kind] || { stake: 0, ret: 0 };
      byKind[main.kind].stake += p.totalStake;
      byKind[main.kind].ret   += p.payout || 0;
    }
  }
  const pnl = ret - stake;
  const roi = stake > 0 ? ret / stake : 0;
  const hitRate = items.length > 0 ? hits / items.length : 0;
  // ベスト券種 (収支)
  let bestKind = null, bestKindPnl = -Infinity;
  for (const [k, v] of Object.entries(byKind)) {
    const p = v.ret - v.stake;
    if (p > bestKindPnl) { bestKindPnl = p; bestKind = k; }
  }
  return { count: items.length, stake, ret, pnl, roi, hits, hitRate, bestPayout, bestKind };
}

function buildDaily(items) {
  const m = {};
  for (const p of items) {
    m[p.date] = m[p.date] || { date: p.date, stake: 0, ret: 0, count: 0, hits: 0 };
    m[p.date].stake += p.totalStake;
    m[p.date].ret   += p.payout || 0;
    m[p.date].count += 1;
    if (p.hit) m[p.date].hits += 1;
  }
  return Object.values(m).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d, pnl: Math.round(d.ret - d.stake),
  }));
}

function buildCumulative(daily) {
  let cum = 0, cumStake = 0, cumRet = 0;
  return daily.map(d => {
    cum += d.pnl;
    cumStake += d.stake;
    cumRet   += d.ret;
    return { date: d.date, pnl: cum, roi: cumStake > 0 ? Math.round(cumRet / cumStake * 100) : 100 };
  });
}

function buildByKind(items) {
  const m = {};
  for (const p of items) {
    const k = p.combos?.[0]?.kind || "—";
    m[k] = m[k] || { kind: k, stake: 0, ret: 0 };
    m[k].stake += p.totalStake;
    m[k].ret   += p.payout || 0;
  }
  const order = ["2連単", "2連複", "3連単", "3連複"];
  return order
    .map(k => m[k] && { kind: k, pnl: Math.round(m[k].ret - m[k].stake), stake: m[k].stake, ret: m[k].ret })
    .filter(Boolean);
}
