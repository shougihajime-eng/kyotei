import { useMemo, memo } from "react";
import { computeKpiSummary, evaluateWinnability, CURRENT_VERIFICATION_VERSION } from "../lib/verificationLog.js";
import { yen } from "../lib/format.js";

/**
 * Round 101: KpiPanel premium polish
 *
 * 検証 KPI を 1 画面で:
 *   ・全体 ROI / 的中率 / 平均オッズ / 最大連敗
 *   ・スタイル別 (winner ハイライト)
 *   ・健全性シグナル
 *   ・「勝てる可能性」 verdict
 */
export default memo(KpiPanel);

const STYLE_LABEL = {
  steady:     { label: "🛡️ 安定",   desc: "的中率特化",   color: "#3B82F6" },
  balanced:   { label: "⚖️ バランス", desc: "実戦最適",   color: "#F59E0B" },
  aggressive: { label: "🎯 攻め",     desc: "高配当狙い", color: "#EF4444" },
};

const SIG_TINT = {
  good:     { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.40)", color: "#6EE7B7", icon: "✅" },
  info:     { bg: "rgba(34, 211, 238, 0.08)", border: "rgba(34, 211, 238, 0.35)", color: "#67E8F9", icon: "💡" },
  warning:  { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.40)", color: "#FCD34D", icon: "⚠️" },
  critical: { bg: "rgba(239, 68, 68, 0.08)",  border: "rgba(239, 68, 68, 0.40)",  color: "#FCA5A5", icon: "🚨" },
};

function KpiPanel({ predictions, options = {} }) {
  const kpi = useMemo(() => {
    return computeKpiSummary(predictions || {}, {
      preCloseOnly: true,
      verificationVersion: CURRENT_VERIFICATION_VERSION,
      ...options,
    });
  }, [predictions, options]);

  const verdict = useMemo(() => evaluateWinnability(kpi), [kpi]);
  const o = kpi.overall;

  const verdictTint = verdict.ok === true ? SIG_TINT.good
                    : verdict.ok === false ? SIG_TINT.critical
                    : SIG_TINT.warning;

  // BEST スタイル判定
  let winnerKey = null, winnerRoi = -Infinity;
  for (const s of ["steady", "balanced", "aggressive"]) {
    const sk = kpi.byStyle[s];
    if (sk?.count >= 3 && sk?.roi != null && sk.roi > winnerRoi) {
      winnerRoi = sk.roi; winnerKey = s;
    }
  }

  return (
    <section className="card mb-3" style={{ padding: 16 }}>
      {/* === ヘッダ === */}
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.01em" }}>
          📊 検証 KPI
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginLeft: 8, fontWeight: 500, letterSpacing: "0.04em" }}>
            (直前判定型)
          </span>
        </div>
        <div style={{ fontSize: 9.5, color: "var(--text-quaternary)", letterSpacing: "0.04em", fontFamily: "monospace" }}>
          {CURRENT_VERIFICATION_VERSION}
        </div>
      </div>

      {/* === verdict バナー === */}
      <div style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: verdictTint.bg,
        border: `1px solid ${verdictTint.border}`,
        color: verdictTint.color,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.55,
        letterSpacing: "0.01em",
      }}>
        <b style={{ fontSize: 13 }}>{verdictTint.icon} {verdict.level}</b>
        <div style={{ marginTop: 3, fontWeight: 500, opacity: 0.95 }}>
          {verdict.text}
        </div>
      </div>

      {/* === 全体 KPI 4 セル === */}
      {o && o.count > 0 ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}>
          <KpiCell label="ROI" value={o.roi != null ? `${Math.round(o.roi * 100)}%` : "—"} positive={o.roi != null && o.roi >= 1.0} />
          <KpiCell label="的中率" value={o.hitRate != null ? `${Math.round(o.hitRate * 100)}%` : "—"} />
          <KpiCell label="平均オッズ" value={o.avgOdds != null ? `${o.avgOdds}倍` : "—"} />
          <KpiCell label="最大連敗" value={`${o.maxLossStreak}`} negative={o.maxLossStreak >= 8} />
        </div>
      ) : (
        <div style={{
          fontSize: 11.5,
          color: "var(--text-tertiary)",
          marginBottom: 12,
          textAlign: "center",
          padding: "12px 8px",
          lineHeight: 1.55,
        }}>
          検証データなし — 直前判定型 (締切 3〜25 分前) で Go 判定されたレースを蓄積中
        </div>
      )}

      {/* === PnL + サンプル === */}
      {o && o.count > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
          fontSize: 11,
          color: "var(--text-secondary)",
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(0, 0, 0, 0.18)",
          border: "1px solid var(--border-subtle)",
        }}>
          <span>📦 <span className="num"><b>{o.count}</b></span> 戦 ({o.hits} 勝 / {o.miss} 敗)</span>
          <span>賭 <span className="num">{yen(o.stake)}</span></span>
          <span>戻 <span className="num">{yen(o.ret)}</span></span>
          <span style={{ color: o.pnl >= 0 ? "#34D399" : "#FCA5A5", fontWeight: 700, marginLeft: "auto" }}>
            収支 <span className="num">{o.pnl >= 0 ? "+" : "−"}{yen(Math.abs(o.pnl))}</span>
          </span>
        </div>
      )}

      {/* === 🏆 スタイル別 (winner ハイライト) === */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 6, letterSpacing: "0.04em" }}>
        🏆 スタイル別成績 (どれが一番勝っているか)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
        {["steady", "balanced", "aggressive"].map((s) => {
          const sk = kpi.byStyle[s];
          const info = STYLE_LABEL[s];
          const isWinner = s === winnerKey;
          const profitable = sk?.roi != null && sk.roi >= 1.0;
          return (
            <div key={s} style={{
              position: "relative",
              padding: "10px 6px",
              borderRadius: 12,
              background: isWinner
                ? "linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.04) 100%)"
                : "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${isWinner ? "rgba(16, 185, 129, 0.55)" : info.color + "30"}`,
              boxShadow: isWinner ? "inset 0 1px 0 rgba(255,255,255,0.06)" : "none",
              textAlign: "center",
              minWidth: 0,
            }}>
              {isWinner && (
                <div style={{
                  position: "absolute", top: -7, right: -3,
                  padding: "2px 7px", borderRadius: 999,
                  background: "linear-gradient(180deg, #10B981 0%, #059669 100%)",
                  color: "#fff",
                  fontSize: 9, fontWeight: 800,
                  letterSpacing: "0.06em",
                  boxShadow: "0 2px 6px rgba(16, 185, 129, 0.40)",
                }}>
                  🏆 BEST
                </div>
              )}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: info.color, lineHeight: 1.1, letterSpacing: "0.01em" }}>
                {info.label}
              </div>
              <div style={{ fontSize: 9, opacity: 0.65, marginTop: 1, lineHeight: 1.2, fontWeight: 500, letterSpacing: "0.04em" }}>
                {info.desc}
              </div>
              {sk.count > 0 ? (
                <>
                  <div className="num" style={{
                    fontSize: 18, fontWeight: 800,
                    color: profitable ? "#34D399" : "#FCA5A5",
                    lineHeight: 1.1,
                    marginTop: 5,
                    letterSpacing: "-0.025em",
                  }}>
                    ROI {sk.roi != null ? `${Math.round(sk.roi * 100)}%` : "—"}
                  </div>
                  <div style={{ fontSize: 9.5, opacity: 0.75, marginTop: 1, lineHeight: 1.4, fontWeight: 500 }}>
                    {sk.count} 戦・{sk.hits} 勝
                    <br/>
                    連敗 {sk.maxLossStreak}・的中 {sk.hitRate != null ? Math.round(sk.hitRate * 100) : "—"}%
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10, opacity: 0.45, marginTop: 12, fontWeight: 500 }}>
                  未蓄積
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* === 連敗確率 === */}
      {o && o.lossStreakProb_5 != null && (
        <div style={{
          fontSize: 11,
          marginBottom: 8,
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(239, 68, 68, 0.06)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          color: "var(--c-danger-text)",
          lineHeight: 1.55,
        }}>
          <b>⚠️ 連敗確率</b> (現的中率 {Math.round((o.hitRate || 0) * 100)}% で 50 戦試行時)
          <div style={{ marginTop: 3, fontSize: 11.5 }}>
            5 連敗 <b className="num">{Math.round(o.lossStreakProb_5 * 100)}%</b>
            {" · "}
            10 連敗 <b className="num">{Math.round((o.lossStreakProb_10 || 0) * 100)}%</b>
          </div>
          <div style={{ opacity: 0.75, marginTop: 3, fontSize: 9.5, fontWeight: 500 }}>
            連敗は当然起こる前提で資金管理してください
          </div>
        </div>
      )}

      {/* === 健全性シグナル === */}
      {kpi.healthSignals?.length > 0 && (
        <div style={{ display: "grid", gap: 5 }}>
          {kpi.healthSignals.map((sig, i) => {
            const c = SIG_TINT[sig.level] || SIG_TINT.info;
            return (
              <div key={i} style={{
                fontSize: 11,
                padding: "7px 10px",
                borderRadius: 8,
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.color,
                lineHeight: 1.5,
                letterSpacing: "0.005em",
              }}>
                {c.icon} {sig.text}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function KpiCell({ label, value, positive, negative }) {
  const color = positive ? "#34D399" : negative ? "#FCA5A5" : "var(--text-primary)";
  return (
    <div style={{
      padding: "10px 8px",
      borderRadius: 10,
      background: "rgba(0, 0, 0, 0.20)",
      border: "1px solid var(--border-subtle)",
      textAlign: "center",
      transition: "border-color 0.18s ease",
    }}>
      <div style={{
        fontSize: 9.5,
        color: "var(--text-tertiary)",
        marginBottom: 3,
        letterSpacing: "0.06em",
        fontWeight: 600,
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div className="num kpi-num" style={{ fontSize: 20, color }}>
        {value}
      </div>
    </div>
  );
}
