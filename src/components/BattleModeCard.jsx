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
     - なし: 「今日はもう買い指示なし」 をハッキリ表示 */
  const NEXT_HORIZON_MIN = 360; // 6 時間先まで「次」 として扱う
  const battleState = useMemo(() => {
    if (!races || !recommendations) return { kind: "none", buyToday: 0, nowBest: null, nextBest: null };
    let nowBest = null;
    let nextBest = null;
    let buyToday = 0;
    for (const r of races) {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) continue;
      const minutesToStart = (e - now) / 60000;
      if (minutesToStart <= 0) continue;
      const rec = recommendations[r.id];
      if (rec?.decision !== "buy") continue;
      buyToday++;
      const gradeRank = ({ S: 4, A: 3, B: 2, C: 1 }[rec.grade]) || 0;
      if (minutesToStart <= ODDS_STABLE_MINUTES) {
        // 今 (0-15 分): 高グレード優先 + 締切近い順
        const score = gradeRank * 1000 + (ODDS_STABLE_MINUTES - minutesToStart);
        if (!nowBest || score > nowBest.score) {
          nowBest = { race: r, rec, minutesToStart, score };
        }
      } else if (minutesToStart <= NEXT_HORIZON_MIN) {
        // 次 (15 分 - 6 時間): 高グレード優先 + 早い時刻順
        const score = gradeRank * 1000 + (NEXT_HORIZON_MIN - minutesToStart);
        if (!nextBest || score > nextBest.score) {
          nextBest = { race: r, rec, minutesToStart, score };
        }
      }
    }
    if (nowBest) return { kind: "now", buyToday, nowBest, nextBest };
    if (nextBest) return { kind: "next", buyToday, nowBest: null, nextBest };
    return { kind: "none", buyToday, nowBest: null, nextBest: null };
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

  /* Round 146: 「次の勝負レース」 表示 (15 分-6 時間先) */
  if (battleState.kind === "next") {
    const { race, rec, minutesToStart } = battleState.nextBest;
    const m = Math.floor(minutesToStart);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const timeLabel = h > 0 ? `あと ${h} 時間 ${mm} 分` : `あと ${mm} 分`;
    const voteUrl = buildRaceCardUrl(race.jcd, race.date, race.raceNo);
    return (
      <section style={{
        padding: "20px 20px 18px",
        borderRadius: 18,
        background:
          "linear-gradient(135deg, rgba(34, 211, 238, 0.16) 0%, rgba(37, 99, 235, 0.08) 100%), " +
          "linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)",
        border: "2px solid #22D3EE",
        boxShadow: "0 0 0 1px rgba(34,211,238,0.30) inset, 0 8px 32px rgba(0,0,0,0.40), 0 0 64px -12px rgba(34,211,238,0.40)",
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ fontSize: 11.5, color: "#67E8F9", fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
          🟡 次の勝負レース
        </div>
        <div style={{ fontSize: "min(28px, 7.5vw)", fontWeight: 900, color: "#F1F5F9", lineHeight: 1.15, marginBottom: 8 }}>
          {race.venue} <span className="num">{race.raceNo}R</span>
          <span style={{ marginLeft: 10, fontSize: 14, color: "#94A3B8", fontWeight: 600 }} className="num">
            {race.startTime}締切
          </span>
        </div>
        <div className="num" style={{
          display: "inline-block", padding: "6px 14px", marginBottom: 12,
          borderRadius: 999, background: "rgba(34,211,238,0.18)",
          border: "1px solid rgba(34,211,238,0.40)", color: "#67E8F9",
          fontSize: 14, fontWeight: 800,
        }}>
          {timeLabel}
        </div>
        {rec.main && (
          <div style={{ background: "rgba(0,0,0,0.30)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, color: "#94A3B8", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
              本命 ({rec.main.kind})
            </div>
            <div className="font-mono num" style={{ fontSize: "min(36px, 9vw)", fontWeight: 900, letterSpacing: "0.02em" }}>
              {rec.main.combo}
            </div>
            <div className="num" style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
              投資 {yen(rec.main.stake)} / EV {rec.main.ev?.toFixed(2)}
            </div>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 10 }}>
          ※今日の買い候補 <b className="num text-brand">{battleState.buyToday}</b> 件中、 最優先のレースです。
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onPickRace?.(race.id)} style={{
            flex: "1 1 140px", minHeight: 44, padding: "10px 14px",
            borderRadius: 12, background: "rgba(255,255,255,0.08)",
            color: "#F1F5F9", fontWeight: 700, fontSize: 13,
            border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer",
          }}>
            📋 詳しく見る
          </button>
          {voteUrl && (
            <a href={voteUrl} target="_blank" rel="noopener noreferrer" style={{
              flex: "1 1 180px", minHeight: 44, padding: "10px 14px",
              borderRadius: 12, background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
              color: "#451A03", fontWeight: 800, fontSize: 13.5,
              textDecoration: "none", textAlign: "center",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 12px rgba(245,158,11,0.34)",
            }}>
              💰 公式で買う ↗
            </a>
          )}
        </div>
      </section>
    );
  }

  /* Round 146: 「今日は買い指示なし」 表示 */
  if (battleState.kind === "none") {
    return (
      <section style={{
        padding: "18px 20px",
        borderRadius: 18,
        background: "linear-gradient(180deg, rgba(11, 18, 32, 0.96) 0%, rgba(8, 15, 28, 0.96) 100%)",
        border: "1.5px solid rgba(255,255,255,0.10)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "min(22px, 5.5vw)", fontWeight: 800, color: "#F1F5F9", marginBottom: 6 }}>
          ⚪ 今日はもう買い指示なし
        </div>
        <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>
          AI が「期待値プラスに買えるレース」 を見つけられませんでした。<br />
          <b style={{ color: "#67E8F9" }}>「買わない」 も立派な選択</b> — 焦らず明日に賭けましょう。
        </div>
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
