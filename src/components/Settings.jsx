import { yen } from "../lib/format.js";

/**
 * 設定 — 資金管理 + リスク感覚 + 仮想モード切替 + リセット。
 */
export default function Settings({ settings, setSettings, switchVirtualMode, onReset }) {
  const isVirtual = !!settings.virtualMode;
  function setMode(virtual) {
    if (virtual === isVirtual) return;
    if (switchVirtualMode) switchVirtualMode(virtual);
    else setSettings((prev) => ({ ...prev, virtualMode: virtual }));
  }
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
        <h2 className="text-lg font-bold mb-3">🧪 購入モード (エア / リアル)</h2>
        <div className="text-xs opacity-80 mb-3">
          記録モードを切り替えます。Header の大ボタンからもいつでも切替できます。
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode(true)}
            style={{
              padding: "14px 12px", minHeight: 64, borderRadius: 12,
              border: "2px solid " + (isVirtual ? "#22d3ee" : "#243154"),
              background: isVirtual ? "rgba(34,211,238,0.15)" : "rgba(15,24,48,0.6)",
              color: isVirtual ? "#67e8f9" : "#9fb0c9",
              fontWeight: 800, fontSize: 14, cursor: "pointer",
              transition: "all 0.12s ease",
              boxShadow: isVirtual ? "0 0 0 1px #22d3ee40, 0 4px 14px rgba(34,211,238,0.2)" : "none",
              transform: isVirtual ? "scale(1.02)" : "scale(1)",
            }}>
            <div style={{ fontSize: 22 }}>🧪</div>
            <div>エア舟券</div>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, marginTop: 2 }}>検証用 (購入なし)</div>
            {isVirtual && <div style={{ fontSize: 10, marginTop: 2 }}>✓ 選択中</div>}
          </button>
          <button
            type="button"
            onClick={() => setMode(false)}
            style={{
              padding: "14px 12px", minHeight: 64, borderRadius: 12,
              border: "2px solid " + (!isVirtual ? "#fbbf24" : "#243154"),
              background: !isVirtual ? "rgba(251,191,36,0.16)" : "rgba(15,24,48,0.6)",
              color: !isVirtual ? "#fcd34d" : "#9fb0c9",
              fontWeight: 800, fontSize: 14, cursor: "pointer",
              transition: "all 0.12s ease",
              boxShadow: !isVirtual ? "0 0 0 1px #fbbf2440, 0 4px 14px rgba(251,191,36,0.2)" : "none",
              transform: !isVirtual ? "scale(1.02)" : "scale(1)",
            }}>
            <div style={{ fontSize: 22 }}>💰</div>
            <div>リアル舟券</div>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, marginTop: 2 }}>実購入を記録</div>
            {!isVirtual && <div style={{ fontSize: 10, marginTop: 2 }}>✓ 選択中</div>}
          </button>
        </div>
        <div className="text-xs opacity-70 mt-3">
          ※ 切替は localStorage に保存され、リロードしても維持されます。
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
