import { memo, useEffect, useState, useMemo } from "react";
import { yen, startEpoch } from "../lib/format.js";
import { buildRaceCardUrl } from "../lib/raceLinks.js";

/**
 * Round 118: 「今、 これに賭けろ」 巨大表示モード
 *
 * 思想:
 *   ・複数候補の中から **最も urgent + 最も信頼できる買い** を 1 件だけ選び、
 *     画面いっぱいに表示する。
 *   ・ユーザーが迷わない。 「これだ」 が 1 秒で分かる。
 *   ・買い判定がない時は何も表示しない (= ノイズなし、 自然に消える)。
 *
 * 選び方:
 *   ・対象: minutesToStart 0-15 + decision="buy"
 *   ・優先順: グレード S > A > B > C > others (高評価ほど信頼)
 *     その中で発走時刻が近いものを優先
 *
 * 表示要素:
 *   ・🟢 今、 これに賭けろ (大見出し)
 *   ・会場 + Rno + 締切時刻
 *   ・残り時間カウントダウン (1 秒刻み)
 *   ・本命買い目 (3連単 1-2-3 など)
 *   ・推奨投資額 (円)
 *   ・EV / オッズ
 *   ・💰 BOATRACE 公式で買う ボタン (Round 118 Task 3)
 */
const ODDS_STABLE_MINUTES = 15;

export default memo(BattleModeCard);

function BattleModeCard({ races, recommendations, onPickRace }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const battle = useMemo(() => {
    if (!races || !recommendations) return null;
    let best = null;
    for (const r of races) {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) continue;
      const minutesToStart = (e - now) / 60000;
      if (minutesToStart <= 0 || minutesToStart > ODDS_STABLE_MINUTES) continue;
      const rec = recommendations[r.id];
      if (rec?.decision !== "buy") continue;
      // S/A/B/C のグレード優先 + 発走時刻近い順
      const gradeRank = ({ S: 4, A: 3, B: 2, C: 1 }[rec.grade]) || 0;
      const score = gradeRank * 1000 + (15 - minutesToStart); // 早いほど + 高グレードほど
      if (!best || score > best.score) {
        best = { race: r, rec, minutesToStart, score };
      }
    }
    return best;
  }, [races, recommendations, now]);

  if (!battle) return null;

  const { race, rec, minutesToStart } = battle;
  const main = rec.main;
  const m = Math.max(0, Math.floor(minutesToStart));
  const sec = Math.max(0, Math.floor(minutesToStart * 60) % 60);
  const isVeryUrgent = minutesToStart <= 5;
  const isS = rec.grade === "S";

  // 投票サイトリンク (公式 boatrace.jp の出走表ページ — そこに 「投票」 ボタンあり)
  const voteUrl = buildRaceCardUrl(race.jcd, race.date, race.raceNo);

  const accent = isS ? "#10b981" : "#34d399";
  const accentBg = isS
    ? "linear-gradient(135deg, rgba(16, 185, 129, 0.32) 0%, rgba(6, 95, 70, 0.18) 100%)"
    : "linear-gradient(135deg, rgba(52, 211, 153, 0.22) 0%, rgba(6, 95, 70, 0.14) 100%)";

  return (
    <section style={{
      padding: "24px 22px 20px",
      borderRadius: 18,
      background: `${accentBg}, linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)`,
      border: `2px solid ${accent}`,
      boxShadow: `0 0 0 1px ${accent}40 inset, 0 8px 32px rgba(0, 0, 0, 0.40), 0 0 64px -12px ${accent}66`,
      backdropFilter: "blur(12px)",
      color: "var(--text-primary)",
      minHeight: 360,
      position: "relative",
      animation: isVeryUrgent ? "battlePulse 1.6s ease-in-out infinite" : undefined,
    }}>
      {/* 残り時間バッジ (右上) */}
      <div style={{
        position: "absolute",
        top: 12,
        right: 14,
        background: isVeryUrgent ? "rgba(248,113,113,0.22)" : "rgba(0,0,0,0.40)",
        color: isVeryUrgent ? "#fecaca" : "#fde68a",
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "0.02em",
        border: isVeryUrgent ? "1px solid rgba(248,113,113,0.45)" : "1px solid rgba(255,255,255,0.10)",
      }} className="num">
        {m === 0 ? `あと ${sec} 秒` : `あと ${m} 分`}
      </div>

      {/* メインタイトル */}
      <div style={{
        fontSize: "min(34px, 8.5vw)",
        fontWeight: 900,
        color: accent,
        letterSpacing: "0.005em",
        marginBottom: 6,
        lineHeight: 1.15,
      }}>
        {isS ? "🔥 今、 勝負レース" : "🟢 今、 これに賭けろ"}
      </div>

      {/* 会場 R 番号 + 締切 */}
      <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, letterSpacing: "0.01em" }}>
        <b style={{ fontSize: 16, color: "var(--text-primary)" }}>
          {race.venue} <span className="num">{race.raceNo}R</span>
        </b>
        <span style={{ marginLeft: 8, opacity: 0.85 }} className="num">
          ({race.startTime} 締切)
        </span>
        {rec.grade && (
          <span className={"pill badge-grade-" + rec.grade} style={{
            marginLeft: 10,
            fontSize: 11.5,
            padding: "3px 9px",
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}>
            {rec.grade}評価
          </span>
        )}
      </div>

      {/* 本命買い目 (巨大表示) */}
      {main && (
        <div style={{
          background: "rgba(0, 0, 0, 0.38)",
          borderRadius: 16,
          padding: "20px 16px 18px",
          textAlign: "center",
          border: `1.5px solid ${accent}66`,
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 6,
          }}>
            本命買い目 ({main.kind})
          </div>
          <div className="font-mono" style={{
            fontSize: "min(56px, 14vw)",
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "0.02em",
            color: "var(--text-primary)",
            marginBottom: 8,
          }}>
            {main.combo}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
            <Stat label="投資" value={yen(main.stake)} num color={accent} />
            <Stat label="オッズ" value={`${main.odds?.toFixed(1)}倍`} num />
            <Stat label="EV" value={main.ev?.toFixed(2)} num color="#fde68a" />
          </div>
        </div>
      )}

      {/* 一言理由 */}
      {rec.reason && (
        <div style={{
          fontSize: 12.5,
          color: "#fde68a",
          textAlign: "center",
          marginBottom: 14,
          padding: "8px 12px",
          background: "rgba(0, 0, 0, 0.22)",
          borderRadius: 10,
          lineHeight: 1.5,
        }}>
          💡 {rec.reason}
        </div>
      )}

      {/* アクションボタン: 詳細を見る + BOATRACE 公式で買う */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onPickRace?.(race.id)}
          style={{
            flex: "1 1 140px",
            minHeight: 48,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(255, 255, 255, 0.08)",
            color: "var(--text-primary)",
            fontWeight: 700,
            fontSize: 13.5,
            border: "1px solid rgba(255, 255, 255, 0.18)",
            cursor: "pointer",
          }}>
          📋 詳しく見る
        </button>
        {voteUrl && (
          <a
            href={voteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: "1 1 200px",
              minHeight: 48,
              padding: "12px 16px",
              borderRadius: 12,
              background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
              color: "#451A03",
              fontWeight: 800,
              fontSize: 14.5,
              border: "none",
              cursor: "pointer",
              textDecoration: "none",
              textAlign: "center",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              letterSpacing: "0.01em",
              boxShadow: "0 1px 0 rgba(255, 255, 255, 0.30) inset, 0 4px 14px rgba(245, 158, 11, 0.40)",
            }}>
            💰 BOATRACE 公式で買う <span style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
          </a>
        )}
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.65, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
        ※ 公式サイトの該当レースに飛びます。 投票には TELEBOAT の会員ログインが必要です。
      </div>

      <style>{`
        @keyframes battlePulse {
          0%, 100% { box-shadow: 0 0 0 1px ${accent}40 inset, 0 8px 32px rgba(0, 0, 0, 0.40), 0 0 64px -12px ${accent}66; }
          50%      { box-shadow: 0 0 0 1px ${accent}80 inset, 0 8px 40px rgba(0, 0, 0, 0.50), 0 0 96px -8px ${accent}; }
        }
      `}</style>
    </section>
  );
}

function Stat({ label, value, num, color }) {
  return (
    <div>
      <div style={{
        fontSize: 9.5,
        color: "var(--text-tertiary)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 600,
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div
        className={num ? "num" : ""}
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: color || "var(--text-primary)",
          letterSpacing: "0.005em",
          lineHeight: 1.2,
        }}>
        {value}
      </div>
    </div>
  );
}
