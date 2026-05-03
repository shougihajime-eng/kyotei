import { useMemo, useState } from "react";
import { yen } from "../lib/format.js";
import {
  loadPublicLog, verifyIntegrity, summarizePublicLog, exportPublicLogJson,
} from "../lib/immutableLog.js";

/**
 * Round 75-76: 公開検証ログページ (read-only)
 *
 * URL: /?log=public でアクセス
 *
 * 設計原則 (信用ページとして):
 *  ① 初見でも 10 秒で意味が分かる (ヒーロー + 説明)
 *  ② 全体 ROI / 的中率 / 最大連敗 を一瞬で
 *  ③ 悪い結果も隠さず表示 (連敗強調・全件)
 *  ④ 仮データ起源は絶対に表示しない (immutableLog で append 時除外)
 *  ⑤ スマホでも軽快 (デスクトップ=テーブル / スマホ=カード)
 *  ⑥ ログ増加でも破綻しない (showLimit + memoized summary)
 *  ⑦ 信用源: 整合性ハッシュ + JSON エクスポート + GitHub リンク
 */
const GITHUB_URL = "https://github.com/shougihajime-eng/kyotei";

export default function PublicLogPage() {
  const log = useMemo(() => loadPublicLog(), []);
  const integrity = useMemo(() => verifyIntegrity(log), [log]);
  const summary = useMemo(() => summarizePublicLog(log), [log]);
  const o = summary.overall;
  const [filterVersion, setFilterVersion] = useState("all");
  const [showLimit, setShowLimit] = useState(50);
  const [showHelp, setShowHelp] = useState(false);

  const versions = Object.keys(summary.byVersion);
  const months = Object.keys(summary.byMonth).sort();
  const filtered = useMemo(() => {
    if (filterVersion === "all") return log;
    return log.filter((b) => b.entry?.verificationVersion === filterVersion);
  }, [log, filterVersion]);

  // 累計 PnL (時系列、 直近 60 件)
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
          payout: b.entry.payout,
          stake: b.entry.totalStake,
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
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("log");
      window.location.href = url.toString();
    }
  }

  // ROI 色分け
  const roiColor = (roi) => roi == null ? "#94a3b8"
                       : roi >= 1.10 ? "#34d399"
                       : roi >= 1.0  ? "#a7f3d0"
                       : roi >= 0.85 ? "#fde68a"
                       : "#fca5a5";
  const roiVerdict = (roi, count) => {
    if (count < 30) return { text: "サンプル不足", color: "#94a3b8" };
    if (roi == null) return { text: "未検証", color: "#94a3b8" };
    if (roi >= 1.10) return { text: "✅ 期待値プラス", color: "#34d399" };
    if (roi >= 1.0) return { text: "🟡 ほぼ五分", color: "#fde68a" };
    if (roi >= 0.85) return { text: "🔴 負け越し", color: "#fca5a5" };
    return { text: "🚨 致命的", color: "#fca5a5" };
  };
  const verdict = roiVerdict(o?.roi, o?.count || 0);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a1124",
      color: "#e2e8f0",
      padding: "12px",
      fontSize: 13,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* ヘッダ */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>📊 公開検証ログ</h1>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
              改ざん検知付き append-only ログ / 全予想を結果と共に公開 / 第三者検証可能
            </div>
          </div>
          <button onClick={handleClose} style={ghostBtn}>← アプリへ戻る</button>
        </div>

        {/* 信用バナー (赤) — 勝てる保証なし */}
        <div style={{
          marginBottom: 12, padding: "10px 12px", borderRadius: 8,
          background: "rgba(239,68,68,0.10)",
          border: "1px solid rgba(239,68,68,0.4)",
          color: "#fca5a5", fontSize: 12, lineHeight: 1.55,
        }}>
          ⚠️ <b>勝てる保証はありません</b>。 良い結果も悪い結果もすべて表示しています。
          競艇の舟券購入は <b>20 歳以上のみ</b>、 自己責任でご利用ください。
        </div>

        {/* === ヒーローセクション: 全体 ROI / 的中率 / 最大連敗 === */}
        {o && o.count > 0 ? (
          <section style={{
            marginBottom: 16, padding: 16, borderRadius: 12,
            background: "linear-gradient(135deg, rgba(56,189,248,0.06), rgba(99,102,241,0.06))",
            border: "1px solid rgba(56,189,248,0.25)",
          }}>
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 6, textAlign: "center" }}>
              📈 全期間集計 ({o.count} 戦 — {o.hits} 勝 / {o.count - o.hits} 敗)
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}>
              <HeroNumber
                label="ROI (回収率)"
                value={o.roi != null ? `${Math.round(o.roi * 100)}%` : "—"}
                color={roiColor(o.roi)}
                sub={o.roi != null && o.roi >= 1.0 ? "100% 超 = プラス" : o.roi != null ? "100% 未満 = マイナス" : "未検証"}
              />
              <HeroNumber
                label="的中率"
                value={o.hitRate != null ? `${Math.round(o.hitRate * 100)}%` : "—"}
                color="#bae6fd"
                sub={`平均オッズ ${o.avgOdds != null ? `${o.avgOdds}倍` : "—"}`}
              />
              <HeroNumber
                label="最大連敗"
                value={`${o.maxLossStreak}`}
                color={o.maxLossStreak >= 8 ? "#fca5a5" : o.maxLossStreak >= 5 ? "#fde68a" : "#a7f3d0"}
                sub={`最大連勝 ${o.maxWinStreak} 戦`}
              />
            </div>
            {/* PnL & verdict */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: 8, fontSize: 12,
              padding: 8, borderRadius: 6,
              background: "rgba(0,0,0,0.18)",
            }}>
              <span>
                💴 賭 <b>{yen(o.stake)}</b> → 戻 <b>{yen(o.ret)}</b>
              </span>
              <span style={{ color: o.pnl >= 0 ? "#34d399" : "#fca5a5", fontWeight: 800 }}>
                収支 {o.pnl >= 0 ? "+" : "−"}{yen(Math.abs(o.pnl))}
              </span>
              <span style={{
                padding: "3px 10px", borderRadius: 999,
                background: verdict.color + "20",
                border: `1px solid ${verdict.color}80`,
                color: verdict.color, fontWeight: 700,
              }}>
                {verdict.text}
              </span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 8, textAlign: "center" }}>
              ※ 公営競技の払戻控除率 (約 25%) を考慮し、 ROI 110% 以上で本格的にプラスと判定
            </div>
          </section>
        ) : (
          <section style={{
            marginBottom: 16, padding: 24, borderRadius: 12,
            background: "rgba(0,0,0,0.18)",
            border: "1px dashed rgba(255,255,255,0.15)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              まだ検証ログがありません
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.5 }}>
              直前判定で Go 候補となったレースの結果が確定すると<br/>
              ここに自動的に追記されます (仮データは含まれません)
            </div>
          </section>
        )}

        {/* === 「これは何？」 折りたたみヘルプ === */}
        <section style={{ marginBottom: 12 }}>
          <button
            onClick={() => setShowHelp(!showHelp)}
            style={{
              width: "100%", textAlign: "left",
              padding: "8px 12px", borderRadius: 6,
              background: "rgba(56,189,248,0.08)",
              border: "1px solid rgba(56,189,248,0.25)",
              color: "#bae6fd",
              cursor: "pointer", fontSize: 12, fontWeight: 700,
            }}
          >
            {showHelp ? "▼" : "▶"} 📖 このページは何? / 用語の意味 / なぜ信頼できるのか
          </button>
          {showHelp && (
            <div style={{
              marginTop: 6, padding: 12, borderRadius: 6,
              background: "rgba(0,0,0,0.18)",
              border: "1px solid rgba(255,255,255,0.06)",
              fontSize: 12, lineHeight: 1.7,
            }}>
              <p style={{ marginBottom: 8 }}>
                <b>このページは何?</b><br/>
                競艇 EV アシスタント (kyotei-two) が出した予想と、 その実際の結果を <b>すべて</b> 公開しています。
                良い結果だけ抜粋することはなく、 負けたレースもすべて含めています。
              </p>
              <p style={{ marginBottom: 8 }}>
                <b>用語</b>:
              </p>
              <ul style={{ paddingLeft: 18, marginBottom: 8 }}>
                <li><b>ROI (回収率)</b>: 賭けた金額に対する戻り。 100% で五分、 控除率 (約 25%) を超えるには <b>110%+</b> が目安</li>
                <li><b>的中率</b>: 予想が当たった割合。 3 連単などは構造的に低い (5-30%)</li>
                <li><b>EV</b>: 期待値 (確率 × オッズ)。 100% 超なら理論上プラス</li>
                <li><b>最大連敗</b>: 連続で外した回数の最高記録。 連敗は確率上当然起こる</li>
                <li><b>verificationVersion</b>: 予想ロジックのバージョン。 ロジック変更ごとに別集計</li>
              </ul>
              <p style={{ marginBottom: 8 }}>
                <b>なぜ信頼できるのか</b>:
              </p>
              <ul style={{ paddingLeft: 18, marginBottom: 8 }}>
                <li>各エントリには <b>ハッシュ</b> が付き、 前のエントリの hash をチェイン (= 簡易ブロックチェーン)</li>
                <li>後から編集・削除する API は提供していない (append-only)</li>
                <li>下の <b>JSON エクスポート</b> でデータをダウンロードし、 第三者がローカルで整合性を再検証可能</li>
                <li>ソースコードは公開: <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#bae6fd", textDecoration: "underline" }}>{GITHUB_URL}</a></li>
                <li><b>仮データ (API 失敗時の fallback)</b> は <code>isSampleData=true</code> でフラグ付けされ、 公開ログには絶対に追記されません</li>
              </ul>
              <p>
                <b>注意</b>: このアプリは予想を <b>保証しません</b>。 競艇の控除率 (約 25%) を継続的に超える保証はなく、
                短期の良績は運の要素もあります。 過去の結果は将来を保証しません。
              </p>
            </div>
          )}
        </section>

        {/* === 整合性ステータス === */}
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 6,
          background: integrity.valid ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${integrity.valid ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.5)"}`,
          color: integrity.valid ? "#a7f3d0" : "#fca5a5",
          fontSize: 12, lineHeight: 1.5,
        }}>
          <b>{integrity.valid ? "🔒 整合性 OK" : "🚨 整合性違反 検出"}</b>
          {" — "}
          {integrity.valid
            ? `${log.length} エントリ全件、 ハッシュチェイン整合 (改ざんなし)`
            : `エントリ ${integrity.brokenAt} 番目で違反: ${integrity.reason}`}
        </div>

        {/* === 連敗・連勝 注意喚起 (悪い結果を隠さない) === */}
        {o && o.count >= 5 && (
          <div style={{
            marginBottom: 12, padding: "8px 12px", borderRadius: 6,
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#fca5a5", fontSize: 11, lineHeight: 1.6,
          }}>
            ⚠️ <b>連敗の現実</b>: 過去 {o.count} 戦中、 最大 <b>{o.maxLossStreak} 連敗</b> を記録。
            的中率 {Math.round((o.hitRate || 0) * 100)}% でも 5 連敗・10 連敗は確率的に普通に起きます。
            資金管理は厳格に行ってください。
          </div>
        )}

        {/* === Round 84: スタイル別成績 (検証アプリの中心) === */}
        {summary.byStyle && (summary.byStyle.steady.count + summary.byStyle.balanced.count + summary.byStyle.aggressive.count) > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              🏆 スタイル別成績 (どれが一番勝っているか)
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 8,
            }}>
              {[
                { k: "steady", label: "🛡️ 安定", color: "#3b82f6", desc: "的中率重視" },
                { k: "balanced", label: "⚖️ バランス", color: "#fbbf24", desc: "中庸" },
                { k: "aggressive", label: "🎯 攻め", color: "#ef4444", desc: "高配当狙い" },
              ].map(({ k, label, color, desc }) => {
                const s = summary.byStyle[k];
                const isWinner = summary.bestStyle === k;
                const profitable = s.roi != null && s.roi >= 1.0;
                return (
                  <div key={k} style={{
                    padding: 12, borderRadius: 8,
                    background: isWinner ? "rgba(16,185,129,0.10)" : "rgba(0,0,0,0.20)",
                    border: `1px solid ${isWinner ? "rgba(16,185,129,0.6)" : color + "60"}`,
                    position: "relative",
                  }}>
                    {isWinner && (
                      <div style={{
                        position: "absolute", top: -8, right: 8,
                        padding: "2px 8px", borderRadius: 999,
                        background: "rgba(16,185,129,0.95)", color: "#fff",
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                      }}>
                        🏆 BEST
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 800, color, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 6 }}>{desc}</div>
                    {s.count > 0 ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 900, color: profitable ? "#34d399" : "#fca5a5", lineHeight: 1.1 }}>
                          ROI {s.roi != null ? `${Math.round(s.roi * 100)}%` : "—"}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>
                          {s.count} 戦・{s.hits} 勝 / 的中率 {s.hitRate != null ? `${Math.round(s.hitRate * 100)}%` : "—"}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>
                          賭 {yen(s.stake)} → 戻 {yen(s.ret)}
                          <br/>
                          <span style={{ color: s.pnl >= 0 ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                            収支 {s.pnl >= 0 ? "+" : "−"}{yen(Math.abs(s.pnl))}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, opacity: 0.5 }}>未蓄積</div>
                    )}
                  </div>
                );
              })}
            </div>
            {summary.bestStyle && (
              <div style={{
                marginTop: 8, padding: "6px 10px", borderRadius: 6,
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#a7f3d0", fontSize: 11, lineHeight: 1.55,
              }}>
                ✨ <b>{summary.bestStyle === "steady" ? "🛡️ 安定型" : summary.bestStyle === "balanced" ? "⚖️ バランス型" : "🎯 攻め型"}</b>
                {" "}が現時点で最も成績良好 (ROI {Math.round(summary.bestRoi * 100)}% / 3 戦以上のスタイルから判定)
              </div>
            )}
          </section>
        )}

        {/* === バージョン別成績 === */}
        {versions.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📋 バージョン別成績</h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
            }}>
              {versions.map((v) => {
                const s = summary.byVersion[v];
                const profitable = s.roi != null && s.roi >= 1.0;
                return (
                  <button
                    key={v}
                    onClick={() => setFilterVersion(filterVersion === v ? "all" : v)}
                    style={{
                      cursor: "pointer", textAlign: "left",
                      background: filterVersion === v ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.18)",
                      border: `1px solid ${filterVersion === v ? "#38bdf8" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 8, padding: 10, color: "inherit",
                    }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#bae6fd", marginBottom: 4, wordBreak: "break-all" }}>{v}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span>{s.count} 戦 ({s.hits}勝/{s.count - s.hits}敗)</span>
                      <span style={{ color: profitable ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                        ROI {s.roi != null ? `${Math.round(s.roi * 100)}%` : "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>
                      賭 {yen(s.stake)} / PnL{" "}
                      <span style={{ color: s.pnl >= 0 ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                        {s.pnl >= 0 ? "+" : "−"}{yen(Math.abs(s.pnl))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {filterVersion !== "all" && (
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
                ▶ フィルタ中: {filterVersion} (もう一度クリックで解除)
              </div>
            )}
          </section>
        )}

        {/* === 月別推移 === */}
        {months.length > 1 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📅 月別 ROI 推移</h2>
            <div style={{
              display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4,
              padding: "4px 0",
            }}>
              {months.map((m) => {
                const s = summary.byMonth[m];
                const c = roiColor(s.roi);
                return (
                  <div key={m} style={{
                    minWidth: 100, padding: 8, borderRadius: 6,
                    background: "rgba(0,0,0,0.18)",
                    border: `1px solid ${c}40`,
                    flex: "0 0 auto",
                  }}>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{m}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: c }}>
                      {s.roi != null ? `${Math.round(s.roi * 100)}%` : "—"}
                    </div>
                    <div style={{ fontSize: 9, opacity: 0.7 }}>
                      {s.count}戦 / {s.hits}勝
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* === 累計収支推移 === */}
        {cumulative.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 累計収支 (最新 30 件)</h2>
            <div style={{
              padding: 8, borderRadius: 6,
              background: "rgba(0,0,0,0.18)",
              border: "1px solid rgba(255,255,255,0.06)",
              maxHeight: 140, overflow: "auto",
              fontFamily: "monospace", fontSize: 10, lineHeight: 1.5,
            }}>
              {cumulative.slice(-30).map((c, i) => (
                <div key={i} style={{
                  color: c.hit ? "#a7f3d0" : "#fca5a5",
                  display: "flex", gap: 8, justifyContent: "space-between",
                }}>
                  <span>{c.date} {c.venue} {c.raceNo}R: {c.hit ? "✓" : "✗"}</span>
                  <span>累計 {c.pnl >= 0 ? "+" : "−"}{yen(Math.abs(c.pnl))}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* === 全件ログ (PC=テーブル / スマホ=カード) === */}
        <section style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700 }}>📜 全件ログ ({filtered.length} 件)</h2>
            <button onClick={handleExport} style={ghostBtn}>📥 JSON</button>
          </div>

          {/* PC 表示: テーブル (md 以上で表示) */}
          <div className="hidden md:block" style={{
            background: "rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, overflow: "hidden",
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
                  <th style={cellH}>hash</th>
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
                      <td style={cell}>{e.decision === "buy" ? "🛒buy" : e.decision === "skip" ? "⏭skip" : e.decision || "—"}</td>
                      <td style={cell}>{e.main ? `${e.main.kind} ${e.main.combo}` : "—"}</td>
                      <td style={cell}>{e.main?.ev != null ? `${Math.round(e.main.ev * 100)}%` : "—"}</td>
                      <td style={cell}>{e.result ? `${e.result.first}-${e.result.second}-${e.result.third}` : "—"}</td>
                      <td style={{ ...cell, color: e.pnl > 0 ? "#34d399" : e.pnl < 0 ? "#fca5a5" : "inherit", fontWeight: 700 }}>
                        {e.pnl ? (e.pnl > 0 ? "+" : "") + yen(e.pnl) : "—"}
                      </td>
                      <td style={{ ...cell, fontFamily: "monospace", opacity: 0.6 }}>{b.hash?.slice(0, 6) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* スマホ表示: カード */}
          <div className="md:hidden" style={{ display: "grid", gap: 6 }}>
            {filtered.slice(-showLimit).reverse().map((b, i) => {
              const e = b.entry;
              if (!e) return null;
              const isBuy = e.decision === "buy";
              const result = e.result ? `${e.result.first}-${e.result.second}-${e.result.third}` : null;
              return (
                <div key={i} style={{
                  padding: 8, borderRadius: 6,
                  background: "rgba(0,0,0,0.18)",
                  border: `1px solid ${e.hit ? "rgba(16,185,129,0.3)" : e.pnl < 0 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700 }}>{e.date} {e.venue} {e.raceNo}R</span>
                    <span style={{
                      fontSize: 10,
                      padding: "1px 6px", borderRadius: 999,
                      background: e.profile === "steady" ? "rgba(59,130,246,0.20)"
                                 : e.profile === "balanced" ? "rgba(251,191,36,0.20)"
                                 : "rgba(239,68,68,0.20)",
                    }}>
                      {e.profile}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, marginBottom: 3 }}>
                    {isBuy ? `🛒 ${e.main?.kind} ${e.main?.combo} (EV ${Math.round((e.main?.ev || 0) * 100)}%)` : `⏭ skip`}
                  </div>
                  {result && (
                    <div style={{ fontSize: 10, opacity: 0.85, display: "flex", justifyContent: "space-between" }}>
                      <span>結果: <b>{result}</b> {e.hit ? "✓ 的中" : "✗ 外れ"}</span>
                      {isBuy && (
                        <span style={{ fontWeight: 700, color: e.pnl > 0 ? "#34d399" : e.pnl < 0 ? "#fca5a5" : "inherit" }}>
                          {e.pnl > 0 ? "+" : ""}{e.pnl ? yen(e.pnl) : "—"}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 9, opacity: 0.5, marginTop: 3, fontFamily: "monospace" }}>
                    hash: {b.hash}
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, fontSize: 11, opacity: 0.6 }}>
              該当エントリなし
            </div>
          )}

          {filtered.length > showLimit && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button onClick={() => setShowLimit(showLimit + 50)} style={ghostBtn}>
                + さらに 50 件表示 ({filtered.length - showLimit} 件残り)
              </button>
            </div>
          )}
        </section>

        {/* === 第三者検証手順 === */}
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🔍 第三者検証の手順</h2>
          <div style={{
            padding: 12, borderRadius: 6,
            background: "rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11, lineHeight: 1.7,
          }}>
            <ol style={{ paddingLeft: 18 }}>
              <li>上の「📥 JSON」 ボタンでログ全件をダウンロード</li>
              <li>JSON ファイルの <code>integrity.valid</code> が <code>true</code> なら改ざんなし</li>
              <li><code>log[i].entry</code> をハッシュ関数 (djb2 / quickHash) に通し、 <code>JSON.stringify(entry) + prevHash + appendedAt</code> を文字列結合した値のハッシュが <code>log[i].hash</code> と一致することを確認</li>
              <li>ハッシュ関数の実装はソースコード公開: <a href={GITHUB_URL + "/blob/main/src/lib/immutableLog.js"} target="_blank" rel="noopener noreferrer" style={{ color: "#bae6fd" }}>immutableLog.js</a></li>
              <li>結果との照合は boatrace.jp の公式結果ページで確認可</li>
            </ol>
          </div>
        </section>

        {/* === フッタ === */}
        <div style={{
          fontSize: 10, opacity: 0.6, lineHeight: 1.7,
          textAlign: "center", marginTop: 24, paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          このログは append-only — 削除・編集不可。 仮データ起源 (API 失敗時の fallback) は除外。<br/>
          ソースコード: <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#bae6fd", textDecoration: "underline" }}>{GITHUB_URL}</a><br/>
          公営競技は 20 歳以上のみ / 依存症相談: 厚生労働省 0570-061-330
        </div>
      </div>
    </div>
  );
}

/* === 巨大数値カード (ヒーローセクション用) === */
function HeroNumber({ label, value, color, sub }) {
  return (
    <div style={{
      padding: "12px 8px", borderRadius: 8,
      background: "rgba(0,0,0,0.22)",
      border: "1px solid rgba(255,255,255,0.06)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const ghostBtn = {
  padding: "5px 10px", fontSize: 11, fontWeight: 600,
  borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.03)",
  color: "#cbd5e1", cursor: "pointer",
};
const cellH = {
  padding: "6px 8px", textAlign: "left",
  fontSize: 10, fontWeight: 700,
  color: "#bae6fd", whiteSpace: "nowrap",
};
const cell = {
  padding: "6px 8px", whiteSpace: "nowrap",
};
