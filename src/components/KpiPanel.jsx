import { useMemo, memo } from "react";
import { computeKpiSummary, evaluateWinnability, CURRENT_VERIFICATION_VERSION } from "../lib/verificationLog.js";
import { yen } from "../lib/format.js";

/**
 * Round 73 Phase 1②: 検証 KPI パネル
 *
 * ・全体 ROI / 的中率 / 平均オッズ / 最大連敗
 * ・スタイル別 (安定 / バランス / 攻め)
 * ・健全性シグナル (サンプル不足 / ROI 低下 / 連敗注意)
 * ・「勝てる可能性」 評価 (3 段階: 未検証 / 微妙 / 勝てる)
 *
 * 検証は「直前判定型」「現在のロジック版」 のみを対象にロックして集計。
 */
export default memo(KpiPanel);

const STYLE_LABEL = {
  steady: { label: "🛡️ 安定", color: "#3b82f6" },
  balanced: { label: "⚖️ バランス", color: "#fbbf24" },
  aggressive: { label: "🎯 攻め", color: "#ef4444" },
};

const SIG_COLOR = {
  good: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.4)", color: "#a7f3d0" },
  info: { bg: "rgba(56,189,248,0.10)", border: "rgba(56,189,248,0.4)", color: "#bae6fd" },
  warning: { bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.4)", color: "#fde68a" },
  critical: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.4)", color: "#fca5a5" },
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

  return (
    <section className="card p-3 mb-3" style={{ minHeight: 100 }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-bold text-sm">📊 検証 KPI (直前判定型)</div>
        <div className="text-xs opacity-60">
          ver: {CURRENT_VERIFICATION_VERSION}
        </div>
      </div>

      {/* 「勝てる可能性」 1 行評価 */}
      <div
        className="mb-2 p-2 rounded text-xs"
        style={{
          background: verdict.ok === true ? SIG_COLOR.good.bg
                    : verdict.ok === false ? SIG_COLOR.critical.bg
                    : SIG_COLOR.warning.bg,
          border: `1px solid ${
            verdict.ok === true ? SIG_COLOR.good.border
            : verdict.ok === false ? SIG_COLOR.critical.border
            : SIG_COLOR.warning.border
          }`,
          color: verdict.ok === true ? SIG_COLOR.good.color
              : verdict.ok === false ? SIG_COLOR.critical.color
              : SIG_COLOR.warning.color,
          fontWeight: 700,
        }}
      >
        🎯 {verdict.level}: {verdict.text}
      </div>

      {/* 全体 KPI */}
      {o && o.count > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <KpiCell label="ROI" value={o.roi != null ? `${Math.round(o.roi * 100)}%` : "—"} positive={o.roi != null && o.roi >= 1.0} />
          <KpiCell label="的中率" value={o.hitRate != null ? `${Math.round(o.hitRate * 100)}%` : "—"} />
          <KpiCell label="平均オッズ" value={o.avgOdds != null ? `${o.avgOdds}倍` : "—"} />
          <KpiCell label="最大連敗" value={`${o.maxLossStreak} 戦`} negative={o.maxLossStreak >= 8} />
        </div>
      ) : (
        <div className="text-xs opacity-70 mb-2">
          検証データなし — 直前判定型 (締切 5〜15 分前) で Go 判定されたレースを蓄積中
        </div>
      )}

      {/* PnL + サンプル数 */}
      {o && o.count > 0 && (
        <div className="flex items-center gap-3 text-xs mb-2 flex-wrap" style={{ opacity: 0.85 }}>
          <span>📦 {o.count} 戦 ({o.hits} 勝 / {o.miss} 敗)</span>
          <span>💴 賭 {yen(o.stake)}</span>
          <span>💰 戻 {yen(o.ret)}</span>
          <span style={{ color: o.pnl >= 0 ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
            収支 {o.pnl >= 0 ? "+" : "−"}{yen(Math.abs(o.pnl))}
          </span>
          {o.skipCount > 0 && (
            <span style={{ opacity: 0.6 }}>
              見送り {o.skipCount} 件 (正解 {o.skipCorrect} / ミス {o.skipMissed})
            </span>
          )}
        </div>
      )}

      {/* Round 84: スタイル別 (検証アプリの中心 — 勝者ハイライト付き) */}
      {(() => {
        // 勝者判定 (3 戦以上 + ROI 最高)
        let winnerKey = null, winnerRoi = -Infinity;
        for (const s of ["steady", "balanced", "aggressive"]) {
          const sk = kpi.byStyle[s];
          if (sk?.count >= 3 && sk?.roi != null && sk.roi > winnerRoi) {
            winnerRoi = sk.roi; winnerKey = s;
          }
        }
        return (
          <>
            <div className="text-xs mb-1 opacity-70 font-bold">🏆 スタイル別成績 (どれが一番勝っているか)</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {["steady", "balanced", "aggressive"].map((s) => {
                const sk = kpi.byStyle[s];
                const info = STYLE_LABEL[s];
                const isWinner = s === winnerKey;
                return (
                  <div key={s} className="p-2 rounded" style={{
                    position: "relative",
                    background: isWinner ? "rgba(16,185,129,0.10)" : "rgba(0,0,0,0.18)",
                    border: `1px solid ${isWinner ? "rgba(16,185,129,0.6)" : info.color + "40"}`,
                  }}>
                    {isWinner && (
                      <div style={{
                        position: "absolute", top: -6, right: 4,
                        padding: "1px 6px", borderRadius: 999,
                        background: "rgba(16,185,129,0.95)", color: "#fff",
                        fontSize: 9, fontWeight: 800,
                      }}>
                        🏆 BEST
                      </div>
                    )}
                    <div className="text-xs font-bold mb-1" style={{ color: info.color }}>{info.label}</div>
                    <div className="text-xs" style={{ lineHeight: 1.4 }}>
                      {sk.count > 0 ? (
                        <>
                          <div>{sk.count} 戦・{sk.hits} 勝</div>
                          <div className="num" style={{ color: sk.roi != null && sk.roi >= 1.0 ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                            ROI {sk.roi != null ? `${Math.round(sk.roi * 100)}%` : "—"}
                          </div>
                          <div className="opacity-70">
                            連敗 {sk.maxLossStreak}・的中 {sk.hitRate != null ? Math.round(sk.hitRate * 100) : "—"}%
                          </div>
                        </>
                      ) : (
                        <div className="opacity-50">未蓄積</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* 連敗確率 (Phase 5⑩) */}
      {o && o.lossStreakProb_5 != null && (
        <div className="text-xs mb-2 p-2 rounded" style={{
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.25)",
          color: "#fca5a5",
          lineHeight: 1.5,
        }}>
          ⚠️ <b>連敗確率 (現的中率 {Math.round((o.hitRate || 0) * 100)}% で 50 戦試行時)</b>:
          5 連敗 {Math.round(o.lossStreakProb_5 * 100)}% / 10 連敗 {Math.round((o.lossStreakProb_10 || 0) * 100)}%
          <div className="opacity-80 mt-1" style={{ fontSize: 10 }}>
            連敗は当然起こる前提で資金管理してください
          </div>
        </div>
      )}

      {/* 健全性シグナル */}
      {kpi.healthSignals?.length > 0 && (
        <div className="space-y-1">
          {kpi.healthSignals.map((sig, i) => {
            const c = SIG_COLOR[sig.level] || SIG_COLOR.info;
            return (
              <div key={i}
                className="text-xs p-2 rounded"
                style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, lineHeight: 1.5 }}
              >
                {sig.level === "good" ? "✅" : sig.level === "critical" ? "🚨" : sig.level === "warning" ? "⚠️" : "💡"} {sig.text}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function KpiCell({ label, value, positive, negative }) {
  const color = positive ? "#34d399" : negative ? "#fca5a5" : "#e2e8f0";
  return (
    <div className="p-2 rounded" style={{
      background: "rgba(0,0,0,0.18)",
      border: "1px solid rgba(255,255,255,0.08)",
      textAlign: "center",
    }}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="num font-bold" style={{ fontSize: 18, color }}>
        {value}
      </div>
    </div>
  );
}
