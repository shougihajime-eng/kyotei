import { useMemo, useState } from "react";
import { yen, pct } from "../lib/format.js";
import ManualBetForm from "./ManualBetForm.jsx";

/**
 * 検証画面 — レース別カード一覧 + 集計。
 *  ・タブで [エア舟券] [リアル舟券] を切替
 *  ・各カードに 買い目 / 結果 / 着順 / 払戻 / 収支 を全部表示 (クリック不要)
 *  ・最低 1 週間分を時系列降順
 */
export default function Verify({ predictions, onManualBet, onDeleteRecord, currentProfile }) {
  const [tab, setTab] = useState("air"); // air | real
  const [styleFilter, setStyleFilter] = useState("all"); // all | steady | balanced | aggressive
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const all = useMemo(() => Object.values(predictions || {}), [predictions]);

  const filtered = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return all.filter((p) => p.date >= weekAgo).filter((p) => {
      const isReal = p.virtual === false;
      const matchTab = tab === "real" ? isReal : !isReal;
      const matchStyle = styleFilter === "all" || (p.profile || "balanced") === styleFilter;
      return matchTab && matchStyle;
    });
  }, [all, tab, styleFilter]);

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

      {/* 集計 */}
      <section className="card p-4" style={{ minHeight: 140 }}>
        <div className="text-xs opacity-70 uppercase tracking-widest mb-2">
          {tab === "air" ? "エア舟券" : "リアル舟券"} - 直近 7 日間
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
    <section style={{
      padding: 14, borderRadius: 14, background: bg, border: `2px solid ${border}`,
      color: "#fff", minHeight: 160,
    }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-sm opacity-90">
          <span className="font-bold">{p.venue} {p.raceNo}R</span>
          <span className="ml-2 opacity-70 text-xs">{p.date} {p.startTime}</span>
          {p.manuallyRecorded && <span className="pill ml-2" style={{ background: "rgba(34,211,238,0.18)", color: "#a5f3fc", fontSize: 10 }}>📝 手動</span>}
        </div>
        <div className="flex items-center gap-2">
          {status === "hit"  && <span className="pill" style={{ background: "#10b981", color: "#fff" }}>🎯 的中</span>}
          {status === "miss" && <span className="pill" style={{ background: "#ef4444", color: "#fff" }}>❌ 不的中</span>}
          {status === "pending" && <span className="pill badge-skip">未確定</span>}
          {onEdit && <button onClick={onEdit} className="btn btn-ghost text-xs" style={{ padding: "4px 8px" }}>✏️</button>}
          {onDelete && <button onClick={onDelete} className="btn btn-ghost text-xs" style={{ padding: "4px 8px", color: "#f87171" }}>🗑</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs opacity-70">買い目 (本命)</div>
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
        </div>

        <div>
          <div className="text-xs opacity-70">着順 (正解)</div>
          {settled ? (
            <>
              <div className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: "#fde68a", marginTop: 2 }}>{correct}</div>
              <div className="num text-xs opacity-80 mt-1">
                払戻 {yen(p.payout || 0)}
              </div>
              <div className={"num mt-2 " + (p.pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 18, fontWeight: 800 }}>
                {p.pnl >= 0 ? "+" : ""}{yen(p.pnl)}
              </div>
            </>
          ) : <div className="opacity-70 mt-1">未確定</div>}
        </div>
      </div>
      {p.memo && <div className="text-xs opacity-70 mt-2 italic border-l-2 pl-2 border-cyan-400">📝 {p.memo}</div>}
    </section>
  );
}
