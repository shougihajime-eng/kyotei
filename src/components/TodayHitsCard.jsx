import { useMemo } from "react";
import { yen } from "../lib/format.js";

/**
 * Round 146: 今日の的中レースを派手に表示
 *
 * 思想:
 *   ・確定済 buy 予想で hit=true のものを今日分だけ抽出
 *   ・「○○会場 ○R 的中! +○○円」 と一目で分かる派手な表示
 *   ・連勝中なら 🔥 アイコン、 累計収支も上部に
 *   ・的中ゼロなら何も出さない (押し付けない)
 *
 * 表示要素:
 *   ・上部サマリ: 「🎉 今日の的中 N 件 / +X円」 (連勝マーク付き)
 *   ・各的中カード: 会場 + Rno + 本命買い目 + 払戻 + 利益
 */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function TodayHitsCard({ predictions, onPickRace }) {
  const stats = useMemo(() => {
    if (!predictions) return null;
    const today = todayKey();
    const todayBuys = Object.values(predictions)
      .filter((p) =>
        p?.date === today &&
        p?.decision === "buy" &&
        (p?.totalStake || 0) > 0 &&
        p?.result?.first
      )
      .sort((a, b) => {
        // 時刻順 (新しい順)
        const ta = `${a.startTime || ""}`;
        const tb = `${b.startTime || ""}`;
        return tb.localeCompare(ta);
      });

    const hits = todayBuys.filter((p) => p.hit);
    if (hits.length === 0) return null;

    const totalStake = hits.reduce((s, p) => s + (p.totalStake || 0), 0);
    const totalReturn = hits.reduce((s, p) => s + (p.payout || 0), 0);
    const totalProfit = totalReturn - totalStake;

    // 直近の連勝数 (時刻昇順で末尾から hit が続く数)
    const ordered = [...todayBuys].sort((a, b) =>
      `${a.startTime || ""}`.localeCompare(`${b.startTime || ""}`)
    );
    let streak = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].hit) streak++;
      else break;
    }

    return { hits, totalProfit, totalReturn, streak };
  }, [predictions]);

  if (!stats) return null;
  const { hits, totalProfit, streak } = stats;
  const isPositive = totalProfit > 0;

  return (
    <section style={{
      padding: "18px 18px 14px",
      borderRadius: 18,
      background:
        "linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(34, 211, 238, 0.10) 100%), " +
        "linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)",
      border: "2px solid #10B981",
      boxShadow:
        "0 0 0 1px rgba(16,185,129,0.30) inset, " +
        "0 8px 32px rgba(0,0,0,0.40), " +
        "0 0 64px -12px rgba(16,185,129,0.55)",
    }}>
      {/* 上部サマリ */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap",
        gap: 12, marginBottom: 14, justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontSize: "min(24px, 6vw)", fontWeight: 900,
            color: "#6EE7B7", letterSpacing: "0.005em",
            textShadow: "0 0 12px rgba(110,231,183,0.45)",
          }}>
            🎉 今日の的中 <span className="num">{hits.length}</span> 件
          </div>
          {streak >= 2 && (
            <div style={{
              display: "inline-block", marginTop: 4,
              padding: "3px 10px", borderRadius: 999,
              background: "rgba(245,158,11,0.20)",
              border: "1px solid rgba(245,158,11,0.50)",
              color: "#FCD34D", fontSize: 12, fontWeight: 800,
            }}>
              🔥 <span className="num">{streak}</span> 連勝中
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10.5, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>
            今日の収支
          </div>
          <div className="num" style={{
            fontSize: "min(28px, 7vw)", fontWeight: 900, lineHeight: 1.1,
            color: isPositive ? "#22F5A8" : "#F87171",
            textShadow: isPositive
              ? "0 0 12px rgba(34,245,168,0.45)"
              : "0 0 8px rgba(248,113,113,0.30)",
          }}>
            {isPositive ? "+" : ""}{yen(totalProfit)}
          </div>
        </div>
      </div>

      {/* 各的中カード (最大 5 件まで表示) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hits.slice(0, 5).map((p, i) => {
          const main = (p.combos || [])[0];
          const profit = (p.payout || 0) - (p.totalStake || 0);
          return (
            <button
              type="button"
              key={p.id || `${p.venue}-${p.raceNo}-${i}`}
              onClick={() => onPickRace?.(p.id)}
              style={{
                width: "100%", textAlign: "left",
                padding: "10px 14px", borderRadius: 12,
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(16,185,129,0.32)",
                color: "#F1F5F9", cursor: "pointer",
                display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 12,
              }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>
                  ✅ {p.venue} <span className="num">{p.raceNo}R</span>
                  {p.startTime && (
                    <span style={{ marginLeft: 6, fontSize: 11.5, color: "#94A3B8", fontWeight: 600 }} className="num">
                      {p.startTime}
                    </span>
                  )}
                </div>
                {main?.combo && (
                  <div className="num" style={{ fontSize: 12.5, color: "#CBD5E1" }}>
                    {main.kind} {main.combo}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="num" style={{
                  fontSize: 16, fontWeight: 900,
                  color: profit > 0 ? "#22F5A8" : "#FCD34D",
                  textShadow: profit > 0 ? "0 0 8px rgba(34,245,168,0.40)" : null,
                }}>
                  {profit > 0 ? "+" : ""}{yen(profit)}
                </div>
                <div className="num" style={{ fontSize: 10.5, color: "#94A3B8" }}>
                  払戻 {yen(p.payout || 0)}
                </div>
              </div>
            </button>
          );
        })}
        {hits.length > 5 && (
          <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 4 }}>
            …他 {hits.length - 5} 件 (履歴で確認)
          </div>
        )}
      </div>
    </section>
  );
}
