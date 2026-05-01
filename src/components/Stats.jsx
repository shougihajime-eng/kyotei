import { useMemo, useState, useEffect, memo } from "react";
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
export default function Stats({ predictions, lastRefreshAt, virtualMode }) {
  // tab: Header の virtualMode を初期値にする (常に同期)
  const [tab, setTab] = useState(virtualMode === false ? "real" : "air"); // air | real | compare
  const [period, setPeriod] = useState("week"); // today | week | month | all

  // Header のエア/リアル切替に追従 (compare 表示のときは維持)
  useEffect(() => {
    if (tab === "compare") return;
    setTab(virtualMode === false ? "real" : "air");
  }, [virtualMode]);

  // 期間フィルタ用の境界日
  const cutoff = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const d = new Date();
    if (period === "today") return today;
    if (period === "week")  { d.setDate(d.getDate() - 6);  return d.toISOString().slice(0, 10); }
    if (period === "month") { d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); }
    return "0000-00-00"; // all
  }, [period]);

  // 全体統計 (どのモードに属するか把握用)
  const allPredictions = useMemo(() => Object.values(predictions || {}), [predictions]);
  const totalSaved = allPredictions.length;
  const totalAirAll = allPredictions.filter(p => p.virtual !== false).length;
  const totalRealAll = allPredictions.filter(p => p.virtual === false).length;

  const all = useMemo(() => Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && p.totalStake > 0 && p.result?.first)
    .filter((p) => (p.date || "0000-00-00") >= cutoff)
    .sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || ""))),
  [predictions, cutoff]);

  const air = useMemo(() => all.filter((p) => p.virtual !== false), [all]);
  const real = useMemo(() => all.filter((p) => p.virtual === false), [all]);

  // データ無しの理由を判定
  const reason = useMemo(() => {
    const targetSet = tab === "air" ? air : real;
    if (targetSet.length > 0) return null;
    if (totalSaved === 0) return { kind: "none", text: "まだ予想が一件も保存されていません。「🔄 更新」 を押してレース情報を取得してください。" };
    const targetAll = tab === "air" ? totalAirAll : totalRealAll;
    if (targetAll === 0) return { kind: "no-mode", text: tab === "air" ? "エアモードで保存した予想がまだありません。Header の「🧪 エア」 ボタンに切り替えて更新してください。" : "リアル舟券の記録がまだありません。Header の「💰 リアル」 に切り替えて記録するか、検証画面の「+ 手動記録」 で追加してください。" };
    // モードでは保存があるが期間 + 結果確定で 0 件
    return { kind: "no-period", text: `${tab === "air" ? "エア" : "リアル"} 舟券は ${targetAll} 件保存されていますが、選択中の期間 (${period === "today" ? "今日" : period === "week" ? "今週" : period === "month" ? "今月" : "全期間"}) + 結果確定済 で該当なし。期間を 「全期間」 に切り替えてみてください。` };
  }, [tab, air, real, totalSaved, totalAirAll, totalRealAll, period]);

  return (
    <div className="max-w-4xl mx-auto px-4 mt-4 space-y-4">
      {/* タブ */}
      <div className="flex gap-2">
        <button onClick={() => setTab("air")} className={"tab-btn flex-1 " + (tab === "air" ? "active" : "")}>🧪 エア舟券</button>
        <button onClick={() => setTab("real")} className={"tab-btn flex-1 " + (tab === "real" ? "active" : "")}>💰 リアル舟券</button>
        <button onClick={() => setTab("compare")} className={"tab-btn flex-1 " + (tab === "compare" ? "active" : "")}>⚖️ 比較</button>
      </div>

      {/* 期間切替 (今日 / 今週 / 今月 / 全期間) */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs opacity-70">期間:</span>
        {[
          { k: "today", label: "📅 今日",   color: "#22d3ee" },
          { k: "week",  label: "🗓️ 今週",   color: "#10b981" },
          { k: "month", label: "📆 今月",   color: "#a855f7" },
          { k: "all",   label: "📚 全期間", color: "#fbbf24" },
        ].map((f) => (
          <button key={f.k} onClick={() => setPeriod(f.k)}
            className="pill"
            style={{
              padding: "6px 14px", fontSize: 12, cursor: "pointer", border: "none",
              background: period === f.k ? f.color : "rgba(15,24,48,0.6)",
              color: period === f.k ? "#0b1220" : "#9fb0c9",
              fontWeight: period === f.k ? 800 : 600,
              transition: "all 0.12s",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 保存ステータス (常時表示) */}
      <div className="text-xs opacity-70 flex items-center gap-2 flex-wrap">
        <span>💾 保存済:</span>
        <span className="num">全 <b style={{ color: "#bae6fd" }}>{totalSaved}</b> 件</span>
        <span className="opacity-50">|</span>
        <span className="num">🧪 エア <b style={{ color: "#67e8f9" }}>{totalAirAll}</b></span>
        <span className="num">💰 リアル <b style={{ color: "#fcd34d" }}>{totalRealAll}</b></span>
      </div>

      {/* 最終更新表示 */}
      <div className="text-xs opacity-60 text-right" style={{ minHeight: 16 }}>
        最終更新: {lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString("ja-JP") : "—"}
      </div>

      {/* Round 39: 実績検証パネル — 7日 / 30日 / 全期間 並列 */}
      <ActualPerformancePanel predictions={predictions} virtualMode={virtualMode} />

      {/* AI 信頼度パネル — 「このAIを信じていいか」 */}
      <AITrustPanel predictions={predictions} />

      {tab === "compare"
        ? <CompareView air={air} real={real} />
        : reason
          ? (<section className="card p-6 text-center" style={{ minHeight: 200 }}>
              <div className="opacity-70 text-sm">{reason.text}</div>
              <div className="text-xs opacity-50 mt-3">
                {reason.kind === "no-mode" && tab === "real" ? "💡 リアル切替後、レースが確定すると自動で集計されます" : reason.kind === "no-period" ? "💡 期間 「全期間」 ボタンを押してください" : "💡 「🔄 更新」 を押してください"}
              </div>
            </section>)
          : <SingleView items={tab === "air" ? air : real} label={tab === "air" ? "エア" : "リアル"} />}
    </div>
  );
}

/* AI 信頼度パネル — props 同一なら再描画スキップ */
const AITrustPanel = memo(AITrustPanelImpl);
function AITrustPanelImpl({ predictions }) {
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

/* === エア or リアル の単独表示 (memo) === */
const SingleView = memo(SingleViewImpl);
function SingleViewImpl({ items, label }) {
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

/* === エア vs リアル 比較 (memo) === */
const CompareView = memo(CompareViewImpl);
function CompareViewImpl({ air, real }) {
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

/* === Round 39: 実績検証パネル (memo) ===
   ・7日 / 30日 / 全期間 で「買い数」「的中率」「回収率」「見送り精度」「スタイル別」 を並列表示
   ・推定 (シミュレーション) と区別して 「実績データ」 と明示 */
const ActualPerformancePanel = memo(ActualPerformancePanelImpl);
function ActualPerformancePanelImpl({ predictions, virtualMode }) {
  const data = useMemo(() => {
    const all = Object.values(predictions || {});
    const today = new Date();
    function cutoff(daysBack) {
      if (daysBack == null) return "0000-00-00";
      const d = new Date(today);
      d.setDate(d.getDate() - daysBack + 1);
      return d.toISOString().slice(0, 10);
    }
    function summarize(daysBack) {
      const co = cutoff(daysBack);
      const list = all.filter((p) => (p.date || "0000-00-00") >= co);
      const targetMode = list.filter((p) => virtualMode === false ? p.virtual === false : p.virtual !== false);
      const buys = targetMode.filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0);
      const skips = targetMode.filter((p) => p.decision === "skip");
      const settled = buys.filter((p) => p.result?.first);
      const skipsSettled = skips.filter((p) => p.result?.first);
      let stake = 0, ret = 0, hits = 0;
      settled.forEach((p) => { stake += p.totalStake; ret += p.payout || 0; if (p.hit) hits++; });
      // 見送り精度: 見送ったレースの中で「見送って正解」 (= AI の本命買い目が外れた) の率
      let skipCorrect = 0;
      for (const p of skipsSettled) {
        const expected = p.combos?.[0]?.combo;
        if (!expected) { skipCorrect++; continue; } // skip + 買い目候補なし → 自動正解扱い
        const winnerTri = `${p.result.first}-${p.result.second}-${p.result.third}`;
        if (expected !== winnerTri) skipCorrect++;
      }
      return {
        buys: buys.length,
        skips: skips.length,
        settled: settled.length,
        hits,
        skipCorrect,
        skipsSettled: skipsSettled.length,
        stake, ret,
        roi: stake > 0 ? ret / stake : null,
        hitRate: settled.length > 0 ? hits / settled.length : null,
        skipQuality: skipsSettled.length > 0 ? skipCorrect / skipsSettled.length : null,
        pnl: ret - stake,
      };
    }
    function byStyle(daysBack) {
      const co = cutoff(daysBack);
      const list = all.filter((p) => (p.date || "0000-00-00") >= co);
      const targetMode = list.filter((p) => virtualMode === false ? p.virtual === false : p.virtual !== false);
      const m = {};
      for (const p of targetMode) {
        if (p.decision !== "buy" || !(p.totalStake > 0) || !p.result?.first) continue;
        const k = p.profile || "balanced";
        if (!m[k]) m[k] = { stake: 0, ret: 0, count: 0, hits: 0 };
        m[k].stake += p.totalStake; m[k].ret += p.payout || 0; m[k].count++;
        if (p.hit) m[k].hits++;
      }
      const labels = { steady: "🛡️ 本命型", balanced: "⚖️ バランス型", aggressive: "🎯 穴狙い型" };
      return ["steady","balanced","aggressive"].map(k => ({
        profile: k, label: labels[k],
        stake: m[k]?.stake || 0,
        ret:   m[k]?.ret   || 0,
        count: m[k]?.count || 0,
        hits:  m[k]?.hits  || 0,
        roi: m[k]?.stake > 0 ? m[k].ret / m[k].stake : null,
      }));
    }
    return {
      d7:  summarize(7),
      d30: summarize(30),
      all: summarize(null),
      byStyleD7:  byStyle(7),
      byStyleD30: byStyle(30),
    };
  }, [predictions, virtualMode]);

  function fmtPct(v) { return v == null ? "—" : `${Math.round(v * 100)}%`; }
  function fmtPnl(v) {
    const n = Math.round(v || 0);
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toLocaleString()}円`;
  }
  function tone(roi) {
    if (roi == null) return "#9fb0c9";
    if (roi >= 1.10) return "#34d399";
    if (roi >= 1.00) return "#bae6fd";
    if (roi >= 0.85) return "#fde68a";
    return "#f87171";
  }
  const rows = [
    { key: "d7",  label: "7日間",  data: data.d7  },
    { key: "d30", label: "30日間", data: data.d30 },
    { key: "all", label: "全期間", data: data.all },
  ];
  return (
    <section className="card p-4" style={{ minHeight: 200 }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-bold text-sm">📊 実績検証 ({virtualMode === false ? "💰 リアル" : "🧪 エア"})</h3>
        <span className="pill badge-buy" style={{ fontSize: 10 }}>確定済データ</span>
      </div>
      <div className="text-xs opacity-70 mb-3" style={{ lineHeight: 1.5 }}>
        ※ ここは <b>実績データ</b> です (推定値ではなく、保存済の確定レース結果)。<br/>
        買い目の「推定回収率」 は AI 予想に基づく見立てで、長期的にはこの実績ROIに収束します。
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="w-full text-xs num" style={{ borderCollapse: "collapse", minWidth: 540 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #243154", color: "#9fb0c9" }}>
              <th className="text-left p-2">期間</th>
              <th className="text-right p-2">買い</th>
              <th className="text-right p-2">確定</th>
              <th className="text-right p-2">的中率</th>
              <th className="text-right p-2">回収率</th>
              <th className="text-right p-2">PnL</th>
              <th className="text-right p-2">見送り精度</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="p-2 font-bold">{r.label}</td>
                <td className="text-right p-2">{r.data.buys}</td>
                <td className="text-right p-2">{r.data.settled} ({r.data.hits}的中)</td>
                <td className="text-right p-2">{fmtPct(r.data.hitRate)}</td>
                <td className="text-right p-2 font-bold" style={{ color: tone(r.data.roi) }}>{fmtPct(r.data.roi)}</td>
                <td className="text-right p-2" style={{ color: r.data.pnl >= 0 ? "#34d399" : "#f87171" }}>{fmtPnl(r.data.pnl)}</td>
                <td className="text-right p-2 opacity-80">{fmtPct(r.data.skipQuality)} ({r.data.skipCorrect}/{r.data.skipsSettled})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スタイル別 (7日 と 30日 を並列) */}
      <div className="text-xs opacity-70 mt-4 mb-2" style={{ fontWeight: 700 }}>スタイル別 実績</div>
      <div className="grid grid-cols-3 gap-2">
        {data.byStyleD30.map((s) => {
          const d7 = data.byStyleD7.find((x) => x.profile === s.profile);
          return (
            <div key={s.profile} className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.22)" }}>
              <div className="text-xs opacity-80" style={{ fontWeight: 700 }}>{s.label}</div>
              <div className="text-xs opacity-60 mt-1">7日 ROI</div>
              <div className="num font-bold" style={{ fontSize: 14, color: tone(d7?.roi) }}>{fmtPct(d7?.roi)}</div>
              <div className="text-xs opacity-60 mt-1">30日 ROI</div>
              <div className="num font-bold" style={{ fontSize: 14, color: tone(s.roi) }}>{fmtPct(s.roi)}</div>
              <div className="text-xs opacity-50 mt-1">7日 {d7?.count || 0}件 / 30日 {s.count}件</div>
            </div>
          );
        })}
      </div>

      {data.all.settled === 0 && (
        <div className="text-xs opacity-60 mt-3 text-center" style={{ background: "rgba(0,0,0,0.18)", padding: "8px 6px", borderRadius: 8 }}>
          💡 確定済の実績データがまだありません。 数レース記録するとここに 実績の的中率・回収率 が表示されます。
        </div>
      )}
    </section>
  );
}
