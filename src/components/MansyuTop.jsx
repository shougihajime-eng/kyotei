/**
 * 万舟研究所 — トップ画面 (Phase 1.5)
 *
 * 「荒れる時だけ」表示する。
 * - 荒れスコア 85+: 激荒れ警報 (赤)
 * - 荒れスコア 75-84: 荒れ注意 (黄)
 * - それ以外: 表示しない
 *
 * Phase 1.5 追加:
 * - 次回自動更新カウントダウン
 * - 更新失敗バナー (失敗時刻 + 原因)
 * - 古いデータ警告 (5 分以上経過)
 * - ボタン・カードにタップ反応 (scale + tap-highlight 除去)
 * - PC は 2 列、 スマホは 1 列のレスポンシブグリッド
 */
import { useEffect, useMemo, useState } from "react";
import {
  scoreMansyu,
  buildMansyuBuyOrders,
  buildMansyuReason,
  minutesToClose,
  formatMinutesToClose,
  levelLabel,
  levelColor,
} from "../lib/mansyu.js";

const STALE_AFTER_MS = 5 * 60 * 1000;      // 5 分超で古いデータ警告
const VERY_STALE_MS  = 15 * 60 * 1000;     // 15 分超で強警告

export default function MansyuTop({
  races,
  refreshing,
  refreshMsg,
  lastRefreshAt,
  nextRefreshAt,
  refreshError,
  onRefresh,
  onPickRace,
  isSampleMode,
}) {
  // 1 秒ごとに再描画 (カウントダウン用)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [races, tick]);

  const alarms = scored.filter((x) => x.result.level === "alarm");
  const warns  = scored.filter((x) => x.result.level === "warn");

  const lastRefreshMs = lastRefreshAt ? new Date(lastRefreshAt).getTime() : null;
  const ageMs = lastRefreshMs ? now - lastRefreshMs : null;
  const isStale = ageMs != null && ageMs >= STALE_AFTER_MS;
  const isVeryStale = ageMs != null && ageMs >= VERY_STALE_MS;
  const nextRefreshMs = nextRefreshAt ? new Date(nextRefreshAt).getTime() : null;
  const secondsToNext = nextRefreshMs ? Math.max(0, Math.round((nextRefreshMs - now) / 1000)) : null;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "12px clamp(8px, 3vw, 16px) 0" }}>
      {/* ===== ブランドバナー ===== */}
      <div style={{
        background: "linear-gradient(135deg, #0a0e1a 0%, #15172a 100%)",
        border: "1.5px solid rgba(251, 191, 36, 0.30)",
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 12,
        boxShadow: "0 2px 14px rgba(220, 38, 38, 0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 24 }}>🌊</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#FBBF24", letterSpacing: "0.02em" }}>万舟研究所</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              荒れる時だけお知らせ — 5場限定 (戸田・江戸川・平和島・鳴門・桐生)
            </div>
          </div>
          <TapButton
            onClick={onRefresh}
            disabled={refreshing}
            primary
            label={refreshing ? "🔄 更新中…" : "🔄 今すぐ更新"}
          />
        </div>

        {/* === 件数サマリ === */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 6,
          marginTop: 10,
        }}>
          <SumBox label="🚨 激荒れ" value={alarms.length} color="#FCA5A5" emphasis={alarms.length > 0} />
          <SumBox label="⚠️ 荒れ注意" value={warns.length} color="#FDE68A" emphasis={warns.length > 0} />
          <SumBox label="📡 監視中" value={Array.isArray(races) ? races.length : 0} color="#67E8F9" emphasis={false} sub="レース" />
        </div>

        {/* === 更新状態 === */}
        <UpdateStatus
          refreshing={refreshing}
          refreshMsg={refreshMsg}
          lastRefreshMs={lastRefreshMs}
          ageMs={ageMs}
          isStale={isStale}
          isVeryStale={isVeryStale}
          secondsToNext={secondsToNext}
          refreshError={refreshError}
          isSampleMode={isSampleMode}
        />
      </div>

      {/* ===== 激荒れ警報 ===== */}
      {alarms.length > 0 && (
        <Section title="🚨 激荒れ警報" subtitle="荒れスコア 85 以上 — 万舟濃厚">
          <CardGrid>
            {alarms.map((x) => (
              <RaceCard key={x.race.id} race={x.race} result={x.result} close={x.close} onPickRace={onPickRace} />
            ))}
          </CardGrid>
        </Section>
      )}

      {/* ===== 荒れ注意 ===== */}
      {warns.length > 0 && (
        <Section title="⚠️ 荒れ注意" subtitle="荒れスコア 75-84 — 1号艇に黄色信号">
          <CardGrid>
            {warns.map((x) => (
              <RaceCard key={x.race.id} race={x.race} result={x.result} close={x.close} onPickRace={onPickRace} />
            ))}
          </CardGrid>
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
          <div style={{ fontSize: 40, marginBottom: 10 }}>😴</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#cbd5e1", marginBottom: 6 }}>
            今日は荒れそうなレースなし
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            {Array.isArray(races) && races.length > 0
              ? `5場で ${races.length} レース監視中ですが、荒れスコア 75 以上はまだありません。`
              : "更新を押して、今日の対象 5 場を取得してください。"}
            <br />
            無理に予想せず、 条件が揃ったレースだけ通知されます。
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== 更新ステータス ===== */
function UpdateStatus({ refreshing, refreshMsg, lastRefreshMs, ageMs, isStale, isVeryStale, secondsToNext, refreshError, isSampleMode }) {
  const lastTimeStr = lastRefreshMs
    ? new Date(lastRefreshMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "未取得";
  const ageStr = ageMs == null ? "" : ageMs < 60_000 ? `${Math.round(ageMs / 1000)}秒前` : `${Math.round(ageMs / 60_000)}分前`;
  return (
    <div style={{ marginTop: 10 }}>
      {/* 進行中メッセージ */}
      {refreshMsg && (
        <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: refreshMsg.startsWith("⚠") ? "rgba(245, 158, 11, 0.12)" : "rgba(34, 211, 238, 0.10)",
          color: refreshMsg.startsWith("⚠") ? "#FCD34D" : "#67E8F9",
          fontSize: 12, lineHeight: 1.5,
          marginBottom: 6,
        }}>
          {refreshMsg}
        </div>
      )}

      {/* 失敗バナー (refreshError があるとき常時表示) */}
      {refreshError && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(220, 38, 38, 0.14)",
          border: "1.5px solid rgba(220, 38, 38, 0.45)",
          color: "#FCA5A5",
          fontSize: 12, lineHeight: 1.5,
          marginBottom: 6,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 2 }}>❌ 更新失敗</div>
          <div style={{ color: "#FECACA" }}>
            最終失敗: {new Date(refreshError.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} / 原因: {refreshError.message}
          </div>
        </div>
      )}

      {/* サンプル警告 */}
      {isSampleMode && (
        <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.40)",
          color: "#FCD34D", fontSize: 12, marginBottom: 6,
        }}>
          ⚠️ サンプルデータ表示中 — 実 API 取得失敗
        </div>
      )}

      {/* 最終更新 + 次回更新 (常時表示) */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10,
        fontSize: 11.5, color: isVeryStale ? "#FCA5A5" : isStale ? "#FCD34D" : "#94a3b8",
      }}>
        <div>
          {isVeryStale ? "🔴 古い情報" : isStale ? "🟡 やや古い" : "🟢 最新"}
          : <b style={{ color: "#cbd5e1" }}>{lastTimeStr}</b>
          {ageStr && <span style={{ marginLeft: 4, opacity: 0.85 }}>({ageStr})</span>}
        </div>
        {secondsToNext != null && !refreshing && (
          <div style={{ marginLeft: "auto" }}>
            🔄 次回自動更新まで <b className="num" style={{ color: "#67E8F9" }}>{formatSeconds(secondsToNext)}</b>
          </div>
        )}
        {refreshing && (
          <div style={{ marginLeft: "auto", color: "#67E8F9" }}>🔄 更新中…</div>
        )}
      </div>

      {/* 古いデータ警告 (経過 5 分以上) */}
      {isVeryStale && (
        <div style={{
          marginTop: 8,
          padding: "8px 12px", borderRadius: 8,
          background: "rgba(220, 38, 38, 0.10)",
          border: "1px solid rgba(220, 38, 38, 0.30)",
          color: "#FCA5A5", fontSize: 11.5,
        }}>
          ⚠️ 15 分以上更新がありません。「今すぐ更新」 を押すか ネットワークを確認してください。
        </div>
      )}
    </div>
  );
}

function formatSeconds(s) {
  if (s == null) return "—";
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m} 分 ${sec.toString().padStart(2, "0")} 秒`;
}

function SumBox({ label, value, color, emphasis, sub }) {
  return (
    <div style={{
      padding: "8px 10px",
      borderRadius: 10,
      background: emphasis ? `linear-gradient(135deg, ${color}22 0%, rgba(0,0,0,0.20) 100%)` : "rgba(255,255,255,0.03)",
      border: `1px solid ${emphasis ? color + "55" : "rgba(148, 163, 184, 0.20)"}`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1, marginTop: 2 }}>
        {value}<span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>{sub || "件"}</span>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8, padding: "0 4px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", letterSpacing: "0.02em" }}>{title}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function CardGrid({ children }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
      gap: 10,
    }}>
      {children}
    </div>
  );
}

/* ===== タップ反応付き共通ボタン ===== */
function TapButton({ onClick, disabled, primary, label, ariaLabel }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={(e) => { if (!disabled) onClick && onClick(e); }}
      onTouchStart={() => !disabled && setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      disabled={disabled}
      aria-label={ariaLabel || label}
      style={{
        minHeight: 44,
        padding: "10px 16px",
        borderRadius: 12,
        border: primary ? "1.5px solid rgba(251, 191, 36, 0.55)" : "1.5px solid rgba(148, 163, 184, 0.30)",
        background: disabled
          ? "rgba(255,255,255,0.04)"
          : primary
            ? (pressed ? "rgba(251, 191, 36, 0.30)" : "rgba(251, 191, 36, 0.16)")
            : (pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"),
        color: disabled ? "#64748B" : primary ? "#FBBF24" : "#cbd5e1",
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: "0.02em",
        cursor: disabled ? "not-allowed" : "pointer",
        transform: pressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 0.08s ease, background 0.18s ease",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        boxShadow: primary && !disabled ? "0 2px 10px rgba(251, 191, 36, 0.22)" : "none",
      }}>
      {label}
    </button>
  );
}

/* ===== レースカード ===== */
function RaceCard({ race, result, close, onPickRace }) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
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
      transform: pressed ? "scale(0.985)" : "scale(1)",
      transition: "transform 0.08s ease",
      WebkitTapHighlightColor: "transparent",
    }}
    onTouchStart={() => setPressed(true)}
    onTouchEnd={() => setPressed(false)}>
      {/* === 上段: 場名 + R番 + 締切 + スコア === */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.1 }}>
            {race.venue} <span style={{ fontSize: 22, color }}>{race.raceNo}R</span>
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
            発走 {race.startTime || "—"}
          </div>
        </div>
        <div style={{
          padding: "5px 10px", borderRadius: 999,
          background: closeBg, color: "#fff",
          fontSize: 12, fontWeight: 800, lineHeight: 1.1,
        }}>
          ⏱ {closeText}
        </div>
        <div style={{ flex: "1 1 0", minWidth: 4 }} />
        <div style={{
          padding: "5px 12px", borderRadius: 10,
          background: color, color: "#fff",
          fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
          boxShadow: isAlarm ? `0 0 14px ${color}80` : "none",
          lineHeight: 1.1,
        }}>
          {isAlarm ? "🚨 " : "⚠️ "}{label}
        </div>
        <div style={{
          padding: "5px 10px", borderRadius: 10,
          background: "rgba(0,0,0,0.30)",
          border: `1px solid ${color}55`,
          color: "#fff",
          display: "flex", alignItems: "baseline", gap: 2,
        }}>
          <span style={{ color, fontSize: 22, fontWeight: 800 }}>{result.score}</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>/100</span>
        </div>
      </div>

      {/* === 万舟期待度 + 注目艇 === */}
      <div style={{ padding: "0 14px 10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>万舟期待度</div>
        <div style={{ fontSize: 15, color: "#FBBF24", letterSpacing: "0.10em", fontWeight: 700 }}>{result.mansyuRating}</div>
        {result.focus.length > 0 && (
          <>
            <div style={{ width: 1, height: 14, background: "rgba(148, 163, 184, 0.30)" }} />
            <div style={{ fontSize: 12, color: "#94a3b8" }}>注目</div>
            {result.focus.slice(0, 3).map((f) => (
              <span key={f.boatNo} style={{
                padding: "3px 9px", borderRadius: 999,
                background: "rgba(34, 211, 238, 0.12)",
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
        margin: "0 14px 10px 14px", padding: "9px 11px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.30)",
        borderLeft: `3px solid ${color}`,
        fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.5,
      }}>
        💡 {reasonText}
      </div>

      {/* === 買い目 === */}
      {buyOrders.length > 0 && (
        <div style={{ margin: "0 14px 12px 14px" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 700, letterSpacing: "0.04em" }}>
            買い目 (最大 5 点・重複なし)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {buyOrders.map((o, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 8,
                background: "rgba(34, 211, 238, 0.07)",
                border: "1px solid rgba(34, 211, 238, 0.22)",
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.05em" }}>
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
            width: "100%", padding: "10px 14px",
            background: "transparent", border: 0,
            color: "#94a3b8", fontSize: 12, fontWeight: 700,
            cursor: "pointer", textAlign: "left",
            display: "flex", alignItems: "center", gap: 6,
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}>
          <span>{open ? "▼" : "▶"}</span>
          <span>詳しい荒れ条件 (スコア内訳・気象・外部リンク)</span>
        </button>
        {open && (
          <div style={{ padding: "0 14px 12px 14px" }}>
            <ScoreBreakdown parts={result.parts} boost={result.boost} />
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>気象 / 水面</div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                {race.weather || "—"} / 風 {race.wind ?? "—"}m{race.windDir ? ` (${race.windDir})` : ""} / 波 {race.wave ?? "—"}cm
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <DetailLink label="📋 出走表" race={race} kind="program" />
              <DetailLink label="💰 オッズ" race={race} kind="odds" />
              <DetailLink label="🌊 直前情報" race={race} kind="beforeinfo" />
              <DetailLink label="🏁 結果" race={race} kind="result" />
              {onPickRace && (
                <button
                  onClick={() => onPickRace("list")}
                  style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: "rgba(34, 211, 238, 0.10)",
                    border: "1px solid rgba(34, 211, 238, 0.34)",
                    color: "#67E8F9", fontSize: 11, fontWeight: 700,
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
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
          padding: "7px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.20)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.reasons.length ? 4 : 0 }}>
            <div style={{ flex: 1, fontSize: 12, color: "#cbd5e1", fontWeight: 700 }}>{r.label}</div>
            <div style={{
              padding: "2px 9px", borderRadius: 999,
              background: r.score === 0 ? "#475569" : r.score >= r.max * 0.7 ? "#DC2626" : "#F59E0B",
              color: "#fff", fontSize: 11, fontWeight: 800,
            }}>
              {r.score}/{r.max}
            </div>
          </div>
          {r.reasons.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 }}>
              {r.reasons.join(" / ")}
            </div>
          )}
        </div>
      ))}
      {boost > 0 && (
        <div style={{
          padding: "7px 10px", borderRadius: 8,
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
  const path = kind === "program" ? "racelist" : kind;
  const url = `https://www.boatrace.jp/owpc/pc/race/${path}?rno=${rno}&jcd=${jcd}&hd=${dateK}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: "6px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        color: "#cbd5e1", fontSize: 11, fontWeight: 700,
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}>
      {label}
    </a>
  );
}
