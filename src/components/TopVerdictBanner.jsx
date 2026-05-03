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

    // 結論決定
    let verdict;
    if (totalCount === 0) {
      verdict = {
        level: "empty",
        headline: "📭 検証データ蓄積中",
        summary: "Go 候補が出たら自動で記録されます — まず 9 戦の蓄積を",
        bg: "rgba(0,0,0,0.20)",
        border: "rgba(255,255,255,0.10)",
        color: "#94a3b8",
      };
    } else if (totalCount < 9) {
      verdict = {
        level: "early",
        headline: "⏳ 検証蓄積中",
        summary: `現在 ${totalCount} 戦 (各スタイル 3 戦以上 = 計 9 戦超で勝者判定開始)`,
        bg: "rgba(251,191,36,0.08)",
        border: "rgba(251,191,36,0.4)",
        color: "#fde68a",
      };
    } else if (winnerKey) {
      const win = PERSONALITY[winnerKey];
      const sk = kpi.byStyle[winnerKey];
      const profitable = sk.roi >= 1.0;
      verdict = {
        level: "ok",
        winnerKey,
        headline: `🏆 ${win.label} が最も優秀です`,
        sub: win.desc,
        summary: `ROI ${Math.round(sk.roi * 100)}% / 的中率 ${Math.round((sk.hitRate || 0) * 100)}% / 収支 ${sk.pnl >= 0 ? "+" : "−"}${Math.abs(sk.pnl).toLocaleString()} 円 (${sk.count} 戦)`,
        bg: profitable ? "rgba(16,185,129,0.10)" : "rgba(251,191,36,0.10)",
        border: profitable ? "rgba(16,185,129,0.5)" : "rgba(251,191,36,0.5)",
        color: profitable ? "#a7f3d0" : "#fde68a",
      };
    } else {
      verdict = {
        level: "neutral",
        headline: "🟡 まだ勝者判定不能",
        summary: "全スタイルがサンプル不足 (各 3 戦以上必要)",
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
      {/* === ① 1 行 verdict ヘッドライン === */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
        marginBottom: verdict.summary ? 4 : 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: verdict.color, lineHeight: 1.2 }}>
          {verdict.headline}
        </span>
        {verdict.sub && (
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.08)", color: "#cbd5e1",
            fontWeight: 600,
          }}>
            {verdict.sub}
          </span>
        )}
      </div>

      {/* === ② 数値要約 === */}
      {verdict.summary && (
        <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 8 }}>
          {verdict.summary}
        </div>
      )}

      {/* === ③ 3 スタイル並列比較 === */}
      {totalCount > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          fontSize: 11,
        }}>
          {comparison.map((c) => {
            const profitable = c.roi != null && c.roi >= 1.0;
            return (
              <div key={c.key} style={{
                padding: 6, borderRadius: 6,
                background: c.isWinner ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.18)",
                border: `1px solid ${c.isWinner ? "rgba(16,185,129,0.6)" : c.info.color + "30"}`,
                position: "relative",
                textAlign: "center",
              }}>
                {c.isWinner && (
                  <div style={{
                    position: "absolute", top: -6, right: -2,
                    padding: "1px 5px", borderRadius: 999,
                    background: "rgba(16,185,129,0.95)", color: "#fff",
                    fontSize: 8, fontWeight: 800,
                  }}>
                    🏆
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: c.info.color, marginBottom: 1 }}>
                  {c.info.shortLabel}
                </div>
                <div style={{ fontSize: 8, opacity: 0.65, marginBottom: 2 }}>{c.info.desc}</div>
                {c.count > 0 ? (
                  <>
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: c.roi != null ? (profitable ? "#34d399" : "#fca5a5") : "#94a3b8",
                      lineHeight: 1.1,
                    }}>
                      {c.roi != null ? `${Math.round(c.roi * 100)}%` : "—"}
                    </div>
                    <div style={{ fontSize: 9, opacity: 0.7 }}>
                      {c.count} 戦
                      {c.hitRate != null && ` / 的中 ${Math.round(c.hitRate * 100)}%`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, opacity: 0.5 }}>未蓄積</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
