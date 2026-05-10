/**
 * モーター TOP10 テーブル (Round 180 / SPEC §6.1.2)
 *
 * 1 場分のモーター TOP10 を 1 行 1 件で表示。 SPEC §6.1.2 デザイン原則:
 *   - ごちゃごちゃ禁止
 *   - 色 1-2 色のみ
 *   - 一瞬で読める
 *   - 情報密度を上げすぎない
 */
import { useMemo } from "react";
import { computeMotorRanking } from "../lib/venueRanking.js";

export default function MotorRankingTable({ races, jcd, venueName }) {
  const { ranking } = useMemo(() => computeMotorRanking(races, jcd), [races, jcd]);

  if (ranking.length === 0) {
    return (
      <div style={{
        padding: "20px 16px", textAlign: "center",
        fontSize: 13, color: "#94A3B8", lineHeight: 1.6,
      }}>
        📅 {venueName} は今日開催なし、 またはモーター情報を取得中です
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {ranking.map((m) => (
        <Row key={`${m.raceNo}_${m.boatNo}`} m={m} />
      ))}
    </div>
  );
}

function Row({ m }) {
  // 順位カラー (1-3 位は強調)
  const rankColor =
    m.rank === 1 ? "#FBBF24" :
    m.rank === 2 ? "#cbd5e1" :
    m.rank === 3 ? "#FB923C" :
    "#64748B";
  const rankLabel =
    m.rank === 1 ? "🥇" :
    m.rank === 2 ? "🥈" :
    m.rank === 3 ? "🥉" :
    `${m.rank}.`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px",
      borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
      flexWrap: "wrap",
    }}>
      {/* 順位 */}
      <div style={{
        flex: "0 0 auto", minWidth: 32, textAlign: "center",
        fontSize: m.rank <= 3 ? 18 : 14,
        fontWeight: 800, color: rankColor,
        lineHeight: 1.1,
      }}>
        {rankLabel}
      </div>

      {/* レース + 艇番 */}
      <div style={{ flex: "0 0 auto", minWidth: 56 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, lineHeight: 1.1 }}>
          {m.raceNo}R
        </div>
        <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 800, lineHeight: 1.2 }}>
          {m.boatNo}号艇
        </div>
      </div>

      {/* 選手名 */}
      <div style={{ flex: 1, minWidth: 80 }}>
        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700, lineHeight: 1.2 }}>
          {m.racer || "—"}
        </div>
        {m.tag && (
          <div style={{ fontSize: 11, color: "#FCD34D", marginTop: 2, fontWeight: 600, lineHeight: 1.3 }}>
            {m.tag}
          </div>
        )}
      </div>

      {/* スコア + 数字 */}
      <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 80 }}>
        <div style={{ fontSize: 18, color: "#67E8F9", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.01em" }}>
          <span className="num">{m.motorScore}</span>
          <span style={{ fontSize: 11, opacity: 0.65, fontWeight: 600 }}>/100</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 2, fontWeight: 600 }}>
          モーター <span className="num">{m.motor2}</span>%
        </div>
      </div>

      {/* タグ理由 (タグがある時だけ全幅で) */}
      {m.tag && m.tagReason && (
        <div style={{
          flex: "1 0 100%",
          fontSize: 10.5, color: "#94A3B8",
          marginTop: 2, paddingLeft: 42, lineHeight: 1.4,
          fontWeight: 500,
        }}>
          → {m.tagReason}
        </div>
      )}
    </div>
  );
}
