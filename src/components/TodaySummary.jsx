import { useMemo } from "react";
import { yen } from "../lib/format.js";

/**
 * 「今日のサマリ」 — 予想・結果・収支・スタイル別を 1 枚で全表示。
 * Round 18: 検証画面に頼らず、ホームからも今日の状況を即把握できるように。
 *
 * 表示内容:
 *   - 予想数 (買い / 見送り / オッズ取得不可)
 *   - 結果 (確定済み / 的中 / 不的中 / 未確定)
 *   - 収支 (総購入額 / 総払戻 / PnL / 回収率)
 *   - エア / リアル 別
 *   - スタイル別 (安定 / バランス / 攻め)
 *   - 当日レース 1 件ずつのカード
 */
export default function TodaySummary({ predictions, onPickRace }) {
  const data = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const list = Object.values(predictions || {}).filter((p) => p.date === today);

    const buys  = list.filter((p) => p.decision === "buy");
    const skips = list.filter((p) => p.decision === "skip");
    const noodds = list.filter((p) => p.decision === "no-odds");

    const settled = buys.filter((p) => p.result?.first);
    const pending = buys.filter((p) => !p.result?.first);
    const hits = settled.filter((p) => p.hit);
    const misses = settled.filter((p) => !p.hit);

    const sumStake  = (arr) => arr.reduce((s, p) => s + (p.totalStake || 0), 0);
    const sumPayout = (arr) => arr.reduce((s, p) => s + (p.payout || 0), 0);

    // エア / リアル
    const air  = settled.filter((p) => p.virtual !== false);
    const real = settled.filter((p) => p.virtual === false);
    const airPnl  = sumPayout(air)  - sumStake(air);
    const realPnl = sumPayout(real) - sumStake(real);

    // スタイル別
    const styleKeys = ["steady", "balanced", "aggressive"];
    const byStyle = Object.fromEntries(styleKeys.map((k) => {
      const arr = settled.filter((p) => (p.profile || p.predictionType || "balanced") === k);
      const stake = sumStake(arr);
      const ret = sumPayout(arr);
      return [k, { count: arr.length, hits: arr.filter((p) => p.hit).length, stake, ret, pnl: ret - stake, roi: stake > 0 ? ret / stake : 0 }];
    }));

    // 全体収支
    const totalStake  = sumStake(settled);
    const totalReturn = sumPayout(settled);
    const totalPnl    = totalReturn - totalStake;
    const totalRoi    = totalStake > 0 ? totalReturn / totalStake : 0;
    const hitRate     = settled.length > 0 ? hits.length / settled.length : 0;

    return {
      list, buys, skips, noodds, settled, pending, hits, misses,
      air, real, airPnl, realPnl, byStyle,
      totalStake, totalReturn, totalPnl, totalRoi, hitRate,
    };
  }, [predictions]);

  if (data.list.length === 0) {
    return (
      <section className="card p-4 text-center" style={{ minHeight: 110 }}>
        <div className="section-title mb-2">📅 今日のサマリ</div>
        <div className="opacity-70 text-sm">本日の予想記録がまだありません。<br/>「更新」ボタンを押すと AI 予想が自動保存されます。</div>
      </section>
    );
  }

  const styleLabel = { steady: "🛡️ 安定", balanced: "⚖️ バランス", aggressive: "🎯 攻め" };
  const styleColor = { steady: "#3b82f6", balanced: "#fbbf24", aggressive: "#ef4444" };

  return (
    <section className="card p-4" style={{ minHeight: 200 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="section-title">📅 今日のサマリ</div>
        <div className="text-xs opacity-70">{new Date().toLocaleDateString("ja-JP")}</div>
      </div>

      {/* 予想件数 (3列) */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="買い予想" value={data.buys.length} sub={`未確定 ${data.pending.length}`} color="var(--c-buy)" />
        <Stat label="見送り" value={data.skips.length} sub="—" color="var(--c-skip)" />
        <Stat label="オッズ不可" value={data.noodds.length} sub="—" color="var(--c-warn)" />
      </div>

      {/* 結果サマリ (大きく) */}
      <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(0,0,0,0.22)" }}>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs opacity-70">本日の収支</div>
            <div className={"kpi-num " + (data.totalPnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: "min(34px,8.5vw)" }}>
              {data.totalPnl >= 0 ? "+" : ""}{yen(data.totalPnl)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-70">回収率</div>
            <div className={"kpi-num " + (data.totalRoi >= 1 ? "text-pos" : "text-neg")} style={{ fontSize: "min(28px,7vw)" }}>
              {data.totalStake > 0 ? Math.round(data.totalRoi * 100) + "%" : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-70">的中率</div>
            <div className="kpi-num" style={{ fontSize: "min(28px,7vw)" }}>
              {data.settled.length > 0 ? Math.round(data.hitRate * 100) + "%" : "—"}
            </div>
          </div>
        </div>
        <div className="text-xs opacity-70 mt-2">
          投資 {yen(data.totalStake)} / 払戻 {yen(data.totalReturn)} ({data.hits.length}的中 / {data.misses.length}外れ / {data.pending.length}未確定)
        </div>
      </div>

      {/* エア / リアル */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <SmallBox label="🧪 エア舟券" pnl={data.airPnl} stake={data.air.reduce((s,p)=>s+(p.totalStake||0),0)} count={data.air.length} />
        <SmallBox label="💰 リアル舟券" pnl={data.realPnl} stake={data.real.reduce((s,p)=>s+(p.totalStake||0),0)} count={data.real.length} />
      </div>

      {/* スタイル別 */}
      <div className="text-xs opacity-70 mb-1">📊 スタイル別 (今日)</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {Object.entries(data.byStyle).map(([k, s]) => (
          <div key={k} className="text-center" style={{ background: "rgba(0,0,0,0.22)", borderRadius: 8, padding: "8px 6px", borderTop: `2px solid ${styleColor[k]}` }}>
            <div className="text-xs opacity-80" style={{ color: styleColor[k], fontWeight: 700 }}>{styleLabel[k]}</div>
            <div className="num font-bold mt-1" style={{ fontSize: 16, color: s.roi >= 1 ? "#34d399" : "#f87171" }}>
              {s.stake > 0 ? Math.round(s.roi * 100) + "%" : "—"}
            </div>
            <div className="text-xs opacity-60 mt-1">{s.count}件 / {s.hits}的中</div>
          </div>
        ))}
      </div>

      {/* 当日レース 1 件ずつ (簡易リスト) */}
      <div className="text-xs opacity-70 mb-1">🎯 本日の予想一覧 ({data.list.length}件)</div>
      <div className="space-y-2 max-h-72 overflow-y-auto scrollbar pr-1">
        {data.list
          .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
          .map((p) => <RaceLine key={p.key} p={p} onPick={onPickRace} />)}
      </div>

      {onPickRace && (
        <button className="btn btn-ghost text-xs w-full mt-3" onClick={() => onPickRace("verify")}>
          📅 全履歴を見る (検証画面) →
        </button>
      )}
    </section>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="text-center" style={{ background: "rgba(0,0,0,0.22)", borderRadius: 8, padding: "8px 6px", borderTop: `2px solid ${color}` }}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="num font-bold mt-1" style={{ fontSize: 22, color }}>{value}</div>
      <div className="text-xs opacity-50 mt-1">{sub}</div>
    </div>
  );
}

function SmallBox({ label, pnl, stake, count }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.22)" }}>
      <div className="text-xs opacity-70">{label}</div>
      <div className={"num font-bold mt-1 " + (count === 0 ? "opacity-50" : pnl >= 0 ? "text-pos" : "text-neg")} style={{ fontSize: 20 }}>
        {count === 0 ? "—" : (pnl >= 0 ? "+" : "") + yen(pnl)}
      </div>
      <div className="text-xs opacity-60 mt-1">{count}件 / 投資 {yen(stake)}</div>
    </div>
  );
}

function RaceLine({ p, onPick }) {
  const settled = !!p.result?.first;
  const correct = settled ? `${p.result.first}-${p.result.second}-${p.result.third}` : null;
  const main = (p.combos || [])[0];
  const status = p.decision === "skip" ? "skip"
              : p.decision === "no-odds" ? "noodds"
              : !settled ? "pending"
              : p.hit ? "hit" : "miss";
  const statusLabel = {
    skip: "🔴 見送り", noodds: "⚠️ オッズ不可",
    pending: "⏳ 未確定", hit: "🎯 的中", miss: "❌ 外れ",
  }[status];
  const statusColor = {
    skip: "#fca5a5", noodds: "#fcd34d", pending: "#9fb0c9",
    hit: "#34d399", miss: "#f87171",
  }[status];

  return (
    <div className="rounded-lg flex items-center gap-3 px-3 py-2" style={{
      background: "rgba(0,0,0,0.20)", borderLeft: `3px solid ${statusColor}`,
    }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">
          {p.venue} {p.raceNo}R <span className="text-xs opacity-60">{p.startTime}</span>
        </div>
        {p.decision === "buy" ? (
          <div className="text-xs opacity-80 font-mono">
            {main?.combo || "—"} ({main?.kind || ""}) / {yen(p.totalStake || 0)}
          </div>
        ) : (
          <div className="text-xs opacity-70">{p.reason || statusLabel}</div>
        )}
      </div>
      <div className="text-right" style={{ minWidth: 110 }}>
        <div className="text-xs" style={{ color: statusColor, fontWeight: 700 }}>{statusLabel}</div>
        {settled && (
          <>
            <div className="font-mono text-xs opacity-90 mt-0.5">{correct}</div>
            <div className={"num text-xs mt-0.5 " + (p.pnl >= 0 ? "text-pos" : "text-neg")}>
              {p.pnl >= 0 ? "+" : ""}{yen(p.pnl || 0)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
