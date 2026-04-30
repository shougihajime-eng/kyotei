import { useState } from "react";
import { yen, pct } from "../lib/format.js";

/**
 * 結論カード — 連勝系 4 券種 (2連単/2連複/3連単/3連複) のみ。
 *
 * 状態:
 *   ・買う:    「👉 この買い目を採用」 + 本命1点を巨大 + 押さえ/穴 を小さく + 一言理由 + 記録ボタン
 *   ・見送り:  「見送り」 + 一言理由
 *   ・オッズ取得不可: 「オッズ取得不可」 + 説明
 */
export default function BuyDecisionCard({ race, recommendation, onRecord, virtualMode }) {
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

      {/* 一言理由 (タイトル) */}
      <div className="text-center mt-2" style={{ fontSize: 14, color: "#fde68a" }}>
        💡 {recommendation.reason}
      </div>

      {/* 本命 — これだけ採用すれば OK */}
      <div className="mt-3 text-center" style={{ background: "rgba(0,0,0,0.32)", borderRadius: 14, padding: "16px 12px", border: "2px solid rgba(255,255,255,0.18)", minHeight: 200 }}>
        <div className="text-xs opacity-85" style={{ fontWeight: 700, letterSpacing: "0.05em" }}>
          👉 この買い目を採用
        </div>
        <div className="text-xs opacity-70 mt-1">本命 ({main.kind})</div>
        <div className="font-mono" style={{ fontSize: "min(48px,12vw)", fontWeight: 900, marginTop: 6, lineHeight: 1.05 }}>
          {main.combo}
        </div>
        <div className="text-xs opacity-80 mt-2">
          オッズ {main.odds.toFixed(1)} / 確率 {pct(main.prob, 1)} / EV <b style={{ color: "#fde68a" }}>{main.ev.toFixed(2)}</b>
        </div>
        <div className="num mt-3" style={{ fontSize: "min(28px,7vw)", fontWeight: 900 }}>
          {yen(main.stake)}
        </div>
      </div>

      {/* 押さえ / 穴 — 小さく */}
      {others.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {others.map((it, i) => (
            <div key={i} className="text-center" style={{ background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "8px 6px", minHeight: 90 }}>
              <div className="text-xs opacity-70">{it.role} ({it.kind})</div>
              <div className="font-mono" style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{it.combo}</div>
              <div className="text-xs opacity-70 mt-1">EV {it.ev.toFixed(2)} / {yen(it.stake)}</div>
            </div>
          ))}
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
      <div style={{ fontSize: "min(56px,12vw)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
        見送り
      </div>
      <div className="opacity-90 mt-3 text-sm">{race.venue} {race.raceNo}R ({race.startTime}発走)</div>
      <div className="opacity-90 mt-1 text-xs">{reason}</div>
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
