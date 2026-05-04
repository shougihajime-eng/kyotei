import { useMemo, useState, useCallback, memo } from "react";
import { loadPublicLog, verifyIntegrity } from "../lib/immutableLog.js";
import { getJstDateString } from "../lib/dateGuard.js";
import { yen } from "../lib/format.js";

/**
 * Round 100: TodayVerificationPanel premium polish
 *
 * DevTools / localStorage を見なくても、 画面 1 つで「今日ちゃんと動いているか」 が
 * 確認できる。 各買い推奨レースについて 5 段階状態を表示:
 *   ① 保存済み → ② 結果取得済み → ③ 収支計算済み → ④ 公開ログ反映済み → ⑤ 固定済み
 */
export default memo(TodayVerificationPanel);

const PROFILE_INFO = {
  steady:     { label: "🛡️ 安定",   color: "#3B82F6", bg: "rgba(59, 130, 246, 0.10)",  border: "rgba(59, 130, 246, 0.40)" },
  balanced:   { label: "⚖️ バランス", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.40)" },
  aggressive: { label: "🎯 攻め",     color: "#EF4444", bg: "rgba(239, 68, 68, 0.10)",   border: "rgba(239, 68, 68, 0.40)" },
};

function TodayVerificationPanel({ predictions, isSampleMode, storageStatus, publicLogTick }) {
  const today = getJstDateString();
  const [report, setReport] = useState(null);
  const [showSkips, setShowSkips] = useState(false);

  const todayBuys = useMemo(() => {
    return Object.values(predictions || {})
      .filter((p) => p?.date === today && p?.decision === "buy")
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [predictions, today]);

  const todaySkips = useMemo(() => {
    return Object.values(predictions || {})
      .filter((p) => p?.date === today && p?.decision === "skip");
  }, [predictions, today]);

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
      if (s.saved && s.hasResult && s.pnlComputed && s.inGraph && s.inPublicLog) allOk++;
      else if (s.hasResult && !s.inPublicLog) issues.push(`${p.venue} ${p.raceNo}R: 結果あり / 公開ログ未反映`);
      else if (s.hasResult && !s.pnlComputed) issues.push(`${p.venue} ${p.raceNo}R: 結果あり / 収支未計算`);
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
    setTimeout(() => setReport(null), 8000);
  }, [todayBuys, publicLog]);

  return (
    <section className="card mb-3" style={{ padding: 16 }}>
      {/* === ヘッダ === */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.01em" }}>
            📊 本日の検証状態
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3, lineHeight: 1.5 }}>
            <span className="num">{today}</span>
            {" · "}
            買い推奨 <b style={{ color: "var(--text-primary)" }}>{todayBuys.length}</b> 件
            {" · "}
            見送り <b style={{ color: "var(--text-primary)" }}>{todaySkips.length}</b> 件
          </div>
        </div>
        <button
          onClick={handleFullCheck}
          disabled={todayBuys.length === 0}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: todayBuys.length === 0 ? "rgba(255, 255, 255, 0.04)" : "rgba(34, 211, 238, 0.10)",
            border: `1px solid ${todayBuys.length === 0 ? "var(--border-soft)" : "rgba(34, 211, 238, 0.40)"}`,
            color: todayBuys.length === 0 ? "var(--text-quaternary)" : "var(--brand-text)",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: todayBuys.length === 0 ? "not-allowed" : "pointer",
            transition: "all 0.18s ease",
            letterSpacing: "0.01em",
            minHeight: 38,
          }}>
          🔍 一括確認
        </button>
      </div>

      {/* === 仮データ警告 === */}
      {isSampleMode && (
        <div style={{
          marginBottom: 10,
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.30)",
          color: "var(--c-danger-text)",
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          ⚠️ <b>仮データ動作中</b> — このデータは公開ログには反映されません
        </div>
      )}

      {/* === 保存失敗 === */}
      {storageStatus && !storageStatus.ok && storageStatus.error && (
        <div style={{
          marginBottom: 10,
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.45)",
          color: "var(--c-danger-text)",
          fontSize: 11,
          fontWeight: 700,
        }}>
          🚨 <b>保存失敗</b>: {storageStatus.error}
        </div>
      )}

      {/* === 一括確認結果 === */}
      {report && (
        <div className="fade-in" style={{
          marginBottom: 10,
          padding: "10px 12px",
          borderRadius: 10,
          background: report.issues.length === 0 ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
          border: `1px solid ${report.issues.length === 0 ? "rgba(16, 185, 129, 0.40)" : "rgba(245, 158, 11, 0.40)"}`,
          color: report.issues.length === 0 ? "var(--c-success-text)" : "var(--c-warning-text)",
          fontSize: 11.5,
          lineHeight: 1.55,
        }}>
          <b>{report.issues.length === 0 ? "✅" : "⚠️"} 一括確認</b>
          <span style={{ opacity: 0.75, marginLeft: 6, fontSize: 10 }}>{report.checkedAt}</span>
          <div style={{ marginTop: 4 }}>
            {report.total} 件中 <b>{report.ok}</b> 件すべて正常
            {report.pending > 0 && <span style={{ opacity: 0.8 }}> · 結果待ち {report.pending} 件</span>}
          </div>
          {report.issues.length > 0 && (
            <ul style={{ paddingLeft: 16, listStyle: "disc", marginTop: 4, opacity: 0.95 }}>
              {report.issues.slice(0, 5).map((i, idx) => <li key={idx}>{i}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* === レース一覧 === */}
      {todayBuys.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "32px 16px",
          color: "var(--text-tertiary)",
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
          <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>本日の買い推奨レースはまだありません</div>
          <div style={{ marginTop: 4, fontSize: 11 }}>
            直前判定 (締切 3〜25 分前) で条件を満たすレースが出ると<br/>
            ここに自動追加されます
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {todayBuys.map((p) => (
            <RaceVerificationCard key={p.key} p={p} status={computeStatus(p, publicLog.keys)} />
          ))}
        </div>
      )}

      {/* === 見送り一覧 (折り畳み) === */}
      {todaySkips.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowSkips(!showSkips)}
            style={{
              fontSize: 11,
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border-soft)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
              transition: "background 0.18s ease",
              fontWeight: 500,
            }}>
            {showSkips ? "▼" : "▶"} 本日の見送り <span className="num"><b>{todaySkips.length}</b></span> 件 (集計対象外)
          </button>
          {showSkips && (
            <div style={{ marginTop: 6, paddingLeft: 10, fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
              {todaySkips.slice(0, 10).map((p, i) => (
                <div key={i} style={{ padding: "2px 0" }}>
                  <span style={{ opacity: 0.6 }}>⏭</span> {p.venue} <span className="num">{p.raceNo}R</span> ({p.startTime}) — {p.profile} — {(p.reasons?.[0] || p.reason || "見送り").slice(0, 40)}
                </div>
              ))}
              {todaySkips.length > 10 && <div style={{ opacity: 0.55, marginTop: 2 }}>...他 {todaySkips.length - 10} 件</div>}
            </div>
          )}
        </div>
      )}

      {/* === フッタ: 公開ログ整合性 === */}
      <div style={{
        marginTop: 14,
        paddingTop: 10,
        borderTop: "1px solid var(--border-subtle)",
        fontSize: 10.5,
        color: "var(--text-quaternary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 6,
      }}>
        <div>
          🔒 公開ログ: 累計 <b className="num" style={{ color: "var(--text-secondary)" }}>{publicLog.total}</b> 件
          {" · "}
          整合性{" "}
          <span style={{ color: publicLog.integrity?.valid ? "#34D399" : "#FCA5A5", fontWeight: 700 }}>
            {publicLog.integrity?.valid ? "OK" : "NG"}
          </span>
        </div>
        <a href="?log=public" style={{ color: "var(--brand-text)", textDecoration: "underline", fontWeight: 600 }}>
          公開ログを見る →
        </a>
      </div>
    </section>
  );
}

/* === 5 状態を計算 === */
function computeStatus(p, publicLogKeys) {
  return {
    saved: !!p.snapshotAt,
    hasResult: !!p.result?.first,
    pnlComputed: p.payout != null && p.pnl != null && p.finalized === true,
    inGraph: p.decision === "buy" && (p.totalStake || 0) > 0 && !!p.result?.first,
    inPublicLog: publicLogKeys.has(p.key),
    frozen: !!p.result?.first,
    isSampleData: !!p.isSampleData,
  };
}

/* === レースカード (premium) === */
function RaceVerificationCard({ p, status }) {
  const main = p.combos?.[0];
  const hit = p.hit === true;
  const lost = !!p.result?.first && !hit;
  const profile = PROFILE_INFO[p.profile] || PROFILE_INFO.balanced;

  // 5 段階状態
  let stateLabel, stateColor;
  if (status.inPublicLog && status.pnlComputed) { stateLabel = "⑤ 固定済み"; stateColor = "#34D399"; }
  else if (status.pnlComputed) { stateLabel = "③ 収支計算済み"; stateColor = "#A7F3D0"; }
  else if (status.hasResult) { stateLabel = "② 結果取得済み"; stateColor = "#FCD34D"; }
  else if (status.saved) { stateLabel = "① 保存済み"; stateColor = "#67E8F9"; }
  else { stateLabel = "未保存"; stateColor = "#94A3B8"; }

  const cardBorder = hit ? "rgba(16, 185, 129, 0.45)"
                    : lost ? "rgba(239, 68, 68, 0.30)"
                    : "var(--border-soft)";

  return (
    <div style={{
      padding: 12,
      borderRadius: 12,
      background: hit
        ? "linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)"
        : "rgba(255, 255, 255, 0.02)",
      border: `1px solid ${cardBorder}`,
      transition: "all 0.18s ease",
    }}>
      {/* === 上段: レース基本 + state ピル === */}
      <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" }}>
            {p.venue} <span className="num">{p.raceNo}R</span>
            <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11, fontWeight: 500 }}>
              {p.startTime}発走
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{
            fontSize: 9.5,
            padding: "2px 8px",
            borderRadius: 999,
            background: profile.bg,
            color: profile.color,
            fontWeight: 700,
            letterSpacing: "0.01em",
            border: `1px solid ${profile.border}`,
          }}>
            {profile.label}
          </span>
          <span style={{
            fontSize: 9.5,
            padding: "2px 8px",
            borderRadius: 999,
            background: stateColor + "18",
            border: `1px solid ${stateColor}70`,
            color: stateColor,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}>
            {stateLabel}
          </span>
        </div>
      </div>

      {/* === 中段: 本線 + 結果 === */}
      <div style={{ fontSize: 11.5, lineHeight: 1.55, marginBottom: 8, color: "var(--text-secondary)" }}>
        🛒 <b style={{ color: "var(--text-primary)" }}>{main?.kind} {main?.combo}</b>
        {main && (
          <span style={{ opacity: 0.85, marginLeft: 6, fontSize: 11 }}>
            <span className="num">{main.odds?.toFixed(1)}</span>倍
            {" · "}
            EV <span className="num">{Math.round((main.ev || 0) * 100)}</span>%
            {" · "}
            自信 <span className="num">{p.confidence ?? "—"}</span>
          </span>
        )}
        {status.hasResult && (
          <div style={{
            marginTop: 4,
            color: hit ? "#34D399" : "#FCA5A5",
            fontWeight: 700,
            fontSize: 11.5,
          }}>
            → <span className="num">{p.result.first}-{p.result.second}-{p.result.third}</span>{" "}
            {hit ? "✓ 的中" : "✗ 外れ"}
            {p.pnl != null && (
              <span style={{ marginLeft: 6 }}>
                ({p.pnl >= 0 ? "+" : ""}{yen(p.pnl)})
              </span>
            )}
          </div>
        )}
      </div>

      {/* === 5 つのチェック === */}
      <div className="flex items-center gap-1.5 flex-wrap" style={{ fontSize: 10 }}>
        <Check ok={status.saved} label="① 保存済み" />
        <Check ok={status.hasResult} pending={status.saved && !status.hasResult} label="② 結果取得済み" />
        <Check ok={status.pnlComputed} pending={status.hasResult && !status.pnlComputed} label="③ 収支計算済み" />
        <Check ok={status.inPublicLog && !status.isSampleData} pending={status.pnlComputed && !status.inPublicLog && !status.isSampleData} excluded={status.isSampleData} label="④ 公開ログ反映済み" />
        <Check ok={status.frozen && status.inPublicLog} pending={status.frozen && !status.inPublicLog && !status.isSampleData} excluded={status.isSampleData} label="⑤ 固定済み" />
      </div>

      {/* === フリーズ注釈 === */}
      {status.frozen && (
        <div style={{
          fontSize: 9.5,
          marginTop: 8,
          color: "var(--text-quaternary)",
          lineHeight: 1.5,
          letterSpacing: "0.01em",
        }}>
          🔒 このデータは保存時点のものです (オッズ・EV・判断理由は変わりません)
        </div>
      )}

      {/* === 仮データ起源警告 === */}
      {status.isSampleData && (
        <div style={{ fontSize: 10, marginTop: 6, color: "var(--c-danger-text)" }}>
          ⚠️ 仮データ起源 — 公開ログには反映されません
        </div>
      )}
    </div>
  );
}

/* === ステータスチップ === */
function Check({ ok, pending, excluded, label }) {
  let bg, border, color, icon;
  if (excluded) {
    bg = "rgba(107, 114, 128, 0.10)";
    border = "rgba(107, 114, 128, 0.30)";
    color = "#9CA3AF";
    icon = "⊘";
  } else if (ok) {
    bg = "rgba(16, 185, 129, 0.10)";
    border = "rgba(16, 185, 129, 0.35)";
    color = "#A7F3D0";
    icon = "✓";
  } else if (pending) {
    bg = "rgba(245, 158, 11, 0.08)";
    border = "rgba(245, 158, 11, 0.30)";
    color = "#FCD34D";
    icon = "⏳";
  } else {
    bg = "rgba(239, 68, 68, 0.06)";
    border = "rgba(239, 68, 68, 0.25)";
    color = "#FCA5A5";
    icon = "✗";
  }
  return (
    <span style={{
      fontSize: 10,
      padding: "2px 7px",
      borderRadius: 6,
      background: bg,
      border: `1px solid ${border}`,
      color: color,
      fontWeight: 600,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      {icon} {excluded ? `${label} (除外)` : label}
    </span>
  );
}
