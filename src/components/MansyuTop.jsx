/**
 * 万舟研究所 — トップ画面 (Round 188 リファイン版)
 *
 * 「荒れる時だけ」表示する。
 * - 荒れスコア 85+: 激荒れ警報 (赤)
 * - 荒れスコア 75-84: 荒れ注意 (黄)
 * - それ以外: 表示しない
 *
 * Round 188 構成 (SPEC §0.1, §4, §8):
 *   ① MonitorStatusBar (細い帯) — 監視中・5場巡回・更新時刻・本日件数
 *   ② PrimaryBattleCard (超大判) — 最優先 1 レース。買い目を最大表示
 *   ③ 残りの勝負レース (RaceCard 縦並び)
 *
 * Phase 2 (Round 164): 見送りログ — 全レース記録 + 結果突合 (内部・学習データ)
 * Round 185 (SPEC §13.1): 買い目スナップショット保存 (バックテスト・virtualPnl 用)
 */
import { useEffect, useMemo, useState } from "react";
import {
  scoreMansyu,
  buildMansyuBuyOrders,
  buildMansyuReasonLines,
  minutesToClose,
  formatMinutesToClose,
  levelLabel,
  levelColor,
} from "../lib/mansyu.js";
import {
  recordBatch as recordJudgementBatch,
  attachResultsBatch,
  attachBuyOrdersBatch,
} from "../lib/mansyuSkipLog.js";
import PrimaryBattleCard from "./PrimaryBattleCard.jsx";
import MonitorStatusBar from "./MonitorStatusBar.jsx";

/* Round 188: STALE/VERY_STALE 判定は MonitorStatusBar 側に移動済み */

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

  /* Phase 2: races が更新されるたびに見送りログを記録 (内部・学習データ用)。
     ① 全レースのスコアを記録 (75+ は 「show」 / 未満は 「skip」)
     ② 結果が乗っているレースは万舟見逃し判定して finalized 化
     SPEC §5/§7: ユーザー画面に件数バッジは出さない。 研究所タブで参照用。 */
  useEffect(() => {
    if (!Array.isArray(races) || races.length === 0) return;
    try {
      recordJudgementBatch(races, scoreMansyu);
      attachResultsBatch(races);
      // Round 185: show 判定レースの買い目スナップショットを記録 (バックテスト・virtualPnl 用)
      attachBuyOrdersBatch(races, (race) => {
        const sr = scoreMansyu(race);
        if (!sr) return [];
        return buildMansyuBuyOrders(race, sr);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[MansyuTop] skip log update failed:", e);
    }
  }, [races]);

  const alarms = scored.filter((x) => x.result.level === "alarm");
  const warns  = scored.filter((x) => x.result.level === "warn");

  /* Round 190: 「本日の勝負レース」 を TOP3 並列に拡張。
     alarms (激荒れ 85+) を優先、 次に warns (荒れ注意 75-84)。 締切が近い順。
     - 1 件: 全幅大判 / 2 件: PC 2 列 / 3 件以上: PC 3 列・4 件目以降は「そのほか」 へ */
  const prioritized = [...alarms, ...warns]; // すでに締切順 (scored は close で sort 済)
  const top3 = prioritized.slice(0, 3);
  const top3Ids = new Set(top3.map((x) => x.race.id));
  const rest = scored.filter((x) => !top3Ids.has(x.race.id));
  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div style={{
      maxWidth: 1280, margin: "0 auto",
      padding: "8px clamp(8px, 2vw, 18px) 0",
    }}>
      {/* ===== ブランドバナー (コンパクト化) ===== */}
      <div style={{
        background: "linear-gradient(135deg, #0a0e1a 0%, #15172a 100%)",
        border: "1.5px solid rgba(251, 191, 36, 0.30)",
        borderRadius: 12,
        padding: "8px 14px",
        marginBottom: 8,
        boxShadow: "0 2px 10px rgba(220, 38, 38, 0.10)",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 22 }}>🌊</span>
        <div style={{
          fontSize: 20, fontWeight: 800, color: "#FBBF24",
          letterSpacing: "0.02em", lineHeight: 1.0,
        }}>万舟研究所</div>
        <div style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 500 }}>
          荒れる時だけ・5場限定
        </div>
        <div style={{ flex: 1 }} />
        {top3.length > 0 && (
          <div style={{
            fontSize: 12, color: "#FCA5A5", fontWeight: 700,
            padding: "3px 10px", borderRadius: 999,
            background: "rgba(220, 38, 38, 0.15)",
            border: "1.5px solid rgba(220, 38, 38, 0.40)",
          }}>
            🚨 勝負 <b className="num">{alarms.length + warns.length}</b> レース
          </div>
        )}
      </div>

      {/* ===== 監視ステータスバー (細い帯) ===== */}
      <MonitorStatusBar
        refreshing={refreshing}
        refreshMsg={refreshMsg}
        lastRefreshAt={lastRefreshAt}
        nextRefreshAt={nextRefreshAt}
        refreshError={refreshError}
        onRefresh={onRefresh}
        isSampleMode={isSampleMode}
        todayDate={todayDate}
      />

      {/* ===== 本日の勝負レース TOP3 ===== */}
      {top3.length > 0 && (
        <div style={{
          marginBottom: 14,
        }}>
          {/* セクションヘッダー */}
          <div style={{ marginBottom: 8, padding: "0 4px", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#f1f5f9", letterSpacing: "0.02em" }}>
              🎯 本日の勝負レース
            </div>
            <div style={{ fontSize: 12.5, color: "#cbd5e1" }}>
              {top3.length === 1 ? "1 レース・締切が近い順" : `TOP ${top3.length} レース・締切が近い順`}
            </div>
          </div>
          {/* TOP3 grid: 1 件なら全幅、 2 件で 2 列、 3 件で 3 列 (PC ワイド時) / スマホは縦並び */}
          <div style={{
            display: "grid",
            gridTemplateColumns: top3.length === 1
              ? "1fr"
              : "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
            gap: 12,
          }}>
            {top3.map((x) => (
              <PrimaryBattleCard
                key={x.race.id}
                race={x.race}
                result={x.result}
                close={x.close}
                onPickRace={onPickRace}
              />
            ))}
          </div>
        </div>
      )}

      {/* ===== そのほかの勝負レース (4 件目以降) ===== */}
      {rest.length > 0 && (
        <Section
          title={top3.length > 0 ? "📋 そのほかの勝負レース" : "📋 勝負レース"}
          subtitle={`残り ${rest.length} レース — 締切が近い順`}>
          <CardGrid>
            {rest.map((x) => (
              <RaceCard
                key={x.race.id}
                race={x.race}
                result={x.result}
                close={x.close}
                onPickRace={onPickRace}
              />
            ))}
          </CardGrid>
        </Section>
      )}

      {/* ===== 何もない時 ===== */}
      {scored.length === 0 && (
        <div style={{
          marginTop: 12,
          padding: "28px 18px",
          textAlign: "center",
          borderRadius: 14,
          background: "linear-gradient(180deg, rgba(34, 211, 238, 0.04) 0%, rgba(0,0,0,0.20) 100%)",
          border: "1px dashed rgba(103, 232, 249, 0.30)",
          color: "#cbd5e1",
        }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🌙</div>
          <div style={{
            fontSize: 20, fontWeight: 800, color: "#e2e8f0",
            marginBottom: 6, letterSpacing: "0.02em",
          }}>
            今は荒れそうなレースなし
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#cbd5e1" }}>
            {Array.isArray(races) && races.length > 0
              ? <>5 場 (戸田・江戸川・平和島・鳴門・桐生) を監視しましたが、<br />荒れスコア 75 以上はまだ出ていません。</>
              : "「🔄 今すぐ更新」 を押して、 今日の対象 5 場を取得してください。"}
            <br /><br />
            <span style={{ fontSize: 12, opacity: 0.85 }}>
              30 秒ごとに自動巡回中 — 条件が揃ったレースだけ最上部に表示されます。
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* === Round 188: UpdateStatus / Hero / TapButton は MonitorStatusBar + PrimaryBattleCard に統合済み === */

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 10, padding: "0 4px" }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#f1f5f9", letterSpacing: "0.02em" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "#cbd5e1", marginTop: 3 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function CardGrid({ children }) {
  return (
    <div style={{
      display: "grid",
      // Round 183: PC 最適化。 1 列 (スマホ) / 2 列 (タブレット) / 3 列 (PC ワイド) 自動切替。
      // minmax 380px で PC 3 列、 タブレットで 2 列、 スマホで 1 列に自然に折り返す。
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
      gap: 12,
    }}>
      {children}
    </div>
  );
}

/* ===== レースカード ===== */
function RaceCard({ race, result, close, onPickRace }) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const color = levelColor(result.level);
  const label = levelLabel(result.level);
  const buyOrders = useMemo(() => buildMansyuBuyOrders(race, result), [race, result]);
  const reasonLines = useMemo(() => buildMansyuReasonLines(result, 3), [result]);
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
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", lineHeight: 1.0 }}>
            {race.venue} <span style={{ fontSize: 32, color, marginLeft: 2 }}>{race.raceNo}R</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#cbd5e1", marginTop: 4, fontWeight: 600 }}>
            発走 {race.startTime || "—"}
          </div>
        </div>
        <div
          className={close != null && close <= 5 && close >= -1 ? "mansyu-blink" : ""}
          style={{
            padding: "8px 14px", borderRadius: 999,
            background: closeBg, color: "#fff",
            fontSize: 15, fontWeight: 800, lineHeight: 1.1,
            boxShadow: close != null && close <= 5 ? "0 0 10px rgba(220, 38, 38, 0.55)" : "none",
          }}>
          ⏱ {closeText}
        </div>
        <div style={{ flex: "1 1 0", minWidth: 4 }} />
        <div
          className={isAlarm ? "mansyu-pulse" : ""}
          style={{
            padding: "8px 16px", borderRadius: 12,
            background: color, color: "#fff",
            fontSize: 14, fontWeight: 800, letterSpacing: "0.04em",
            lineHeight: 1.1,
          }}>
          {isAlarm ? "🚨 " : "⚠️ "}{label}
        </div>
        <div
          className={isAlarm ? "mansyu-glow" : ""}
          style={{
            padding: "8px 14px", borderRadius: 12,
            background: "rgba(0,0,0,0.40)",
            border: `2px solid ${color}77`,
            color: "#fff",
            display: "flex", alignItems: "baseline", gap: 3,
          }}>
          <span style={{ color, fontSize: 36, fontWeight: 800, lineHeight: 1.0 }}>{result.score}</span>
          <span style={{ fontSize: 13, opacity: 0.75 }}>/100</span>
        </div>
      </div>

      {/* === 万舟期待度 + 注目艇 === */}
      <div style={{ padding: "0 16px 12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>万舟期待度</div>
        <div style={{ fontSize: 22, color: "#FBBF24", letterSpacing: "0.12em", fontWeight: 700, lineHeight: 1.0 }}>{result.mansyuRating}</div>
        {result.focus.length > 0 && (
          <>
            <div style={{ width: 1, height: 16, background: "rgba(148, 163, 184, 0.40)" }} />
            <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>注目</div>
            {result.focus.slice(0, 3).map((f) => (
              <span key={f.boatNo} style={{
                padding: "5px 12px", borderRadius: 999,
                background: "rgba(34, 211, 238, 0.14)",
                border: "1.5px solid rgba(34, 211, 238, 0.50)",
                color: "#67E8F9", fontSize: 14, fontWeight: 700,
              }}>
                {f.boatNo}号艇 {f.racer || ""}
              </span>
            ))}
          </>
        )}
      </div>

      {/* === 理由 3 行 (Round 175 / SPEC §4 「折りたたまずに常時表示」) === */}
      <div style={{
        margin: "0 16px 12px 16px", padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.35)",
        borderLeft: `4px solid ${color}`,
      }}>
        <div style={{ fontSize: 11.5, color: "#cbd5e1", marginBottom: 6, fontWeight: 700, letterSpacing: "0.04em" }}>
          💡 なぜこのレースか
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {reasonLines.map((line, i) => (
            <div key={i} style={{
              fontSize: 14, color: "#e2e8f0", lineHeight: 1.5, fontWeight: 500,
              display: "flex", gap: 8, alignItems: "baseline",
            }}>
              <span style={{ color, fontWeight: 800, flex: "0 0 auto" }}>•</span>
              <span style={{ flex: 1 }}>{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* === 買い目 (Round 173: 5,000 円配分) === */}
      {buyOrders.length > 0 && (
        <div style={{ margin: "0 16px 14px 16px" }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: 8, gap: 8, flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 700, letterSpacing: "0.04em" }}>
              買い目 ({buyOrders.length} 点)
            </div>
            <div style={{ fontSize: 12.5, color: "#FCD34D", fontWeight: 800, letterSpacing: "0.02em" }}>
              合計 <span className="num">5,000</span> 円
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {buyOrders.map((o, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(34, 211, 238, 0.10)",
                border: "1.5px solid rgba(34, 211, 238, 0.32)",
                flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#67E8F9", letterSpacing: "0.06em", lineHeight: 1.0 }}>
                  {o.combo.join("-")}
                </div>
                <div style={{
                  fontSize: 11, color: "#cbd5e1", fontWeight: 700,
                  padding: "2px 8px", borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                }}>{o.kind}</div>
                {o.stake != null && (
                  <div style={{
                    fontSize: 14, color: "#FCD34D", fontWeight: 800,
                    padding: "2px 10px", borderRadius: 999,
                    background: "rgba(251, 191, 36, 0.14)",
                    border: "1px solid rgba(251, 191, 36, 0.40)",
                    letterSpacing: "0.02em",
                  }}>
                    <span className="num">{o.stake.toLocaleString("ja-JP")}</span> 円
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 120, fontSize: 12.5, color: "#cbd5e1", textAlign: "right", lineHeight: 1.4 }}>
                  {o.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === 折りたたみ詳細 (Round 178: タップ領域 + アニメ強化) === */}
      <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.20)" }}>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          style={{
            width: "100%", padding: "16px 16px", minHeight: 56, // 48 → 56 (片手親指最適)
            background: "transparent", border: 0,
            color: "#cbd5e1", fontSize: 14, fontWeight: 700,
            cursor: "pointer", textAlign: "left",
            display: "flex", alignItems: "center", gap: 8,
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}>
          <span style={{
            fontSize: 16,
            display: "inline-block",
            transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}>▶</span>
          <span>詳しい荒れ条件 (スコア内訳・気象・外部リンク)</span>
        </button>
        <div style={{
          maxHeight: open ? 2000 : 0,
          overflow: "hidden",
          transition: "max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          <div style={{ padding: "0 16px 14px 16px" }}>
            <ScoreBreakdown parts={result.parts} boost={result.boost} />
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.25)" }}>
              <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 6, fontWeight: 700 }}>気象 / 水面</div>
              <div style={{ fontSize: 14, color: "#e2e8f0" }}>
                {race.weather || "—"} / 風 <b className="num">{race.wind ?? "—"}</b>m{race.windDir ? ` (${race.windDir})` : ""} / 波 <b className="num">{race.wave ?? "—"}</b>cm
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <DetailLink label="📋 出走表" race={race} kind="program" />
              <DetailLink label="💰 オッズ" race={race} kind="odds" />
              <DetailLink label="🌊 直前情報" race={race} kind="beforeinfo" />
              <DetailLink label="🏁 結果" race={race} kind="result" />
              {onPickRace && (
                /* Round 166: 荒れスコアの詳細 (レーダーチャート) を開く。
                   Round 171: 「📊 一覧で見る」 ボタンは SPEC §6 で「📋 一覧」 タブ廃止に伴い削除。 */
                <button
                  onClick={() => onPickRace(race.id)}
                  style={{
                    padding: "10px 14px", minHeight: 44, borderRadius: 10,
                    background: "rgba(251, 191, 36, 0.14)",
                    border: "1.5px solid rgba(251, 191, 36, 0.45)",
                    color: "#FCD34D", fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                    touchAction: "manipulation",
                  }}>
                  🔬 詳しく見る
                </button>
              )}
            </div>
          </div>
        </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: r.reasons.length ? 6 : 0 }}>
            <div style={{ flex: 1, fontSize: 14, color: "#e2e8f0", fontWeight: 700 }}>{r.label}</div>
            <div style={{
              padding: "4px 12px", borderRadius: 999,
              background: r.score === 0 ? "#475569" : r.score >= r.max * 0.7 ? "#DC2626" : "#F59E0B",
              color: "#fff", fontSize: 13, fontWeight: 800,
            }}>
              {r.score}/{r.max}
            </div>
          </div>
          {r.reasons.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.55 }}>
              {r.reasons.join(" / ")}
            </div>
          )}
        </div>
      ))}
      {boost > 0 && (
        <div style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(220, 38, 38, 0.18)",
          border: "1.5px solid rgba(220, 38, 38, 0.50)",
        }}>
          <div style={{ fontSize: 14, color: "#FCA5A5", fontWeight: 800 }}>
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
