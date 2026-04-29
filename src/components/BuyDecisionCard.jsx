import { useState } from "react";
import { yen, pct } from "../lib/format.js";
import { gradeFactor, FACTOR_LABELS } from "../lib/predict.js";

/**
 * 結論カード。買う / 見送り の 2 状態のみ。
 *  - 買う: 大きい "買う" + レース + 買い目 + 金額 + 1ボタン + 5因子の理由
 *  - 見送り: 大きい "見送り" + 理由 1行
 */
export default function BuyDecisionCard({ race, evalRes, recommendation, onRecord, virtualMode }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!race) {
    return (
      <Empty title="本日対象なし" sub="「最新にする」を押して取得してください" />
    );
  }

  if (!recommendation || recommendation.decision !== "buy") {
    return (
      <Skip race={race} reason={recommendation?.reason || "—"} />
    );
  }

  function record() {
    if (busy) return;
    setBusy(true);
    onRecord(race, recommendation);
    setMsg("✅ 記録しました");
    setTimeout(() => { setMsg(""); setBusy(false); }, 2500);
  }

  return (
    <section style={{ padding: "28px 22px 22px", borderRadius: 20,
      background: "linear-gradient(135deg,#065f46,#053527)",
      border: "3px solid #10b981", color: "#fff",
      boxShadow: "0 0 32px -8px #10b981" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="text-sm opacity-90">
          <b>{race.venue} {race.raceNo}R</b>
          <span className="ml-2 opacity-80">{race.startTime}発走</span>
        </div>
        {virtualMode && <span className="pill" style={{ background: "rgba(0,0,0,0.3)" }}>🧪 仮想</span>}
        <span className={"pill badge-grade-" + (recommendation.grade || "A")}>{recommendation.grade}評価</span>
      </div>

      <div style={{ fontSize: "min(56px,12vw)", fontWeight: 900, lineHeight: 1.05,
        color: "#a7f3d0", textAlign: "center", letterSpacing: "-0.02em", marginTop: 4 }}>
        買う
      </div>
      <div className="text-center text-xs opacity-80 mt-1">{recommendation.reason}</div>

      {/* 買い目: 本命 / 押さえ / 穴 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 mt-5">
        {recommendation.items.map((it, i) => (
          <div key={i} className="text-center" style={{ background: "rgba(0,0,0,0.32)", borderRadius: 14, padding: "14px 8px" }}>
            <div className="flex items-center justify-center gap-1" style={{ fontSize: 11, opacity: 0.85, fontWeight: 700, letterSpacing: "0.05em" }}>
              <span>{it.role}</span>
              <span className={"pill badge-grade-" + it.grade} style={{ fontSize: 10 }}>{it.grade}</span>
            </div>
            <div className="font-mono" style={{ fontSize: "min(28px,7vw)", fontWeight: 900, marginTop: 4 }}>{it.combo}</div>
            <div style={{ fontSize: 11, opacity: 0.78, marginTop: 2 }}>
              {it.kind} / オッズ {it.odds.toFixed(1)} / 確率 {pct(it.prob, 0)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.95, marginTop: 4, fontWeight: 700, color: "#fde68a" }}>
              EV {it.ev.toFixed(2)}
            </div>
            <div className="num" style={{ fontSize: "min(20px,5.5vw)", fontWeight: 800, marginTop: 6 }}>{yen(it.stake)}</div>
          </div>
        ))}
      </div>

      <div className="text-center mt-4 text-sm opacity-90">合計</div>
      <div className="text-center" style={{ fontSize: "min(36px,9vw)", fontWeight: 900, color: "#a7f3d0" }}>
        {yen(recommendation.total)}
      </div>

      <div className="mt-4 flex justify-center">
        <button onClick={record} disabled={busy}
          style={{ background: "#fff", color: "#065f46", padding: "14px 36px",
            borderRadius: 14, fontWeight: 800, fontSize: 18, border: "none", cursor: "pointer",
            opacity: busy ? 0.65 : 1, minWidth: 220, boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>
          {busy ? "✅ 記録中…" : "✅ 記録する"}
        </button>
      </div>

      {/* 5因子の理由 (本命のみ表示) */}
      <FactorRow factors={recommendation.items[0]?.factors} />

      {/* 直前情報による補正があれば表示 */}
      <ConditionRow reasons={recommendation.items[0]?.conditionReasons} />

      {msg && <div className="mt-3 text-center font-bold">{msg}</div>}
    </section>
  );
}

function ConditionRow({ reasons }) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
      <div className="text-xs opacity-75 mb-2 text-center">予想に影響した直前情報</div>
      <div className="flex flex-col items-center gap-1">
        {reasons.map((r, i) => (
          <div key={i} className="text-xs"
            style={{
              background: r.kind === "pos" ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)",
              color: r.kind === "pos" ? "#a7f3d0" : "#fecaca",
              padding: "4px 10px", borderRadius: 999,
            }}>
            {r.kind === "pos" ? "✓ " : "✗ "}{r.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function FactorRow({ factors }) {
  if (!factors) return null;
  const keys = ["inAdvantage", "motor", "exhibition", "startPower"];
  return (
    <div className="mt-5 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
      <div className="text-xs opacity-75 mb-2 text-center">本命の判断理由 (5因子)</div>
      <div className="grid grid-cols-4 gap-1 text-center">
        {keys.map((k) => (
          <div key={k} style={{ background: "rgba(0,0,0,0.22)", borderRadius: 8, padding: "6px 4px" }}>
            <div style={{ fontSize: 10, opacity: 0.75 }}>{FACTOR_LABELS[k]}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: gradeColor(gradeFactor(factors[k])) }}>
              {gradeFactor(factors[k])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function gradeColor(g) {
  if (g === "A") return "#a7f3d0";
  if (g === "B") return "#fde68a";
  if (g === "C") return "#fecaca";
  return "#9fb0c9";
}

function Skip({ race, reason }) {
  return (
    <section style={{ padding: "60px 24px", borderRadius: 20, textAlign: "center",
      background: "linear-gradient(135deg,#7f1d1d,#3b1d1d)",
      border: "3px solid #ef4444", color: "#fecaca",
      boxShadow: "0 0 32px -8px #ef4444" }}>
      <div style={{ fontSize: "min(56px,12vw)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        見送り
      </div>
      <div className="opacity-90 mt-3 text-sm">
        {race ? `${race.venue} ${race.raceNo}R (${race.startTime}発走)` : "対象レースなし"}
      </div>
      <div className="opacity-90 mt-1 text-xs">{reason}</div>
    </section>
  );
}

function Empty({ title, sub }) {
  return (
    <section style={{ padding: "60px 24px", borderRadius: 20, textAlign: "center",
      background: "linear-gradient(135deg,#1e293b,#0f1830)",
      border: "3px solid #475569", color: "#fff" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
      <div style={{ fontSize: "min(40px,10vw)", fontWeight: 900 }}>{title}</div>
      <div className="opacity-80 mt-2 text-sm">{sub}</div>
    </section>
  );
}
