import { yen } from "../lib/format.js";

/**
 * 設定 — 資金管理 + リスク感覚 + 仮想モード切替 + リセット。
 */
export default function Settings({ settings, setSettings, onReset }) {
  function field(key, label) {
    return (
      <div>
        <label className="text-xs opacity-80">{label}</label>
        <input className="input mt-1 num" type="number" value={settings[key] ?? 0}
          onChange={(e) => setSettings({ ...settings, [key]: +e.target.value || 0 })} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">💼 資金管理</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field("bankroll", "現在の資金 (円)")}
          {field("dailyBudget", "1日の予算 (円)")}
          {field("perRaceLimit", "1レース上限 (円)")}
          {field("dailyLossStop", "1日損失ストップ (円)")}
          {field("consecLossStop", "連敗ストップ (回)")}
          {field("evMin", "最小EV (1.10 推奨)")}
        </div>

        <hr className="my-3 border-[#1f2a44]" />

        <div>
          <label className="text-xs opacity-80">リスク感覚</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {[
              { k: "steady", icon: "🛡️", title: "堅め", desc: "本命70 / 押さえ30" },
              { k: "balanced", icon: "⚖️", title: "標準", desc: "50 / 30 / 20" },
              { k: "aggressive", icon: "🎯", title: "攻め", desc: "40 / 30 / 30" },
            ].map((o) => (
              <button key={o.k} type="button"
                className={"p-2 rounded-lg border-2 text-left " + (settings.riskProfile === o.k ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830]")}
                onClick={() => setSettings({ ...settings, riskProfile: o.k })}>
                <div style={{ fontSize: 22 }}>{o.icon}</div>
                <div className="font-bold text-sm">{o.title}</div>
                <div className="text-xs opacity-70">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <hr className="my-3 border-[#1f2a44]" />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={!!settings.virtualMode}
            onChange={(e) => setSettings({ ...settings, virtualMode: e.target.checked })} />
          <span><b>仮想購入モード</b> (実購入せず記録のみ取る — 最初の1週間は推奨)</span>
        </label>
      </section>

      <section className="card p-4 alert-warn">
        <h3 className="text-sm font-bold mb-2">⚠️ 安全装置 (自動)</h3>
        <ul className="text-xs space-y-1 opacity-90">
          <li>・1日損失 {yen(settings.dailyLossStop || 0)} 到達 → 強制見送り</li>
          <li>・{settings.consecLossStop || 3} 連敗 → 当日終了</li>
          <li>・1日予算 {yen(settings.dailyBudget || 0)} 超過 → 追加購入を物理的にブロック</li>
        </ul>
      </section>

      <section className="card p-4">
        <h3 className="text-sm font-bold mb-2">リセット</h3>
        <div className="text-xs opacity-70 mb-2">壊れた状態をクリアして、初期化します。</div>
        <button className="btn btn-ghost text-xs" onClick={onReset}>
          🗑 全データを消去 (resetly)
        </button>
      </section>
    </div>
  );
}
