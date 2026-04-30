/**
 * EV (期待値) 説明スケール — 小学生でも分かるように視覚化。
 *
 *   EV = 確率 × オッズ
 *   ・1.30 以上 — 🔥 勝負級 (S 評価)
 *   ・1.10〜1.29 — ✅ 買い候補 (A 評価)
 *   ・1.00〜1.09 — ⚠️ 慎重に検討 (B 評価)
 *   ・1.00 未満  — ❌ 基本見送り (C 評価)
 *
 *   ただし、EV だけで判断せず、展示気配・モーター・選手・進入・風・波・オッズ変動 も合わせて判断。
 */
export default function EVExplainer({ ev, compact }) {
  const evNum = Number(ev) || 0;
  const grade = evNum >= 1.30 ? "S" : evNum >= 1.10 ? "A" : evNum >= 1.00 ? "B" : "C";

  if (compact) {
    return (
      <span className={"pill badge-grade-" + grade} title={evMeaning(evNum)}>
        EV {evNum.toFixed(2)}
      </span>
    );
  }

  // フルスケール: 0.0 〜 2.0 を視覚化
  const pct = Math.max(0, Math.min(100, (evNum / 2.0) * 100));
  const color = grade === "S" ? "#10b981" : grade === "A" ? "#34d399" : grade === "B" ? "#fde68a" : "#f87171";

  return (
    <div className="card p-4" style={{ minHeight: 200 }}>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-bold text-sm">📊 EV (期待値) とは?</h3>
        <span className="text-xs opacity-70">確率 × オッズ で計算</span>
      </div>

      {/* スケール */}
      <div className="relative" style={{ height: 38, background: "#1f2a44", borderRadius: 6, overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: "50%", background: "linear-gradient(90deg,#3b1d1d,#7f1d1d)",
        }} />
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0, width: "5%",
          background: "linear-gradient(90deg,#7f1d1d,#3a2d0a)",
        }} />
        <div style={{
          position: "absolute", left: "55%", top: 0, bottom: 0, width: "10%",
          background: "linear-gradient(90deg,#3a2d0a,#854d0e)",
        }} />
        <div style={{
          position: "absolute", left: "65%", top: 0, bottom: 0, width: "35%",
          background: "linear-gradient(90deg,#065f46,#10b981)",
        }} />
        {/* 現在の EV を示すマーカー */}
        <div style={{
          position: "absolute", left: `calc(${pct}% - 2px)`, top: -2, bottom: -2,
          width: 4, background: "#fff", boxShadow: "0 0 8px rgba(255,255,255,0.6)",
        }} />
        <div className="absolute inset-0 flex items-center justify-around text-xs font-bold" style={{ color: "#000" }}>
          <span style={{ marginLeft: -8 }}>0.0</span>
          <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", color: "#fff" }}>1.0</span>
          <span style={{ marginRight: -8, color: "#fff" }}>2.0</span>
        </div>
      </div>

      {/* 現在値 */}
      <div className="text-center mt-3">
        <span style={{ fontSize: 36, fontWeight: 900, color }}>EV {evNum.toFixed(2)}</span>
        <span className={"pill ml-2 badge-grade-" + grade} style={{ fontSize: 14, padding: "4px 10px" }}>{grade} 評価</span>
      </div>

      {/* 凡例 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs">
        <div className={"p-2 rounded " + (grade === "S" ? "border-2 border-emerald-400" : "")} style={{ background: "rgba(16,185,129,0.15)", color: "#a7f3d0" }}>
          <div className="font-bold">🔥 1.30+</div>
          <div className="opacity-80">勝負級 (S)</div>
        </div>
        <div className={"p-2 rounded " + (grade === "A" ? "border-2 border-emerald-400" : "")} style={{ background: "rgba(52,211,153,0.15)", color: "#86efac" }}>
          <div className="font-bold">✅ 1.10〜1.29</div>
          <div className="opacity-80">買い候補 (A)</div>
        </div>
        <div className={"p-2 rounded " + (grade === "B" ? "border-2 border-yellow-400" : "")} style={{ background: "rgba(251,191,36,0.15)", color: "#fde68a" }}>
          <div className="font-bold">⚠️ 1.00〜1.09</div>
          <div className="opacity-80">慎重に (B)</div>
        </div>
        <div className={"p-2 rounded " + (grade === "C" ? "border-2 border-rose-400" : "")} style={{ background: "rgba(239,68,68,0.15)", color: "#fecaca" }}>
          <div className="font-bold">❌ 1.00 未満</div>
          <div className="opacity-80">見送り (C)</div>
        </div>
      </div>

      <div className="text-xs opacity-70 mt-3">
        💡 <b>EV = 1.10</b> 以上から「買い候補」。<br/>
        ただし EV だけでなく、<b>展示気配 / モーター / 選手 / 進入 / 風波 / オッズ変動</b> も合わせて判断します。
      </div>
    </div>
  );
}

function evMeaning(ev) {
  if (ev >= 1.30) return "🔥 勝負級 — オッズに対して確率が高い";
  if (ev >= 1.10) return "✅ 買い候補";
  if (ev >= 1.00) return "⚠️ 慎重に検討";
  return "❌ 見送り推奨";
}
