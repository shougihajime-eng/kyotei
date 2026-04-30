/**
 * 予想スタイル選択 (本命党 / 中堅党 / 穴党)
 *  ・いつでも切替可能
 *  ・切替直後に recommendations が再計算される (App の useMemo 依存に riskProfile が入っているため自動)
 *  ・各スタイルごとの記録は predictions で profile フィールドを保持して別途集計
 */

const STYLES = [
  { k: "steady",     icon: "🛡️", title: "本命党",  desc: "1号艇重視 / 1〜2点", short: "安定" },
  { k: "balanced",   icon: "⚖️", title: "中堅党",  desc: "1〜3号艇中心 / 2〜3点", short: "バランス" },
  { k: "aggressive", icon: "🎯", title: "穴党",    desc: "4〜6号艇も採用 / 3〜5点", short: "攻め" },
];

export default function StyleSelector({ value, onChange, compact, suggested }) {
  if (compact) {
    return (
      <div className="flex gap-1">
        {STYLES.map((s) => (
          <button key={s.k}
            onClick={() => onChange(s.k)}
            className="tab-btn whitespace-nowrap"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: value === s.k ? 800 : 600,
              background: value === s.k ? "#1d4ed8" : "transparent",
              color: value === s.k ? "#fff" : "#9fb0c9",
              borderRadius: 8,
              border: suggested === s.k ? "1px dashed #fde68a" : "1px solid transparent",
            }}
            title={s.desc}>
            {s.icon} {s.short}
            {suggested === s.k && <span style={{ marginLeft: 4, fontSize: 10 }}>💡</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {STYLES.map((s) => (
        <button key={s.k}
          onClick={() => onChange(s.k)}
          className={"p-3 rounded-lg border-2 text-center cursor-pointer transition-all " +
            (value === s.k ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830]")}
          style={{ minHeight: 100 }}>
          <div style={{ fontSize: 28 }}>{s.icon}</div>
          <div className="font-bold text-sm mt-1">{s.title}</div>
          <div className="text-xs opacity-70 mt-1">{s.desc}</div>
          {suggested === s.k && (
            <div className="text-xs mt-1" style={{ color: "#fde68a" }}>💡 AI 推奨</div>
          )}
        </button>
      ))}
    </div>
  );
}

/* AI が現在のレース状況からおすすめスタイルを提案 */
export function suggestStyle(evals, predictions) {
  // 全レースの development.scenario と evals.maxEV から判定
  const all = Object.values(evals || {});
  if (all.length === 0) return null;
  const buyable = all.filter(e => e.ok && e.maxEV >= 1.10);
  const roughCount = all.filter(e => e.ok && (e.windWave?.roughLikelihood >= 60 || e.development?.scenario === "荒れ")).length;
  const inDominantCount = all.filter(e => e.ok && e.inTrust?.level === "イン逃げ濃厚").length;

  if (inDominantCount / Math.max(1, all.length) >= 0.30) return "steady";   // インが多ければ本命党
  if (roughCount / Math.max(1, all.length) >= 0.30) return "aggressive";    // 荒れが多ければ穴党
  return "balanced";
}
