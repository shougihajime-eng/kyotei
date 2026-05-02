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
  // Round 74: 利用同意 (20 歳以上 + 予想保証なし + 自己責任)
  const [agreedAge, setAgreedAge] = useState(false);
  const [agreedNoGuarantee, setAgreedNoGuarantee] = useState(false);

  function save() {
    if (!agreedAge || !agreedNoGuarantee) return;
    setSettings({
      ...settings,
      bankroll: +bankroll || 0,
      dailyBudget: +dailyBudget || 0,
      perRaceLimit: +perRace || 0,
      riskProfile: risk,
      onboardingDone: true,
      agreedAt: new Date().toISOString(),
      agreedAge: true,
      agreedNoGuarantee: true,
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

          {/* Round 74: 利用同意 (法令対応) */}
          <div className="p-3 rounded" style={{
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.4)",
          }}>
            <div className="text-xs font-bold mb-2" style={{ color: "#fca5a5" }}>
              ⚠️ ご利用にあたっての確認
            </div>
            <label className="flex items-start gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={agreedAge} onChange={(e) => setAgreedAge(e.target.checked)} style={{ marginTop: 3, minWidth: 18, minHeight: 18 }} />
              <span className="text-xs" style={{ lineHeight: 1.5 }}>
                私は <b>20 歳以上</b> です。 競艇の舟券購入は 20 歳以上のみ可能です。
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={agreedNoGuarantee} onChange={(e) => setAgreedNoGuarantee(e.target.checked)} style={{ marginTop: 3, minWidth: 18, minHeight: 18 }} />
              <span className="text-xs" style={{ lineHeight: 1.5 }}>
                本アプリの予想は <b>勝利を保証しません</b>。 購入は自己責任で、 損失を被る可能性があります。
                依存症が気になる方は{" "}
                <a href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000160118.html" target="_blank" rel="noopener noreferrer" style={{ color: "#bae6fd", textDecoration: "underline" }}>
                  厚生労働省窓口
                </a>{" "}
                (TEL 0570-061-330) へ。
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>後で設定</button>
          <button type="button"
            className={"btn " + ((agreedAge && agreedNoGuarantee) ? "btn-success" : "btn-ghost")}
            onClick={save}
            disabled={!agreedAge || !agreedNoGuarantee}
            style={{ opacity: (agreedAge && agreedNoGuarantee) ? 1 : 0.45, cursor: (agreedAge && agreedNoGuarantee) ? "pointer" : "not-allowed" }}
            aria-disabled={!agreedAge || !agreedNoGuarantee}
            title={!agreedAge || !agreedNoGuarantee ? "両方の項目への同意が必要です" : ""}>
            ✅ 同意して開始
          </button>
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
