/* ヘッダ + 4 タブナビ + エア/リアル損益 */
import { yen } from "../lib/format.js";

const TABS = [
  { k: "home", label: "🏠 ホーム" },
  { k: "list", label: "📋 一覧" },
  { k: "verify", label: "📅 検証" },
  { k: "stats", label: "📈 グラフ" },
  { k: "settings", label: "💼 設定" },
];

export default function Header({ tab, setTab, today, settings }) {
  const air = today?.air || { stake: 0, pnl: 0, count: 0, hits: 0 };
  const real = today?.real || { stake: 0, pnl: 0, count: 0, hits: 0 };
  const realLabel = real.stake === 0 ? "未入力" : (real.pnl >= 0 ? "+" + yen(real.pnl) : "−" + yen(Math.abs(real.pnl)));
  const airLabel = air.stake === 0 ? "—" : (air.pnl >= 0 ? "+" + yen(air.pnl) : "−" + yen(Math.abs(air.pnl)));
  const airROI = air.stake > 0 ? Math.round(air.stake > 0 ? (air.stake + air.pnl) / air.stake * 100 : 0) : null;

  return (
    <header className="border-b border-[#1f2a44] bg-[#0b1220]/90 sticky top-0 z-30 backdrop-blur" style={{ minHeight: 96 }}>
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div style={{ minWidth: 110 }}>
          <div className="font-bold text-sm">競艇 期待値AI</div>
          <div className="text-xs opacity-70">買わないAI v2</div>
        </div>
        {settings.onboardingDone && (
          <div className="flex flex-col items-end gap-1 text-xs">
            <div className="flex gap-3 items-center" title="エア = 仮想購入 (検証用)">
              <span className="pill" style={{ background: "rgba(34,211,238,0.15)", color: "#a5f3fc", fontSize: 10 }}>エア</span>
              <b className={"num " + (air.pnl >= 0 ? "text-pos" : "text-neg")}>{airLabel}</b>
              {airROI != null && <span className="opacity-70">回収率 {airROI}%</span>}
            </div>
            <div className="flex gap-3 items-center" title="リアル = 実購入 (本気の記録)">
              <span className="pill" style={{ background: "rgba(251,191,36,0.18)", color: "#fcd34d", fontSize: 10 }}>リアル</span>
              <b className={"num " + (real.stake === 0 ? "opacity-60" : (real.pnl >= 0 ? "text-pos" : "text-neg"))}>{realLabel}</b>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-2">
        <div className="flex gap-1 overflow-x-auto scrollbar">
          {TABS.map((t) => (
            <button key={t.k} className={"tab-btn whitespace-nowrap " + (tab === t.k ? "active" : "")}
              onClick={() => setTab(t.k)}>{t.label}</button>
          ))}
        </div>
      </div>
    </header>
  );
}
