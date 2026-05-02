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
  } = goMode || {};
  const isSuppressed = !!suppressedReason || confidenceLabel === "見送り推奨";
  const labelColor = confidenceLabel === "Go" ? "#34d399"
                   : confidenceLabel === "様子見" ? "#fde68a"
                   : "#fca5a5";
  const labelBg = confidenceLabel === "Go" ? "rgba(16,185,129,0.18)"
                : confidenceLabel === "様子見" ? "rgba(251,191,36,0.18)"
                : "rgba(239,68,68,0.18)";

  // 除外理由のツールチップ用テキスト (上位 5 件)
  const excludedTooltip = excludedReasons.length > 0
    ? excludedReasons.slice(0, 5).map(e => `${e.venue || ""} ${e.raceNo || ""}R: ${e.reason}`).join("\n")
    : "除外なし";

  return (
    <div className="mb-3 p-3 rounded" style={{ background: "rgba(0,0,0,0.18)", border: `1px solid ${labelColor}40` }}>
      {/* 信頼度バー (Go/様子見/見送り推奨 + 除外バッジ) */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-80">本日の信頼度:</span>
          <span className="num font-bold" style={{ fontSize: 22, color: labelColor }} aria-label={`信頼度 ${dayConfidence} / 100`}>
            {dayConfidence}
          </span>
          <span className="opacity-60">/</span>
          <span className="opacity-60 text-xs">100 (閾値 {threshold})</span>
        </div>
        <span className="pill" style={{ background: labelBg, color: labelColor, border: `1px solid ${labelColor}`, fontSize: 11, fontWeight: 800 }}>
          {confidenceLabel === "Go" ? "🎯 Go (勝負日)" : confidenceLabel === "様子見" ? "⚠️ 様子見" : "📊 見送り推奨"}
        </span>
      </div>
      <div className="text-xs opacity-85 mb-2" style={{ lineHeight: 1.5 }}>{confidenceReason}</div>

      {/* 除外バッジ (オッズ未取得 / データ欠損 等) */}
      {excludedCount > 0 && (
        <div className="text-xs mb-3" style={{ color: "#fde68a" }} title={excludedTooltip}>
          ⚠️ <b>{excludedCount} 件除外</b>
          <span className="opacity-80 ml-1">(オッズ未取得 / データ欠損 などの理由 — ホバーで詳細)</span>
        </div>
      )}

      {/* 抑制理由 (閾値未満) */}
      {suppressedReason && (
        <div className="text-xs mb-3 p-2 rounded" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", lineHeight: 1.55 }}>
          🛑 <b>購買 UI を抑制中</b><br/>
          {suppressedReason}
        </div>
      )}

      {/* Top 3 picks (抑制時は非表示) */}
      {goPicks.length > 0 && !isSuppressed ? (
        <div>
          <div className="text-xs font-bold mb-2" style={{ color: "#a7f3d0" }}>🎯 今すぐ買う候補 (上位 {goPicks.length} 件)</div>
          <div className="grid grid-cols-1 gap-2">
            {goPicks.map((p, i) => (
              <div key={p.raceId} className="p-2 rounded flex items-center justify-between flex-wrap gap-2"
                style={{
                  background: "rgba(16,185,129,0.10)",
                  border: "1px solid rgba(16,185,129,0.4)",
                }}>
                <div className="flex items-center gap-2">
                  <span className="num font-bold" style={{ fontSize: 16, color: "#fde68a" }}>#{i + 1}</span>
                  <div>
                    <div className="text-xs font-bold">{p.race?.venue} {p.race?.raceNo}R <span className="opacity-70">{p.race?.startTime}</span></div>
                    <div className="text-xs opacity-80">
                      {STYLE_LABELS[p.style]?.label} / {p.mainCombo} ({p.recommendation?.main?.kind})
                    </div>
                    {p.simpleReason && (
                      <div className="text-xs opacity-70 mt-1" style={{ fontSize: 10 }}>{p.simpleReason}</div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num font-bold text-xs" style={{ color: "#a7f3d0" }}>EV {Math.round(p.ev * 100)}%</div>
                  <div className="text-xs opacity-70">自信 {p.confidence}/100</div>
                </div>
              </div>
            ))}
          </div>
          {totalCandidates > goPicks.length && (
            <div className="text-xs opacity-70 mt-2">
              💡 他 {totalCandidates - goPicks.length} 件は EV/自信 が低いため除外 (top {goPicks.length} のみ表示)
            </div>
          )}
        </div>
      ) : isSuppressed ? (
        <div className="text-xs opacity-85" style={{ background: "rgba(0,0,0,0.22)", padding: 8, borderRadius: 8, lineHeight: 1.55 }}>
          📊 <b>本日は見送り推奨</b><br/>
          無理に買わない判断もアプリの価値です。 「📅 検証」 で過去の実績を振り返ってください。
        </div>
      ) : (
        <div className="text-xs opacity-70">候補レース蓄積中…</div>
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

  return (
    <section className="card card-glow p-3" style={{ minHeight: 140 }} aria-live="polite">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-bold text-sm">⚡ 今日の結論</div>
        {lastUpdated && (
          <div className="text-xs opacity-60">
            📅 最終更新 {new Date(lastUpdated).toLocaleTimeString("ja-JP")}
          </div>
        )}
      </div>

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
