import { useMemo } from "react";

/**
 * Round 139: データ蓄積進捗バー
 *
 * 確定済予想数を 「あと何件で何が解禁されるか」 で見える化する。
 *   ・10 件超 → 得意/苦手パターン分析が始まる (patternAnalysis.js)
 *   ・30 件超 → 学習機能が動き出す (learning.js)
 *
 * 既に達成済みなら ✅ で表示、 未達成なら進捗バー付きで残り件数を表示。
 */

const MILESTONES = [
  {
    threshold: 10,
    title: "得意パターン分析",
    desc: "あなたの得意/苦手な「会場×風×スタイル」 が見えるようになります",
    color: "#A855F7", // purple
  },
  {
    threshold: 15,
    title: "学習機能",
    desc: "過去の的中傾向から重みを自動調整 (1号艇本命の信頼度など)",
    color: "#22D3EE", // cyan
  },
];

export default function DataProgressCard({ predictions }) {
  const settled = useMemo(() => {
    if (!predictions) return 0;
    return Object.values(predictions).filter((p) =>
      p?.result?.first && p?.decision === "buy" && (p?.totalStake || 0) > 0
    ).length;
  }, [predictions]);

  // 全部達成済みなら表示しない (画面の節約)
  const allDone = MILESTONES.every((m) => settled >= m.threshold);
  if (allDone) return null;

  return (
    <div className="card p-4" style={{ borderLeft: "3px solid #22D3EE" }}>
      <div className="text-sm font-bold mb-2" style={{ color: "#67E8F9" }}>
        🎯 機能解禁までの進捗
      </div>
      <div className="text-xs text-mute mb-3">
        確定済 buy 予想: <b className="num text-brand">{settled} 件</b>
      </div>

      <div className="space-y-3">
        {MILESTONES.map((m) => {
          const done = settled >= m.threshold;
          const remaining = Math.max(0, m.threshold - settled);
          const progress = Math.min(100, (settled / m.threshold) * 100);
          return (
            <div key={m.threshold}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold" style={{ color: done ? "#6EE7B7" : "#F1F5F9" }}>
                  {done ? "✅" : "🔒"} {m.title}
                </div>
                <div className="text-xs num" style={{ color: done ? "#6EE7B7" : m.color }}>
                  {done ? "解禁済み" : `あと ${remaining} 件`}
                </div>
              </div>
              <div style={{
                height: 8, borderRadius: 999,
                background: "rgba(255,255,255,0.06)", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${progress}%`, borderRadius: 999,
                  background: done
                    ? "linear-gradient(90deg, #10B981 0%, #34D399 100%)"
                    : `linear-gradient(90deg, ${m.color}88 0%, ${m.color} 100%)`,
                  boxShadow: done ? "0 0 8px rgba(16,185,129,0.4)" : `0 0 8px ${m.color}66`,
                  transition: "width 0.4s ease",
                }} />
              </div>
              <div className="text-xs text-mute mt-1">{m.desc}</div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-mute mt-3" style={{ opacity: 0.8 }}>
        💡 1 日のレースを 5-10 件記録するだけで、 1-2 週間で全機能が解禁します。
      </div>
    </div>
  );
}
