import { useMemo, memo } from "react";
import { computeKpiSummary } from "../lib/verificationLog.js";

/**
 * Round 88: 「今日の結論」 最上部バナー
 *
 * ユーザーが一番知りたい 「結局どれが勝っているのか」 を 1 枚で見せる:
 *   ① 1 行 verdict: 「🏆 ⚖️ バランス型が最も優秀です」
 *   ② 数値要約: ROI / 的中率 / 収支
 *   ③ 3 スタイル並列比較 (性格 desc 付き)
 *
 * 状態:
 *   ・empty: 検証データ蓄積中
 *   ・early: 9 戦未満 (各スタイル 3 戦以上必要)
 *   ・ok: 勝者判定可 → 緑バナー
 *   ・neutral: 勝者なし (全スタイル不足)
 */
export default memo(TopVerdictBanner);

const PERSONALITY = {
  steady:     { label: "🛡️ 安定型",   shortLabel: "🛡️ 安定",  desc: "的中率特化",     color: "#3b82f6" },
  balanced:   { label: "⚖️ バランス型", shortLabel: "⚖️ バランス", desc: "実戦最適",     color: "#fbbf24" },
  aggressive: { label: "🎯 攻め型",   shortLabel: "🎯 攻め",  desc: "高配当狙い",   color: "#ef4444" },
};

function TopVerdictBanner({ predictions }) {
  const { verdict, comparison, totalCount } = useMemo(() => {
    const kpi = computeKpiSummary(predictions || {}, { preCloseOnly: true });
    const styles = ["steady", "balanced", "aggressive"];

    // BEST スタイル (3 戦以上 + ROI 最高)
    let winnerKey = null, winnerRoi = -Infinity;
    for (const s of styles) {
      const sk = kpi.byStyle[s];
      if (sk?.count >= 3 && sk?.roi != null && sk.roi > winnerRoi) {
        winnerRoi = sk.roi; winnerKey = s;
      }
    }

    const totalCount = styles.reduce((sum, s) => sum + (kpi.byStyle[s]?.count || 0), 0);

    // Round 89: 結論決定 + モバイル誤解防止
    let verdict;
    if (totalCount === 0) {
      // 不安にさせない前向きな表現
      verdict = {
        level: "empty",
        headline: "📭 これから検証データを蓄積します",
        summary: "Go 候補が出ると自動で記録されます",
        bg: "rgba(56,189,248,0.06)",
        border: "rgba(56,189,248,0.30)",
        color: "#bae6fd",
      };
    } else if (totalCount < 9) {
      const remaining = 9 - totalCount;
      verdict = {
        level: "early",
        headline: `⏳ 蓄積中 (あと ${remaining} 戦で勝者判定可)`,
        summary: `現在 ${totalCount} 戦 / 9 戦超で BEST スタイル判定開始`,
        bg: "rgba(56,189,248,0.06)",
        border: "rgba(56,189,248,0.30)",
        color: "#bae6fd",
      };
    } else if (winnerKey) {
      const win = PERSONALITY[winnerKey];
      const sk = kpi.byStyle[winnerKey];
      const profitable = sk.roi >= 1.0;
      const veryProfitable = sk.roi >= 1.10; // 控除率 25% 超 = 本格的にプラス
      // ROI < 100% でも BEST 表示する場合の誤解防止
      const subText = profitable
        ? (veryProfitable ? `${win.desc} — 控除率超え達成` : `${win.desc} — ほぼ五分`)
        : `${win.desc} — 現状ベストだが損益マイナス`;
      verdict = {
        level: "ok",
        winnerKey,
        headline: profitable
          ? `🏆 ${win.label} が最も優秀です`
          : `📊 現状 ${win.label} が最も「マシ」`,  // 誤解誘発回避
        sub: subText,
        summary: `ROI ${Math.round(sk.roi * 100)}% / 的中率 ${Math.round((sk.hitRate || 0) * 100)}% / 収支 ${sk.pnl >= 0 ? "+" : "−"}${Math.abs(sk.pnl).toLocaleString()} 円 (${sk.count} 戦)`,
        warning: !profitable ? "⚠️ 全スタイルが控除率 25% を超えていません — リアル投入は推奨しません" : null,
        bg: veryProfitable ? "rgba(16,185,129,0.10)"
            : profitable ? "rgba(251,191,36,0.10)"
            : "rgba(239,68,68,0.08)",
        border: veryProfitable ? "rgba(16,185,129,0.5)"
            : profitable ? "rgba(251,191,36,0.5)"
            : "rgba(239,68,68,0.4)",
        color: veryProfitable ? "#a7f3d0"
            : profitable ? "#fde68a"
            : "#fca5a5",
      };
    } else {
      verdict = {
        level: "neutral",
        headline: "🟡 まだ勝者判定不能",
        summary: "全スタイルが 3 戦未満 — もう少しデータが必要",
        bg: "rgba(0,0,0,0.20)",
        border: "rgba(255,255,255,0.10)",
        color: "#94a3b8",
      };
    }

    // 3 スタイル並列比較
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
    <section className="card mb-3" style={{
      background: verdict.bg,
      border: `1.5px solid ${verdict.border}`,
      padding: 12,
    }}>
      {/* === ① 1 行 verdict ヘッドライン (最重要 — モバイルで一番大きく) === */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
        marginBottom: verdict.summary ? 4 : 0,
      }}>
        <span style={{
          fontSize: 17, fontWeight: 800, color: verdict.color, lineHeight: 1.25,
          letterSpacing: "-0.01em",
        }}>
          {verdict.headline}
        </span>
        {verdict.sub && (
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.08)", color: "#cbd5e1",
            fontWeight: 600,
          }}>
            {verdict.sub}
          </span>
        )}
      </div>

      {/* === ② 数値要約 === */}
      {verdict.summary && (
        <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 6 }}>
          {verdict.summary}
        </div>
      )}

      {/* === ②+ 損益マイナス警告 (誤解防止) === */}
      {verdict.warning && (
        <div style={{
          fontSize: 10, color: "#fca5a5", lineHeight: 1.5, marginBottom: 8,
          padding: "4px 8px", borderRadius: 4,
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.3)",
        }}>
          {verdict.warning}
        </div>
      )}

      {/* === ③ 3 スタイル並列比較 (モバイル最適化: 3 列固定 + 各要素のフォントを読みやすく) === */}
      {totalCount > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",  // 横スクロール禁止 + 等幅
          gap: 6,
        }}>
          {comparison.map((c) => {
            const profitable = c.roi != null && c.roi >= 1.0;
            return (
              <div key={c.key} style={{
                padding: 8, borderRadius: 8,
                background: c.isWinner ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.20)",
                border: `1px solid ${c.isWinner ? "rgba(16,185,129,0.6)" : c.info.color + "30"}`,
                position: "relative",
                textAlign: "center",
                minWidth: 0,  // grid 子要素のオーバーフロー防止
              }}>
                {c.isWinner && (
                  <div style={{
                    position: "absolute", top: -8, right: -4,
                    padding: "2px 6px", borderRadius: 999,
                    background: "rgba(16,185,129,0.95)", color: "#fff",
                    fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                  }}>
                    🏆
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 800, color: c.info.color, lineHeight: 1.1 }}>
                  {c.info.shortLabel}
                </div>
                <div style={{ fontSize: 9, opacity: 0.7, marginTop: 1, lineHeight: 1.2 }}>
                  {c.info.desc}
                </div>
                {c.count > 0 ? (
                  <>
                    <div style={{
                      fontSize: 18, fontWeight: 900,
                      color: c.roi != null ? (profitable ? "#34d399" : "#fca5a5") : "#94a3b8",
                      lineHeight: 1.1,
                      marginTop: 4,
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {c.roi != null ? `${Math.round(c.roi * 100)}%` : "—"}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1, lineHeight: 1.3 }}>
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
                  <div style={{ fontSize: 10, opacity: 0.5, marginTop: 8 }}>
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
