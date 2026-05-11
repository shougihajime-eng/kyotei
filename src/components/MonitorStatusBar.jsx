/**
 * 監視ステータスバー (Round 188 / SPEC §8)
 *
 * 「本当に裏で動いているか」 を見える化する小さな帯。
 * ホーム最上部に表示。 細く、 補助情報として薄めに。
 *
 * 表示要素:
 *   ・🟢 監視中 (ブラウザ開いている間は 30 秒ごとに自動更新)
 *   ・最終更新時刻 + 経過秒
 *   ・対象 5 場 (戸田・江戸川・平和島・鳴門・桐生)
 *   ・本日 N レース判定 / 買い M / 見送り K
 *   ・次回更新まで NN 秒
 *   ・更新ボタン
 */
import { useEffect, useMemo, useState } from "react";
import { getTodayJudgementLog } from "../lib/mansyuSkipLog.js";

const STALE_AFTER_MS = 5 * 60 * 1000;
const VERY_STALE_MS = 15 * 60 * 1000;

export default function MonitorStatusBar({
  refreshing,
  refreshMsg,
  lastRefreshAt,
  nextRefreshAt,
  refreshError,
  onRefresh,
  isSampleMode,
  todayDate,
}) {
  // 1 秒ごとに再描画 (カウントダウン用)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();

  // 本日の判定件数 (mansyuSkipLog から取得)
  const counts = useMemo(() => {
    try {
      const log = getTodayJudgementLog(todayDate);
      const show = log.filter((e) => e.judgement === "show").length;
      const skip = log.filter((e) => e.judgement === "skip").length;
      const finalized = log.filter((e) => e.finalized).length;
      return { total: log.length, show, skip, finalized };
    } catch {
      return { total: 0, show: 0, skip: 0, finalized: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, todayDate]);

  const lastRefreshMs = lastRefreshAt ? new Date(lastRefreshAt).getTime() : null;
  const ageMs = lastRefreshMs ? now - lastRefreshMs : null;
  const isStale = ageMs != null && ageMs >= STALE_AFTER_MS;
  const isVeryStale = ageMs != null && ageMs >= VERY_STALE_MS;
  const nextMs = nextRefreshAt ? new Date(nextRefreshAt).getTime() : null;
  const secondsToNext = nextMs ? Math.max(0, Math.round((nextMs - now) / 1000)) : null;

  const dotColor =
    refreshError ? "#DC2626" :
    isVeryStale ? "#DC2626" :
    isStale ? "#F59E0B" :
    refreshing ? "#22D3EE" :
    "#10B981";

  const lastTimeStr = lastRefreshMs
    ? new Date(lastRefreshMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "未取得";
  const ageStr = ageMs == null ? ""
    : ageMs < 60_000 ? `${Math.round(ageMs / 1000)}秒前`
    : `${Math.round(ageMs / 60_000)}分前`;

  return (
    <div style={{
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(10, 14, 26, 0.92) 100%)",
      border: `1px solid ${dotColor}44`,
      padding: "8px 12px",
      marginBottom: 10,
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      fontSize: 12,
    }}>
      {/* 監視中 LED + ラベル */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 8px ${dotColor}`,
          animation: refreshError || isVeryStale ? "none" : "mansyu-led 2s infinite",
        }} />
        <span style={{ color: "#e2e8f0", fontWeight: 800, letterSpacing: "0.02em" }}>
          {refreshError ? "更新失敗" :
           isVeryStale ? "古い情報" :
           isStale ? "やや古い" :
           refreshing ? "更新中…" :
           "🟢 監視中"}
        </span>
      </div>

      {/* 区切り */}
      <Sep />

      {/* 対象 5 場 */}
      <div style={{ color: "#cbd5e1", fontWeight: 600 }}>
        対象 <b style={{ color: "#67E8F9" }} className="num">5</b> 場 巡回中
        <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>(戸田・江戸川・平和島・鳴門・桐生)</span>
      </div>

      <Sep />

      {/* 本日の判定件数 */}
      <div style={{ color: "#cbd5e1", fontWeight: 600 }}>
        本日 <b className="num" style={{ color: "#e2e8f0" }}>{counts.total}</b> 判定
        <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>
          (🎯買 <b className="num" style={{ color: "#34D399" }}>{counts.show}</b>
          {" / "}
          🌙見送 <b className="num" style={{ color: "#94a3b8" }}>{counts.skip}</b>
          {counts.finalized > 0 && (
            <>{" / "}🏁確 <b className="num" style={{ color: "#FCD34D" }}>{counts.finalized}</b></>
          )}
          )
        </span>
      </div>

      <Sep />

      {/* 最終更新 */}
      <div style={{ color: isVeryStale ? "#FCA5A5" : isStale ? "#FCD34D" : "#94a3b8" }}>
        最終 <b style={{ color: "#cbd5e1" }} className="num">{lastTimeStr}</b>
        {ageStr && <span style={{ marginLeft: 4, opacity: 0.8 }}>({ageStr})</span>}
      </div>

      <div style={{ flex: 1, minWidth: 8 }} />

      {/* 次回更新 + 手動更新ボタン */}
      {secondsToNext != null && !refreshing && (
        <div style={{ color: "#67E8F9", fontWeight: 700 }}>
          次回 <b className="num">{secondsToNext}</b> 秒後
        </div>
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          padding: "6px 14px", borderRadius: 999, minHeight: 32,
          border: "1.5px solid rgba(251, 191, 36, 0.55)",
          background: refreshing ? "rgba(255,255,255,0.04)" : "rgba(251, 191, 36, 0.18)",
          color: refreshing ? "#64748B" : "#FCD34D",
          fontWeight: 800, fontSize: 12, letterSpacing: "0.02em",
          cursor: refreshing ? "not-allowed" : "pointer",
          WebkitTapHighlightColor: "transparent",
        }}>
        {refreshing ? "🔄…" : "🔄 今すぐ更新"}
      </button>

      {/* 失敗・サンプル警告 (右側に小さく) */}
      {refreshError && (
        <div style={{
          flexBasis: "100%",
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(220, 38, 38, 0.14)",
          border: "1px solid rgba(220, 38, 38, 0.45)",
          color: "#FCA5A5", fontSize: 11.5,
        }}>
          ❌ 更新失敗 — {new Date(refreshError.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}: {refreshError.message}
        </div>
      )}
      {isSampleMode && (
        <div style={{
          flexBasis: "100%",
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(245, 158, 11, 0.14)",
          border: "1px solid rgba(245, 158, 11, 0.40)",
          color: "#FCD34D", fontSize: 11.5,
        }}>
          ⚠️ サンプルデータ表示中 (実 API 失敗) — 判断には使わないでください
        </div>
      )}
      {refreshMsg && !refreshError && (
        <div style={{
          flexBasis: "100%",
          padding: "4px 10px", borderRadius: 8,
          background: refreshMsg.startsWith("⚠") ? "rgba(245, 158, 11, 0.10)" : "rgba(34, 211, 238, 0.10)",
          color: refreshMsg.startsWith("⚠") ? "#FCD34D" : "#67E8F9",
          fontSize: 11.5,
        }}>
          {refreshMsg}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 16, background: "rgba(148, 163, 184, 0.30)" }} />;
}
