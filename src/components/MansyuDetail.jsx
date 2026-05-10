/**
 * 万舟研究所 — 1 レース深掘り画面 (Round 166 / Phase 2.5)
 *
 * MansyuTop の各カードからクリックして開く。
 * ・荒れスコアの 6 成分をレーダーチャートで可視化
 * ・各成分の理由 (reasons[]) を一覧
 * ・出走表 / オッズ / 直前情報 / 結果 のリンク
 * ・現在の重みが反映された score がそのまま表示される
 */
import { useMemo } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";
import {
  scoreMansyu,
  buildMansyuBuyOrders,
  buildMansyuReason,
  minutesToClose,
  formatMinutesToClose,
  levelLabel,
  levelColor,
} from "../lib/mansyu.js";
import RaceLinks from "./RaceLinks.jsx";

const COMPONENT_LABELS = {
  entry:      "進入不安",
  weather:    "強風・波",
  leader:     "1号艇不安",
  attackers:  "攻め手",
  exhibition: "展示異変",
  odds:       "オッズ妙味",
};
const COMPONENT_MAX = {
  entry: 20, weather: 15, leader: 20, attackers: 20, exhibition: 15, odds: 10,
};

export default function MansyuDetail({ race, onClose }) {
  const result = useMemo(() => race ? scoreMansyu(race) : null, [race]);
  if (!race || !result) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16, color: "#94a3b8" }}>
        レース情報がありません。 <button onClick={onClose} style={btnStyle()}>← 戻る</button>
      </div>
    );
  }

  const close = minutesToClose(race);
  const buyOrders = buildMansyuBuyOrders(race, result);
  const reasonText = buildMansyuReason(race, result);
  const color = levelColor(result.level);
  const label = levelLabel(result.level);
  const isAlarm = result.level === "alarm";

  // recharts 用に正規化 (各成分を 0〜100% に変換)
  const radarData = Object.keys(COMPONENT_LABELS).map((k) => ({
    component: COMPONENT_LABELS[k],
    score: COMPONENT_MAX[k] > 0
      ? Math.round((result.parts[k]?.score || 0) / COMPONENT_MAX[k] * 100)
      : 0,
    raw: result.parts[k]?.score || 0,
    max: COMPONENT_MAX[k],
  }));

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "12px clamp(8px, 3vw, 16px) 0" }}>
      {/* ===== ヘッダ ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={onClose} style={btnStyle()}>← 戻る</button>
        <div style={{ flex: 1, fontSize: 12, color: "#94a3b8" }}>
          {race.date} / {formatMinutesToClose(close)}
        </div>
      </div>

      {/* ===== タイトル ===== */}
      <div style={{
        padding: "16px 18px", borderRadius: 14,
        background: isAlarm
          ? "linear-gradient(135deg, rgba(220, 38, 38, 0.14) 0%, rgba(15, 23, 42, 0.85) 100%)"
          : "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)",
        border: `1.5px solid ${color}55`,
        boxShadow: isAlarm ? `0 0 24px ${color}40` : "none",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9" }}>
              {race.venue} <span style={{ color }}>{race.raceNo}R</span>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
              発走 {race.startTime || "—"}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            padding: "8px 14px", borderRadius: 12,
            background: color, color: "#fff",
            fontSize: 14, fontWeight: 800, letterSpacing: "0.04em",
          }}>
            {isAlarm ? "🚨 " : "⚠️ "}{label}
          </div>
          <div style={{
            padding: "8px 14px", borderRadius: 12,
            background: "rgba(0,0,0,0.30)",
            border: `1.5px solid ${color}55`,
            color: "#fff",
          }}>
            <span style={{ color, fontSize: 28, fontWeight: 900 }}>{result.score}</span>
            <span style={{ fontSize: 13, opacity: 0.7, marginLeft: 4 }}>/100</span>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 14, color: "#FBBF24" }}>
          🌊 万舟期待度 {result.mansyuRating}
        </div>
        <div style={{
          marginTop: 8, padding: "10px 12px", borderRadius: 8,
          background: "rgba(0,0,0,0.30)",
          borderLeft: `3px solid ${color}`,
          fontSize: 13, color: "#cbd5e1", lineHeight: 1.6,
        }}>
          💡 {reasonText}
        </div>
      </div>

      {/* ===== レーダーチャート ===== */}
      <Section title="📊 荒れ条件のバランス" subtitle="6 成分を 0〜100% で正規化">
        <div style={{ height: 320, padding: "8px 0" }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#475569" />
              <PolarAngleAxis dataKey="component" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#64748B", fontSize: 9 }} />
              <Radar
                name="現在のスコア"
                dataKey="score"
                stroke={color}
                fill={color}
                fillOpacity={0.40}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ===== 各成分の詳細 (理由付き) ===== */}
      <Section title="🔍 成分別 詳細" subtitle="それぞれの加点理由">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {radarData.map((row, i) => {
            const reasons = result.parts[Object.keys(COMPONENT_LABELS)[i]]?.reasons || [];
            const ratio = row.score;
            return (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(148, 163, 184, 0.15)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: reasons.length ? 4 : 0 }}>
                  <div style={{ flex: 1, fontSize: 13, color: "#cbd5e1", fontWeight: 700 }}>
                    {row.component}
                  </div>
                  <div style={{
                    padding: "1px 8px", borderRadius: 999,
                    background: ratio === 0 ? "#475569" : ratio >= 70 ? "#DC2626" : ratio >= 40 ? "#F59E0B" : "#6B7280",
                    color: "#fff", fontSize: 11, fontWeight: 800,
                  }}>
                    {row.raw}/{row.max}
                  </div>
                </div>
                {reasons.length > 0 && (
                  <div style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.6 }}>
                    {reasons.join(" / ")}
                  </div>
                )}
              </div>
            );
          })}
          {result.boost > 0 && (
            <div style={{
              padding: "8px 12px", borderRadius: 8,
              background: "rgba(220, 38, 38, 0.12)",
              border: "1px solid rgba(220, 38, 38, 0.40)",
            }}>
              <div style={{ fontSize: 13, color: "#FCA5A5", fontWeight: 800 }}>
                🔥 強制激荒れブースト +{result.boost}
              </div>
              <div style={{ fontSize: 11, color: "#FECACA", marginTop: 2 }}>
                複数の荒れ条件が同時発動
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ===== 買い目 ===== */}
      {buyOrders.length > 0 && (
        <Section title={`🎯 買い目 (${buyOrders.length} 点)`} subtitle="5,000 円配分は MansyuTop で確認">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {buyOrders.map((o, i) => (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(34, 211, 238, 0.06)",
                border: "1px solid rgba(34, 211, 238, 0.25)",
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <div className="font-mono" style={{ fontSize: 16, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.05em" }}>
                  {o.combo.join("-")}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{o.kind}</div>
                <div style={{ flex: 1, textAlign: "right", fontSize: 12, color: "#cbd5e1" }}>
                  {o.reason}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ===== 外部リンク ===== */}
      <Section title="🔗 公式リンク" subtitle="出走表 / オッズ / 直前情報 / 結果 / リプレイ">
        <RaceLinks race={race} showResult />
      </Section>

      {/* ===== 気象 / 水面 ===== */}
      {(race.weather || race.wind != null || race.wave != null) && (
        <Section title="🌊 気象 / 水面">
          <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.20)",
            fontSize: 13, color: "#cbd5e1", lineHeight: 1.6,
          }}>
            {race.weather || "—"} / 風 {race.wind ?? "—"}m
            {race.windDir ? ` (${race.windDir})` : ""} / 波 {race.wave ?? "—"}cm
          </div>
        </Section>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 6, padding: "0 4px" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", letterSpacing: "0.02em" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function btnStyle() {
  return {
    padding: "6px 12px", borderRadius: 8,
    background: "rgba(148, 163, 184, 0.10)",
    border: "1px solid rgba(148, 163, 184, 0.30)",
    color: "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer",
  };
}
