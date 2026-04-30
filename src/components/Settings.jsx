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
        <h2 className="text-lg font-bold mb-3">💼 資金 (表示・参考)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field("bankroll", "現在の資金 (円)")}
          {field("dailyBudget", "1日の予算 (円)")}
          {field("perRaceLimit", "1レース上限 (円)")}
          {field("evMin", "最小EV (1.10 推奨)")}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">🎯 戦略 (買い目の方向性)</h2>
        <div>
          <label className="text-xs opacity-80">3 パターンから選択 — 買い目の券種と本数が変わります</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {[
              { k: "steady",     icon: "🛡️", title: "安全", desc: "2連複 + 3連複 / 的中重視" },
              { k: "balanced",   icon: "⚖️", title: "バランス", desc: "2連単 + 3連単" },
              { k: "aggressive", icon: "🎯", title: "攻め", desc: "3連単 / 高配当狙い" },
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
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">🧪 購入モード</h2>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={!!settings.virtualMode}
            onChange={(e) => setSettings({ ...settings, virtualMode: e.target.checked })} />
          <span><b>エア舟券モード</b> (検証専用・実購入記録には反映しません)</span>
        </label>
        <div className="text-xs opacity-70 mt-2">
          OFF にすると「リアル購入として記録」ボタンが各買い目に表示されます。
        </div>
      </section>

      <section className="card p-4">
        <h3 className="text-sm font-bold mb-2">リセット</h3>
        <div className="text-xs opacity-70 mb-2">壊れた状態をクリアして、初期化します。</div>
        <button className="btn btn-ghost text-xs" onClick={onReset}>
          🗑 全データを消去
        </button>
      </section>
    </div>
  );
}
