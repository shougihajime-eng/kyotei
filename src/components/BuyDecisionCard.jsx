import { useState, memo, useMemo } from "react";
import { yen, pct } from "../lib/format.js";
import { explainExpectedReturn, explainProbOdds, toneColor } from "../lib/explain.js";
import { buildReasoningSummary } from "../lib/reasoningSummary.js";

/**
 * 結論カード — 連勝系 4 券種 (2連単/2連複/3連単/3連複) のみ。
 *
 * 状態:
 *   ・買う:    「👉 この買い目を採用」 + 本命1点を巨大 + 押さえ/穴 を小さく + 一言理由 + 記録ボタン
 *   ・見送り:  「見送り」 + 一言理由
 *   ・オッズ取得不可: 「オッズ取得不可」 + 説明
 */
/* React.memo で props 同一なら再描画スキップ → 「ガーっ」防止 */
export default memo(BuyDecisionCard);

function BuyDecisionCard({ race, recommendation, onRecord, virtualMode, evalRes }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Round 73 Phase 2: 自然言語の理由まとめ (なぜこの買い目 / なぜ他を切ったか / 最大リスク)
  const reasoning = useMemo(
    () => buildReasoningSummary(recommendation, evalRes),
    [recommendation, evalRes]
  );

  if (!race) {
    return <Empty title="本日対象なし" sub="「最新にする」を押して取得してください" />;
  }

  const dec = recommendation?.decision;

  if (dec === "odds-pending") {
    return <OddsPending race={race} recommendation={recommendation} />;
  }
  if (dec === "no-odds") {
    return <NoOdds race={race} recommendation={recommendation} />;
  }
  if (dec === "data-checking") {
    return <DataChecking race={race} recommendation={recommendation} />;
  }
  if (dec === "closed") {
    return <Closed race={race} recommendation={recommendation} />;
  }
  if (dec !== "buy") {
    return <Skip race={race} reason={recommendation?.reason || "見送り"} recommendation={recommendation} />;
  }

  const main = recommendation.main;
  const others = recommendation.items.slice(1, 3);

  function record(real) {
    if (busy) return;
    setBusy(true);
    onRecord(race, recommendation, real != null ? { real } : {});
    setMsg(real ? "✅ リアル購入として記録" : "✅ エア舟券として記録");
    setTimeout(() => { setMsg(""); setBusy(false); }, 2500);
  }

  return (
    <section style={cardStyle.buy}>
      {/* ヘッダ: レース情報 + 評価バッジ + 現在スタイル */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="text-sm opacity-90">
          <b>{race.venue} {race.raceNo}R</b>
          <span className="ml-2 opacity-80">{race.startTime}発走</span>
        </div>
        <div className="flex items-center gap-2">
          {recommendation.profile && (
            <span className="pill" style={{
              fontSize: 11,
              background: recommendation.profile === "steady" ? "rgba(59,130,246,0.18)" : recommendation.profile === "balanced" ? "rgba(251,191,36,0.18)" : "rgba(239,68,68,0.18)",
              color: recommendation.profile === "steady" ? "#93c5fd" : recommendation.profile === "balanced" ? "#fcd34d" : "#fca5a5",
              border: `1px solid ${recommendation.profile === "steady" ? "#3b82f6" : recommendation.profile === "balanced" ? "#fbbf24" : "#ef4444"}`,
            }}>
              {recommendation.profile === "steady" ? "🛡️ 本命型" : recommendation.profile === "balanced" ? "⚖️ バランス型" : "🎯 穴狙い型"}
            </span>
          )}
          <span className={"pill badge-grade-" + (recommendation.grade || "A")}>{recommendation.grade}評価</span>
        </div>
      </div>

      {/* ★1〜5 総合評価 */}
      {recommendation.overall && (
        <div className="text-center mt-1">
          <div style={{ fontSize: 24, letterSpacing: "0.2em" }}>
            {"★".repeat(recommendation.overall.stars)}
            <span style={{ opacity: 0.3 }}>{"☆".repeat(5 - recommendation.overall.stars)}</span>
          </div>
          <div className="text-xs opacity-80 mt-1">推奨アクション: <b>{recommendation.overall.action}</b></div>
        </div>
      )}

      {/* 一言理由 (タイトル) */}
      <div className="text-center mt-2" style={{ fontSize: 14, color: "#fde68a" }}>
        💡 {recommendation.reason}
      </div>

      {/* Round 73 Phase 2: 自然言語の根拠まとめ — 「なぜ買う」 「なぜ切る」 「最大リスク」 */}
      {reasoning?.whyBuy?.length > 0 && (
        <div className="mt-3 p-2 rounded text-xs" style={{
          background: "rgba(56,189,248,0.06)",
          border: "1px solid rgba(56,189,248,0.3)",
          lineHeight: 1.55,
        }}>
          <div className="font-bold mb-1" style={{ color: "#bae6fd" }}>📝 判断の根拠</div>
          {/* なぜ買う (3 行) */}
          <div className="mb-2">
            <div className="text-xs font-semibold mb-0.5" style={{ color: "#a7f3d0" }}>✅ なぜこの買い目か</div>
            <ul style={{ paddingLeft: 16, listStyle: "decimal", color: "#cbd5e1" }}>
              {reasoning.whyBuy.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          {/* なぜ切る (2 行) */}
          {reasoning.whyNot?.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold mb-0.5" style={{ color: "#fcd34d" }}>❎ なぜ他を切ったか</div>
              <ul style={{ paddingLeft: 16, listStyle: "disc", color: "#cbd5e1" }}>
                {reasoning.whyNot.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {/* 最大リスク (1 行) */}
          {reasoning.maxRisk && (
            <div className="text-xs p-1 rounded" style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              ⚠️ <b>最大リスク:</b> {reasoning.maxRisk}
            </div>
          )}
        </div>
      )}

      {/* Round 36-37: 9 条件チェック合格表示 + 自信スコア */}
      {Array.isArray(recommendation.checks) && recommendation.checks.length > 0 && (
        <div className="mt-3 p-2 rounded text-xs" style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.4)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="font-bold" style={{ color: "#a7f3d0" }}>
              ✅ 厳選 {recommendation.checks.length} 条件 すべて通過
            </div>
            {typeof recommendation.confidence === "number" && (
              <div className="font-bold" style={{ color: "#fde68a" }}>
                自信 {recommendation.confidence}/100
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-0.5" style={{ lineHeight: 1.5 }}>
            {recommendation.checks.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2" style={{ color: "#a7f3d0" }}>
                <span>✓ {c.label}</span>
                <span className="opacity-70 text-xs">{c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 事故レース警告 (Round 21) — 買い決定でも危険要素ありなら強調表示 */}
      {recommendation.accident?.isAccident && (
        <div className="mt-3 p-2 rounded text-center" style={{ background: "rgba(239,68,68,0.20)", border: "1px solid rgba(239,68,68,0.6)" }}>
          <div className="text-sm font-bold" style={{ color: "#fecaca" }}>
            🚨 危険レース ({recommendation.accident.severity}/100)
          </div>
          <div className="text-xs mt-1" style={{ color: "#fecaca" }}>
            {recommendation.accident.causes.join(" / ")}
          </div>
          <div className="text-xs opacity-80 mt-1" style={{ color: "#fef9c3" }}>
            ※「買わない」 という選択肢も検討してください
          </div>
        </div>
      )}

      {/* 会場バイアス + 警戒事項 (Round 17) */}
      {(recommendation.venueProfile || (recommendation.warnings || []).length > 0) && (
        <div className="mt-3 p-2 rounded" style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {recommendation.venueProfile && (
            <div className="text-xs mb-1" style={{ color: "#bae6fd", fontWeight: 700 }}>
              📍 {recommendation.venueProfile.name}: {recommendation.venueProfile.note}
              {recommendation.timeSlot === "night" && <span className="ml-2" style={{ color: "#fde68a" }}>🌙 ナイター</span>}
            </div>
          )}
          {(recommendation.warnings || []).slice(0, 4).map((w, i) => (
            <div key={i} className="text-xs mt-1" style={{
              color: w.kind === "warn" ? "#fecaca" : w.kind === "ok" ? "#a7f3d0" : "#bae6fd",
            }}>
              {w.kind === "warn" ? "⚠️" : w.kind === "ok" ? "✅" : "💬"} {w.text}
            </div>
          ))}
        </div>
      )}

      {/* 本命 — これだけ採用すれば OK */}
      <div className="mt-3 text-center" style={{ background: "rgba(0,0,0,0.32)", borderRadius: 14, padding: "16px 12px", border: "2px solid rgba(255,255,255,0.18)", minHeight: 240 }}>
        <div className="text-xs opacity-85" style={{ fontWeight: 700, letterSpacing: "0.05em" }}>
          👉 この買い目を採用
        </div>
        <div className="text-xs opacity-70 mt-1">本命 ({main.kind})</div>
        <div className="font-mono" style={{ fontSize: "min(48px,12vw)", fontWeight: 900, marginTop: 6, lineHeight: 1.05 }}>
          {main.combo}
        </div>
        {/* 4 指標を均等に並べて表示 */}
        <div className="grid grid-cols-2 gap-1 mt-3 text-xs" style={{ background: "rgba(0,0,0,0.18)", borderRadius: 8, padding: "8px 6px" }}>
          <div>
            <div className="opacity-60">推定的中確率</div>
            <div className="num font-bold" style={{ fontSize: 16 }}>{pct(main.prob, 1)}</div>
          </div>
          <div>
            <div className="opacity-60">オッズ</div>
            <div className="num font-bold" style={{ fontSize: 16 }}>{main.odds.toFixed(1)}倍</div>
          </div>
          <div>
            <div className="opacity-60">推定回収率 <span style={{ fontSize: 9 }}>(予想値)</span></div>
            <div className="num font-bold" style={{ fontSize: 16, color: (main.expectedReturn ?? main.ev) >= 1 ? "#a7f3d0" : "#fca5a5" }}>
              {Math.round((main.expectedReturn ?? main.ev) * 100)}%
            </div>
          </div>
          <div>
            <div className="opacity-60">推定 EV <span style={{ fontSize: 9 }}>(予想値)</span></div>
            <div className="num font-bold" style={{ fontSize: 16, color: "#fde68a" }}>
              {((main.evMinus1 ?? (main.ev - 1)) >= 0 ? "+" : "")}{((main.evMinus1 ?? (main.ev - 1)) * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        <div className="text-xs opacity-60 mt-1" style={{ fontSize: 10 }}>
          ※ 上記は AI の予想に基づく推定値。実績は検証画面の確定済みデータをご確認ください。
        </div>

        {/* 平易な日本語説明 (Round 24) */}
        {(() => {
          const er = main.expectedReturn ?? main.ev;
          const erEx = explainExpectedReturn(er);
          const poEx = explainProbOdds(main.prob, main.odds);
          return (
            <div className="mt-2 text-xs" style={{ lineHeight: 1.55 }}>
              <div style={{ color: toneColor[erEx.tone] || "#bae6fd" }}>
                💬 期待回収率 {Math.round(er * 100)}% = {erEx.text}
              </div>
              {poEx && (
                <div className="mt-1" style={{ color: toneColor[poEx.tone] || "#bae6fd" }}>
                  {poEx.text}
                </div>
              )}
            </div>
          );
        })()}
        {/* 採用理由 */}
        {Array.isArray(main.pickReason) && main.pickReason.length > 0 && (
          <div className="mt-3 text-left" style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 10px" }}>
            <div className="text-xs opacity-75 mb-1" style={{ fontWeight: 700 }}>📌 採用理由</div>
            <ul className="text-xs opacity-90" style={{ paddingLeft: 14 }}>
              {main.pickReason.map((r, i) => (<li key={i} style={{ listStyle: "disc", marginTop: 2 }}>{r}</li>))}
            </ul>
          </div>
        )}
        <div className="num mt-3" style={{ fontSize: "min(28px,7vw)", fontWeight: 900 }}>
          {yen(main.stake)}
        </div>
      </div>

      {/* 押さえ / 穴 — 小さく (穴は紫で意味を強調) */}
      {others.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {others.map((it, i) => {
            const isHole = (it.role || "").includes("穴") || (it.role || "").includes("大穴");
            return (
              <div key={i} className="text-center" style={{
                background: isHole ? "rgba(168,85,247,0.16)" : "rgba(0,0,0,0.22)",
                borderRadius: 10, padding: "8px 6px", minHeight: 90,
                border: isHole ? "1px solid rgba(168,85,247,0.45)" : "1px solid transparent",
              }}>
                <div className="text-xs opacity-80" style={{ color: isHole ? "#d8b4fe" : "#9fb0c9" }}>
                  {isHole ? "🟣 " : ""}{it.role} ({it.kind})
                </div>
                <div className="font-mono" style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{it.combo}</div>
                <div className="text-xs opacity-70 mt-1">
                  確率 {pct(it.prob, 1)} / オッズ {it.odds.toFixed(1)}
                </div>
                <div className="text-xs mt-1" style={{ color: (it.expectedReturn ?? it.ev) >= 1 ? "#a7f3d0" : "#fca5a5" }}>
                  期待回収 {Math.round((it.expectedReturn ?? it.ev) * 100)}%
                </div>
                <div className="text-xs opacity-70 mt-1">{yen(it.stake)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 合計 + 想定払戻 (本命的中時) */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="text-center p-2 rounded" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-80">合計投資</div>
          <div style={{ fontSize: "min(24px,6.5vw)", fontWeight: 900, color: "#fde68a" }}>{yen(recommendation.total)}</div>
        </div>
        <div className="text-center p-2 rounded" style={{ background: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs opacity-80">本命的中時 想定払戻</div>
          <div style={{ fontSize: "min(24px,6.5vw)", fontWeight: 900, color: "#a7f3d0" }}>
            {yen(Math.round((recommendation.main?.stake || 0) * (recommendation.main?.odds || 0)))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 items-center">
        <button onClick={() => record()} disabled={busy} style={btnPrimary}>
          {busy ? "✅ 記録中…" : (virtualMode ? "🧪 エア舟券として記録" : "✅ 記録する")}
        </button>
        {!virtualMode && (
          <button onClick={() => record(true)} disabled={busy} style={btnReal}>
            💰 リアル購入として記録
          </button>
        )}
      </div>

      {msg && <div className="mt-3 text-center font-bold" style={{ color: "#fff" }}>{msg}</div>}
    </section>
  );
}

/* Round 106: card styles を premium token に揃える (gradient + 控えめ border + multi-layer shadow) */
const cardStyle = {
  buy: {
    padding: "24px 22px 22px",
    borderRadius: 18,
    background: "linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 95, 70, 0.20) 100%), linear-gradient(180deg, rgba(19, 27, 48, 0.92) 0%, rgba(14, 20, 36, 0.92) 100%)",
    border: "1px solid rgba(16, 185, 129, 0.55)",
    color: "var(--text-primary)",
    boxShadow: "0 0 0 1px rgba(16, 185, 129, 0.18) inset, 0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px rgba(0, 0, 0, 0.32), 0 0 48px -16px rgba(16, 185, 129, 0.45)",
    minHeight: 540,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  skip: {
    padding: "48px 24px",
    borderRadius: 18,
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(239, 68, 68, 0.10) 0%, rgba(127, 29, 29, 0.18) 100%), linear-gradient(180deg, rgba(19, 27, 48, 0.92) 0%, rgba(14, 20, 36, 0.92) 100%)",
    border: "1px solid rgba(239, 68, 68, 0.45)",
    color: "var(--c-danger-text)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0, 0, 0, 0.30)",
    minHeight: 240,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  skipMini: {
    padding: "12px 14px",
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(239, 68, 68, 0.06) 0%, rgba(255,255,255,0.02) 100%)",
    border: "1px solid rgba(239, 68, 68, 0.32)",
    color: "var(--c-danger-text)",
    minHeight: 80,
  },
  noOdds: {
    padding: "48px 24px",
    borderRadius: 18,
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(245, 158, 11, 0.10) 0%, rgba(120, 53, 15, 0.18) 100%), linear-gradient(180deg, rgba(19, 27, 48, 0.92) 0%, rgba(14, 20, 36, 0.92) 100%)",
    border: "1px solid rgba(245, 158, 11, 0.45)",
    color: "var(--c-warning-text)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0, 0, 0, 0.30)",
    minHeight: 240,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  dataChecking: {
    padding: "40px 24px",
    borderRadius: 18,
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(34, 211, 238, 0.10) 0%, rgba(30, 58, 95, 0.20) 100%), linear-gradient(180deg, rgba(19, 27, 48, 0.92) 0%, rgba(14, 20, 36, 0.92) 100%)",
    border: "1px solid rgba(34, 211, 238, 0.45)",
    color: "var(--brand-text)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0, 0, 0, 0.30), 0 0 32px -12px rgba(34, 211, 238, 0.40)",
    minHeight: 280,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  closed: {
    padding: "40px 24px",
    borderRadius: 18,
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(107, 114, 128, 0.10) 0%, rgba(31, 41, 55, 0.20) 100%), linear-gradient(180deg, rgba(19, 27, 48, 0.92) 0%, rgba(14, 20, 36, 0.92) 100%)",
    border: "1px solid var(--border-medium)",
    color: "var(--text-secondary)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0, 0, 0, 0.30)",
    minHeight: 220,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  /* Round 113: -15 分前まで 「予想を出さない」 確定待ち状態 */
  pending: {
    padding: "40px 24px",
    borderRadius: 18,
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(167, 139, 250, 0.12) 0%, rgba(91, 33, 182, 0.20) 100%), linear-gradient(180deg, rgba(19, 27, 48, 0.92) 0%, rgba(14, 20, 36, 0.92) 100%)",
    border: "1px solid rgba(167, 139, 250, 0.55)",
    color: "var(--text-primary)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0, 0, 0, 0.30), 0 0 32px -12px rgba(167, 139, 250, 0.45)",
    minHeight: 280,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  empty: {
    padding: "48px 24px",
    borderRadius: 18,
    textAlign: "center",
    background: "linear-gradient(180deg, rgba(19, 27, 48, 0.85) 0%, rgba(14, 20, 36, 0.85) 100%)",
    border: "1px dashed var(--border-medium)",
    color: "var(--text-secondary)",
    minHeight: 240,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
};

/* Round 106: 「✅ エア舟券として記録」 等のメインアクションボタン (premium) */
const btnPrimary = {
  background: "linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%)",
  color: "#065F46",
  padding: "14px 36px",
  borderRadius: 14,
  fontWeight: 700,
  fontSize: 16,
  border: "none",
  cursor: "pointer",
  minWidth: 240,
  letterSpacing: "0.01em",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.50) inset, 0 4px 14px rgba(0, 0, 0, 0.20), 0 0 0 1px rgba(16, 185, 129, 0.25)",
  transition: "transform 0.12s ease, filter 0.12s ease",
};
const btnReal = {
  background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
  color: "#451A03",
  padding: "12px 28px",
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 14.5,
  border: "none",
  cursor: "pointer",
  minWidth: 240,
  letterSpacing: "0.01em",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.30) inset, 0 4px 12px rgba(245, 158, 11, 0.30)",
  transition: "transform 0.12s ease, filter 0.12s ease",
};

function Skip({ race, reason, recommendation }) {
  // Round 31: 見送りレースは短く。1 行理由 + 必要時のみ詳細を expand。
  const [showAll, setShowAll] = useState(false);
  const reasons = recommendation?.reasons || [];
  const shortReason = reasons[0] || reason || "見送り";
  const moreCount = Math.max(0, reasons.length - 1);
  return (
    <section style={cardStyle.skipMini}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 24 }}>🔴</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>見送り</div>
            <div className="text-xs opacity-80">{race.venue} {race.raceNo}R ({race.startTime})</div>
          </div>
        </div>
        <span className="pill badge-skip" style={{ fontSize: 10 }}>📊 賢い判断</span>
      </div>
      <div className="text-xs opacity-90 mt-2" style={{ lineHeight: 1.45 }}>{shortReason}</div>
      {moreCount > 0 && (
        <>
          <button onClick={() => setShowAll(v => !v)} className="text-xs opacity-70 mt-1 underline" style={{ background: "none", border: "none", cursor: "pointer", color: "#fcd34d" }}>
            {showAll ? "▲ 隠す" : `▼ 他${moreCount}件の理由を見る`}
          </button>
          {showAll && (
            <ul className="text-xs opacity-85 mt-1" style={{ paddingLeft: 16, lineHeight: 1.5 }}>
              {reasons.slice(1).map((r, i) => <li key={i} style={{ listStyle: "disc", marginTop: 2 }}>{r}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* Round 35: オッズ整合性チェック中 (キャッシュデータあり、リトライ中) */
function DataChecking({ race, recommendation }) {
  const ago = recommendation?.lastFetchedAt ? formatAgo(recommendation.lastFetchedAt) : null;
  return (
    <section style={cardStyle.dataChecking}>
      <div style={{ fontSize: 36, marginBottom: 6 }}>🔄</div>
      <div style={{ fontSize: "min(28px,7vw)", fontWeight: 900 }}>オッズ整合性チェック中</div>
      <div className="opacity-90 mt-3 text-sm">{race.venue} {race.raceNo}R ({race.startTime}発走)</div>
      {ago && (
        <div className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(0,0,0,0.30)", color: "#fde68a" }}>
          📅 最終取得 {ago} 前 (参考値)
        </div>
      )}
      <div className="opacity-85 mt-3 text-xs px-3" style={{ lineHeight: 1.55 }}>
        現在のオッズは <b>キャッシュ (参考値)</b> です。<br/>
        古いデータで「買い」 と判定するのは危険なため、<br/>
        最新データ取得後に再評価します。
      </div>
      {(recommendation?.reasons || []).slice(1).length > 0 && (
        <ul className="text-xs opacity-80 mt-3 mx-4" style={{ paddingLeft: 14, textAlign: "left", lineHeight: 1.5 }}>
          {(recommendation.reasons || []).slice(1).map((r, i) => <li key={i} style={{ listStyle: "disc", marginTop: 2 }}>{r}</li>)}
        </ul>
      )}
    </section>
  );
}

/* Round 113: -15 分前まで 「予想を出さない」 確定待ち状態
   競艇のオッズは発走 15 分前にならないと安定しないため、
   それ以前は計算結果を表示しない (= 不安定オッズで誤誘導しない) */
function OddsPending({ race, recommendation }) {
  const m = recommendation?.minutesToStart;
  const eta = recommendation?.etaMinutes;
  return (
    <section style={cardStyle.pending}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>⏳</div>
      <div style={{ fontSize: "min(28px,7vw)", fontWeight: 900, color: "#ddd6fe" }}>
        オッズ確定待ち
      </div>
      <div className="opacity-90 mt-2 text-sm">
        {race.venue} {race.raceNo}R ({race.startTime}発走)
      </div>
      {m != null && (
        <div className="mt-3 inline-block px-4 py-2 rounded-full text-sm font-bold" style={{ background: "rgba(0,0,0,0.30)", color: "#ddd6fe" }}>
          発走 {m} 分前
        </div>
      )}
      <div className="opacity-85 mt-4 text-xs px-4" style={{ lineHeight: 1.65, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
        競艇のオッズは <b>発走 15 分前</b> にならないと安定しません。<br/>
        確定したオッズで <b>正しく勝負を決めるため</b>、 それまでは予想を出しません。
      </div>
      {eta != null && eta > 0 && (
        <div className="mt-4 px-4 py-2 inline-block rounded-lg text-sm font-bold" style={{ background: "rgba(251,191,36,0.16)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.45)" }}>
          ⏱ あと <span className="num">{eta}</span> 分で自動的に予想開始
        </div>
      )}
      <div className="opacity-70 mt-4 text-xs">
        15 分前を過ぎたら、 このカードが自動的に 「買い / 見送り」 に切り替わります。
      </div>
    </section>
  );
}

/* Round 35: 締切済み (発走時刻を過ぎた) */
function Closed({ race, recommendation }) {
  return (
    <section style={cardStyle.closed}>
      <div style={{ fontSize: 36, marginBottom: 6 }}>🔒</div>
      <div style={{ fontSize: "min(28px,7vw)", fontWeight: 900 }}>締切済み</div>
      <div className="opacity-90 mt-3 text-sm">{race.venue} {race.raceNo}R ({race.startTime}発走)</div>
      <div className="opacity-85 mt-2 text-xs px-3" style={{ lineHeight: 1.55 }}>
        発走時刻を過ぎているため、<b>新規の買い判定は行いません</b>。<br/>
        結果が確定したら検証画面で確認できます。
      </div>
    </section>
  );
}

function NoOdds({ race, recommendation }) {
  // Round 51-G: 4 状態に細分化 — 「壊れている」 印象を与えない
  // 1. 再取得待ち (stale): 直前のキャッシュあり、リトライ中
  // 2. 候補維持 (structural high/medium): オッズ無しでも構造的に有望
  // 3. 見送り (structural skip): 構造的にも弱い
  // 4. 公開待ち (default): 発走前で未公開
  const hasStale = !!race?.apiOdds?.stale;
  const lastFetchedAt = race?.apiOdds?.lastFetchedAt;
  const ago = lastFetchedAt ? formatAgo(lastFetchedAt) : null;
  const sa = recommendation?.structuralAssessment;
  const candidateLevel = sa?.candidateLevel;
  let mode, emoji, title, body;
  if (hasStale) {
    mode = "retry"; emoji = "🔄"; title = "オッズ再取得待ち";
    body = `リトライ中です。 ${ago ? `最終取得 ${ago} 前` : ""} 仮オッズでの推奨は行いません。`;
  } else if (candidateLevel === "high" || candidateLevel === "medium") {
    mode = "structural-keep"; emoji = "📋"; title = "オッズなしでも候補維持";
    body = `構造的には有望 (1号艇モーター/展示/勝率などが揃っている)。 オッズ公開後に詳細判定します。`;
  } else if (candidateLevel === "low" || candidateLevel === "skip") {
    mode = "skip-early"; emoji = "📊"; title = "オッズ未取得 + 構造弱い → 見送り";
    body = `1 号艇の信頼度や条件が弱く、 オッズが出ても買わない可能性が高いです。`;
  } else {
    mode = "waiting"; emoji = "⏳"; title = "オッズ公開待ち";
    body = "発走 60〜90 分前から公開されます。 まだ公開されていない可能性があります。";
  }
  const reasons = sa?.reasons || [];
  return (
    <section style={cardStyle.noOdds}>
      <div style={{ fontSize: 36, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontSize: "min(26px,6.5vw)", fontWeight: 900 }}>{title}</div>
      <div className="opacity-90 mt-3 text-sm">{race.venue} {race.raceNo}R ({race.startTime}発走)</div>
      {ago && (
        <div className="opacity-90 mt-2 text-xs" style={{ color: "#fde68a" }}>
          最終取得 {ago} 前
        </div>
      )}
      <div className="opacity-85 mt-3 text-xs px-3" style={{ lineHeight: 1.55 }}>
        {body}
      </div>
      {sa && (
        <div className="mt-3 inline-block px-3 py-1 rounded-full text-xs" style={{
          background: "rgba(0,0,0,0.30)",
          color: candidateLevel === "high" ? "#a7f3d0"
               : candidateLevel === "medium" ? "#bae6fd"
               : candidateLevel === "low" ? "#fde68a"
               : "#fca5a5",
        }}>
          構造スコア {sa.score}/100 ({candidateLevel})
        </div>
      )}
      {reasons.length > 0 && (
        <div className="text-xs opacity-75 mt-3 px-3" style={{ lineHeight: 1.5 }}>
          {reasons.slice(0, 3).join(" / ")}
        </div>
      )}
    </section>
  );
}

function formatAgo(ts) {
  if (!ts) return null;
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分`;
  return `${Math.floor(sec / 3600)}時間`;
}

function Empty({ title, sub }) {
  return (
    <section style={cardStyle.empty}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
      <div style={{ fontSize: "min(40px,10vw)", fontWeight: 900 }}>{title}</div>
      <div className="opacity-80 mt-2 text-sm">{sub}</div>
    </section>
  );
}
