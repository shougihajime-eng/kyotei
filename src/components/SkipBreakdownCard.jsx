import { useMemo } from "react";

/**
 * Round 150: スキップ内訳の見える化 (SkipBreakdownCard)
 *
 * 思想:
 *   ・「今日 buy 候補が出ない」 という時に 「全 N レース中、 buy X 件、 skip Y 件、 待機 Z 件」 を即見える化
 *   ・主要 skip 理由 Top 3 を表示 → どのゲートで多く落ちているか分かる
 *   ・データ取得不足 (出走表/オッズなし) の件数も別カウント
 *   ・「全部 skip = 異常」 が即気付けるように
 */
export default function SkipBreakdownCard({ races, recommendations }) {
  const stats = useMemo(() => {
    if (!races || races.length === 0 || !recommendations) return null;
    let buy = 0, skip = 0, pending = 0, finished = 0;
    const skipCounts = {};
    for (const r of races) {
      const rec = recommendations[r.id];
      if (r.apiResult?.first || r.result?.first) {
        finished++;
        continue;
      }
      if (!rec) {
        pending++;
        continue;
      }
      if (rec.decision === "buy") {
        buy++;
      } else if (rec.decision === "skip") {
        skip++;
        // skip の主因をカウント (主要キーワードで分類)
        const reason = rec.reason || (rec.reasons || [])[0] || "その他";
        const cat = categorize(reason);
        skipCounts[cat] = (skipCounts[cat] || 0) + 1;
      } else {
        pending++;
      }
    }
    const total = races.length;
    const topSkip = Object.entries(skipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { total, buy, skip, pending, finished, topSkip };
  }, [races, recommendations]);

  if (!stats || stats.total === 0) return null;
  const { total, buy, skip, pending, finished, topSkip } = stats;

  // buy が極端に少ない時 (= 全レース対象で 0 件) は赤バナー、 ある程度なら通常表示
  const isAlarmingZero = buy === 0 && (skip + pending) >= 30;

  return (
    <section style={{
      padding: "16px 18px",
      borderRadius: 14,
      background: isAlarmingZero
        ? "linear-gradient(135deg, rgba(239,68,68,0.16) 0%, rgba(11,18,32,0.96) 100%)"
        : "linear-gradient(180deg, rgba(11,18,32,0.96) 0%, rgba(8,15,28,0.96) 100%)",
      border: isAlarmingZero ? "2px solid #EF4444" : "1px solid rgba(255,255,255,0.08)",
      boxShadow: isAlarmingZero ? "0 0 32px -8px rgba(239,68,68,0.35)" : null,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 800,
        color: isAlarmingZero ? "#FCA5A5" : "#67E8F9",
        marginBottom: 10, letterSpacing: "0.04em",
      }}>
        {isAlarmingZero ? "🚨 今日は買い候補ゼロ — 内訳を確認" : "📊 今日のレース内訳"}
      </div>

      {/* 4 つのカテゴリ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <Stat label="全レース" value={total} color="#CBD5E1" />
        <Stat label="買い" value={buy} color="#22F5A8" highlight={buy > 0} />
        <Stat label="見送り" value={skip} color="#F87171" />
        <Stat label="待機/終了" value={pending + finished} color="#94A3B8" />
      </div>

      {/* スキップ内訳 Top 3 */}
      {topSkip.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            主な見送り理由
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {topSkip.map(([cat, n]) => (
              <div key={cat} style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 12, color: "#CBD5E1",
                padding: "4px 8px", borderRadius: 6,
                background: "rgba(255,255,255,0.03)",
              }}>
                <span>{cat}</span>
                <b className="num" style={{ color: "#FCD34D" }}>{n} 件</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAlarmingZero && (
        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: "rgba(239,68,68,0.12)", borderRadius: 8,
          fontSize: 11.5, color: "#FECACA", lineHeight: 1.6,
        }}>
          💡 もし「データ不足」 が多いなら更新ボタンを押して再取得してください。<br />
          「ゲート」 系で多くスキップされていれば設定で別スタイル (steady/balanced/aggressive) を試してみてください。
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, color, highlight }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>
        {label}
      </div>
      <div className="num" style={{
        fontSize: 22, fontWeight: 900, color, lineHeight: 1.05,
        textShadow: highlight ? `0 0 12px ${color}66` : null,
      }}>
        {value}
      </div>
    </div>
  );
}

/**
 * skip reason の文字列を主要カテゴリへ分類。
 * predict.js の skipReasons[0] (= 主因) をそのまま使う。
 */
function categorize(reason) {
  if (!reason) return "その他";
  if (/データ不足|未取得|データ整合性|計算保留/.test(reason)) return "📡 データ不足";
  if (/本命型ゲート/.test(reason)) return "🛡️ 本命型ゲート";
  if (/バランス型ゲート/.test(reason)) return "⚖️ バランス型ゲート";
  if (/穴狙い型ゲート|穴/.test(reason)) return "🎯 穴狙い型ゲート";
  if (/危険レース|severity/.test(reason)) return "⚠️ 危険レース";
  if (/イン崩壊警戒|信頼度/.test(reason)) return "💧 1号艇信頼度";
  if (/オッズ妙味|妙味薄|期待回収率/.test(reason)) return "💸 期待値不足";
  if (/風|波|荒水面|荒れ/.test(reason)) return "🌊 荒水面/強風";
  if (/部品交換/.test(reason)) return "🔧 部品交換";
  if (/買い目が広/.test(reason)) return "📋 買い目広すぎ";
  return "その他";
}
