import { useEffect, useMemo, useRef, useState } from "react";
import { yen, startEpoch } from "../lib/format.js";
import { buildRaceCardUrl } from "../lib/raceLinks.js";

/* === Round 154: 「これを買え!」 が出た瞬間にビープ音 ===
   ・1 レースにつき 1 回 (連打防止)
   ・Web Audio API で短いビープ — 上昇音 (880→1320Hz) の 2 連打 (0.45 秒)
   ・ユーザーが操作 (タップ/クリック) するまで AudioContext は鳴らない (ブラウザ仕様) */
const beepedBuyOrderIds = new Set();
let _audioCtxBuy = null;
function getAudioCtxBuy() {
  try {
    if (!_audioCtxBuy) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioCtxBuy = new Ctx();
    }
    if (_audioCtxBuy.state === "suspended") _audioCtxBuy.resume?.();
    return _audioCtxBuy;
  } catch { return null; }
}
function playBuyOrderBeep() {
  const ctx = getAudioCtxBuy();
  if (!ctx) return;
  const now = ctx.currentTime;
  // 「これを買え」 専用音 — 上昇 + 強調 (3 連打)
  [[660, now, 0.18], [990, now + 0.20, 0.18], [1320, now + 0.40, 0.24]].forEach(([freq, start, dur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.20, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}

/**
 * Round 149: 「これを買え!」 シンプル指示書 (BuyOrderHero)
 *
 * 思想:
 *   ・「どこで・何を・いくら買えばいいか」 を 1 秒で読み取れる超シンプル指示書
 *   ・予想の根拠や詳細は別カード (BattleModeCard) に任せ、 ここは「行動」 だけ
 *   ・まだ TELEBOAT を使ったことがないユーザーでも迷わないようにガイダンス付き
 *
 * 表示条件:
 *   ・直近 (発走 0-15 分) の buy 候補が 1 件以上ある時のみ
 *   ・S/A/B/C グレード優先 + 締切近い順
 *   ・該当なしなら何も出さない (= BattleModeCard の next/none が代わりに出る)
 */
const NOW_WINDOW_MIN = 15;

export default function BuyOrderHero({ races, recommendations }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = useMemo(() => {
    if (!races || !recommendations) return null;
    let best = null;
    for (const r of races) {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) continue;
      const minutesToStart = (e - now) / 60000;
      if (minutesToStart <= 0 || minutesToStart > NOW_WINDOW_MIN) continue;
      const rec = recommendations[r.id];
      if (rec?.decision !== "buy" || !rec.main) continue;
      const gradeRank = ({ S: 4, A: 3, B: 2, C: 1 }[rec.grade]) || 0;
      const score = gradeRank * 1000 + (NOW_WINDOW_MIN - minutesToStart);
      if (!best || score > best.score) {
        best = { race: r, rec, minutesToStart, score };
      }
    }
    return best;
  }, [races, recommendations, now]);

  // Round 154: target 出現時に 1 回ビープ (1 レースにつき 1 回)
  const lastBeepRef = useRef(null);
  useEffect(() => {
    const id = target?.race?.id;
    if (!id) return;
    if (lastBeepRef.current === id) return;
    if (beepedBuyOrderIds.has(id)) return;
    lastBeepRef.current = id;
    beepedBuyOrderIds.add(id);
    const t = setTimeout(() => playBuyOrderBeep(), 150);
    return () => clearTimeout(t);
  }, [target?.race?.id]);

  if (!target) return null;
  const { race, rec, minutesToStart } = target;
  const m = Math.max(0, Math.floor(minutesToStart));
  const sec = Math.max(0, Math.floor(minutesToStart * 60) % 60);
  const isVeryUrgent = minutesToStart <= 5;
  const voteUrl = buildRaceCardUrl(race.jcd, race.date, race.raceNo);

  // Round 155: 勝負度 + 危険度 を結論カードに反映
  const grade = rec.grade || "—"; // S/A/B/C
  // 危険度: ev.accident.severity (0-100) を 低/中/高 にマッピング
  const accidentSev = rec?.accident?.severity || 0;
  const riskLabel = accidentSev >= 60 ? "高" : accidentSev >= 30 ? "中" : "低";
  const riskColor = riskLabel === "高" ? "#F87171" : riskLabel === "中" ? "#FCD34D" : "#22F5A8";
  const points = rec?.items?.length || 0;
  const reasonShort = rec.reason ? String(rec.reason).slice(0, 40) : null;

  return (
    <section style={{
      padding: "26px 22px 22px",
      borderRadius: 20,
      background:
        "linear-gradient(135deg, rgba(251, 191, 36, 0.32) 0%, rgba(245, 158, 11, 0.18) 100%), " +
        "linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)",
      border: `3px solid ${isVeryUrgent ? "#F87171" : "#FBBF24"}`,
      boxShadow:
        `0 0 0 1px ${isVeryUrgent ? "rgba(248,113,113,0.50)" : "rgba(251,191,36,0.50)"} inset, ` +
        "0 8px 32px rgba(0,0,0,0.45), " +
        `0 0 100px -8px ${isVeryUrgent ? "rgba(248,113,113,0.75)" : "rgba(251,191,36,0.75)"}`,
      backdropFilter: "blur(12px)",
      position: "relative",
      animation: isVeryUrgent ? "buyOrderUrgent 1.2s ease-in-out infinite" : "buyOrderPulse 2.4s ease-in-out infinite",
    }}>
      {/* 上部: 「これを買え!」 + 残り時間 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, marginBottom: 14,
      }}>
        <div style={{
          fontSize: "min(36px, 9vw)", fontWeight: 900,
          color: "#FCD34D", letterSpacing: "0.005em",
          lineHeight: 1.05,
          textShadow: "0 0 22px rgba(252,211,77,0.55)",
        }}>
          💰 これを買え!
        </div>
        <div className="num" style={{
          padding: "8px 16px", borderRadius: 999,
          background: isVeryUrgent ? "rgba(248,113,113,0.30)" : "rgba(0,0,0,0.40)",
          color: isVeryUrgent ? "#FECACA" : "#FCD34D",
          border: isVeryUrgent ? "2px solid rgba(248,113,113,0.60)" : "1.5px solid rgba(252,211,77,0.50)",
          fontSize: 14, fontWeight: 800, letterSpacing: "0.02em",
          boxShadow: isVeryUrgent ? "0 0 18px rgba(248,113,113,0.50)" : "0 0 14px rgba(252,211,77,0.35)",
        }}>
          {m === 0 ? `あと ${sec} 秒で締切` : `あと ${m} 分で締切`}
        </div>
      </div>

      {/* Round 155: 勝負度 + 危険度 + 点数 — 結論を 1 行で */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8,
        marginBottom: 14,
      }}>
        <span style={{
          padding: "5px 12px", borderRadius: 999,
          background: "rgba(252,211,77,0.16)",
          border: "1.5px solid rgba(252,211,77,0.50)",
          color: "#FCD34D", fontSize: 12.5, fontWeight: 800,
          letterSpacing: "0.02em",
        }}>
          🏆 勝負度: <span className="num" style={{ fontSize: 14 }}>{grade}</span>
        </span>
        <span style={{
          padding: "5px 12px", borderRadius: 999,
          background: `${riskColor}22`,
          border: `1.5px solid ${riskColor}80`,
          color: riskColor, fontSize: 12.5, fontWeight: 800,
          letterSpacing: "0.02em",
        }}>
          ⚠️ 危険度: {riskLabel}
        </span>
        <span style={{
          padding: "5px 12px", borderRadius: 999,
          background: "rgba(34,211,238,0.14)",
          border: "1.5px solid rgba(34,211,238,0.45)",
          color: "#67E8F9", fontSize: 12.5, fontWeight: 800,
          letterSpacing: "0.02em",
        }}>
          🎯 買い目: <span className="num">{points}</span> 点
        </span>
      </div>

      {/* どこで - 場 + R */}
      <div style={{
        fontSize: 12, color: "#94A3B8", letterSpacing: "0.10em",
        textTransform: "uppercase", fontWeight: 700, marginBottom: 4,
      }}>
        どこで
      </div>
      <div style={{
        fontSize: "min(40px, 10vw)", fontWeight: 900,
        color: "#F1F5F9", lineHeight: 1.05, marginBottom: 14,
        letterSpacing: "0.005em",
      }}>
        {race.venue} <span className="num">{race.raceNo}R</span>
        <span className="num" style={{ marginLeft: 12, fontSize: "min(18px, 4.5vw)", color: "#94A3B8", fontWeight: 600 }}>
          ({race.startTime}締切)
        </span>
      </div>

      {/* 何を - 買い目 */}
      <div style={{
        fontSize: 12, color: "#94A3B8", letterSpacing: "0.10em",
        textTransform: "uppercase", fontWeight: 700, marginBottom: 4,
      }}>
        何を
      </div>
      <div className="font-mono" style={{
        fontSize: "min(56px, 14vw)", fontWeight: 900,
        color: "#F1F5F9", lineHeight: 1.05, marginBottom: 14,
        letterSpacing: "0.02em",
        textShadow: "0 0 24px rgba(251,191,36,0.30)",
      }}>
        {rec.main.kind} <span style={{ color: "#FCD34D" }}>{rec.main.combo}</span>
      </div>

      {/* いくら - 金額 */}
      <div style={{
        fontSize: 12, color: "#94A3B8", letterSpacing: "0.10em",
        textTransform: "uppercase", fontWeight: 700, marginBottom: 4,
      }}>
        いくら
      </div>
      <div className="num" style={{
        fontSize: "min(48px, 12vw)", fontWeight: 900,
        color: "#22F5A8", lineHeight: 1.05, marginBottom: 18,
        textShadow: "0 0 20px rgba(34,245,168,0.50)",
      }}>
        {yen(rec.main.stake)}
        <span style={{ marginLeft: 12, fontSize: "min(16px, 4vw)", color: "#94A3B8", fontWeight: 600 }}>
          (オッズ {rec.main.odds?.toFixed(1)}倍 / EV {rec.main.ev?.toFixed(2)})
        </span>
      </div>

      {/* なぜ買うのか (理由を一言で) */}
      {reasonShort && (
        <div style={{
          marginBottom: 14, padding: "10px 14px",
          background: "rgba(0,0,0,0.30)", borderRadius: 10,
          fontSize: 13, color: "#FDE68A", lineHeight: 1.5,
          letterSpacing: "0.01em",
        }}>
          💡 <b>理由:</b> {reasonShort}
        </div>
      )}

      {/* 公式で買うボタン (超目立つ) */}
      {voteUrl && (
        <a href={voteUrl} target="_blank" rel="noopener noreferrer" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", minHeight: 64,
          padding: "16px 20px", borderRadius: 16,
          background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
          color: "#451A03", fontWeight: 900,
          fontSize: "min(20px, 5vw)", letterSpacing: "0.01em",
          textDecoration: "none",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.35) inset, " +
            "0 8px 24px rgba(245,158,11,0.55)",
        }}>
          📱 BOATRACE 公式で今すぐ買う
          <span style={{ fontSize: 14, opacity: 0.7 }}>↗</span>
        </a>
      )}

      {/* 初めての方向け注意書き */}
      <div style={{
        marginTop: 12, padding: "10px 14px",
        background: "rgba(0,0,0,0.30)", borderRadius: 10,
        fontSize: 11.5, lineHeight: 1.6, color: "#CBD5E1",
      }}>
        💡 <b>初めての方へ:</b> ボタンを押すとボートレース公式サイトに飛びます。
        実際に買うには <b>TELEBOAT (テレボート) の会員登録</b> + 銀行口座の連携が必要です。
        登録は公式サイトから無料 (即日完了) でできます。
      </div>

      <style>{`
        @keyframes buyOrderPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(251,191,36,0.50) inset, 0 8px 32px rgba(0,0,0,0.45), 0 0 100px -8px rgba(251,191,36,0.75); }
          50%      { box-shadow: 0 0 0 1px rgba(251,191,36,0.70) inset, 0 8px 40px rgba(0,0,0,0.55), 0 0 130px -4px rgba(251,191,36,0.95); }
        }
        @keyframes buyOrderUrgent {
          0%, 100% { box-shadow: 0 0 0 1px rgba(248,113,113,0.50) inset, 0 8px 32px rgba(0,0,0,0.45), 0 0 100px -8px rgba(248,113,113,0.80); }
          50%      { box-shadow: 0 0 0 2px rgba(248,113,113,0.85) inset, 0 8px 44px rgba(0,0,0,0.55), 0 0 140px -2px rgba(248,113,113,1.00); }
        }
      `}</style>
    </section>
  );
}
