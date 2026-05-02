import { useMemo, useState } from "react";
import { yen } from "../lib/format.js";
import {
  loadPublicLog, verifyIntegrity, summarizePublicLog, exportPublicLogJson,
} from "../lib/immutableLog.js";

/**
 * Round 75: 公開検証ログページ (read-only)
 *
 * URL: /?log=public または #log でアクセス
 *
 * 全 finalized レースを append-only ログから表示:
 *   ・整合性検証 (ハッシュチェイン)
 *   ・バージョン別 / 日別 集計
 *   ・全件一覧 (買い目 / オッズ / 結果 / 払戻 / hit/miss)
 *   ・JSON エクスポート (第三者検証用)
 *
 * 編集・削除 UI なし。
 */
export default function PublicLogPage() {
  const log = useMemo(() => loadPublicLog(), []);
  const integrity = useMemo(() => verifyIntegrity(log), [log]);
  const summary = useMemo(() => summarizePublicLog(log), [log]);
  const [filterVersion, setFilterVersion] = useState("all");
  const [showLimit, setShowLimit] = useState(50);

  const versions = Object.keys(summary.byVersion);
  const filtered = useMemo(() => {
    if (filterVersion === "all") return log;
    return log.filter((b) => b.entry?.verificationVersion === filterVersion);
  }, [log, filterVersion]);

  // 累計 PnL (時系列)
  const cumulative = useMemo(() => {
    let stake = 0, ret = 0;
    return filtered
      .filter((b) => b.entry?.decision === "buy" && b.entry?.result)
      .map((b) => {
        stake += b.entry.totalStake || 0;
        ret += b.entry.payout || 0;
        return {
          date: b.entry.date,
          venue: b.entry.venue,
          raceNo: b.entry.raceNo,
          pnl: ret - stake,
          hit: b.entry.hit,
        };
      });
  }, [filtered]);

  function handleExport() {
    const json = exportPublicLogJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kyotei-public-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleClose() {
    // 通常のアプリ画面に戻す
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("log");
      window.location.href = url.toString();
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a1124",
      color: "#e2e8f0",
      padding: "16px 12px",
    }}>
      <div className="max-w-4xl mx-auto">
        {/* ヘッダ */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h1 className="text-xl font-bold">📊 公開検証ログ (read-only)</h1>
            <div className="text-xs opacity-70 mt-1">
              全 Go 判定結果を append-only で記録。 改ざん検出のためハッシュチェインを採用。
            </div>
          </div>
          <button onClick={handleClose} className="btn btn-ghost text-xs">← アプリに戻る</button>
        </div>

        {/* 注意書き (誤解誘発防止) */}
        <div className="mb-4 p-3 rounded text-xs" style={{
          background: "rgba(239,68,68,0.10)",
          border: "1px solid rgba(239,68,68,0.4)",
          color: "#fca5a5",
          lineHeight: 1.6,
        }}>
          ⚠️ <b>勝てる保証はありません</b>。 これは過去の予想ログです。 良い結果も悪い結果もすべて表示しています。
          競艇の舟券購入は <b>20 歳以上のみ</b>。 自己責任でご利用ください。
        </div>

        {/* 整合性 */}
        <div className="mb-4 p-3 rounded" style={{
          background: integrity.valid ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${integrity.valid ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.5)"}`,
          color: integrity.valid ? "#a7f3d0" : "#fca5a5",
        }}>
          <div className="text-xs font-bold mb-1">
            {integrity.valid ? "🔒 整合性 OK" : "🚨 整合性 NG"}
          </div>
          <div className="text-xs opacity-80">
            {integrity.valid
              ? `${log.length} エントリ全てハッシュチェイン整合 (改ざんなし)`
              : `エントリ ${integrity.brokenAt} で整合性違反: ${integrity.reason}`
            }
          </div>
        </div>

        {/* バージョン別サマリ */}
        {versions.length > 0 && (
          <section className="mb-4">
            <h2 className="text-sm font-bold mb-2">📋 バージョン別成績</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {versions.map((v) => {
                const s = summary.byVersion[v];
                const profitable = s.roi != null && s.roi >= 1.0;
                return (
                  <div
                    key={v}
                    onClick={() => setFilterVersion(filterVersion === v ? "all" : v)}
                    style={{
                      cursor: "pointer",
                      background: filterVersion === v ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.18)",
                      border: `1px solid ${filterVersion === v ? "#38bdf8" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 8,
                      padding: 12,
                    }}>
                    <div className="text-xs font-bold mb-1" style={{ color: "#bae6fd" }}>{v}</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span>{s.count} 戦</span>
                      <span>{s.hits} 勝 / {s.count - s.hits} 敗</span>
                      <span style={{ color: profitable ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                        ROI {s.roi != null ? `${Math.round(s.roi * 100)}%` : "—"}
                      </span>
                    </div>
                    <div className="text-xs mt-1 opacity-80">
                      賭 {yen(s.stake)} / 戻 {yen(s.ret)} / PnL{" "}
                      <span style={{ color: s.pnl >= 0 ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                        {s.pnl >= 0 ? "+" : "−"}{yen(Math.abs(s.pnl))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {filterVersion !== "all" && (
              <div className="text-xs mt-2 opacity-70">
                ▶ フィルタ中: {filterVersion} (クリックで解除)
              </div>
            )}
          </section>
        )}

        {/* 累計 PnL 推移 (簡易テキスト + CSV風) */}
        {cumulative.length > 0 && (
          <section className="mb-4">
            <h2 className="text-sm font-bold mb-2">📈 累計収支推移 ({cumulative.length} 件)</h2>
            <div className="text-xs p-2 rounded" style={{
              background: "rgba(0,0,0,0.20)",
              border: "1px solid rgba(255,255,255,0.06)",
              maxHeight: 120, overflow: "auto", fontFamily: "monospace",
              lineHeight: 1.4,
            }}>
              {cumulative.slice(-30).map((c, i) => (
                <div key={i} style={{ color: c.hit ? "#a7f3d0" : "#fca5a5" }}>
                  {c.date} {c.venue} {c.raceNo}R: {c.hit ? "✓" : "✗"}{" "}
                  累計 {c.pnl >= 0 ? "+" : "−"}{yen(Math.abs(c.pnl))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 全件一覧 */}
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">📜 全件ログ ({filtered.length} 件)</h2>
            <button onClick={handleExport} className="btn btn-ghost text-xs">
              📥 JSON エクスポート
            </button>
          </div>
          <div style={{
            background: "rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
              <thead style={{ background: "rgba(255,255,255,0.04)" }}>
                <tr>
                  <th style={cellH}>日付</th>
                  <th style={cellH}>会場</th>
                  <th style={cellH}>R</th>
                  <th style={cellH}>style</th>
                  <th style={cellH}>判断</th>
                  <th style={cellH}>本線</th>
                  <th style={cellH}>EV</th>
                  <th style={cellH}>結果</th>
                  <th style={cellH}>PnL</th>
                  <th style={cellH}>ハッシュ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(-showLimit).reverse().map((b, i) => {
                  const e = b.entry;
                  if (!e) return null;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={cell}>{e.date || "—"}</td>
                      <td style={cell}>{e.venue || "—"}</td>
                      <td style={cell}>{e.raceNo || "—"}</td>
                      <td style={cell}>{e.profile || "—"}</td>
                      <td style={cell}>
                        {e.decision === "buy" ? "🛒 buy"
                         : e.decision === "skip" ? "⏭ skip"
                         : e.decision || "—"}
                      </td>
                      <td style={cell}>
                        {e.main ? `${e.main.kind} ${e.main.combo}` : "—"}
                      </td>
                      <td style={cell}>
                        {e.main?.ev != null ? `${Math.round(e.main.ev * 100)}%` : "—"}
                      </td>
                      <td style={cell}>
                        {e.result ? `${e.result.first}-${e.result.second}-${e.result.third}` : "—"}
                      </td>
                      <td style={{
                        ...cell,
                        color: e.pnl > 0 ? "#34d399" : e.pnl < 0 ? "#fca5a5" : "inherit",
                        fontWeight: 700,
                      }}>
                        {e.pnl ? (e.pnl > 0 ? "+" : "") + yen(e.pnl) : "—"}
                      </td>
                      <td style={{ ...cell, fontFamily: "monospace", opacity: 0.6 }}>
                        {b.hash?.slice(0, 6) || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center text-xs opacity-60 p-4">
                まだログがありません — Go 判定 + 結果確定後に自動追記されます
              </div>
            )}
          </div>
          {filtered.length > showLimit && (
            <div className="text-center mt-2">
              <button
                onClick={() => setShowLimit(showLimit + 50)}
                className="btn btn-ghost text-xs"
              >
                + さらに 50 件表示
              </button>
            </div>
          )}
        </section>

        <div className="text-xs opacity-60 mt-6 text-center" style={{ lineHeight: 1.6 }}>
          このログは append-only — 削除・編集は不可。<br/>
          各エントリのハッシュは前のエントリのハッシュをチェインしているため、 改ざん検出可能。<br/>
          JSON エクスポートで第三者が手元で整合性を再検証できます。
        </div>
      </div>
    </div>
  );
}

const cellH = {
  padding: "6px 8px", textAlign: "left",
  fontSize: 10, fontWeight: 700,
  color: "#bae6fd", whiteSpace: "nowrap",
};
const cell = {
  padding: "6px 8px", whiteSpace: "nowrap",
};
