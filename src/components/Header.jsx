/* ヘッダ + 4 タブナビ */
import { yen } from "../lib/format.js";

const TABS = [
  { k: "home", label: "🏠 ホーム" },
  { k: "list", label: "📋 レース一覧" },
  { k: "verify", label: "📅 検証" },
  { k: "settings", label: "💼 設定" },
];

export default function Header({ tab, setTab, today, settings }) {
  const pnlColor = today.pnl >= 0 ? "text-pos" : "text-neg";
  return (
    <header className="border-b border-[#1f2a44] bg-[#0b1220]/90 sticky top-0 z-30 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-bold text-sm">競艇 期待値AI</div>
          <div className="text-xs opacity-70">買わないAI v2</div>
        </div>
        {settings.onboardingDone && (
          <div className="text-xs flex items-center gap-2 flex-wrap">
            <span className="opacity-70">資金</span>
            <b className="num">{yen(settings.bankroll)}</b>
            <span className="opacity-50">/</span>
            <span className="opacity-70">本日</span>
            <b className={"num " + pnlColor}>
              {today.pnl >= 0 ? "+" : ""}{yen(today.pnl).replace("¥", "¥")}
            </b>
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
