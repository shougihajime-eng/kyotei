import { useState } from "react";
import { yen } from "../lib/format.js";

/**
 * 初回起動時の資金管理ウィザード。
 * 入力後 settings を更新し、onboardingDone:true をセット。
 */
export default function Onboarding({ settings, setSettings, onClose }) {
  const [bankroll, setBankroll] = useState(settings.bankroll || 50000);
  const [dailyBudget, setDailyBudget] = useState(settings.dailyBudget || 2500);
  const [perRace, setPerRace] = useState(settings.perRaceLimit || 1000);
  const [risk, setRisk] = useState(settings.riskProfile || "balanced");

  function save() {
    setSettings({
      ...settings,
      bankroll: +bankroll || 0,
      dailyBudget: +dailyBudget || 0,
      perRaceLimit: +perRace || 0,
      riskProfile: risk,
      onboardingDone: true,
    });
    onClose && onClose();
  }

  const ratio = bankroll > 0 ? ((dailyBudget / bankroll) * 100).toFixed(1) : "—";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,18,32,0.92)", zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card" style={{ maxWidth: 560, width: "100%", padding: 24, border: "2px solid #22d3ee" }}>
        <div className="text-center mb-3">
          <div style={{ fontSize: 40 }}>💼</div>
          <h2 className="text-xl font-bold mt-2">最初に: あなたの資金を教えてください</h2>
          <div className="text-xs opacity-80 mt-1">破産しない設計のために、最初に1度だけ設定します。</div>
        </div>

        <div className="space-y-3 text-sm">
          <Field label="現在の資金 (円)" value={bankroll} onChange={setBankroll} />
          <Field label={`1日の予算 (円) — 推奨: 資金の 5% (現在 約 ${ratio}%)`} value={dailyBudget} onChange={setDailyBudget} />
          <Field label="1レースの上限 (円) — 推奨: 1日予算の 1/2〜1/3" value={perRace} onChange={setPerRace} />

          <div>
            <label className="text-xs opacity-80">リスク感覚</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { k: "steady", icon: "🛡️", title: "堅め", desc: "本命70 / 押さえ30" },
                { k: "balanced", icon: "⚖️", title: "標準", desc: "50 / 30 / 20" },
                { k: "aggressive", icon: "🎯", title: "攻め", desc: "40 / 30 / 30" },
              ].map((o) => (
                <button key={o.k} type="button"
                  className={"p-2 rounded-lg border-2 text-left " + (risk === o.k ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830]")}
                  onClick={() => setRisk(o.k)}>
                  <div style={{ fontSize: 22 }}>{o.icon}</div>
                  <div className="font-bold text-sm">{o.title}</div>
                  <div className="opacity-70 text-xs">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="alert-info text-xs">
            このアプリは買い目提案 + EV + オッズ表示のみ。<br/>
            購入判断は最終的にユーザーが行います (自動停止機能なし)。
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>後で設定</button>
          <button type="button" className="btn btn-success" onClick={save}>✅ 確定して開始</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs opacity-80">{label}</label>
      <input className="input mt-1 num" type="number" value={value}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
