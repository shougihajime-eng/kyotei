import { useMemo, useState, useCallback, memo } from "react";
import { loadPublicLog, verifyIntegrity } from "../lib/immutableLog.js";
import { getJstDateString } from "../lib/dateGuard.js";
import { yen } from "../lib/format.js";

/**
 * Round 80: 本日の検証状態パネル (ユーザー向け可視化)
 *
 * DevTools / localStorage を見なくても、 画面 1 つで「今日ちゃんと動いているか」 が
 * 確認できる。 各買い推奨レースについて 5 つのチェックポイントを表示:
 *   ① 保存済み (snapshotAt あり)
 *   ② 結果取得済み (result.first あり)
 *   ③ 収支計算済み (payout / pnl 計算済)
 *   ④ グラフ反映済み (Stats / KpiPanel に出る条件を満たす)
 *   ⑤ 公開ログ反映済み (kyoteiPublicLog に key あり)
 *
 * 加えて:
 *   ・🔒 固定済み: 結果確定後はデータが上書きされない (Round 79 freeze)
 *   ・⚠️ 仮データ動作中: 公開ログには反映されない警告
 *   ・🚨 保存失敗: storageStatus.ok=false 時に明示
 *   ・「🔍 今日の検証状態を確認」 ボタンで全件まとめて検証 → 結果トースト
 */
export default memo(TodayVerificationPanel);

function TodayVerificationPanel({ predictions, isSampleMode, storageStatus, publicLogTick }) {
  const today = getJstDateString();
  const [report, setReport] = useState(null);
  const [showSkips, setShowSkips] = useState(false);

  // 今日の買い推奨レース (全スタイル混在、 startTime 順)
  const todayBuys = useMemo(() => {
    return Object.values(predictions || {})
      .filter((p) => p?.date === today && p?.decision === "buy")
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [predictions, today]);

  // 今日の見送り件数 (内訳は表示しない、 件数のみ)
  const todaySkips = useMemo(() => {
    return Object.values(predictions || {})
      .filter((p) => p?.date === today && p?.decision === "skip");
  }, [predictions, today]);

  // 公開ログの key set + 整合性
  // Round 81: publicLogTick を deps に追加 — App.jsx の syncPublicLog 完了後に強制再読込
  const publicLog = useMemo(() => {
    const log = loadPublicLog();
    const keys = new Set(log.map((b) => b?.entry?.key).filter(Boolean));
    const integ = verifyIntegrity(log);
    return { keys, total: log.length, integrity: integ };
  }, [predictions, publicLogTick]);

  const handleFullCheck = useCallback(() => {
    const issues = [];
    let allOk = 0;
    for (const p of todayBuys) {
      const s = computeStatus(p, publicLog.keys);
      if (s.saved && s.hasResult && s.pnlComputed && s.inGraph && s.inPublicLog) {
        allOk++;
      } else if (s.hasResult && !s.inPublicLog) {
        issues.push(`${p.venue} ${p.raceNo}R: 結果あり / 公開ログ未反映`);
      } else if (s.hasResult && !s.pnlComputed) {
        issues.push(`${p.venue} ${p.raceNo}R: 結果あり / 収支未計算`);
      }
    }
    if (publicLog.integrity?.valid === false) {
      issues.push(`公開ログ整合性違反 (位置 ${publicLog.integrity.brokenAt})`);
    }
    setReport({
      checkedAt: new Date().toLocaleTimeString("ja-JP"),
      total: todayBuys.length,
      ok: allOk,
      pending: todayBuys.filter((p) => !p.result?.first).length,
      issues,
    });
    // 5 秒で自動消去
    setTimeout(() => setReport(null), 8000);
  }, [todayBuys, publicLog]);

  return (
    <section className="card p-3 mb-3" style={{ minHeight: 120 }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <div className="font-bold text-sm">📊 本日の検証状態</div>
          <div className="text-xs opacity-70 mt-0.5">{today} / 買い推奨 {todayBuys.length} 件 / 見送り {todaySkips.length} 件</div>
        </div>
        <button
          onClick={handleFullCheck}
          disabled={todayBuys.length === 0}
          style={{
            padding: "6px 12px", borderRadius: 8,
            background: todayBuys.length === 0 ? "rgba(255,255,255,0.06)" : "rgba(56,189,248,0.18)",
            border: `1px solid ${todayBuys.length === 0 ? "rgba(255,255,255,0.10)" : "rgba(56,189,248,0.5)"}`,
            color: todayBuys.length === 0 ? "#94a3b8" : "#bae6fd",
            fontSize: 12, fontWeight: 700, cursor: todayBuys.length === 0 ? "not-allowed" : "pointer",
          }}>
          🔍 今日の検証状態を確認
        </button>
      </div>

      {/* 仮データ警告 (公開ログには反映されない) */}
      {isSampleMode && (
        <div className="mb-2 p-2 rounded text-xs" style={{
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5",
        }}>
          ⚠️ <b>仮データ動作中</b> — このデータは公開ログには反映されません (信用毀損防止)
        </div>
      )}

      {/* 保存失敗バナー */}
      {storageStatus && !storageStatus.ok && storageStatus.error && (
        <div className="mb-2 p-2 rounded text-xs" style={{
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#fca5a5", fontWeight: 700,
        }}>
          🚨 <b>保存失敗</b>: {storageStatus.error}
        </div>
      )}

      {/* 一括確認結果 */}
      {report && (
        <div className="mb-2 p-2 rounded text-xs" style={{
          background: report.issues.length === 0 ? "rgba(16,185,129,0.10)" : "rgba(251,191,36,0.10)",
          border: `1px solid ${report.issues.length === 0 ? "rgba(16,185,129,0.4)" : "rgba(251,191,36,0.4)"}`,
          color: report.issues.length === 0 ? "#a7f3d0" : "#fde68a",
          lineHeight: 1.55,
        }}>
          {report.issues.length === 0 ? "✅" : "⚠️"} <b>一括確認 ({report.checkedAt})</b>:{" "}
          {report.total} 件中 {report.ok} 件すべて正常
          {report.pending > 0 && <span> / 結果待ち {report.pending} 件</span>}
          {report.issues.length > 0 && (
            <ul style={{ paddingLeft: 16, listStyle: "disc", marginTop: 4 }}>
              {report.issues.slice(0, 5).map((i, idx) => <li key={idx}>{i}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* レース一覧 */}
      {todayBuys.length === 0 ? (
        <div className="text-center text-xs opacity-70 p-4">
          📭 本日の買い推奨レースはまだありません<br/>
          <span className="opacity-80">直前判定 (締切 5〜15 分前) で条件を満たすレースが出ると、 ここに自動追加されます</span>
        </div>
      ) : (
        <div className="space-y-2">
          {todayBuys.map((p) => (
            <RaceVerificationCard key={p.key} p={p} status={computeStatus(p, publicLog.keys)} />
          ))}
        </div>
      )}

      {/* 見送り件数表示 (展開可能) */}
      {todaySkips.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowSkips(!showSkips)}
            style={{
              fontSize: 11, padding: "4px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#94a3b8", cursor: "pointer", width: "100%", textAlign: "left",
            }}>
            {showSkips ? "▼" : "▶"} 本日の見送り {todaySkips.length} 件 (軽量保存 — 集計対象外)
          </button>
          {showSkips && (
            <div className="text-xs opacity-70 mt-1 space-y-1" style={{ lineHeight: 1.5 }}>
              {todaySkips.slice(0, 10).map((p, i) => (
                <div key={i} style={{ paddingLeft: 12 }}>
                  ⏭ {p.venue} {p.raceNo}R ({p.startTime}) — {p.profile} — {(p.reasons?.[0] || p.reason || "見送り").slice(0, 40)}
                </div>
              ))}
              {todaySkips.length > 10 && <div style={{ opacity: 0.6 }}>...他 {todaySkips.length - 10} 件</div>}
            </div>
          )}
        </div>
      )}

      {/* フッタ: 公開ログ整合性 */}
      <div className="mt-3 pt-2 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", opacity: 0.7 }}>
        🔒 公開ログ: 累計 {publicLog.total} 件 / 整合性{" "}
        <span style={{ color: publicLog.integrity?.valid ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
          {publicLog.integrity?.valid ? "OK" : "NG"}
        </span>
        {" / "}
        <a href="?log=public" style={{ color: "#bae6fd", textDecoration: "underline" }}>公開ログを見る →</a>
      </div>
    </section>
  );
}

/* === 各レースの 5 状態を計算 === */
function computeStatus(p, publicLogKeys) {
  return {
    saved: !!p.snapshotAt,
    hasReasoning: !!p.reasoning,
    hasBoatsSnapshot: Array.isArray(p.boatsSnapshot) && p.boatsSnapshot.length === 6,
    hasResult: !!p.result?.first,
    pnlComputed: p.payout != null && p.pnl != null && p.finalized === true,
    inGraph: p.decision === "buy" && (p.totalStake || 0) > 0 && !!p.result?.first,
    inPublicLog: publicLogKeys.has(p.key),
    frozen: !!p.result?.first,        // Round 79: 結果ありで判断材料が固定
    isSampleData: !!p.isSampleData,
  };
}

/* === レースごとのカード (ステータスチェックリスト付き) === */
function RaceVerificationCard({ p, status }) {
  const main = p.combos?.[0];
  const hit = p.hit === true;
  const lost = !!p.result?.first && !hit;
  const profileLabel = { steady: "🛡️ 安定", balanced: "⚖️ バランス", aggressive: "🎯 攻め" }[p.profile] || p.profile;

  // 結果状態のラベル
  let stateLabel = "予想済み";
  let stateColor = "#bae6fd";
  if (status.inPublicLog && status.inGraph) { stateLabel = "公開ログ反映済み"; stateColor = "#34d399"; }
  else if (status.pnlComputed) { stateLabel = "結果反映済み"; stateColor = "#a7f3d0"; }
  else if (status.hasResult) { stateLabel = "結果取得済み"; stateColor = "#fde68a"; }
  else if (status.saved) { stateLabel = "結果待ち"; stateColor = "#bae6fd"; }

  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: "rgba(0,0,0,0.20)",
      border: `1px solid ${hit ? "rgba(16,185,129,0.4)" : lost ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
    }}>
      {/* ヘッダ */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="text-sm font-bold">
          {p.venue} {p.raceNo}R
          <span className="opacity-70 text-xs ml-2">{p.startTime} 発走</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="pill" style={{
            fontSize: 10,
            background: p.profile === "steady" ? "rgba(59,130,246,0.18)"
                       : p.profile === "balanced" ? "rgba(251,191,36,0.18)"
                       : "rgba(239,68,68,0.18)",
            color: p.profile === "steady" ? "#93c5fd"
                  : p.profile === "balanced" ? "#fcd34d"
                  : "#fca5a5",
          }}>
            {profileLabel}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 999,
            background: stateColor + "20",
            border: `1px solid ${stateColor}80`,
            color: stateColor, fontWeight: 700,
          }}>
            {stateLabel}
          </span>
        </div>
      </div>

      {/* 本線 + 結果 */}
      <div className="text-xs mb-2" style={{ lineHeight: 1.5 }}>
        🛒 <b>{main?.kind} {main?.combo}</b>
        {main && (
          <span className="opacity-80 ml-2">
            {main.odds?.toFixed(1)}倍 / EV {Math.round((main.ev || 0) * 100)}% / 自信 {p.confidence ?? "—"}
          </span>
        )}
        {status.hasResult && (
          <span className="ml-2" style={{ color: hit ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
            → {p.result.first}-{p.result.second}-{p.result.third} {hit ? "✓ 的中" : "✗ 外れ"}{" "}
            ({p.pnl >= 0 ? "+" : ""}{p.pnl ? yen(p.pnl) : "—"})
          </span>
        )}
      </div>

      {/* 5 つのステータスチェック */}
      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11 }}>
        <Check ok={status.saved} label="保存済" />
        <Check ok={status.hasResult} pending={!status.hasResult} label="結果取得" />
        <Check ok={status.pnlComputed} pending={status.hasResult && !status.pnlComputed} label="収支計算" />
        <Check ok={status.inGraph} pending={!status.inGraph} label="グラフ反映" />
        <Check ok={status.inPublicLog} pending={!status.inPublicLog && !status.isSampleData} excluded={status.isSampleData} label="公開ログ" />
        {status.frozen && (
          <span style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 4,
            background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)",
            color: "#d8b4fe", fontWeight: 700,
          }} title="結果確定後はデータが上書きされません (Round 79 フリーズ機構)">
            🔒 固定済
          </span>
        )}
      </div>

      {/* フリーズの注釈 */}
      {status.frozen && (
        <div className="text-xs mt-2 opacity-60" style={{ fontSize: 10, lineHeight: 1.4 }}>
          このデータは保存時点のものです (オッズ・EV・判断理由は後から変わりません)
        </div>
      )}

      {/* 仮データ起源警告 */}
      {status.isSampleData && (
        <div className="text-xs mt-2" style={{ color: "#fca5a5", fontSize: 10 }}>
          ⚠️ 仮データ起源 — 公開ログには反映されません
        </div>
      )}
    </div>
  );
}

/* === チェックマークアイコン === */
function Check({ ok, pending, excluded, label }) {
  if (excluded) {
    return (
      <span style={{
        fontSize: 10, padding: "2px 6px", borderRadius: 4,
        background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.4)",
        color: "#9ca3af",
      }}>
        ⊘ {label} (除外)
      </span>
    );
  }
  if (ok) {
    return (
      <span style={{
        fontSize: 10, padding: "2px 6px", borderRadius: 4,
        background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)",
        color: "#a7f3d0",
      }}>
        ✓ {label}
      </span>
    );
  }
  if (pending) {
    return (
      <span style={{
        fontSize: 10, padding: "2px 6px", borderRadius: 4,
        background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.3)",
        color: "#fde68a",
      }}>
        ⏳ {label}
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 10, padding: "2px 6px", borderRadius: 4,
      background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)",
      color: "#fca5a5",
    }}>
      ✗ {label}
    </span>
  );
}
