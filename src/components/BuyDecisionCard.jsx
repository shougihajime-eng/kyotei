import { useState, memo } from "react";
import { yen, pct } from "../lib/format.js";
import { explainExpectedReturn, explainProbOdds, toneColor } from "../lib/explain.js";

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

function BuyDecisionCard({ race, recommendation, onRecord, virtualMode }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!race) {
    return <Empty title="本日対象なし" sub="「最新にする」を押して取得してください" />;
  }

  const dec = recommendation?.decision;

  if (dec === "no-odds") {
    return <NoOdds race={race} />;
  }
  if (dec !== "buy") {
    return <Skip race={race} reason={recommendation?.reason || "見送り"} />;
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
      {/* ヘッダ: レース情報 + 評価バッジ */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="text-sm opacity-90">
          <b>{race.venue} {race.raceNo}R</b>
          <span className="ml-2 opacity-80">{race.startTime}発走</span>
        </div>
        <span className={"pill badge-grade-" + (recommendation.grade || "A")}>{recommendation.grade}評価</span>
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
            <div className="opacity-60">期待回収率</div>
            <div className="num font-bold" style={{ fontSize: 16, color: (main.expectedReturn ?? main.ev) >= 1 ? "#a7f3d0" : "#fca5a5" }}>
              {Math.round((main.expectedReturn ?? main.ev) * 100)}%
            </div>
          </div>
          <div>
            <div className="opacity-60">EV (期待値)</div>
            <div className="num font-bold" style={{ fontSize: 16, color: "#fde68a" }}>
              {((main.evMinus1 ?? (main.ev - 1)) >= 0 ? "+" : "")}{((main.evMinus1 ?? (main.ev - 1)) * 100).toFixed(0)}%
            </div>
          </div>
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

      {/* 合計 + ボタン */}
      <div className="text-center mt-4 text-xs opacity-80">合計</div>
      <div className="text-center" style={{ fontSize: "min(32px,8vw)", fontWeight: 900, color: "#a7f3d0" }}>
        {yen(recommendation.total)}
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

const cardStyle = {
  buy: {
    padding: "24px 20px 20px", borderRadius: 20,
    background: "linear-gradient(135deg,#065f46,#053527)",
    border: "3px solid #10b981", color: "#fff",
    boxShadow: "0 0 32px -8px #10b981",
    minHeight: 540, // 揺れ防止
  },
  skip: {
    padding: "60px 20px", borderRadius: 20, textAlign: "center",
    background: "linear-gradient(135deg,#7f1d1d,#3b1d1d)",
    border: "3px solid #ef4444", color: "#fecaca",
    boxShadow: "0 0 32px -8px #ef4444",
    minHeight: 240,
  },
  noOdds: {
    padding: "60px 20px", borderRadius: 20, textAlign: "center",
    background: "linear-gradient(135deg,#3a2d0a,#1f1606)",
    border: "3px solid #f59e0b", color: "#fde68a",
    minHeight: 240,
  },
  empty: {
    padding: "60px 20px", borderRadius: 20, textAlign: "center",
    background: "linear-gradient(135deg,#1e293b,#0f1830)",
    border: "3px solid #475569", color: "#fff",
    minHeight: 240,
  },
};

const btnPrimary = {
  background: "#fff", color: "#065f46", padding: "14px 36px",
  borderRadius: 14, fontWeight: 800, fontSize: 17, border: "none", cursor: "pointer",
  minWidth: 240, boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
};
const btnReal = {
  background: "#fbbf24", color: "#451a03", padding: "12px 28px",
  borderRadius: 12, fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer",
  minWidth: 240,
};

function Skip({ race, reason }) {
  return (
    <section style={cardStyle.skip}>
      <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.85, marginBottom: 4 }}>📊 賢い判断</div>
      <div style={{ fontSize: "min(48px,11vw)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        見送り
      </div>
      <div className="opacity-90 mt-3 text-sm">{race.venue} {race.raceNo}R ({race.startTime}発走)</div>
      <div className="opacity-90 mt-2 text-xs px-3">{reason}</div>
      <div className="mt-3 mx-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(0,0,0,0.30)", color: "#fef9c3", lineHeight: 1.55 }}>
        💡 <b>勝負レースを選ぶ</b>ことで、長期的な回収率が改善します。<br/>
        無理に買わない判断にも価値があります。
      </div>
    </section>
  );
}

function NoOdds({ race }) {
  return (
    <section style={cardStyle.noOdds}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontSize: "min(40px,10vw)", fontWeight: 900 }}>オッズ取得不可</div>
      <div className="opacity-90 mt-3 text-sm">{race.venue} {race.raceNo}R ({race.startTime}発走)</div>
      <div className="opacity-90 mt-2 text-xs">
        まだ実オッズが公開されていません。<br/>
        仮オッズでの推奨は行いません (期待値計算が壊れるため)
      </div>
    </section>
  );
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
