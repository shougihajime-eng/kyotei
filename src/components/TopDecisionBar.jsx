/**
 * Top Decision Bar (Round 54-56) — 純粋コンポーネント (state なし / effect なし)
 *
 * @typedef {Object} VisibleData
 * 必須フィールド:
 * @property {Object<string, Object>} predictions  - フィルタ済み予測データ
 * @property {boolean} hasData                     - データあり
 * @property {boolean} isEmpty                     - データなし
 * @property {Object} countsByStyle                - { steady, balanced, aggressive }
 * @property {Object} roiByStyle                   - 各スタイル ROI (null 可)
 * @property {Object} pnlSummary                   - { air, real } 集計
 * 任意フィールド:
 * @property {boolean} [isLegacyMixed]            - legacy 混在
 * @property {string|null} [lastUpdated]          - 最終 snapshotAt (ISO)
 * @property {boolean} [isReady]                  - 準備完了
 * @property {boolean} [isLoading]                - 読込中
 * @property {string|null} [error]                - エラー (なければ null)
 * @property {string|null} [bestStyle]            - 最良 ROI スタイル
 * @property {boolean} [driftDetected]            - 選択 vs 最良のズレ
 * @property {string|null} [currentStyle]         - 現在選択中
 * @property {boolean} [showLegacy]               - legacy 表示モード
 * @property {Object} [versionInfo]               - { v2Count, legacyCount, ... }
 *
 * @typedef {Object} TopDecisionBarProps
 * @property {VisibleData} visibleData            - getVisibleData() の戻り値
 * @property {string} currentStyle                - "steady" | "balanced" | "aggressive"
 * @property {function(string): void} switchProfile
 * @property {function(): void} [onRetry]         - エラー時の再取得コールバック (任意)
 */
import { memo } from "react";
import { yen } from "../lib/format.js";

/* === 型ガード: visibleData の必須フィールドを検証 === */
export function validateVisibleData(vd) {
  if (!vd || typeof vd !== "object") return "visibleData prop が未指定";
  const required = ["predictions", "countsByStyle", "roiByStyle", "pnlSummary", "isEmpty", "hasData"];
  for (const k of required) {
    if (!(k in vd)) return `visibleData.${k} が欠落`;
  }
  if (typeof vd.countsByStyle !== "object" || vd.countsByStyle == null) return "countsByStyle 不正";
  if (typeof vd.pnlSummary !== "object" || vd.pnlSummary == null) return "pnlSummary 不正";
  return null;
}

/* === 4 系統状態判定: isLoading / error / empty / ready === */
function determineUIState(vd) {
  if (vd.error) return "error";
  if (vd.isLoading) return "loading";
  if (vd.isEmpty || !vd.hasData) return "empty";
  return "ready";
}

/* === Round 61: 購入レース分析パネル (少数精鋭学習) === */
function PurchaseAnalysisPanel({ analysis }) {
  const { sampleSize, summary, winPatterns = [], lossPatterns = [], recent = [] } = analysis;
  if (sampleSize === 0) return null;
  const wins = recent.filter(r => r.label?.kind === "win").length;
  const losses = recent.length - wins;
  return (
    <div className="mb-3 p-3 rounded" style={{
      background: "rgba(56,189,248,0.06)",
      border: "1px solid rgba(56,189,248,0.3)",
    }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs font-bold" style={{ color: "#bae6fd" }}>
          🔬 直近 {sampleSize} 件の購入レース分析
        </div>
        <div className="text-xs opacity-80">{wins}勝{losses}敗</div>
      </div>
      <div className="text-xs opacity-90 mb-2" style={{ lineHeight: 1.5 }}>{summary}</div>
      {/* 勝ちパターン */}
      {winPatterns.length > 0 && (
        <div className="mb-2">
          <div className="text-xs opacity-70 mb-1" style={{ color: "#a7f3d0" }}>✅ 勝ちパターン:</div>
          <div className="flex gap-1 flex-wrap">
            {winPatterns.map((w, i) => (
              <span key={i} className="pill" style={{ fontSize: 10, background: "rgba(16,185,129,0.18)", color: "#a7f3d0", border: "1px solid rgba(16,185,129,0.4)" }}>
                {w.label} × {w.count}
              </span>
            ))}
          </div>
        </div>
      )}
      {/* 負けパターン */}
      {lossPatterns.length > 0 && (
        <div className="mb-2">
          <div className="text-xs opacity-70 mb-1" style={{ color: "#fca5a5" }}>❌ 負けパターン:</div>
          <div className="flex gap-1 flex-wrap">
            {lossPatterns.map((l, i) => (
              <span key={i} className="pill" style={{ fontSize: 10, background: "rgba(239,68,68,0.18)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.4)" }}>
                {l.key} × {l.count}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs opacity-60 mt-2" style={{ lineHeight: 1.5 }}>
        💡 「数をこなす」 でなく「1 戦ごとに精度を上げる」 設計 — 少数精鋭学習
      </div>
    </div>
  );
}

/* === Round 57-58: Go モードパネル (実戦モード) ===
   visibleData.goMode を読み、 上位 3 件・本日の信頼度・抑制理由・除外件数を表示。
   閾値未満なら購買 UI を抑制し 「今日は見送り推奨」 を強制する。 */
function GoModePanel({ goMode }) {
  const {
    goPicks = [],
    dayConfidence = 0,
    confidenceLabel = "様子見",
    confidenceReason = "",
    suppressedReason = null,
    totalCandidates = 0,
    excludedCount = 0,
    excludedReasons = [],
    threshold = 60,
    preCloseMode = false,
    preCloseRaceCount = 0,
    preCloseWindow = null,
    preCloseThresholds = null,
  } = goMode || {};
  const isSuppressed = !!suppressedReason || confidenceLabel === "見送り推奨";
  // Round 99: ステータス accent カラー (洗練)
  const accent = confidenceLabel === "Go" ? "#10B981"
              : confidenceLabel === "様子見" ? "#F59E0B"
              : "#EF4444";
  const accentText = confidenceLabel === "Go" ? "#34D399"
                  : confidenceLabel === "様子見" ? "#FCD34D"
                  : "#FCA5A5";

  const excludedTooltip = excludedReasons.length > 0
    ? excludedReasons.slice(0, 5).map(e => `${e.venue || ""} ${e.raceNo || ""}R: ${e.reason}`).join("\n")
    : "除外なし";

  return (
    <div style={{
      marginBottom: 12,
      padding: 14,
      borderRadius: 14,
      background: `linear-gradient(180deg, ${accent}10 0%, rgba(0,0,0,0.10) 100%)`,
      border: `1px solid ${accent}40`,
    }}>
      {/* === 信頼度ヒーロー: 大きい数字 + ラベルピル === */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-baseline gap-2.5">
          <span style={{ fontSize: 10.5, color: "var(--text-quaternary)", letterSpacing: "0.10em", fontWeight: 600, textTransform: "uppercase" }}>
            本日の信頼度
          </span>
          <span className="num kpi-num" style={{ fontSize: 30, color: accentText, lineHeight: 1 }} aria-label={`信頼度 ${dayConfidence} / 100`}>
            {dayConfidence}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-quaternary)" }}>
            / 100
          </span>
        </div>
        <span style={{
          padding: "5px 12px",
          borderRadius: 999,
          background: `${accent}18`,
          border: `1px solid ${accent}50`,
          color: accentText,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}>
          {confidenceLabel === "Go" ? "🎯 直前候補あり" : confidenceLabel === "様子見" ? "⚠️ 様子見" : "📊 見送り推奨"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.55 }}>
        {confidenceReason}
      </div>

      {/* === 直前判定型バッジ (cyan tint) === */}
      {preCloseMode && (
        <div style={{
          fontSize: 11,
          marginBottom: 8,
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(34, 211, 238, 0.08)",
          border: "1px solid rgba(34, 211, 238, 0.30)",
          color: "var(--brand-text)",
          lineHeight: 1.55,
        }}>
          <b>⏰ 直前判定型</b> — 締切 {preCloseWindow?.min ?? 3}〜{preCloseWindow?.max ?? 25} 分前のレースを評価
          <div style={{ opacity: 0.85, marginTop: 2 }}>
            {preCloseRaceCount > 0
              ? `対象 ${preCloseRaceCount} レース`
              : "対象レースなし (時間外)"}
            {preCloseThresholds && ` / 判定基準 EV≥${Math.round(preCloseThresholds.ev * 100)}% + 自信≥${preCloseThresholds.confidence}`}
          </div>
        </div>
      )}

      {/* === 除外バッジ (subtle warn tint) === */}
      {excludedCount > 0 && (
        <div title={excludedTooltip} style={{
          fontSize: 11,
          color: "var(--c-warning-text)",
          marginBottom: 10,
          opacity: 0.85,
          lineHeight: 1.5,
        }}>
          ⚠️ <b>{excludedCount} 件除外</b>
          <span style={{ opacity: 0.8, marginLeft: 4 }}>
            (オッズ未取得 / データ欠損 — ホバーで詳細)
          </span>
        </div>
      )}

      {/* === 抑制理由 (赤背景) === */}
      {suppressedReason && (
        <div style={{
          fontSize: 11.5,
          marginBottom: 10,
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.30)",
          color: "var(--c-danger-text)",
          lineHeight: 1.55,
        }}>
          <b>🛑 購買 UI を抑制中</b>
          <div style={{ marginTop: 4, fontWeight: 500 }}>{suppressedReason}</div>
        </div>
      )}

      {/* === Top picks (premium card) === */}
      {goPicks.length > 0 && !isSuppressed ? (
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--c-success-text)",
            marginBottom: 8,
            letterSpacing: "0.02em",
          }}>
            🎯 直前判定で条件を満たした候補 ({goPicks.length} 件 / 勝利保証なし)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            {goPicks.map((p, i) => (
              <div key={p.raceId} style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}>
                <div className="flex items-center gap-3">
                  <div className="num" style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "var(--c-warning-text)",
                    minWidth: 26,
                  }}>
                    #{i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" }}>
                      {p.race?.venue} <span className="num">{p.race?.raceNo}R</span>
                      <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11, fontWeight: 500 }}>{p.race?.startTime}</span>
                    </div>
                    <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                      {STYLE_LABELS[p.style]?.label} / <b>{p.mainCombo}</b> ({p.recommendation?.main?.kind})
                    </div>
                    {p.simpleReason && (
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{p.simpleReason}</div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 800, color: "var(--c-success-text)" }}>
                    EV {Math.round(p.ev * 100)}%
                  </div>
                  <div style={{ fontSize: 10.5, opacity: 0.75, marginTop: 1 }}>
                    自信 {p.confidence}/100
                  </div>
                </div>
              </div>
            ))}
          </div>
          {totalCandidates > goPicks.length && (
            <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 8, lineHeight: 1.5 }}>
              💡 他 {totalCandidates - goPicks.length} 件は EV/自信 が低いため除外 (top {goPicks.length} のみ表示)
            </div>
          )}
        </div>
      ) : isSuppressed ? (
        <div style={{
          fontSize: 11.5,
          padding: 12,
          borderRadius: 10,
          background: "rgba(0, 0, 0, 0.22)",
          lineHeight: 1.6,
          color: "var(--text-secondary)",
        }}>
          <b>📊 本日は見送り推奨</b>
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            無理に買わない判断もアプリの価値です。 「📅 検証」 で過去の実績を振り返ってください。
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, opacity: 0.7, padding: "8px 0" }}>
          候補レース蓄積中…
        </div>
      )}
    </div>
  );
}

const STYLE_LABELS = {
  steady:     { label: "🛡️ 本命型",   color: "#3b82f6" },
  balanced:   { label: "⚖️ バランス型", color: "#fbbf24" },
  aggressive: { label: "🎯 穴狙い型",  color: "#ef4444" },
};

export default memo(TopDecisionBar);
/** @param {TopDecisionBarProps} props */
function TopDecisionBar({ visibleData, currentStyle, switchProfile, onRetry }) {
  // Round 58: goMode は visibleData から取得 (単一ソース)
  const goMode = visibleData?.goMode;
  // 1. 型ガード — 不整合なら安全フォールバック
  const validationError = validateVisibleData(visibleData);
  if (validationError) {
    return (
      <section className="card p-3" style={{ minHeight: 80, borderColor: "#ef4444", borderWidth: 1 }} aria-live="polite" role="status">
        <div className="text-xs" style={{ color: "#fecaca", lineHeight: 1.5 }}>
          ⚠️ <b>TopDecisionBar 不整合</b>: {validationError}<br/>
          <span className="opacity-80">getVisibleData() の戻り値を確認してください</span>
        </div>
      </section>
    );
  }

  // 2. 4 系統状態判定
  const uiState = determineUIState(visibleData);

  // === 状態 A: error ===
  if (uiState === "error") {
    return (
      <section className="card p-4" style={{ minHeight: 120, borderColor: "#ef4444", borderWidth: 2 }} aria-live="polite" role="alert">
        <div className="font-bold mb-2" style={{ color: "#fecaca" }}>⚠️ 通信エラー</div>
        <div className="text-xs opacity-90 mb-3" style={{ lineHeight: 1.55 }}>
          {visibleData.error}<br/>
          ローカル保存は影響を受けていません。 再取得を試してください。
        </div>
        {visibleData.lastUpdated && (
          <div className="text-xs opacity-70 mb-2">
            最終更新: {new Date(visibleData.lastUpdated).toLocaleTimeString("ja-JP")}
          </div>
        )}
        {onRetry && (
          <button onClick={onRetry} className="btn btn-primary text-xs" style={{ minHeight: 36 }}>
            🔄 再取得
          </button>
        )}
      </section>
    );
  }

  // === 状態 B: loading ===
  if (uiState === "loading") {
    return (
      <section className="card p-4" style={{ minHeight: 120, borderColor: "#3b82f6", borderWidth: 2 }} aria-live="polite" role="status">
        <div className="font-bold mb-2" style={{ color: "#bae6fd" }}>⏳ データ取得中…</div>
        <div className="text-xs opacity-80" style={{ lineHeight: 1.55 }}>
          AI がレース情報を確認しています。 通常 5-10 秒で完了します。
        </div>
        <div className="skeleton mt-3" style={{ height: 60 }}></div>
      </section>
    );
  }

  // === 状態 C: empty ===
  if (uiState === "empty") {
    return (
      <section className="card p-4" style={{ minHeight: 120, borderColor: "#6b7280", borderWidth: 1 }} aria-live="polite" role="status">
        <div className="font-bold mb-2">📭 該当データなし</div>
        <div className="text-xs opacity-80 mb-3" style={{ lineHeight: 1.55 }}>
          v2 データがまだ蓄積されていません。<br/>
          以下のいずれかをお試しください:
        </div>
        <ul className="text-xs opacity-90" style={{ paddingLeft: 16, listStyle: "disc", lineHeight: 1.7 }}>
          <li>「🔄 更新」 を押して当日のレース情報を取得</li>
          <li>開催時間中 (10-22 時) にアクセス</li>
          <li>「📅 検証」 → 「+ 手動記録」 で過去のレースを記録</li>
          <li>条件を緩める (Settings で EV 下限調整)</li>
        </ul>
      </section>
    );
  }

  // === 状態 D: ready (本来の表示) ===
  const {
    countsByStyle = { steady: 0, balanced: 0, aggressive: 0 },
    roiByStyle = { steady: null, balanced: null, aggressive: null },
    pnlSummary = { air: null, real: null },
    bestStyle = null,
    driftDetected = false,
    lastUpdated = null,
  } = visibleData;
  const hasData = visibleData.hasData;
  const isEmpty = visibleData.isEmpty;
  const error = visibleData.error;

  /* ヘッドライン (visibleData の値だけで決定) */
  let headline, headlineMode;
  if (error) {
    headline = `⚠️ エラー: ${error}`;
    headlineMode = "error";
  } else if (isEmpty || !hasData) {
    headline = "📭 v2 データなし — 「🔄 更新」 を押して開始";
    headlineMode = "empty";
  } else if (bestStyle) {
    headline = `🏆 今日のおすすめ: ${STYLE_LABELS[bestStyle].label}`;
    headlineMode = "best";
  } else {
    headline = "💡 実績データ蓄積中 — 各スタイルの候補をご確認ください";
    headlineMode = "neutral";
  }

  const air = pnlSummary?.air;
  const real = pnlSummary?.real;

  // Round 59: 日付不一致時はエラーバッジ
  const dateConsistency = visibleData.dateConsistency;
  const effectiveRaceDate = visibleData.effectiveRaceDate;
  const daySummary = visibleData.daySummary;
  const goModeStats = visibleData.goModeStats;
  const skipImpact = visibleData.skipImpact;
  const streakStats = visibleData.streakStats;

  return (
    <section className="card card-glow p-3" style={{ minHeight: 140 }} aria-live="polite">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-bold text-sm">
          ⚡ 今日の結論
          {effectiveRaceDate && (
            <span className="ml-2 opacity-70 text-xs">📅 {effectiveRaceDate}</span>
          )}
        </div>
        {lastUpdated && (
          <div className="text-xs opacity-60">
            最終更新 {new Date(lastUpdated).toLocaleTimeString("ja-JP")}
          </div>
        )}
      </div>

      {/* Round 59: 日付不一致警告 */}
      {dateConsistency && !dateConsistency.match && (
        <div className="mb-2 p-2 rounded text-xs" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5" }}>
          ⚠️ <b>日付不一致</b>: {dateConsistency.message}<br/>
          「🔄 更新」 でデータを再取得してください
        </div>
      )}

      {/* Round 60: 精度低下警告 (degrading / critical 時のみ) */}
      {visibleData.accuracyHealth && (visibleData.accuracyHealth.level === "degrading" || visibleData.accuracyHealth.level === "critical") && (
        <div className="mb-2 p-2 rounded text-xs" style={{
          background: visibleData.accuracyHealth.level === "critical" ? "rgba(239,68,68,0.15)" : "rgba(251,191,36,0.12)",
          border: `1px solid ${visibleData.accuracyHealth.level === "critical" ? "rgba(239,68,68,0.5)" : "rgba(251,191,36,0.4)"}`,
          color: visibleData.accuracyHealth.level === "critical" ? "#fca5a5" : "#fde68a",
          lineHeight: 1.5,
        }}>
          <b>{visibleData.accuracyHealth.label}</b>: {visibleData.accuracyHealth.message}<br/>
          <span className="opacity-80" style={{ fontSize: 10 }}>
            ※ EV 閾値を {visibleData.isDegraded ? "125%" : "120%"} に引き上げて保守運用中
          </span>
        </div>
      )}

      {/* Round 59: 本日サマリ (短文) + 連勝バッジ */}
      {daySummary && (
        <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-bold" style={{
            color: daySummary.tone === "ok" ? "#a7f3d0"
                 : daySummary.tone === "warn" ? "#fde68a"
                 : daySummary.tone === "neg" ? "#fca5a5"
                 : daySummary.tone === "info" ? "#bae6fd"
                 : "#9fb0c9"
          }}>
            {daySummary.label}
          </div>
          {streakStats && streakStats.currentStreakCount > 0 && (
            <span className="pill" style={{
              background: streakStats.tone === "ok" ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)",
              color: streakStats.tone === "ok" ? "#a7f3d0" : "#fca5a5",
              fontSize: 11,
            }}>
              {streakStats.label}
            </span>
          )}
        </div>
      )}
      {daySummary && (
        <div className="text-xs opacity-80 mb-3" style={{ lineHeight: 1.5 }}>{daySummary.detail}</div>
      )}

      <div className="text-sm font-bold mb-3" style={{
        color: bestStyle ? STYLE_LABELS[bestStyle].color : "#fde68a",
        lineHeight: 1.4,
      }}>
        {headline}
      </div>

      {/* Round 57: 実戦モード (Go) + 本日の信頼度 */}
      {goMode && (
        <GoModePanel goMode={goMode} />
      )}

      {/* Round 62: deepReview activeWarning (頻出ミス警告) */}
      {visibleData.deepReview?.activeWarning && (
        <div className="mb-2 p-2 rounded text-xs" style={{
          background: "rgba(239,68,68,0.10)",
          border: "1px solid rgba(239,68,68,0.4)",
          color: "#fca5a5",
          lineHeight: 1.5,
        }}>
          {visibleData.deepReview.activeWarning}
          {visibleData.deepReview.dynamicGuards?.length > 0 && (
            <div className="opacity-90 mt-1" style={{ fontSize: 11 }}>
              💡 自動ガード: {visibleData.deepReview.dynamicGuards.map(g => g.action).join(" / ")}
            </div>
          )}
        </div>
      )}

      {/* Round 61: 直近購入レース分析 (勝ちパターン / 負けパターン) */}
      {visibleData.purchaseAnalysis?.sampleSize > 0 && (
        <PurchaseAnalysisPanel analysis={visibleData.purchaseAnalysis} />
      )}

      {/* Round 59: Go モード実績 + 見送り効果 */}
      {(goModeStats?.sampleSize > 0 || skipImpact?.sampleSize > 0) && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {goModeStats?.sampleSize > 0 && (
            <div className="p-2 rounded text-xs" style={{
              background: goModeStats.isPositive ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
              border: `1px solid ${goModeStats.isPositive ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
              color: goModeStats.isPositive ? "#a7f3d0" : "#fca5a5",
              lineHeight: 1.5,
            }}>
              <div className="opacity-80" style={{ fontSize: 10 }}>📊 Go モード実績 (直近 {goModeStats.sampleSize} 件)</div>
              <div className="font-bold" style={{ fontSize: 13, marginTop: 2 }}>{goModeStats.label}</div>
              <div className="opacity-80 mt-1" style={{ fontSize: 11 }}>
                収支 {goModeStats.pnl >= 0 ? "+" : ""}{goModeStats.pnl.toLocaleString()}円
              </div>
            </div>
          )}
          {skipImpact?.sampleSize > 0 && (
            <div className="p-2 rounded text-xs" style={{
              background: skipImpact.isPositive ? "rgba(16,185,129,0.10)" : "rgba(251,191,36,0.10)",
              border: `1px solid ${skipImpact.isPositive ? "rgba(16,185,129,0.4)" : "rgba(251,191,36,0.4)"}`,
              color: skipImpact.isPositive ? "#a7f3d0" : "#fde68a",
              lineHeight: 1.5,
            }}>
              <div className="opacity-80" style={{ fontSize: 10 }}>🛡️ 見送り効果 ({skipImpact.sampleSize} 件)</div>
              <div className="font-bold" style={{ fontSize: 13, marginTop: 2 }}>{skipImpact.label}</div>
              {skipImpact.quality != null && (
                <div className="opacity-80 mt-1" style={{ fontSize: 11 }}>
                  見送り精度 {Math.round(skipImpact.quality * 100)}%
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3 スタイル比較 (visibleData の countsByStyle / roiByStyle のみ参照) */}
      <div className="grid grid-cols-3 gap-2">
        {["steady", "balanced", "aggressive"].map((s) => {
          const info = STYLE_LABELS[s];
          const count = countsByStyle[s] || 0;
          const realRoi = roiByStyle[s];
          const active = currentStyle === s;
          const isBest = bestStyle === s;
          return (
            <button key={s} type="button"
              onClick={() => switchProfile && switchProfile(s)}
              aria-label={`${info.label} に切替`}
              style={{
                textAlign: "center",
                padding: "8px 6px",
                borderRadius: 10,
                border: `2px solid ${active ? info.color : isBest ? `${info.color}80` : "transparent"}`,
                background: active ? `${info.color}22` : isBest ? `${info.color}10` : "rgba(0,0,0,0.22)",
                color: active ? info.color : "#e7eef8",
                cursor: "pointer",
                transition: "all 0.12s",
                minHeight: 96,
                lineHeight: 1.2,
              }}>
              <div className="text-xs font-bold">{info.label}{isBest ? " 🏆" : ""}</div>
              <div className="num font-bold" style={{
                fontSize: 22,
                color: count > 0 ? info.color : "#9fb0c9",
                marginTop: 2,
              }}>
                {count}
              </div>
              <div className="text-xs opacity-75">買い件数</div>
              {realRoi != null ? (
                <div className="text-xs mt-1" style={{ color: realRoi >= 1 ? "#34d399" : "#f87171" }}>
                  実績 ROI {Math.round(realRoi * 100)}%
                </div>
              ) : (
                <div className="text-xs mt-1 opacity-60">実績未蓄積</div>
              )}
            </button>
          );
        })}
      </div>

      {/* ズレ検知 (visibleData.driftDetected のみで判定) */}
      {driftDetected && bestStyle && (
        <div className="mt-3 p-2 rounded text-xs" style={{
          background: "rgba(251,191,36,0.12)",
          border: "1px solid rgba(251,191,36,0.4)",
          color: "#fde68a",
          lineHeight: 1.5,
        }}>
          ⚠️ <b>選択スタイルと実績にズレあり</b><br/>
          📈 実績では <b>{STYLE_LABELS[bestStyle]?.label}</b> の方が好調 (ROI {Math.round((roiByStyle[bestStyle] || 0) * 100)}%)
          <button onClick={() => switchProfile && switchProfile(bestStyle)}
            className="btn btn-ghost text-xs mt-1 ml-2" style={{ minHeight: 32, padding: "4px 10px" }}>
            → {STYLE_LABELS[bestStyle]?.label} に切替
          </button>
        </div>
      )}

      {/* 累計収支 (pnlSummary のみ参照) */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-70">🧪 エア累計</div>
          <div className={"num font-bold " + ((air?.pnl ?? 0) >= 0 ? "text-pos" : "text-neg")}
            style={{ fontSize: 20, lineHeight: 1.05 }}>
            {!air || air.stake === 0 ? "—" : `${air.pnl >= 0 ? "+" : ""}${yen(Math.round(air.pnl))}`}
          </div>
        </div>
        <div className="p-2 rounded text-center" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-70">💰 リアル累計</div>
          <div className={"num font-bold " + ((!real || real.stake === 0) ? "opacity-60" : ((real.pnl ?? 0) >= 0 ? "text-pos" : "text-neg"))}
            style={{ fontSize: 20, lineHeight: 1.05 }}>
            {!real || real.stake === 0 ? "未入力" : `${real.pnl >= 0 ? "+" : ""}${yen(Math.round(real.pnl))}`}
          </div>
        </div>
      </div>
    </section>
  );
}
