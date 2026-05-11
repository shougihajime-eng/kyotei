/**
 * 本日の勝負レース — 超大判ヒーローカード (Round 188 / SPEC §0.1, §4, §8)
 *
 * ホーム最上部に「今日これを買う」を 1 秒で伝えるための専用カード。
 * 通常の RaceCard より一段大きい・買い目を圧倒的に目立たせる。
 *
 * 表示内容:
 *   ・場名 + R番 (超大)
 *   ・締切時刻 + 残り (赤バッジ・5分以内は点滅)
 *   ・荒れスコア (超大・glow)
 *   ・万舟期待度 ★
 *   ・💡 なぜこのレースか (理由 3 行)
 *   ・💰 買い目 (combo 超大・5,000 円配分)
 *   ・🏁 結果 / 収支 (確定済みなら)
 */
import { useMemo } from "react";
import {
  buildMansyuBuyOrders,
  buildMansyuReasonLines,
  levelColor,
  levelLabel,
  formatMinutesToClose,
} from "../lib/mansyu.js";
import { getJudgementLog, makeKey } from "../lib/mansyuSkipLog.js";

export default function PrimaryBattleCard({ race, result, close, onPickRace }) {
  const color = levelColor(result.level);
  const label = levelLabel(result.level);
  const isAlarm = result.level === "alarm";
  const buyOrders = useMemo(() => buildMansyuBuyOrders(race, result), [race, result]);
  const reasonLines = useMemo(() => buildMansyuReasonLines(result, 3), [result]);
  const closeText = formatMinutesToClose(close);
  const closing = close != null && close <= 5 && close >= -1;
  const closeBg = close == null ? "#475569"
    : close <= 5  ? "#DC2626"
    : close <= 15 ? "#F59E0B"
    : close <= 60 ? "#2563EB"
    : "#475569";

  // skipLog から結果 + 仮想収支を引っ張る (確定済みなら表示)
  const logEntry = useMemo(() => {
    try {
      const key = makeKey(race);
      if (!key) return null;
      return getJudgementLog().find((e) => e.key === key) || null;
    } catch { return null; }
  }, [race]);
  const hasFinal = logEntry?.finalized && logEntry?.result;
  const pnl = logEntry?.virtualPnl;

  return (
    <div style={{
      borderRadius: 18,
      background: isAlarm
        ? "linear-gradient(135deg, rgba(220, 38, 38, 0.20) 0%, rgba(15, 23, 42, 0.92) 60%)"
        : "linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(15, 23, 42, 0.92) 60%)",
      border: `2.5px solid ${color}`,
      boxShadow: isAlarm
        ? `0 0 28px ${color}55, 0 4px 18px rgba(0,0,0,0.4)`
        : `0 0 18px ${color}40, 0 4px 16px rgba(0,0,0,0.4)`,
      overflow: "hidden",
      marginBottom: 14,
    }}>
      {/* === 上段ラベル === */}
      <div style={{
        padding: "8px 16px",
        background: isAlarm
          ? "linear-gradient(90deg, rgba(220, 38, 38, 0.50) 0%, rgba(220, 38, 38, 0.18) 100%)"
          : "linear-gradient(90deg, rgba(245, 158, 11, 0.45) 0%, rgba(245, 158, 11, 0.16) 100%)",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        borderBottom: `1px solid ${color}55`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: "#fff" }}>
          🎯 本日の勝負レース
        </span>
        <span
          className={isAlarm ? "mansyu-pulse" : ""}
          style={{
            padding: "3px 10px", borderRadius: 999,
            background: color, color: "#fff",
            fontSize: 12.5, fontWeight: 800, letterSpacing: "0.04em",
          }}>
          {isAlarm ? "🚨 " : "⚠️ "}{label}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600 }}>
          {hasFinal ? "結果確定" : "勝負中"}
        </span>
      </div>

      {/* === 場名 + R番 + 締切 + スコア === */}
      <div style={{
        padding: "16px clamp(14px, 3vw, 22px) 10px",
        display: "flex", alignItems: "center", gap: "clamp(10px, 2vw, 18px)",
        flexWrap: "wrap",
      }}>
        <div style={{ flex: "0 1 auto", minWidth: 0 }}>
          <div style={{
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 900, color: "#f8fafc",
            lineHeight: 1.0, letterSpacing: "0.01em",
          }}>
            {race.venue}
            <span style={{
              fontSize: "clamp(40px, 7vw, 60px)",
              color, marginLeft: 8, fontWeight: 900,
            }}>{race.raceNo}R</span>
          </div>
          <div style={{ fontSize: 14, color: "#cbd5e1", marginTop: 6, fontWeight: 600 }}>
            発走 <b className="num" style={{ color: "#e2e8f0" }}>{race.startTime || "—"}</b>
          </div>
        </div>

        <div style={{ flex: "1 1 0", minWidth: 4 }} />

        <div
          className={closing ? "mansyu-blink" : ""}
          style={{
            padding: "10px 18px", borderRadius: 14,
            background: closeBg, color: "#fff",
            fontSize: "clamp(16px, 2.2vw, 20px)", fontWeight: 800, lineHeight: 1.1,
            boxShadow: closing ? "0 0 14px rgba(220, 38, 38, 0.65)" : "none",
          }}>
          ⏱ {closeText}
        </div>

        <div
          className={isAlarm ? "mansyu-glow" : ""}
          style={{
            padding: "10px 18px", borderRadius: 16,
            background: "rgba(0,0,0,0.45)",
            border: `2.5px solid ${color}`,
            color: "#fff",
            display: "flex", alignItems: "baseline", gap: 4,
            lineHeight: 1.0,
          }}>
          <span style={{
            color, fontWeight: 900,
            fontSize: "clamp(48px, 8vw, 68px)",
            letterSpacing: "-0.02em",
          }} className="num">{result.score}</span>
          <span style={{ fontSize: 16, color: "#cbd5e1", opacity: 0.85 }}>/100</span>
        </div>
      </div>

      {/* === 万舟期待度 + 注目艇 === */}
      <div style={{
        padding: "0 clamp(14px, 3vw, 22px) 12px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>万舟期待度</div>
        <div style={{
          fontSize: "clamp(24px, 3vw, 30px)",
          color: "#FBBF24", letterSpacing: "0.14em", fontWeight: 800, lineHeight: 1.0,
        }}>{result.mansyuRating}</div>
        {result.focus.length > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: "rgba(148, 163, 184, 0.40)" }} />
            <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>注目</div>
            {result.focus.slice(0, 3).map((f) => (
              <span key={f.boatNo} style={{
                padding: "6px 14px", borderRadius: 999,
                background: "rgba(34, 211, 238, 0.18)",
                border: "2px solid rgba(34, 211, 238, 0.55)",
                color: "#67E8F9", fontSize: 15, fontWeight: 800,
              }}>
                {f.boatNo}号艇 {f.racer || ""}
              </span>
            ))}
          </>
        )}
      </div>

      {/* === 💡 なぜこのレースか (3 行) === */}
      <div style={{
        margin: "0 clamp(14px, 3vw, 22px) 14px",
        padding: "14px 16px",
        borderRadius: 12,
        background: "rgba(0,0,0,0.45)",
        borderLeft: `5px solid ${color}`,
      }}>
        <div style={{
          fontSize: 13, color: "#FCD34D", marginBottom: 8,
          fontWeight: 800, letterSpacing: "0.05em",
        }}>
          💡 なぜこのレースか
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reasonLines.map((line, i) => (
            <div key={i} style={{
              fontSize: "clamp(15px, 1.8vw, 17px)", color: "#f1f5f9",
              lineHeight: 1.5, fontWeight: 600,
              display: "flex", gap: 10, alignItems: "baseline",
            }}>
              <span style={{ color, fontWeight: 900, flex: "0 0 auto", fontSize: 18 }}>•</span>
              <span style={{ flex: 1 }}>{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* === 💰 買い目 (圧倒的に目立たせる) === */}
      {buyOrders.length > 0 && (
        <div style={{ margin: "0 clamp(14px, 3vw, 22px) 14px" }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: 10, gap: 8, flexWrap: "wrap",
          }}>
            <div style={{
              fontSize: "clamp(18px, 2.2vw, 22px)", color: "#FCD34D",
              fontWeight: 900, letterSpacing: "0.04em",
            }}>
              💰 今日はこれを買う <span style={{
                fontSize: 13, color: "#cbd5e1", fontWeight: 700, marginLeft: 4,
              }}>({buyOrders.length} 点)</span>
            </div>
            <div style={{
              padding: "6px 14px", borderRadius: 999,
              background: "rgba(251, 191, 36, 0.20)",
              border: "2px solid rgba(251, 191, 36, 0.55)",
              fontSize: 15, color: "#FCD34D", fontWeight: 900, letterSpacing: "0.02em",
            }}>
              合計 <span className="num">5,000</span> 円
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {buyOrders.map((o, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 12,
                background: "rgba(34, 211, 238, 0.14)",
                border: "2px solid rgba(34, 211, 238, 0.45)",
                flexWrap: "wrap",
              }}>
                <div style={{
                  fontSize: "clamp(28px, 4vw, 36px)",
                  fontWeight: 900, color: "#67E8F9",
                  letterSpacing: "0.08em", lineHeight: 1.0,
                }}>
                  {o.combo.join("-")}
                </div>
                <div style={{
                  fontSize: 12, color: "#cbd5e1", fontWeight: 800,
                  padding: "4px 10px", borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  letterSpacing: "0.04em",
                }}>{o.kind}</div>
                {o.stake != null && (
                  <div style={{
                    fontSize: "clamp(18px, 2vw, 22px)", color: "#FCD34D", fontWeight: 900,
                    padding: "4px 14px", borderRadius: 999,
                    background: "rgba(251, 191, 36, 0.20)",
                    border: "2px solid rgba(251, 191, 36, 0.50)",
                    letterSpacing: "0.02em",
                  }}>
                    <span className="num">{o.stake.toLocaleString("ja-JP")}</span> 円
                  </div>
                )}
                <div style={{
                  flex: 1, minWidth: 130, fontSize: 13, color: "#cbd5e1",
                  textAlign: "right", lineHeight: 1.45, fontWeight: 500,
                }}>
                  {o.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === 🏁 結果 + 収支 (確定済みのみ) === */}
      <div style={{
        margin: "0 clamp(14px, 3vw, 22px) 14px",
        padding: "12px 16px",
        borderRadius: 12,
        background: hasFinal
          ? (pnl?.pnl > 0
              ? "linear-gradient(90deg, rgba(16, 185, 129, 0.22) 0%, rgba(15, 23, 42, 0.80) 100%)"
              : "linear-gradient(90deg, rgba(220, 38, 38, 0.18) 0%, rgba(15, 23, 42, 0.80) 100%)")
          : "rgba(255,255,255,0.04)",
        border: hasFinal
          ? `1.5px solid ${pnl?.pnl > 0 ? "rgba(16, 185, 129, 0.55)" : "rgba(220, 38, 38, 0.55)"}`
          : "1px dashed rgba(148, 163, 184, 0.35)",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        {hasFinal ? (
          <>
            <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 700 }}>🏁 結果</div>
            <div style={{
              fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 900, color: "#f1f5f9",
              letterSpacing: "0.08em", lineHeight: 1.0,
            }} className="num">
              {logEntry.result.order}
            </div>
            {logEntry.result.payout != null && (
              <div style={{
                fontSize: 14, color: "#FCD34D", fontWeight: 800,
                padding: "4px 12px", borderRadius: 999,
                background: "rgba(251, 191, 36, 0.15)",
                border: "1.5px solid rgba(251, 191, 36, 0.45)",
              }}>
                3連単 <span className="num">{Number(logEntry.result.payout).toLocaleString("ja-JP")}</span> 円
              </div>
            )}
            <div style={{ flex: 1 }} />
            {pnl && (
              <div style={{
                fontSize: "clamp(18px, 2.4vw, 24px)", fontWeight: 900,
                color: pnl.pnl > 0 ? "#34D399" : pnl.pnl === 0 ? "#cbd5e1" : "#FCA5A5",
                letterSpacing: "0.02em",
              }}>
                収支 <span className="num">{pnl.pnl > 0 ? "+" : ""}{pnl.pnl.toLocaleString("ja-JP")}</span> 円
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>
              ⏳ 結果待ち
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              レース終了後、自動で 3 連単結果と収支が反映されます
            </div>
          </>
        )}
      </div>

      {/* === 詳細ボタン (1 行) === */}
      <div style={{
        padding: "10px clamp(14px, 3vw, 22px) 14px",
        display: "flex", gap: 8, flexWrap: "wrap",
        borderTop: "1px solid rgba(148, 163, 184, 0.18)",
      }}>
        <DetailLink label="📋 出走表" race={race} kind="program" />
        <DetailLink label="💰 オッズ" race={race} kind="odds" />
        <DetailLink label="🌊 直前情報" race={race} kind="beforeinfo" />
        <DetailLink label="🏁 結果" race={race} kind="result" />
        {onPickRace && (
          <button
            onClick={() => onPickRace(race.id)}
            style={{
              padding: "10px 16px", minHeight: 44, borderRadius: 10,
              background: "rgba(251, 191, 36, 0.18)",
              border: "1.5px solid rgba(251, 191, 36, 0.55)",
              color: "#FCD34D", fontSize: 14, fontWeight: 800,
              cursor: "pointer", marginLeft: "auto",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}>
            🔬 詳しく見る →
          </button>
        )}
      </div>
    </div>
  );
}

function DetailLink({ label, race, kind }) {
  const dateK = (race?.date || "").replaceAll("-", "");
  const jcd = race?.jcd;
  const rno = race?.raceNo;
  if (!jcd || !rno || !dateK) return null;
  const path = kind === "program" ? "racelist" : kind;
  const url = `https://www.boatrace.jp/owpc/pc/race/${path}?rno=${rno}&jcd=${jcd}&hd=${dateK}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: "10px 14px", minHeight: 44, borderRadius: 10,
        background: "rgba(255,255,255,0.06)",
        border: "1.5px solid rgba(148, 163, 184, 0.35)",
        color: "#e2e8f0", fontSize: 13, fontWeight: 700,
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        display: "inline-flex", alignItems: "center",
      }}>
      {label}
    </a>
  );
}
