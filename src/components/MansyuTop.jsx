/**
 * 万舟研究所 — トップ画面 (Phase 1)
 *
 * 「荒れる時だけ」表示する。
 * - 荒れスコア 85+: 激荒れ警報 (赤)
 * - 荒れスコア 75-84: 荒れ注意 (黄)
 * - それ以外: 表示しない
 *
 * 詳細 (展示/モーター/オッズ/水面) はカードを開いて見る。
 */
import { useMemo, useState } from "react";
import {
  scoreMansyu,
  buildMansyuBuyOrders,
  buildMansyuReason,
  minutesToClose,
  formatMinutesToClose,
  levelLabel,
  levelColor,
  TARGET_VENUES,
} from "../lib/mansyu.js";

export default function MansyuTop({ races, refreshing, refreshMsg, lastRefreshAt, onRefresh, onPickRace, isSampleMode }) {
  const now = Date.now();
  // スコア計算 + 75 点以上 + 未終了のみ
  const scored = useMemo(() => {
    if (!Array.isArray(races)) return [];
    return races
      .map((r) => {
        const result = scoreMansyu(r);
        const close = minutesToClose(r, now);
        return { race: r, result, close };
      })
      .filter((x) => x.result && x.result.score >= 75 && x.close != null && x.close >= -5)
      .sort((a, b) => a.close - b.close);
  }, [races, now]);

  const alarms = scored.filter((x) => x.result.level === "alarm");
  const warns  = scored.filter((x) => x.result.level === "warn");

  return (
    <div className="max-w-3xl mx-auto px-3 mt-3">
      {/* ===== ブランドバナー ===== */}
      <div style={{
        background: "linear-gradient(135deg, #0a0e1a 0%, #15172a 100%)",
        border: "1.5px solid rgba(251, 191, 36, 0.30)",
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 12,
        boxShadow: "0 2px 14px rgba(220, 38, 38, 0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>🌊</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#FBBF24", letterSpacing: "0.02em" }}>万舟研究所</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              荒れる時だけお知らせ — 戸田・江戸川・平和島・鳴門・桐生の5場限定
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1.5px solid rgba(251, 191, 36, 0.45)",
              background: refreshing ? "rgba(251, 191, 36, 0.06)" : "rgba(251, 191, 36, 0.14)",
              color: "#FBBF24",
              fontWeight: 700,
              fontSize: 13,
              cursor: refreshing ? "not-allowed" : "pointer",
            }}>
            {refreshing ? "🔄 更新中…" : "🔄 更新"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "#cbd5e1" }}>
          <div>🚨 激荒れ <b style={{ color: "#FCA5A5", fontSize: 14 }}>{alarms.length}</b> 件</div>
          <div>⚠️ 荒れ注意 <b style={{ color: "#FDE68A", fontSize: 14 }}>{warns.length}</b> 件</div>
          <div style={{ marginLeft: "auto", color: "#94a3b8" }}>
            {lastRefreshAt ? `最終更新: ${new Date(lastRefreshAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "未更新"}
          </div>
        </div>
        {refreshMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#67E8F9" }}>{refreshMsg}</div>
        )}
        {isSampleMode && (
          <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(245, 158, 11, 0.10)", border: "1px solid rgba(245, 158, 11, 0.30)", color: "#FCD34D", fontSize: 11 }}>
            ⚠️ サンプルデータ表示中 (実 API 取得失敗)
          </div>
        )}
      </div>

      {/* ===== 激荒れ警報 ===== */}
      {alarms.length > 0 && (
        <Section title="🚨 激荒れ警報" subtitle="荒れスコア 85 以上 — 万舟濃厚">
          {alarms.map((x) => (
            <RaceCard key={x.race.id} race={x.race} result={x.result} close={x.close} onPickRace={onPickRace} />
          ))}
        </Section>
      )}

      {/* ===== 荒れ注意 ===== */}
      {warns.length > 0 && (
        <Section title="⚠️ 荒れ注意" subtitle="荒れスコア 75-84 — 1号艇に黄色信号">
          {warns.map((x) => (
            <RaceCard key={x.race.id} race={x.race} result={x.result} close={x.close} onPickRace={onPickRace} />
          ))}
        </Section>
      )}

      {/* ===== 何もない時 ===== */}
      {scored.length === 0 && (
        <div style={{
          marginTop: 24,
          padding: "32px 16px",
          textAlign: "center",
          borderRadius: 14,
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(148, 163, 184, 0.25)",
          color: "#94a3b8",
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>😴</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
            今日は荒れそうなレースなし
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            {races.length > 0
              ? `5場で ${races.length} レース監視中ですが、荒れスコア 75 以上のレースはまだありません。`
              : "更新を押して、今日の対象 5 場を取得してください。"}
            <br />
            無理に予想せず、 条件が揃ったレースだけ通知されます。
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8, padding: "0 4px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#e2e8f0", letterSpacing: "0.02em" }}>{title}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function RaceCard({ race, result, close, onPickRace }) {
  const [open, setOpen] = useState(false);
  const color = levelColor(result.level);
  const label = levelLabel(result.level);
  const buyOrders = useMemo(() => buildMansyuBuyOrders(race, result), [race, result]);
  const reasonText = useMemo(() => buildMansyuReason(race, result), [race, result]);
  const isAlarm = result.level === "alarm";
  const closeText = formatMinutesToClose(close);
  const closeBg = close == null ? "#475569" : close <= 5 ? "#DC2626" : close <= 15 ? "#F59E0B" : close <= 60 ? "#2563EB" : "#475569";

  return (
    <div style={{
      borderRadius: 14,
      background: isAlarm
        ? "linear-gradient(135deg, rgba(220, 38, 38, 0.10) 0%, rgba(15, 23, 42, 0.85) 100%)"
        : "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.85) 100%)",
      border: `1.5px solid ${color}55`,
      boxShadow: isAlarm ? `0 0 16px ${color}40` : "none",
      overflow: "hidden",
    }}>
      {/* === 上段: 場名 + R番 + 締切 + スコア === */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#f1f5f9" }}>
            {race.venue} <span style={{ fontSize: 19, color }}>{race.raceNo}R</span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            発走 {race.startTime || "—"}
          </div>
        </div>
        <div style={{
          padding: "4px 10px", borderRadius: 999,
          background: closeBg, color: "#fff",
          fontSize: 12, fontWeight: 800,
        }}>
          ⏱ {closeText}
        </div>
        <div style={{ flex: "1 1 0" }} />
        {/* 警報バッジ */}
        <div style={{
          padding: "5px 12px", borderRadius: 10,
          background: color, color: "#fff",
          fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
          boxShadow: isAlarm ? `0 0 14px ${color}80` : "none",
        }}>
          {isAlarm ? "🚨 " : "⚠️ "}{label}
        </div>
        {/* スコア */}
        <div style={{
          padding: "5px 10px", borderRadius: 10,
          background: "rgba(0,0,0,0.30)",
          border: `1px solid ${color}55`,
          color: "#fff", fontSize: 14, fontWeight: 800,
        }}>
          <span style={{ color, fontSize: 18 }}>{result.score}</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>/100</span>
        </div>
      </div>

      {/* === 万舟期待度 + 注目艇 === */}
      <div style={{ padding: "0 14px 10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>万舟期待度</div>
        <div style={{ fontSize: 14, color: "#FBBF24", letterSpacing: "0.10em" }}>{result.mansyuRating}</div>
        {result.focus.length > 0 && (
          <>
            <div style={{ width: 1, height: 14, background: "rgba(148, 163, 184, 0.30)" }} />
            <div style={{ fontSize: 12, color: "#94a3b8" }}>注目</div>
            {result.focus.slice(0, 3).map((f) => (
              <span key={f.boatNo} style={{
                padding: "2px 8px", borderRadius: 999,
                background: "rgba(34, 211, 238, 0.10)",
                border: "1px solid rgba(34, 211, 238, 0.40)",
                color: "#67E8F9", fontSize: 12, fontWeight: 700,
              }}>
                {f.boatNo}号艇 {f.racer || ""}
              </span>
            ))}
          </>
        )}
      </div>

      {/* === 理由コメント === */}
      <div style={{
        margin: "0 14px 10px 14px", padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.25)",
        borderLeft: `3px solid ${color}`,
        fontSize: 12, color: "#cbd5e1", lineHeight: 1.5,
      }}>
        💡 {reasonText}
      </div>

      {/* === 買い目 === */}
      {buyOrders.length > 0 && (
        <div style={{ margin: "0 14px 12px 14px" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 700, letterSpacing: "0.04em" }}>
            買い目 (最大 5 点)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {buyOrders.map((o, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", borderRadius: 8,
                background: "rgba(34, 211, 238, 0.06)",
                border: "1px solid rgba(34, 211, 238, 0.20)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.05em" }}>
                  {o.combo.join("-")}
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{o.kind}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#cbd5e1", textAlign: "right" }}>
                  {o.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === 折りたたみ詳細 === */}
      <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.15)" }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: "100%", padding: "8px 14px",
            background: "transparent", border: 0,
            color: "#94a3b8", fontSize: 12, fontWeight: 700,
            cursor: "pointer", textAlign: "left",
            display: "flex", alignItems: "center", gap: 6,
          }}>
          <span>{open ? "▼" : "▶"}</span>
          <span>詳しい荒れ条件 (スコア内訳)</span>
        </button>
        {open && (
          <div style={{ padding: "0 14px 12px 14px" }}>
            <ScoreBreakdown parts={result.parts} boost={result.boost} />
            {race.boats && (
              <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>気象 / 水面</div>
                <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                  {race.weather || "—"} / 風 {race.wind ?? "—"}m{race.windDir ? ` (${race.windDir})` : ""} / 波 {race.wave ?? "—"}cm
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <DetailLink label="📋 出走表" race={race} kind="program" />
              <DetailLink label="💰 オッズ" race={race} kind="odds" />
              <DetailLink label="🌊 直前情報" race={race} kind="beforeinfo" />
              <DetailLink label="🏁 結果" race={race} kind="result" />
              {onPickRace && (
                <button
                  onClick={() => { onPickRace("list"); }}
                  style={{
                    padding: "5px 10px", borderRadius: 8,
                    background: "rgba(34, 211, 238, 0.08)",
                    border: "1px solid rgba(34, 211, 238, 0.30)",
                    color: "#67E8F9", fontSize: 11, fontWeight: 700,
                    cursor: "pointer",
                  }}>
                  📊 一覧で見る
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBreakdown({ parts, boost }) {
  const rows = [
    { label: "進入不安",       max: 20, score: parts.entry.score,      reasons: parts.entry.reasons },
    { label: "強風・波",       max: 15, score: parts.weather.score,    reasons: parts.weather.reasons },
    { label: "1号艇不安",      max: 20, score: parts.leader.score,     reasons: parts.leader.reasons },
    { label: "攻め手存在",     max: 20, score: parts.attackers.score,  reasons: parts.attackers.reasons },
    { label: "展示異変",       max: 15, score: parts.exhibition.score, reasons: parts.exhibition.reasons },
    { label: "オッズ妙味",     max: 10, score: parts.odds.score,       reasons: parts.odds.reasons },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} style={{
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.20)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.reasons.length ? 4 : 0 }}>
            <div style={{ flex: 1, fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>{r.label}</div>
            <div style={{
              padding: "1px 8px", borderRadius: 999,
              background: r.score === 0 ? "#475569" : r.score >= r.max * 0.7 ? "#DC2626" : "#F59E0B",
              color: "#fff", fontSize: 11, fontWeight: 800,
            }}>
              {r.score}/{r.max}
            </div>
          </div>
          {r.reasons.length > 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
              {r.reasons.join(" / ")}
            </div>
          )}
        </div>
      ))}
      {boost > 0 && (
        <div style={{
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(220, 38, 38, 0.15)",
          border: "1px solid rgba(220, 38, 38, 0.40)",
        }}>
          <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 700 }}>
            🔥 強制激荒れブースト +{boost}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLink({ label, race, kind }) {
  const dateK = (race?.date || "").replaceAll("-", "");
  const jcd = race?.jcd;
  const rno = race?.raceNo;
  if (!jcd || !rno || !dateK) return null;
  const url = `https://www.boatrace.jp/owpc/pc/race/${kind === "program" ? "racelist" : kind}?rno=${rno}&jcd=${jcd}&hd=${dateK}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: "5px 10px", borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        color: "#cbd5e1", fontSize: 11, fontWeight: 700,
        textDecoration: "none",
      }}>
      {label}
    </a>
  );
}
