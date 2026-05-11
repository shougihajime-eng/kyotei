/**
 * 全レース一覧 (Round 190.5 復活版)
 *
 * Round 171 で削除した「📋 一覧」 タブを、 万舟ロジックに乗せて復活。
 * - 5 場 (戸田/江戸川/平和島/鳴門/桐生) 全レースを一覧表示
 * - 各行: 場名 + R番 + 締切 + 荒れスコア + 買い目 (圧縮 1 行) + 詳細ボタン
 * - スコア 85+ は赤、 75-84 は橙、 それ未満はグレーで色分け
 * - 並び替え: 締切順 (デフォ) / スコア降順
 * - フィルター: 締切前のみ / 全部
 *
 * SPEC §6 に「📋 一覧」 を再追加 (Round 190.5)。 「荒れる時だけ大判表示」 はホームの責務。
 * 一覧タブは「自分の目で確認したい」 ユーザー向けの全件ビュー。
 */
import { useMemo, useState } from "react";
import {
  scoreMansyu,
  buildMansyuBuyOrders,
  minutesToClose,
  formatMinutesToClose,
  levelLabel,
  levelColor,
} from "../lib/mansyu.js";

const SORT_OPTIONS = [
  { k: "close", label: "締切が近い順" },
  { k: "score", label: "荒れスコア順" },
];

const FILTER_OPTIONS = [
  { k: "pre",  label: "締切前のみ" },
  { k: "all",  label: "全部 (終了含む)" },
];

export default function RaceList({ races, onPickRace }) {
  const [sort, setSort] = useState("close");
  const [filter, setFilter] = useState("pre");
  const now = Date.now();

  const items = useMemo(() => {
    if (!Array.isArray(races)) return [];
    const rows = races.map((r) => {
      const result = scoreMansyu(r);
      const close = minutesToClose(r, now);
      return { race: r, result, close };
    });
    // フィルター
    const filtered = filter === "pre"
      ? rows.filter((x) => x.close != null && x.close >= -5)
      : rows;
    // ソート
    if (sort === "score") {
      return filtered.sort((a, b) => {
        const sa = a.result?.score || 0;
        const sb = b.result?.score || 0;
        if (sb !== sa) return sb - sa;
        // 同点は締切が近い順
        return (a.close ?? 9999) - (b.close ?? 9999);
      });
    }
    return filtered.sort((a, b) => (a.close ?? 9999) - (b.close ?? 9999));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [races, sort, filter]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "8px clamp(8px, 2vw, 18px)" }}>
      {/* ===== ヘッダー (タイトル + コントロール) ===== */}
      <div style={{
        marginBottom: 12,
        padding: "10px 14px",
        background: "linear-gradient(135deg, #0a0e1a 0%, #15172a 100%)",
        border: "1.5px solid rgba(34, 211, 238, 0.30)",
        borderRadius: 12,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#67E8F9", lineHeight: 1.0, letterSpacing: "0.02em" }}>
            全レース一覧
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 500, marginTop: 4 }}>
            5 場 (戸田・江戸川・平和島・鳴門・桐生) の全予想を見る
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 600 }}>
          表示中 <b className="num" style={{ color: "#f1f5f9", fontSize: 14 }}>{items.length}</b> レース
        </div>
      </div>

      {/* ===== コントロール (並び替え + フィルター) ===== */}
      <div style={{
        marginBottom: 12,
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(148, 163, 184, 0.20)",
        borderRadius: 10,
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <SegGroup label="並び" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        <div style={{ width: 1, height: 24, background: "rgba(148, 163, 184, 0.30)" }} />
        <SegGroup label="表示" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      </div>

      {/* ===== レース行 ===== */}
      {items.length === 0 ? (
        <div style={{
          padding: "28px 18px",
          textAlign: "center",
          borderRadius: 14,
          background: "linear-gradient(180deg, rgba(34, 211, 238, 0.04) 0%, rgba(0,0,0,0.20) 100%)",
          border: "1px dashed rgba(103, 232, 249, 0.30)",
          color: "#cbd5e1",
        }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🌙</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 }}>
            表示できるレースがありません
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            「🔄 更新」 ボタンで本日の対象 5 場を取得してください。
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((x) => (
            <RaceRow key={x.race.id} race={x.race} result={x.result} close={x.close} onPickRace={onPickRace} />
          ))}
        </div>
      )}
    </div>
  );
}

/* === セグメントスイッチ (並び替え / フィルター) === */
function SegGroup({ label, options, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.04em" }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {options.map((o) => {
          const active = o.k === value;
          return (
            <button
              key={o.k}
              onClick={() => onChange(o.k)}
              style={{
                padding: "7px 12px", minHeight: 36,
                borderRadius: 8,
                background: active ? "rgba(34, 211, 238, 0.18)" : "rgba(255,255,255,0.03)",
                border: active ? "1.5px solid rgba(34, 211, 238, 0.55)" : "1.5px solid rgba(148, 163, 184, 0.25)",
                color: active ? "#67E8F9" : "#cbd5e1",
                fontSize: 12.5, fontWeight: 700,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* === 1 レース分の行 === */
function RaceRow({ race, result, close, onPickRace }) {
  const score = result?.score ?? 0;
  const level = result?.level || "calm";
  const isAlarm = level === "alarm";
  const isWarn  = level === "warn";
  const color = levelColor(level);
  const label = levelLabel(level);
  const buyOrders = useMemo(() => (result ? buildMansyuBuyOrders(race, result) : []), [race, result]);

  const closeText = formatMinutesToClose(close);
  const closeBg = close == null ? "#475569"
    : close <= 5 ? "#DC2626"
    : close <= 15 ? "#F59E0B"
    : close <= 60 ? "#2563EB"
    : "#475569";

  const finished = !!race?.result;

  // 行の背景: alarm/warn で色分け、 終了済は半透明
  const rowBg = isAlarm
    ? "linear-gradient(135deg, rgba(220, 38, 38, 0.14) 0%, rgba(15, 23, 42, 0.85) 100%)"
    : isWarn
      ? "linear-gradient(135deg, rgba(245, 158, 11, 0.10) 0%, rgba(15, 23, 42, 0.85) 100%)"
      : "rgba(15, 23, 42, 0.55)";
  const rowBorder = isAlarm
    ? `1.5px solid ${color}66`
    : isWarn
      ? `1.5px solid ${color}55`
      : "1px solid rgba(148, 163, 184, 0.22)";

  return (
    <div style={{
      borderRadius: 12,
      background: rowBg,
      border: rowBorder,
      opacity: finished ? 0.7 : 1,
      padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      WebkitTapHighlightColor: "transparent",
    }}>
      {/* 場名 + R番 */}
      <div style={{ flex: "0 0 auto", minWidth: 92 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#f8fafc", lineHeight: 1.0 }}>
          {race.venue} <span style={{ fontSize: 26, color, marginLeft: 1 }}>{race.raceNo}R</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, fontWeight: 600 }}>
          発走 {race.startTime || "—"}
        </div>
      </div>

      {/* 締切バッジ */}
      <div
        className={close != null && close <= 5 && close >= -1 ? "mansyu-blink" : ""}
        style={{
          flex: "0 0 auto",
          padding: "6px 12px", borderRadius: 999,
          background: closeBg, color: "#fff",
          fontSize: 13, fontWeight: 800, lineHeight: 1.1,
          minWidth: 70, textAlign: "center",
        }}>
        ⏱ {closeText}
      </div>

      {/* 荒れスコア */}
      <div
        className={isAlarm ? "mansyu-glow" : ""}
        style={{
          flex: "0 0 auto",
          padding: "6px 12px", borderRadius: 10,
          background: "rgba(0,0,0,0.40)",
          border: `2px solid ${color}77`,
          display: "flex", alignItems: "baseline", gap: 3,
          minWidth: 86, justifyContent: "center",
        }}>
        <span style={{ color, fontSize: 24, fontWeight: 800, lineHeight: 1.0 }}>{score}</span>
        <span style={{ fontSize: 11, color: "#cbd5e1", opacity: 0.75 }}>/100</span>
      </div>

      {/* レベルラベル (alarm/warn のみ) */}
      {(isAlarm || isWarn) && (
        <div
          className={isAlarm ? "mansyu-pulse" : ""}
          style={{
            flex: "0 0 auto",
            padding: "5px 10px", borderRadius: 8,
            background: color, color: "#fff",
            fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
            lineHeight: 1.1,
          }}>
          {isAlarm ? "🚨 " : "⚠️ "}{label}
        </div>
      )}

      {/* 万舟期待度 ★ */}
      {result?.mansyuRating && (
        <div style={{
          flex: "0 0 auto",
          fontSize: 16, color: "#FBBF24", letterSpacing: "0.10em", fontWeight: 700, lineHeight: 1.0,
        }}>
          {result.mansyuRating}
        </div>
      )}

      {/* スペーサー (買い目を右に押し出す) */}
      <div style={{ flex: 1, minWidth: 8 }} />

      {/* 買い目 (上位 2 点 + 合計) */}
      {buyOrders.length > 0 && (
        <div style={{
          flex: "0 1 auto",
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          padding: "6px 10px",
          background: "rgba(34, 211, 238, 0.08)",
          border: "1.5px solid rgba(34, 211, 238, 0.28)",
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.04em" }}>💰</span>
          {buyOrders.slice(0, 2).map((o, i) => (
            <span key={i} style={{
              fontSize: 15, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}>
              {o.combo.join("-")}
            </span>
          ))}
          {buyOrders.length > 2 && (
            <span style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 700 }}>
              +{buyOrders.length - 2}点
            </span>
          )}
          <span style={{
            fontSize: 11, color: "#FCD34D", fontWeight: 800,
            padding: "2px 7px", borderRadius: 999,
            background: "rgba(251, 191, 36, 0.14)",
            border: "1px solid rgba(251, 191, 36, 0.40)",
          }}>
            計 <span className="num">5,000</span>円
          </span>
        </div>
      )}

      {/* 結果 (終了済のみ) */}
      {finished && race.result?.trio && (
        <div style={{
          flex: "0 0 auto",
          padding: "5px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          fontSize: 12.5, color: "#f1f5f9", fontWeight: 700,
        }}>
          🏁 {race.result.trio}
        </div>
      )}

      {/* 詳細ボタン */}
      {onPickRace && (
        <button
          onClick={() => onPickRace(race.id)}
          style={{
            flex: "0 0 auto",
            padding: "8px 14px", minHeight: 40, borderRadius: 8,
            background: isAlarm
              ? "rgba(220, 38, 38, 0.18)"
              : "rgba(251, 191, 36, 0.14)",
            border: isAlarm
              ? "1.5px solid rgba(220, 38, 38, 0.50)"
              : "1.5px solid rgba(251, 191, 36, 0.40)",
            color: isAlarm ? "#FCA5A5" : "#FCD34D",
            fontSize: 12.5, fontWeight: 700,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}>
          🔬 詳しく
        </button>
      )}
    </div>
  );
}
