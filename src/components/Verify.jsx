import { useMemo, useState, useEffect } from "react";
import { yen, pct } from "../lib/format.js";
import ManualBetForm from "./ManualBetForm.jsx";
import { classifyLossPattern } from "../lib/venueBias.js";

/**
 * 検証画面 — レース別カード一覧 + 集計。
 *  ・タブで [エア舟券] [リアル舟券] を切替 (Header の virtualMode に自動追従)
 *  ・各カードに 買い目 / 結果 / 着順 / 払戻 / 収支 を全部表示 (クリック不要)
 *  ・最低 1 週間分を時系列降順
 */
export default function Verify({ predictions, onManualBet, onDeleteRecord, currentProfile, virtualMode }) {
  const [tab, setTab] = useState(virtualMode === false ? "real" : "air"); // air | real
  const [styleFilter, setStyleFilter] = useState("all"); // all | steady | balanced | aggressive
  const [periodFilter, setPeriodFilter] = useState("week"); // today | week | month | all
  const [venueFilter, setVenueFilter] = useState("all");    // all | (venue name)
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Header の エア/リアル切替に同期
  useEffect(() => {
    setTab(virtualMode === false ? "real" : "air");
  }, [virtualMode]);

  const all = useMemo(() => Object.values(predictions || {}), [predictions]);

  // 利用可能な会場一覧 (ヘッドライン)
  const venueOptions = useMemo(() => {
    const set = new Set();
    for (const p of all) if (p.venue) set.add(p.venue);
    return ["all", ...Array.from(set).sort()];
  }, [all]);

  const cutoff = useMemo(() => {
    const today = new Date();
    if (periodFilter === "today") return today.toISOString().slice(0, 10);
    if (periodFilter === "week")  return new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    if (periodFilter === "month") return new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    return "0000-00-00";
  }, [periodFilter]);

  const filtered = useMemo(() => {
    return all.filter((p) => (p.date || "0000-00-00") >= cutoff).filter((p) => {
      const isReal = p.virtual === false;
      const matchTab = tab === "real" ? isReal : !isReal;
      const matchStyle = styleFilter === "all" || (p.profile || "balanced") === styleFilter;
      const matchVenue = venueFilter === "all" || p.venue === venueFilter;
      return matchTab && matchStyle && matchVenue;
    });
  }, [all, tab, styleFilter, venueFilter, cutoff]);

  const buys = filtered.filter((p) => p.decision === "buy" && p.totalStake > 0);
  const settled = buys.filter((p) => p.result?.first);

  const stats = useMemo(() => {
    let stake = 0, ret = 0, hits = 0;
    settled.forEach((p) => { stake += p.totalStake; ret += p.payout || 0; if (p.hit) hits++; });
    return {
      count: buys.length,
      settled: settled.length,
      hits, miss: settled.length - hits,
      stake, ret, pnl: ret - stake,
      roi: stake > 0 ? ret / stake : 0,
      hitRate: settled.length > 0 ? hits / settled.length : 0,
    };
  }, [buys, settled]);

  const cards = useMemo(() => {
    return [...buys].sort((a, b) =>
      (b.recordedAt || b.snapshotAt || "").localeCompare(a.recordedAt || a.snapshotAt || "")
    );
  }, [buys]);

  return (
    <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
      {/* タブ + 手動記録ボタン */}
      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={() => setTab("air")} className={"tab-btn flex-1 " + (tab === "air" ? "active" : "")}>
          🧪 エア舟券
        </button>
        <button onClick={() => setTab("real")} className={"tab-btn flex-1 " + (tab === "real" ? "active" : "")}>
          💰 リアル舟券
        </button>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          style={{ minHeight: 44, minWidth: 120, padding: "8px 14px", borderRadius: 10, fontSize: 14, fontWeight: 800, border: "none", cursor: "pointer", background: "#10b981", color: "#fff" }}>
          + 手動記録
        </button>
      </div>

      {/* 期間フィルタ */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs opacity-70">期間:</span>
        {[
          { k: "today", label: "📅 今日",   color: "#22d3ee" },
          { k: "week",  label: "🗓️ 今週",   color: "#10b981" },
          { k: "month", label: "📆 今月",   color: "#a855f7" },
          { k: "all",   label: "📚 全期間", color: "#fbbf24" },
        ].map((f) => (
          <button key={f.k} onClick={() => setPeriodFilter(f.k)}
            className="pill"
            style={{
              padding: "6px 12px", fontSize: 12,
              cursor: "pointer", border: "none",
              background: periodFilter === f.k ? f.color : "rgba(15,24,48,0.6)",
              color: periodFilter === f.k ? "#0b1220" : "#9fb0c9",
              fontWeight: periodFilter === f.k ? 800 : 600,
              transition: "all 0.12s",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* スタイル別フィルタ */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs opacity-70">スタイル別:</span>
        {[
          { k: "all",        label: "全部",        color: "#9fb0c9" },
          { k: "steady",     label: "🛡️ 安定",     color: "#3b82f6" },
          { k: "balanced",   label: "⚖️ バランス", color: "#fbbf24" },
          { k: "aggressive", label: "🎯 攻め",     color: "#ef4444" },
        ].map((f) => (
          <button key={f.k} onClick={() => setStyleFilter(f.k)}
            className="pill"
            style={{
              padding: "6px 12px", fontSize: 12,
              cursor: "pointer", border: "none",
              background: styleFilter === f.k ? f.color : "rgba(15,24,48,0.6)",
              color: styleFilter === f.k ? "#fff" : "#9fb0c9",
              fontWeight: styleFilter === f.k ? 800 : 600,
              transition: "all 0.12s",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 会場フィルタ */}
      {venueOptions.length > 1 && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs opacity-70">会場:</span>
          <select className="select" style={{ width: "auto", minWidth: 140 }}
            value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
            {venueOptions.map((v) => <option key={v} value={v}>{v === "all" ? "全会場" : v}</option>)}
          </select>
        </div>
      )}

      {/* 集計 */}
      <section className="card p-4" style={{ minHeight: 140 }}>
        <div className="text-xs opacity-70 uppercase tracking-widest mb-2">
          {tab === "air" ? "エア舟券" : "リアル舟券"} - {
            { today: "本日", week: "直近 7 日間", month: "直近 30 日間", all: "全期間" }[periodFilter]
          }{venueFilter !== "all" ? ` / ${venueFilter}` : ""}
        </div>
        <div className="flex items-baseline gap-4 flex-wrap">
          <div>
            <div className="text-xs opacity-70">収支</div>
            <div className={"num " + (stats.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: "min(40px,9vw)", fontWeight: 900 }}>
              {stats.pnl >= 0 ? "+" : ""}{yen(stats.pnl)}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-70">回収率</div>
            <div className={"num " + (stats.roi >= 1 ? "text-pos" : "text-neg")} style={{ fontSize: "min(28px,7vw)", fontWeight: 800 }}>
              {stats.stake > 0 ? Math.round(stats.roi * 100) + "%" : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-70">的中率</div>
            <div className="num" style={{ fontSize: "min(28px,7vw)", fontWeight: 800 }}>
              {stats.settled > 0 ? Math.round(stats.hitRate * 100) + "%" : "—"}
            </div>
          </div>
        </div>
        <div className="text-xs opacity-70 mt-2">
          勝負 {stats.count} 件 / 確定 {stats.settled} / 的中 {stats.hits} / 外 {stats.miss}
        </div>
      </section>

      {/* レース別カード */}
      {cards.length === 0 ? (
        <div className="card p-4 text-center text-sm opacity-70" style={{ minHeight: 100 }}>
          {tab === "air" ? "エア舟券" : "リアル舟券"} の記録なし<br />
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="btn btn-success mt-3 text-sm">+ 手動記録する</button>
        </div>
      ) : (
        cards.map((p) => <RaceCard key={p.key} p={p}
          onEdit={p.manuallyRecorded ? () => { setEditing(p); setFormOpen(true); } : null}
          onDelete={p.manuallyRecorded && onDeleteRecord ? () => {
            if (confirm(`${p.venue} ${p.raceNo}R の記録を削除しますか?`)) onDeleteRecord(p.key);
          } : null}
        />)
      )}

      {/* 手動記録フォーム */}
      <ManualBetForm
        open={formOpen}
        initial={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={(record) => onManualBet && onManualBet(record)}
      />
    </div>
  );
}

function RaceCard({ p, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const settled = !!p.result?.first;
  const correct = settled ? `${p.result.first}-${p.result.second}-${p.result.third}` : null;
  const main = (p.combos || [])[0];
  const status = !settled ? "pending"
               : p.hit ? "hit"
               : "miss";
  const bg = status === "hit" ? "linear-gradient(135deg,#053527,#0b1220)"
           : status === "miss" ? "linear-gradient(135deg,#3b1d1d,#0b1220)"
           : "linear-gradient(135deg,#1e293b,#0f1830)";
  const border = status === "hit" ? "#10b981"
              : status === "miss" ? "#ef4444"
              : "#475569";

  return (
    <section onClick={() => setExpanded(v => !v)} style={{
      padding: 12, borderRadius: 14, background: bg, border: `2px solid ${border}`,
      color: "#fff", minHeight: expanded ? 160 : 56, cursor: "pointer",
      transition: "min-height 0.18s ease",
    }}>
      {/* 一覧モード: 日付・場・R・的中/不的中・収支のみ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {status === "hit"  && <span className="pill" style={{ background: "#10b981", color: "#fff", flexShrink: 0 }}>🎯</span>}
          {status === "miss" && <span className="pill" style={{ background: "#ef4444", color: "#fff", flexShrink: 0 }}>❌</span>}
          {status === "pending" && <span className="pill badge-skip" style={{ flexShrink: 0 }}>⏳</span>}
          <div className="text-sm font-bold truncate">{p.venue} {p.raceNo}R</div>
          <div className="text-xs opacity-60">{p.date}</div>
          {p.manuallyRecorded && <span className="pill" style={{ background: "rgba(34,211,238,0.18)", color: "#a5f3fc", fontSize: 10 }}>📝</span>}
        </div>
        <div className="flex items-center gap-3">
          {settled ? (
            <div className="text-right">
              <div className={"num " + (p.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 16, fontWeight: 800 }}>
                {p.pnl >= 0 ? "+" : ""}{yen(p.pnl || 0)}
              </div>
              <div className="num text-xs opacity-70">
                {p.totalStake > 0 ? Math.round(((p.payout || 0) / p.totalStake) * 100) + "%" : "—"}
              </div>
            </div>
          ) : (
            <div className="text-xs opacity-70">未確定</div>
          )}
          <div className="text-xs opacity-50">{expanded ? "▲" : "▼"}</div>
        </div>
      </div>

      {expanded && (
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <div className="text-xs opacity-70">買い目 (本命) <span className="opacity-50">{p.startTime}</span></div>
          {main ? (
            <>
              <div className="font-mono" style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{main.combo}</div>
              <div className="text-xs opacity-70">{main.kind}</div>
            </>
          ) : <div className="opacity-70 mt-1">—</div>}
          {p.combos?.length > 1 && (
            <div className="text-xs opacity-70 mt-2 font-mono">
              押さえ: {p.combos.slice(1).map(c => c.combo).join(" / ")}
            </div>
          )}
          <div className="num text-xs opacity-80 mt-1">投資 {yen(p.totalStake)}</div>
          <div className="flex gap-1 mt-2">
            {onEdit  && <button onClick={(e) => { e.stopPropagation(); onEdit(); }}  className="btn btn-ghost text-xs" style={{ padding: "4px 8px" }}>✏️ 編集</button>}
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="btn btn-ghost text-xs" style={{ padding: "4px 8px", color: "#f87171" }}>🗑 削除</button>}
          </div>
        </div>

        <div>
          <div className="text-xs opacity-70">着順 (正解)</div>
          {settled ? (
            <>
              <div className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: "#fde68a", marginTop: 2 }}>{correct}</div>
              <div className="num text-xs opacity-80 mt-1">払戻 {yen(p.payout || 0)}</div>
              <div className={"num mt-2 " + (p.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 18, fontWeight: 800 }}>
                {p.pnl >= 0 ? "+" : ""}{yen(p.pnl)}
              </div>
            </>
          ) : <div className="opacity-70 mt-1">未確定</div>}
        </div>
      </div>
      )}
      {expanded && (
        <>
          {p.memo && <div className="text-xs opacity-70 mt-2 italic border-l-2 pl-2 border-cyan-400">📝 {p.memo}</div>}
          {/* 負けパターン (Round 17) */}
          {(() => {
            if (!settled || p.hit) return null;
            const cls = classifyLossPattern({ jcd: p.jcd, venue: p.venue, apiResult: p.result }, p);
            if (!cls) return null;
            return (
              <div className="text-xs mt-2 px-2 py-1 rounded" style={{ background: "rgba(239,68,68,0.10)", color: "#fecaca", border: "1px solid rgba(239,68,68,0.25)" }}>
                😫 <b>{cls.kind}</b> — {cls.desc}
              </div>
            );
          })()}
          {p.reflection && <div className="text-xs opacity-70 mt-2 italic border-l-2 pl-2 border-amber-400">📝 反省: {p.reflection}</div>}
        </>
      )}
    </section>
  );
}
