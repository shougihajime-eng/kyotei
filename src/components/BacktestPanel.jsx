/**
 * バックテストパネル (Round 186 / SPEC §13.2)
 *
 * 🔬 研究所タブに表示される、 過去ログからの 5 指標集計 UI。
 * 期間切替 (7日 / 14日 / 30日 / 全期間) で「予想精度」 を客観的に確認できる。
 */
import { useMemo, useState } from "react";
import { runBacktest } from "../lib/mansyuBacktest.js";

const PERIODS = [
  { k: 7,    label: "7日" },
  { k: 14,   label: "14日" },
  { k: 30,   label: "30日" },
  { k: "all", label: "全期間" },
];

export default function BacktestPanel() {
  const [period, setPeriod] = useState(7);
  const result = useMemo(() => runBacktest({ days: period }), [period]);

  return (
    <section style={{
      padding: "16px 18px",
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(34, 211, 238, 0.06) 0%, rgba(15, 23, 42, 0.40) 100%)",
      border: "1.5px solid rgba(34, 211, 238, 0.30)",
      marginBottom: 14,
    }}>
      {/* ヘッダー */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 12, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.02em" }}>
          📊 バックテスト
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>
          過去予想の客観的成績
        </div>
      </div>

      {/* 期間切替タブ */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {PERIODS.map((p) => {
          const active = period === p.k;
          return (
            <button
              key={String(p.k)}
              onClick={() => setPeriod(p.k)}
              style={{
                flex: "1 1 70px", minHeight: 36,
                padding: "6px 12px",
                borderRadius: 999,
                background: active
                  ? "linear-gradient(180deg, rgba(34, 211, 238, 0.20) 0%, rgba(34, 211, 238, 0.08) 100%)"
                  : "rgba(255,255,255,0.04)",
                border: active ? "1.5px solid rgba(34, 211, 238, 0.55)" : "1px solid rgba(148, 163, 184, 0.30)",
                color: active ? "#67E8F9" : "#cbd5e1",
                fontSize: 12.5, fontWeight: active ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                WebkitTapHighlightColor: "transparent",
              }}>
              {p.label}
            </button>
          );
        })}
      </div>

      {/* メッセージ (データ不足時) */}
      {result.message && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(245, 158, 11, 0.10)",
          border: "1px solid rgba(245, 158, 11, 0.30)",
          color: "#FCD34D",
          fontSize: 12, lineHeight: 1.55,
          marginBottom: 10,
        }}>
          ⚠️ {result.message}
        </div>
      )}

      {/* 5 指標カード */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}>
        <Metric
          label="的中率"
          value={result.hitRate != null ? `${(result.hitRate * 100).toFixed(0)}%` : "—"}
          sub={result.showWithBuyCount > 0 ? `${result.hitCount}/${result.showWithBuyCount}件` : ""}
          color="#FCD34D"
        />
        <Metric
          label="回収率"
          value={result.roi != null ? `${(result.roi * 100).toFixed(0)}%` : "—"}
          sub={result.totalStake > 0 ? `${result.totalReturn.toLocaleString()}/${result.totalStake.toLocaleString()}円` : ""}
          color={result.roi != null && result.roi >= 1 ? "#86EFAC" : "#FCA5A5"}
        />
        <Metric
          label="期待値"
          value={result.avgPnl != null
            ? `${result.avgPnl >= 0 ? "+" : ""}${Math.round(result.avgPnl).toLocaleString()}円`
            : "—"}
          sub="1レースあたり"
          color={result.avgPnl != null && result.avgPnl >= 0 ? "#86EFAC" : "#FCA5A5"}
        />
        <Metric
          label="最大連敗"
          value={result.maxLosingStreak != null ? `${result.maxLosingStreak}連敗` : "—"}
          sub="show判定の連続外れ"
          color={result.maxLosingStreak != null && result.maxLosingStreak >= 5 ? "#FCA5A5" : "#cbd5e1"}
        />
        <Metric
          label="見送り精度"
          value={result.skipAccuracy != null ? `${(result.skipAccuracy * 100).toFixed(0)}%` : "—"}
          sub={result.skipWithResultCount > 0 ? `${result.correctSkip}/${result.skipWithResultCount}件` : ""}
          color="#67E8F9"
        />
      </div>

      {/* サンプル情報 */}
      <div style={{
        marginTop: 10, padding: "8px 10px",
        background: "rgba(0,0,0,0.30)", borderRadius: 8,
        fontSize: 11, color: "#94A3B8", lineHeight: 1.55,
      }}>
        🗂 集計対象: 確定済 <b className="num">{result.sampleSize}</b> 件
        (show <b className="num">{result.showCount}</b> / skip <b className="num">{result.skipCount}</b>)
        <br/>
        💡 「感覚で良くなった」 を排除するための客観指標。 重みを変えた前後でこの数字が改善しているか確認。
      </div>
    </section>
  );
}

function Metric({ label, value, sub, color }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(0,0,0,0.30)",
      border: "1px solid rgba(148, 163, 184, 0.20)",
    }}>
      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div className="num" style={{
        fontSize: 22, fontWeight: 800, color,
        lineHeight: 1.0, marginTop: 4, letterSpacing: "-0.01em",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, fontWeight: 500 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
