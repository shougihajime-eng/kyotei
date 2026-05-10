/**
 * 場別ランキング 親コンポーネント (Round 180-181 / SPEC §6.1.2)
 *
 * 場切替タブ + モーター TOP10 (Round 180) + 選手 TOP10 (Round 181 で追加)
 * 5 場リストは TARGET_VENUES から動的取得 (SPEC §6.1.2 設計原則 — 固定埋め込み禁止)
 */
import { useMemo, useState } from "react";
import { TARGET_VENUES } from "../lib/mansyu.js";
import MotorRankingTable from "./MotorRankingTable.jsx";
import RacerRankingTable from "./RacerRankingTable.jsx";

/* TARGET_VENUES jcd → 表示名 (mansyu.js の VENUE_BASE と整合) */
const VENUE_NAMES = {
  "01": "桐生",
  "02": "戸田",
  "03": "江戸川",
  "04": "平和島",
  "14": "鳴門",
};

export default function VenueRankings({ races }) {
  // 各場の開催状況 (今日その場のレースが取得できているか)
  const venueStatus = useMemo(() => {
    const out = {};
    for (const v of TARGET_VENUES) {
      const has = Array.isArray(races) && races.some((r) => String(r?.jcd || "").padStart(2, "0") === v);
      out[v] = has;
    }
    return out;
  }, [races]);

  // 初期選択: 開催中の場を優先 (なければ最初の場)
  const initial = TARGET_VENUES.find((v) => venueStatus[v]) || TARGET_VENUES[0];
  const [activeJcd, setActiveJcd] = useState(initial);

  return (
    <section style={{
      padding: "16px 18px",
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(251, 191, 36, 0.04) 0%, rgba(15, 23, 42, 0.40) 100%)",
      border: "1.5px solid rgba(251, 191, 36, 0.25)",
      marginBottom: 14,
    }}>
      {/* ヘッダー */}
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 12, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#FCD34D", letterSpacing: "0.02em" }}>
          🏆 場別 モーター TOP10
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>
          5 場限定・今日開催分
        </div>
      </div>

      {/* 場切替タブ (動的生成 — TARGET_VENUES から) */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 12,
        overflowX: "auto", scrollSnapType: "x proximity",
      }}>
        {TARGET_VENUES.map((jcd) => {
          const active = jcd === activeJcd;
          const open = venueStatus[jcd];
          return (
            <button
              key={jcd}
              onClick={() => setActiveJcd(jcd)}
              style={{
                flex: "0 0 auto", scrollSnapAlign: "start",
                padding: "8px 14px", minHeight: 40,
                borderRadius: 999,
                background: active
                  ? "linear-gradient(180deg, rgba(251, 191, 36, 0.22) 0%, rgba(245, 158, 11, 0.10) 100%)"
                  : "rgba(255,255,255,0.04)",
                border: active
                  ? "1.5px solid rgba(251, 191, 36, 0.65)"
                  : "1px solid rgba(148, 163, 184, 0.30)",
                color: active ? "#FCD34D" : (open ? "#cbd5e1" : "#64748B"),
                fontSize: 13, fontWeight: active ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}>
              {VENUE_NAMES[jcd] || jcd}
              {!open && (
                <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>休</span>
              )}
            </button>
          );
        })}
      </div>

      {/* === モーター TOP10 === */}
      <SubHeader icon="🏆" title="モーター TOP10" />
      <div style={{
        background: "rgba(0,0,0,0.25)", borderRadius: 10,
        padding: "4px 0", marginBottom: 8,
      }}>
        <MotorRankingTable
          races={races}
          jcd={activeJcd}
          venueName={VENUE_NAMES[activeJcd] || activeJcd}
        />
      </div>
      <Caption text="💡 評価: モーター 2 連率 60% + ボート 2 連率 25% + 展示気配 15%" />

      {/* === 選手 TOP10 (Round 181) === */}
      <SubHeader icon="🏅" title="選手 TOP10" mt={16} />
      <div style={{
        background: "rgba(0,0,0,0.25)", borderRadius: 10,
        padding: "4px 0", marginBottom: 8,
      }}>
        <RacerRankingTable
          races={races}
          jcd={activeJcd}
          venueName={VENUE_NAMES[activeJcd] || activeJcd}
        />
      </div>
      <Caption text="💡 評価: 当地勝率 30% + 全国勝率 20% + 級別 15% + ST 15% + モーター相性 10% / 「🌊 会場巧者」 を発見" />

    </section>
  );
}

function SubHeader({ icon, title, mt }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8,
      marginTop: mt || 0, marginBottom: 6,
      paddingLeft: 4,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", letterSpacing: "0.02em" }}>
        {title}
      </span>
    </div>
  );
}

function Caption({ text }) {
  return (
    <div style={{
      padding: "6px 10px",
      background: "rgba(0,0,0,0.30)", borderRadius: 8,
      fontSize: 11, color: "#94A3B8", lineHeight: 1.55,
    }}>
      {text}
    </div>
  );
}
