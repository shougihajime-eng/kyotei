import { useMemo } from "react";
import { yen } from "../lib/format.js";

/**
 * Round 107: RaceList premium polish
 *
 * ・セクションヘッダのタイポグラフィ統一 (15px / 0.01em / palt)
 * ・買うべきレースカードを refined gradient + lift on hover
 * ・グレード badge を premium 化 (S/A は accent カラー、その他 muted)
 * ・見送り / オッズ未取得セクションを subtle に
 */
export default function RaceList({ races, evals, recommendations, onPickRace }) {
  const rows = useMemo(() => {
    return (races || []).map((r) => {
      const ev = evals[r.id];
      const rec = recommendations[r.id];
      const grade = ev?.topGrade || "—";
      const maxEV = ev?.maxEV ?? 0;
      const decision = rec?.decision || "skip";
      const mainCombo = rec?.main ? `${rec.main.kind} ${rec.main.combo}` : "—";
      const total = rec?.decision === "buy" ? rec.total : 0;
      const scenario = ev?.development?.scenario || "—";
      const inTrust = ev?.inTrust;
      const points = rec?.items?.length || 0;
      return { race: r, ev, rec, grade, maxEV, mainCombo, total, decision, scenario, inTrust, points };
    }).sort((a, b) => b.maxEV - a.maxEV);
  }, [races, evals, recommendations]);

  const goodOnly = rows.filter((row) => row.decision === "buy" && (row.grade === "S" || row.grade === "A"));
  const oddsPending = rows.filter((row) => row.decision === "odds-pending");
  const noOdds = rows.filter((row) => row.decision === "no-odds");
  const others = rows.filter((row) => row.decision === "skip");

  // 6号艇偏重チェック
  const totalBuy = goodOnly.length;
  const boat6Heavy = goodOnly.filter((row) => (row.rec?.main?.combo || "").startsWith("6")).length;
  const boat6Ratio = totalBuy > 0 ? boat6Heavy / totalBuy : 0;
  const showBoat6Warning = totalBuy >= 3 && boat6Ratio >= 0.20;

  return (
    <div className="max-w-5xl mx-auto px-4 mt-4 space-y-4">
      {showBoat6Warning && (
        <div className="alert-warn" style={{ fontSize: 12.5, lineHeight: 1.55, padding: "10px 14px" }}>
          ⚠️ 6号艇頭の推奨が <b>{Math.round(boat6Ratio * 100)}%</b> ({boat6Heavy}/{totalBuy})。データ偏りや荒れ判定の重なりが原因かもしれません。
        </div>
      )}

      <section className="card" style={{ padding: 18, minHeight: 200 }}>
        <SectionHeader
          icon="🔥"
          title="買うべきレース"
          count={goodOnly.length}
          desc="EV 1.10 以上の連勝系券種を抽出。 S = EV 1.30+, A = 1.10+。"
        />
        {goodOnly.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "20px 4px", textAlign: "center" }}>
            該当なし
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {goodOnly.map((row) => (
              <RaceCard key={row.race.id} row={row} onPick={onPickRace} />
            ))}
          </div>
        )}
      </section>

      {/* Round 113: -15 分前まで予想しないレース群 (オッズ不安定のため) */}
      {oddsPending.length > 0 && (
        <section className="card" style={{
          padding: 16,
          minHeight: 100,
          background: "linear-gradient(180deg, rgba(167, 139, 250, 0.08) 0%, rgba(91, 33, 182, 0.04) 100%), var(--bg-card)",
          border: "1px solid rgba(167, 139, 250, 0.32)",
        }}>
          <SectionHeader
            icon="⏳"
            title="オッズ確定待ち (発走 15 分前から予想開始)"
            count={oddsPending.length}
            desc="競艇のオッズは発走 15 分前にならないと安定しません。 それまでは判定を保留します。"
            small
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {oddsPending
              .slice()
              .sort((a, b) => (a.rec?.minutesToStart ?? 999) - (b.rec?.minutesToStart ?? 999))
              .slice(0, 24)
              .map((row) => (
                <button key={row.race.id} className="btn btn-ghost"
                  onClick={() => onPickRace(row.race.id)}
                  style={{
                    fontSize: 11.5,
                    padding: "6px 10px",
                    minHeight: 32,
                    color: "#ddd6fe",
                    border: "1px solid rgba(167,139,250,0.35)",
                  }}>
                  {row.race.venue} {row.race.raceNo}R · 発走 <span className="num">{row.rec?.minutesToStart ?? "—"}</span>分前
                </button>
              ))}
            {oddsPending.length > 24 && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", alignSelf: "center", letterSpacing: "0.02em" }}>
                ...他 {oddsPending.length - 24}件
              </span>
            )}
          </div>
        </section>
      )}

      {noOdds.length > 0 && (
        <section className="card" style={{
          padding: 16,
          minHeight: 100,
          background: "linear-gradient(180deg, rgba(245, 158, 11, 0.06) 0%, rgba(245, 158, 11, 0.02) 100%), var(--bg-card)",
          border: "1px solid rgba(245, 158, 11, 0.30)",
        }}>
          <SectionHeader
            icon="⚠️"
            title="オッズ取得不可"
            count={noOdds.length}
            desc="発走前で実オッズが未公開。 仮オッズは使わない方針。"
            small
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {noOdds.slice(0, 18).map((row) => (
              <button key={row.race.id} className="btn btn-ghost"
                onClick={() => onPickRace(row.race.id)}
                style={{ fontSize: 11.5, padding: "6px 10px", minHeight: 32 }}>
                {row.race.venue} {row.race.raceNo}R · {row.race.startTime}
              </button>
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="card" style={{
          padding: 16,
          minHeight: 100,
          opacity: 0.72,
        }}>
          <SectionHeader
            icon="📭"
            title="見送り"
            count={others.length}
            desc="EV 1.10 未満"
            small
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {others.slice(0, 24).map((row) => (
              <button key={row.race.id} className="btn btn-ghost"
                onClick={() => onPickRace(row.race.id)}
                style={{ fontSize: 11.5, padding: "6px 10px", minHeight: 32 }}>
                {row.race.venue} {row.race.raceNo}R · EV <span className="num">{row.maxEV.toFixed(2)}</span>
              </button>
            ))}
            {others.length > 24 && (
              <span style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                alignSelf: "center",
                letterSpacing: "0.02em",
              }}>
                ...他 {others.length - 24}件
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* === セクションヘッダ === */
function SectionHeader({ icon, title, count, desc, small }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{
          fontSize: small ? 13.5 : 15,
          fontWeight: 800,
          letterSpacing: "0.01em",
          color: "var(--text-primary)",
          margin: 0,
          lineHeight: 1.3,
        }}>
          <span style={{ marginRight: 6 }}>{icon}</span>{title}
        </h3>
        <span className="num" style={{
          fontSize: small ? 11.5 : 12,
          color: "var(--text-tertiary)",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}>
          ({count})
        </span>
      </div>
      {desc && (
        <div style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          marginTop: 4,
          lineHeight: 1.5,
          letterSpacing: "0.01em",
        }}>
          {desc}
        </div>
      )}
    </div>
  );
}

/* === レースカード (premium) === */
function RaceCard({ row, onPick }) {
  const trust = row.inTrust;
  const isS = row.grade === "S";

  const accentColor = isS ? "var(--c-success)" : "var(--brand)";
  const accentRgba = isS ? "rgba(16, 185, 129," : "rgba(34, 211, 238,";

  return (
    <div
      className="lift-on-hover"
      onClick={() => onPick(row.race.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPick(row.race.id); }}
      style={{
        padding: "16px 16px 14px",
        borderRadius: 14,
        background: `linear-gradient(180deg, ${accentRgba} 0.08) 0%, rgba(255, 255, 255, 0.01) 100%), var(--bg-card)`,
        border: `1px solid ${accentRgba} 0.32)`,
        boxShadow: `0 0 0 1px ${accentRgba} 0.12) inset, 0 6px 18px rgba(0, 0, 0, 0.30)`,
        cursor: "pointer",
        minHeight: 180,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* === ヘッダ: 会場 / R番号 / グレード === */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 10,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "0.005em",
            color: "var(--text-primary)",
            lineHeight: 1.2,
          }}>
            {row.race.venue} <span className="num">{row.race.raceNo}R</span>
          </div>
          <div className="num" style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 2,
            letterSpacing: "0.02em",
          }}>
            締切 {row.race.startTime || "—"}
          </div>
        </div>
        <span className={"pill badge-grade-" + row.grade} style={{
          fontSize: 13,
          padding: "5px 12px",
          fontWeight: 800,
          letterSpacing: "0.04em",
        }}>
          {row.grade}
        </span>
      </div>

      {/* === ピル: 買い + 信頼度 === */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 10,
        flexWrap: "wrap",
      }}>
        <span className="pill badge-buy" style={{ fontSize: 11.5, padding: "3px 10px", fontWeight: 700 }}>
          👉 買い ({row.points}点)
        </span>
        {trust && (
          <span className="pill" style={{
            fontSize: 10.5,
            padding: "3px 8px",
            background: "rgba(255, 255, 255, 0.04)",
            color: trust.color,
            border: `1px solid ${trust.color}40`,
            letterSpacing: "0.02em",
          }}>
            イン: {trust.level}
          </span>
        )}
      </div>

      {/* === 推奨買い目 === */}
      <div style={{
        fontSize: 10.5,
        color: "var(--text-tertiary)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 600,
        marginBottom: 3,
      }}>
        推奨買い目
      </div>
      <div className="num" style={{
        fontSize: 16,
        fontWeight: 700,
        marginBottom: 12,
        color: "var(--text-primary)",
        letterSpacing: "0.01em",
        fontVariantNumeric: "tabular-nums",
      }}>
        {row.mainCombo}
      </div>

      {/* === 3 セル KPI === */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        paddingTop: 10,
        borderTop: "1px solid var(--border-soft)",
      }}>
        <KpiCell label="投資" value={row.total > 0 ? yen(row.total) : "—"} num />
        <KpiCell label="EV" value={row.maxEV.toFixed(2)} num accent={accentColor} />
        <KpiCell label="展開" value={row.scenario} />
      </div>
    </div>
  );
}

/* === KPI 1 セル === */
function KpiCell({ label, value, num, accent }) {
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
          fontSize: 13,
          fontWeight: 700,
          color: accent || "var(--text-primary)",
          letterSpacing: "0.005em",
          lineHeight: 1.25,
        }}
      >
        {value}
      </div>
    </div>
  );
}
