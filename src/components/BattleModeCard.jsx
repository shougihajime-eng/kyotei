import { memo, useEffect, useState, useMemo, useRef } from "react";
import { yen, startEpoch } from "../lib/format.js";
import { buildRaceCardUrl } from "../lib/raceLinks.js";
import { analyzePatterns, classifyRaceByPattern } from "../lib/patternAnalysis.js";
import { computeDataConfidence } from "../lib/dataConfidence.js";

/* === Round 119: 買い判定が出た瞬間に音を鳴らす ===
   ・タブが見えている時こそ即気付ける (notifyBuy はタブ可視時は通知しない設計)
   ・1 レースにつき 1 回 (同じレースに対して連打しない)
   ・Web Audio API で短いビープ (外部ファイル不要、 オフラインでも鳴る)
   ・ユーザーが操作 (タップ/クリック) するまで AudioContext は鳴らない (ブラウザ仕様) */
const beepedRaceIds = new Set();
let _audioCtx = null;
function getAudioCtx() {
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _audioCtx = new Ctx();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume?.();
    return _audioCtx;
  } catch { return null; }
}
function playBuyBeep() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // 上昇音 880 → 1320 Hz の 2 連打 (合計 0.45 秒)
  [[880, now, 0.18], [1320, now + 0.20, 0.22]].forEach(([freq, start, dur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}

/**
 * Round 118: 「今、 これに賭けろ」 巨大表示モード
 *
 * 思想:
 *   ・複数候補の中から **最も urgent + 最も信頼できる買い** を 1 件だけ選び、
 *     画面いっぱいに表示する。
 *   ・ユーザーが迷わない。 「これだ」 が 1 秒で分かる。
 *   ・買い判定がない時は何も表示しない (= ノイズなし、 自然に消える)。
 *
 * 選び方:
 *   ・対象: minutesToStart 0-15 + decision="buy"
 *   ・優先順: グレード S > A > B > C > others (高評価ほど信頼)
 *     その中で発走時刻が近いものを優先
 *
 * 表示要素:
 *   ・🟢 今、 これに賭けろ (大見出し)
 *   ・会場 + Rno + 締切時刻
 *   ・残り時間カウントダウン (1 秒刻み)
 *   ・本命買い目 (3連単 1-2-3 など)
 *   ・推奨投資額 (円)
 *   ・EV / オッズ
 *   ・💰 BOATRACE 公式で買う ボタン (Round 118 Task 3)
 */
const ODDS_STABLE_MINUTES = 15;

export default memo(BattleModeCard);

function BattleModeCard({ races, recommendations, onPickRace, predictions, evals, profile }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Round 146: 3 状態 (今/次/なし) で常に「買い指示」 を表示
     - 今 (0-15 分): 既存の派手表示
     - 次 (15 分-6 時間): 「次の勝負レース」 として中期予告
     - なし: 「今日はもう買い指示なし」 をハッキリ表示
     Round 152: pending (データ取得待ち) もカウントしてフォールバック強化 */
  const NEXT_HORIZON_MIN = 360; // 6 時間先まで「次」 として扱う
  const battleState = useMemo(() => {
    if (!races || !recommendations) return { kind: "none", buyToday: 0, pendingFuture: 0, totalFuture: 0, nowBest: null, nextBest: null };
    let nowBest = null;
    let nextBest = null;
    let buyToday = 0;
    let pendingFuture = 0;  // 発走後にまだデータ未取得 (評価対象になりそうなレース)
    let totalFuture = 0;    // 発走前のレース総数
    for (const r of races) {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) continue;
      const minutesToStart = (e - now) / 60000;
      if (minutesToStart <= 0) continue;
      totalFuture++;
      const rec = recommendations[r.id];
      // データが揃っていない / 未評価レース (= 後ほど buy 候補化する可能性あり)
      const hasBoats = Array.isArray(r.boats) && r.boats.length > 0;
      if (!hasBoats || !rec) {
        pendingFuture++;
      }
      if (rec?.decision !== "buy") continue;
      buyToday++;
      const gradeRank = ({ S: 4, A: 3, B: 2, C: 1 }[rec.grade]) || 0;
      if (minutesToStart <= ODDS_STABLE_MINUTES) {
        const score = gradeRank * 1000 + (ODDS_STABLE_MINUTES - minutesToStart);
        if (!nowBest || score > nowBest.score) {
          nowBest = { race: r, rec, minutesToStart, score };
        }
      } else if (minutesToStart <= NEXT_HORIZON_MIN) {
        const score = gradeRank * 1000 + (NEXT_HORIZON_MIN - minutesToStart);
        if (!nextBest || score > nextBest.score) {
          nextBest = { race: r, rec, minutesToStart, score };
        }
      }
    }
    if (nowBest) return { kind: "now", buyToday, pendingFuture, totalFuture, nowBest, nextBest };
    if (nextBest) return { kind: "next", buyToday, pendingFuture, totalFuture, nowBest: null, nextBest };
    return { kind: "none", buyToday, pendingFuture, totalFuture, nowBest: null, nextBest: null };
  }, [races, recommendations, now]);
  // 既存の "battle" 互換 (now 状態のみ)
  const battle = battleState.nowBest;

  // Round 119: battle 出現時 (= 買い判定が表示された瞬間) に 1 回ビープ音
  const lastBeepRef = useRef(null);
  useEffect(() => {
    if (!battle?.race?.id) return;
    const id = battle.race.id;
    if (lastBeepRef.current === id) return;
    if (beepedRaceIds.has(id)) return;
    lastBeepRef.current = id;
    beepedRaceIds.add(id);
    // 少しだけ遅延して鳴らす (描画と同時の方が自然)
    const t = setTimeout(() => playBuyBeep(), 120);
    return () => clearTimeout(t);
  }, [battle?.race?.id]);

  /* Round 139: 得意/苦手パターンマッチ */
  const patternResult = useMemo(() => {
    if (!battle?.race || !predictions || !profile) return null;
    const analyzed = analyzePatterns(predictions);
    if (!analyzed.hasEnough) return null;
    const ev = evals?.[battle.race.id];
    return classifyRaceByPattern(battle.race, ev, profile, analyzed);
  }, [battle?.race, predictions, evals, profile]);

  /* Round 147: 予想データの厚さ (★1〜5) */
  const dataConf = useMemo(() => {
    if (!battle?.race) return null;
    return computeDataConfidence(battle.race);
  }, [battle?.race]);

  /* Round 148: 「次の勝負レース」 を 「今」 と同等の派手さに引き上げ */
  if (battleState.kind === "next") {
    const { race, rec, minutesToStart } = battleState.nextBest;
    const m = Math.floor(minutesToStart);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const timeLabel = h > 0 ? `あと ${h}時間${mm}分` : `あと ${mm}分`;
    const voteUrl = buildRaceCardUrl(race.jcd, race.date, race.raceNo);
    const accent = "#22D3EE";
    return (
      <section style={{
        padding: "24px 22px 20px",
        borderRadius: 18,
        background:
          "linear-gradient(135deg, rgba(34, 211, 238, 0.30) 0%, rgba(37, 99, 235, 0.16) 100%), " +
          "linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)",
        border: `2px solid ${accent}`,
        boxShadow:
          "0 0 0 1px rgba(34,211,238,0.45) inset, " +
          "0 8px 32px rgba(0,0,0,0.40), " +
          "0 0 80px -10px rgba(34,211,238,0.65)",
        backdropFilter: "blur(12px)",
        minHeight: 360,
        position: "relative",
        animation: "nextPulse 2.4s ease-in-out infinite",
      }}>
        {/* 残り時間バッジ (右上) */}
        <div className="num" style={{
          position: "absolute", top: 12, right: 14,
          background: "rgba(34,211,238,0.22)", color: "#67E8F9",
          padding: "6px 14px", borderRadius: 999,
          fontSize: 13, fontWeight: 800, letterSpacing: "0.02em",
          border: "1.5px solid rgba(34,211,238,0.50)",
          boxShadow: "0 0 16px rgba(34,211,238,0.35)",
        }}>
          {timeLabel}
        </div>

        {/* 大見出し */}
        <div style={{
          fontSize: "min(34px, 8.5vw)", fontWeight: 900,
          color: accent, letterSpacing: "0.005em",
          marginBottom: 6, lineHeight: 1.15,
          textShadow: "0 0 18px rgba(34,211,238,0.55)",
        }}>
          ⚡ 次の勝負レース
        </div>

        {/* 候補件数バッジ */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", marginBottom: 10, borderRadius: 999,
          background: "linear-gradient(135deg, rgba(34,211,238,0.28) 0%, rgba(34,211,238,0.14) 100%)",
          border: "1.5px solid rgba(34,211,238,0.55)",
          color: "#67E8F9", fontSize: 12, fontWeight: 800,
          letterSpacing: "0.02em",
        }}>
          🎯 今日の買い候補 <span className="num">{battleState.buyToday}</span> 件中の最優先
        </div>

        {/* 会場 + Rno + 締切 */}
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, letterSpacing: "0.01em" }}>
          <b style={{ fontSize: 16, color: "var(--text-primary)" }}>
            {race.venue} <span className="num">{race.raceNo}R</span>
          </b>
          <span style={{ marginLeft: 8, opacity: 0.85 }} className="num">
            ({race.startTime} 締切)
          </span>
          {rec.grade && (
            <span className={"pill badge-grade-" + rec.grade} style={{
              marginLeft: 10, fontSize: 11.5, padding: "3px 9px",
              fontWeight: 800, letterSpacing: "0.04em",
            }}>
              {rec.grade}評価
            </span>
          )}
        </div>

        {/* 本命買い目 (巨大表示 — 「今」 と同サイズ) */}
        {rec.main && (
          <div style={{
            background: "rgba(0, 0, 0, 0.38)", borderRadius: 16,
            padding: "20px 16px 18px", textAlign: "center",
            border: `1.5px solid ${accent}66`, marginBottom: 16,
          }}>
            <div style={{
              fontSize: 11, color: "var(--text-tertiary)",
              letterSpacing: "0.10em", textTransform: "uppercase",
              fontWeight: 700, marginBottom: 6,
            }}>
              本命買い目 ({rec.main.kind})
            </div>
            <div className="font-mono" style={{
              fontSize: "min(56px, 14vw)", fontWeight: 900,
              lineHeight: 1.05, letterSpacing: "0.02em",
              color: "var(--text-primary)", marginBottom: 8,
              textShadow: "0 0 22px rgba(34,211,238,0.30)",
            }}>
              {rec.main.combo}
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10, marginTop: 14, paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}>
              <Stat label="投資" value={yen(rec.main.stake)} num color={accent} />
              <Stat label="オッズ" value={`${rec.main.odds?.toFixed(1)}倍`} num />
              <Stat label="EV" value={rec.main.ev?.toFixed(2)} num color="#fde68a" />
            </div>
          </div>
        )}

        {/* 一言理由 */}
        {rec.reason && (
          <div style={{
            fontSize: 12.5, color: "#fde68a", textAlign: "center",
            marginBottom: 14, padding: "8px 12px",
            background: "rgba(0,0,0,0.22)", borderRadius: 10,
            lineHeight: 1.5,
          }}>
            💡 {rec.reason}
          </div>
        )}

        {/* アクションボタン (「今」 と同サイズ) */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => onPickRace?.(race.id)} style={{
            flex: "1 1 140px", minHeight: 48, padding: "12px 16px",
            borderRadius: 12, background: "rgba(255,255,255,0.08)",
            color: "var(--text-primary)", fontWeight: 700, fontSize: 13.5,
            border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer",
          }}>
            📋 詳しく見る
          </button>
          {voteUrl && (
            <a href={voteUrl} target="_blank" rel="noopener noreferrer" style={{
              flex: "1 1 200px", minHeight: 48, padding: "12px 16px",
              borderRadius: 12,
              background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
              color: "#451A03", fontWeight: 800, fontSize: 14.5,
              border: "none", cursor: "pointer", textDecoration: "none",
              textAlign: "center",
              display: "inline-flex", alignItems: "center",
              justifyContent: "center", gap: 6, letterSpacing: "0.01em",
              boxShadow: "0 1px 0 rgba(255,255,255,0.30) inset, 0 4px 14px rgba(245,158,11,0.40)",
            }}>
              💰 BOATRACE 公式で買う <span style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
            </a>
          )}
        </div>
        <div style={{ fontSize: 10.5, opacity: 0.65, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          ※ 公式サイトの該当レースに飛びます。 投票には TELEBOAT の会員ログインが必要です。
        </div>

        <style>{`
          @keyframes nextPulse {
            0%, 100% { box-shadow: 0 0 0 1px rgba(34,211,238,0.45) inset, 0 8px 32px rgba(0,0,0,0.40), 0 0 80px -10px rgba(34,211,238,0.65); }
            50%      { box-shadow: 0 0 0 1px rgba(34,211,238,0.65) inset, 0 8px 40px rgba(0,0,0,0.50), 0 0 120px -5px rgba(34,211,238,0.85); }
          }
        `}</style>
      </section>
    );
  }

  /* Round 149: 「今日は買い指示なし」 を派手な「見送り推奨」 表示に格上げ */
  if (battleState.kind === "none") {
    return (
      <section style={{
        padding: "26px 22px 22px",
        borderRadius: 20,
        background:
          "linear-gradient(135deg, rgba(168, 85, 247, 0.20) 0%, rgba(99, 102, 241, 0.10) 100%), " +
          "linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)",
        border: "2px solid #A855F7",
        boxShadow:
          "0 0 0 1px rgba(168,85,247,0.40) inset, " +
          "0 8px 32px rgba(0,0,0,0.40), " +
          "0 0 80px -12px rgba(168,85,247,0.55)",
        backdropFilter: "blur(12px)",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: "min(36px, 9vw)", fontWeight: 900,
          color: "#D8B4FE", letterSpacing: "0.005em",
          marginBottom: 8, lineHeight: 1.1,
          textShadow: "0 0 22px rgba(216,180,254,0.50)",
        }}>
          🛡️ 今日は見送り推奨
        </div>
        <div style={{
          display: "inline-block",
          padding: "6px 14px", marginBottom: 14, borderRadius: 999,
          background: "rgba(168,85,247,0.20)",
          border: "1.5px solid rgba(168,85,247,0.50)",
          color: "#E9D5FF", fontSize: 13, fontWeight: 800,
          letterSpacing: "0.02em",
        }}>
          AI が期待値プラスのレースを発見できませんでした
        </div>
        <div style={{
          fontSize: "min(20px, 5vw)", fontWeight: 800,
          color: "#F1F5F9", marginBottom: 10, lineHeight: 1.4,
        }}>
          「買わない」 も<br className="sm:hidden" />
          <span style={{ color: "#22F5A8", textShadow: "0 0 12px rgba(34,245,168,0.45)" }}>
            立派な「勝ち」 です。
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.7, padding: "0 8px" }}>
          無理に買うと負けます。 焦らず、 自信のあるレースだけ買いましょう。<br />
          数時間後に新しい買い候補が出るかもしれません ・ 自動で 5 分ごとにチェック中。
        </div>
        {/* Round 152: フォールバック強化 — まだ評価されていないレース数を表示 */}
        {battleState.pendingFuture > 0 && (
          <div style={{
            marginTop: 14, padding: "10px 12px",
            background: "rgba(34,211,238,0.10)", borderRadius: 10,
            border: "1px solid rgba(34,211,238,0.30)",
            fontSize: 12, color: "#67E8F9", lineHeight: 1.6,
          }}>
            ⏳ 今後まだ <b className="num">{battleState.pendingFuture}</b> レース分のデータ取得待ち
            ({battleState.totalFuture} 件中) — 取得が進めば買い候補が増える可能性があります。
          </div>
        )}
      </section>
    );
  }

  /* Round 146: kind === "now" — 以下、 既存の派手表示 */
  const { race, rec, minutesToStart } = battle;
  const main = rec.main;
  const m = Math.max(0, Math.floor(minutesToStart));
  const sec = Math.max(0, Math.floor(minutesToStart * 60) % 60);
  const isVeryUrgent = minutesToStart <= 5;
  const isS = rec.grade === "S";

  // 投票サイトリンク (公式 boatrace.jp の出走表ページ — そこに 「投票」 ボタンあり)
  const voteUrl = buildRaceCardUrl(race.jcd, race.date, race.raceNo);

  const accent = isS ? "#10b981" : "#34d399";
  const accentBg = isS
    ? "linear-gradient(135deg, rgba(16, 185, 129, 0.32) 0%, rgba(6, 95, 70, 0.18) 100%)"
    : "linear-gradient(135deg, rgba(52, 211, 153, 0.22) 0%, rgba(6, 95, 70, 0.14) 100%)";

  return (
    <section style={{
      padding: "24px 22px 20px",
      borderRadius: 18,
      background: `${accentBg}, linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)`,
      border: `2px solid ${accent}`,
      boxShadow: `0 0 0 1px ${accent}40 inset, 0 8px 32px rgba(0, 0, 0, 0.40), 0 0 64px -12px ${accent}66`,
      backdropFilter: "blur(12px)",
      color: "var(--text-primary)",
      minHeight: 360,
      position: "relative",
      animation: isVeryUrgent ? "battlePulse 1.6s ease-in-out infinite" : undefined,
    }}>
      {/* 残り時間バッジ (右上) */}
      <div style={{
        position: "absolute",
        top: 12,
        right: 14,
        background: isVeryUrgent ? "rgba(248,113,113,0.22)" : "rgba(0,0,0,0.40)",
        color: isVeryUrgent ? "#fecaca" : "#fde68a",
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "0.02em",
        border: isVeryUrgent ? "1px solid rgba(248,113,113,0.45)" : "1px solid rgba(255,255,255,0.10)",
      }} className="num">
        {m === 0 ? `あと ${sec} 秒` : `あと ${m} 分`}
      </div>

      {/* メインタイトル */}
      <div style={{
        fontSize: "min(34px, 8.5vw)",
        fontWeight: 900,
        color: accent,
        letterSpacing: "0.005em",
        marginBottom: 6,
        lineHeight: 1.15,
      }}>
        {isS ? "🔥 今、 勝負レース" : "🟢 今、 これに賭けろ"}
      </div>

      {/* Round 139: 得意/苦手パターンバッジ — 過去データに基づく追加情報 */}
      {patternResult?.kind === "best" && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", marginBottom: 10,
          borderRadius: 999,
          background: "linear-gradient(135deg, rgba(16,185,129,0.32) 0%, rgba(16,185,129,0.18) 100%)",
          border: "1.5px solid rgba(16,185,129,0.55)",
          color: "#a7f3d0", fontSize: 12, fontWeight: 800,
          letterSpacing: "0.02em",
        }}>
          💎 あなたの得意パターン (過去 ROI {Math.round(patternResult.roi * 100)}% / {patternResult.count}戦)
        </div>
      )}
      {patternResult?.kind === "worst" && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", marginBottom: 10,
          borderRadius: 999,
          background: "rgba(239,68,68,0.18)",
          border: "1.5px solid rgba(239,68,68,0.45)",
          color: "#fecaca", fontSize: 12, fontWeight: 700,
          letterSpacing: "0.02em",
        }}>
          ⚠️ 過去苦手パターン (ROI {Math.round(patternResult.roi * 100)}% / {patternResult.count}戦) — 慎重に
        </div>
      )}

      {/* Round 147: 予想データの厚さバッジ (★1〜5) */}
      {dataConf && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", marginBottom: 10, marginLeft: patternResult ? 8 : 0,
          borderRadius: 999,
          background: dataConf.stars >= 4 ? "rgba(16,185,129,0.18)"
                    : dataConf.stars >= 3 ? "rgba(34,211,238,0.18)"
                    : dataConf.stars >= 2 ? "rgba(245,158,11,0.18)"
                    : "rgba(239,68,68,0.18)",
          border: `1.5px solid ${
            dataConf.stars >= 4 ? "rgba(16,185,129,0.50)"
            : dataConf.stars >= 3 ? "rgba(34,211,238,0.50)"
            : dataConf.stars >= 2 ? "rgba(245,158,11,0.50)"
            : "rgba(239,68,68,0.50)"
          }`,
          color: dataConf.stars >= 4 ? "#a7f3d0"
               : dataConf.stars >= 3 ? "#67E8F9"
               : dataConf.stars >= 2 ? "#fcd34d"
               : "#fecaca",
          fontSize: 12, fontWeight: 800, letterSpacing: "0.05em",
        }}>
          📊 {"★".repeat(dataConf.stars)}{"☆".repeat(5 - dataConf.stars)} データ {dataConf.sources.length}/9 種
        </div>
      )}

      {/* 会場 R 番号 + 締切 */}
      <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, letterSpacing: "0.01em" }}>
        <b style={{ fontSize: 16, color: "var(--text-primary)" }}>
          {race.venue} <span className="num">{race.raceNo}R</span>
        </b>
        <span style={{ marginLeft: 8, opacity: 0.85 }} className="num">
          ({race.startTime} 締切)
        </span>
        {rec.grade && (
          <span className={"pill badge-grade-" + rec.grade} style={{
            marginLeft: 10,
            fontSize: 11.5,
            padding: "3px 9px",
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}>
            {rec.grade}評価
          </span>
        )}
      </div>

      {/* 本命買い目 (巨大表示) */}
      {main && (
        <div style={{
          background: "rgba(0, 0, 0, 0.38)",
          borderRadius: 16,
          padding: "20px 16px 18px",
          textAlign: "center",
          border: `1.5px solid ${accent}66`,
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 6,
          }}>
            本命買い目 ({main.kind})
          </div>
          <div className="font-mono" style={{
            fontSize: "min(56px, 14vw)",
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "0.02em",
            color: "var(--text-primary)",
            marginBottom: 8,
          }}>
            {main.combo}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
            <Stat label="投資" value={yen(main.stake)} num color={accent} />
            <Stat label="オッズ" value={`${main.odds?.toFixed(1)}倍`} num />
            <Stat label="EV" value={main.ev?.toFixed(2)} num color="#fde68a" />
          </div>
        </div>
      )}

      {/* 一言理由 */}
      {rec.reason && (
        <div style={{
          fontSize: 12.5,
          color: "#fde68a",
          textAlign: "center",
          marginBottom: 14,
          padding: "8px 12px",
          background: "rgba(0, 0, 0, 0.22)",
          borderRadius: 10,
          lineHeight: 1.5,
        }}>
          💡 {rec.reason}
        </div>
      )}

      {/* アクションボタン: 詳細を見る + BOATRACE 公式で買う */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onPickRace?.(race.id)}
          style={{
            flex: "1 1 140px",
            minHeight: 48,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(255, 255, 255, 0.08)",
            color: "var(--text-primary)",
            fontWeight: 700,
            fontSize: 13.5,
            border: "1px solid rgba(255, 255, 255, 0.18)",
            cursor: "pointer",
          }}>
          📋 詳しく見る
        </button>
        {voteUrl && (
          <a
            href={voteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: "1 1 200px",
              minHeight: 48,
              padding: "12px 16px",
              borderRadius: 12,
              background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
              color: "#451A03",
              fontWeight: 800,
              fontSize: 14.5,
              border: "none",
              cursor: "pointer",
              textDecoration: "none",
              textAlign: "center",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              letterSpacing: "0.01em",
              boxShadow: "0 1px 0 rgba(255, 255, 255, 0.30) inset, 0 4px 14px rgba(245, 158, 11, 0.40)",
            }}>
            💰 BOATRACE 公式で買う <span style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
          </a>
        )}
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.65, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
        ※ 公式サイトの該当レースに飛びます。 投票には TELEBOAT の会員ログインが必要です。
      </div>

      <style>{`
        @keyframes battlePulse {
          0%, 100% { box-shadow: 0 0 0 1px ${accent}40 inset, 0 8px 32px rgba(0, 0, 0, 0.40), 0 0 64px -12px ${accent}66; }
          50%      { box-shadow: 0 0 0 1px ${accent}80 inset, 0 8px 40px rgba(0, 0, 0, 0.50), 0 0 96px -8px ${accent}; }
        }
      `}</style>
    </section>
  );
}

function Stat({ label, value, num, color }) {
  return (
    <div>
      <div style={{
        fontSize: 9.5,
        color: "var(--text-tertiary)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 600,
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div
        className={num ? "num" : ""}
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: color || "var(--text-primary)",
          letterSpacing: "0.005em",
          lineHeight: 1.2,
        }}>
        {value}
      </div>
    </div>
  );
}
