import { useMemo, memo } from "react";
import { computeKpiSummary } from "../lib/verificationLog.js";

/**
 * Round 98: TopVerdictBanner premium polish
 *
 * 設計原則:
 *   ・「結局どれが勝っているのか」 を画面最上部 1 枚で
 *   ・大きい数字 + sophisticated typography + 控えめな色使い
 *   ・ROI < 100% は「優秀」 ではなく「マシ」 表現で誤解防止
 *   ・5 状態 (empty/early/winner-very-profit/winner-marginal/loss/neutral)
 */
export default memo(TopVerdictBanner);

const PERSONALITY = {
  steady:     { label: "安定型",   short: "🛡️", desc: "的中率特化",   color: "#3B82F6", soft: "rgba(59, 130, 246, 0.10)",  border: "rgba(59, 130, 246, 0.35)" },
  balanced:   { label: "バランス型", short: "⚖️", desc: "実戦最適",     color: "#F59E0B", soft: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.35)" },
  aggressive: { label: "攻め型",   short: "🎯", desc: "高配当狙い",   color: "#EF4444", soft: "rgba(239, 68, 68, 0.10)",   border: "rgba(239, 68, 68, 0.35)" },
};

function TopVerdictBanner({ predictions }) {
  const { verdict, comparison, totalCount } = useMemo(() => {
    const kpi = computeKpiSummary(predictions || {}, { preCloseOnly: true });
    const styles = ["steady", "balanced", "aggressive"];

    let winnerKey = null, winnerRoi = -Infinity;
    for (const s of styles) {
      const sk = kpi.byStyle[s];
      if (sk?.count >= 3 && sk?.roi != null && sk.roi > winnerRoi) {
        winnerRoi = sk.roi; winnerKey = s;
      }
    }
    const totalCount = styles.reduce((sum, s) => sum + (kpi.byStyle[s]?.count || 0), 0);

    let verdict;
    if (totalCount === 0) {
      verdict = {
        level: "empty",
        headline: "これから検証を蓄積します",
        emoji: "📭",
        summary: "Go 候補が出ると自動で記録されます",
        accent: "#22D3EE",
      };
    } else if (totalCount < 9) {
      const remaining = 9 - totalCount;
      verdict = {
        level: "early",
        headline: `蓄積中 (あと ${remaining} 戦で勝者判定可)`,
        emoji: "⏳",
        summary: `現在 ${totalCount} 戦 / 9 戦超で BEST スタイル判定開始`,
        accent: "#22D3EE",
      };
    } else if (winnerKey) {
      const win = PERSONALITY[winnerKey];
      const sk = kpi.byStyle[winnerKey];
      const profitable = sk.roi >= 1.0;
      const veryProfitable = sk.roi >= 1.10;
      verdict = {
        level: "ok",
        winnerKey,
        headline: profitable ? `${win.label} が最も優秀です` : `現状 ${win.label} が最もマシ`,
        emoji: profitable ? "🏆" : "📊",
        sub: profitable
          ? (veryProfitable ? `${win.desc} — 控除率超え達成` : `${win.desc} — ほぼ五分`)
          : `${win.desc} — 現状ベストだが損益マイナス`,
        summary: `ROI ${Math.round(sk.roi * 100)}% / 的中率 ${Math.round((sk.hitRate || 0) * 100)}% / 収支 ${sk.pnl >= 0 ? "+" : "−"}${Math.abs(sk.pnl).toLocaleString()} 円 (${sk.count} 戦)`,
        warning: !profitable ? "全スタイルが控除率 25% を超えていません — リアル投入は推奨しません" : null,
        accent: veryProfitable ? "#10B981" : profitable ? "#F59E0B" : "#EF4444",
      };
    } else {
      verdict = {
        level: "neutral",
        headline: "まだ勝者判定不能",
        emoji: "🟡",
        summary: "全スタイルが 3 戦未満 — もう少しデータが必要",
        accent: "#94A3B8",
      };
    }

    const comparison = styles.map((s) => {
      const sk = kpi.byStyle[s];
      const info = PERSONALITY[s];
      return {
        key: s, info,
        count: sk?.count || 0,
        roi: sk?.roi,
        hitRate: sk?.hitRate,
        isWinner: s === winnerKey,
      };
    });

    return { verdict, comparison, totalCount };
  }, [predictions]);

  return (
    <section className="card mb-3 fade-in" style={{
      padding: 16,
      background: `
        linear-gradient(135deg, ${verdict.accent}08 0%, transparent 50%),
        linear-gradient(180deg, rgba(19, 27, 48, 0.85) 0%, rgba(14, 20, 36, 0.85) 100%)
      `,
      borderColor: `${verdict.accent}40`,
    }}>
      {/* === ヘッドライン === */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap",
        marginBottom: verdict.summary || verdict.sub ? 6 : 0,
      }}>
        <div style={{ fontSize: 22, lineHeight: 1.2, flexShrink: 0 }}>{verdict.emoji}</div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div style={{
            fontSize: 17,
            fontWeight: 800,
            color: verdict.accent,
            lineHeight: 1.25,
            letterSpacing: "-0.015em",
          }}>
            {verdict.headline}
          </div>
          {verdict.sub && (
            <div style={{
              fontSize: 11.5,
              color: "var(--text-secondary)",
              marginTop: 4,
              fontWeight: 500,
              letterSpacing: "0.01em",
              lineHeight: 1.4,
            }}>
              {verdict.sub}
            </div>
          )}
        </div>
      </div>

      {/* === 数値要約 === */}
      {verdict.summary && (
        <div style={{
          fontSize: 12.5,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          marginBottom: 8,
          letterSpacing: "0.01em",
        }}>
          {verdict.summary}
        </div>
      )}

      {/* === 警告 (損益マイナス時) === */}
      {verdict.warning && (
        <div style={{
          fontSize: 10.5,
          color: "var(--c-danger-text)",
          lineHeight: 1.55,
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(239, 68, 68, 0.06)",
          border: "1px solid rgba(239, 68, 68, 0.30)",
          letterSpacing: "0.01em",
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
        }}>
          <span style={{ fontSize: 12, lineHeight: 1.4 }}>⚠️</span>
          <span>{verdict.warning}</span>
        </div>
      )}

      {/* === 3 スタイル並列比較 === */}
      {totalCount > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 6,
          marginTop: verdict.summary || verdict.warning ? 4 : 0,
        }}>
          {comparison.map((c) => {
            const profitable = c.roi != null && c.roi >= 1.0;
            const isWinner = c.isWinner;
            return (
              <div key={c.key} style={{
                padding: "10px 6px",
                borderRadius: 12,
                background: isWinner
                  ? `linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.04) 100%)`
                  : "rgba(255, 255, 255, 0.02)",
                border: `1px solid ${isWinner ? "rgba(16, 185, 129, 0.55)" : c.info.border}`,
                position: "relative",
                textAlign: "center",
                minWidth: 0,
                transition: "all 0.2s ease",
                boxShadow: isWinner ? "inset 0 1px 0 rgba(255,255,255,0.06)" : "none",
              }}>
                {isWinner && (
                  <div style={{
                    position: "absolute",
                    top: -7,
                    right: -3,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "linear-gradient(180deg, #10B981 0%, #059669 100%)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    boxShadow: "0 2px 6px rgba(16, 185, 129, 0.40)",
                  }}>
                    🏆 BEST
                  </div>
                )}
                <div style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: c.info.color,
                  lineHeight: 1.1,
                  letterSpacing: "0.01em",
                }}>
                  <span style={{ marginRight: 3 }}>{c.info.short}</span>
                  {c.info.label.replace("型", "")}
                </div>
                <div style={{
                  fontSize: 9,
                  opacity: 0.65,
                  marginTop: 2,
                  lineHeight: 1.2,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                }}>
                  {c.info.desc}
                </div>
                {c.count > 0 ? (
                  <>
                    <div className="num" style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: c.roi != null ? (profitable ? "#34D399" : "#FCA5A5") : "var(--text-quaternary)",
                      lineHeight: 1.05,
                      marginTop: 6,
                      letterSpacing: "-0.025em",
                    }}>
                      {c.roi != null ? `${Math.round(c.roi * 100)}%` : "—"}
                    </div>
                    <div style={{
                      fontSize: 9.5,
                      opacity: 0.75,
                      marginTop: 1,
                      lineHeight: 1.3,
                      fontWeight: 500,
                    }}>
                      {c.count} 戦
                      {c.hitRate != null && (
                        <>
                          <br/>
                          的中 {Math.round(c.hitRate * 100)}%
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{
                    fontSize: 10,
                    opacity: 0.45,
                    marginTop: 12,
                    lineHeight: 1.2,
                    fontWeight: 500,
                  }}>
                    未蓄積
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
