import { useState } from "react";
import { yen } from "../lib/format.js";

/**
 * Round 104: Onboarding redesign — 第一印象 premium 化
 *
 * ・グラスモーフィズムのカード
 * ・ステップ感のあるレイアウト (タイトル・資金 3 項目・スタイル・同意・実行)
 * ・スタイル選択は Header と同じデザイン (3 列 / accent カラー / 浮上)
 * ・同意ボックスを refined warning card で
 */
export default function Onboarding({ settings, setSettings, onClose }) {
  const [bankroll, setBankroll] = useState(settings.bankroll || 50000);
  const [dailyBudget, setDailyBudget] = useState(settings.dailyBudget || 2500);
  const [perRace, setPerRace] = useState(settings.perRaceLimit || 1000);
  const [risk, setRisk] = useState(settings.riskProfile || "balanced");
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
  const canStart = agreedAge && agreedNoGuarantee;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: `
        radial-gradient(1200px 700px at 70% -100px, rgba(34, 211, 238, 0.10), transparent 60%),
        radial-gradient(900px 500px at -10% 30%, rgba(99, 102, 241, 0.10), transparent 60%),
        rgba(6, 10, 24, 0.96)
      `,
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
      overflow: "auto",
    }}>
      <div className="card fade-in" style={{
        maxWidth: 580,
        width: "100%",
        padding: 28,
        border: "1px solid rgba(34, 211, 238, 0.35)",
        boxShadow: "0 0 0 1px rgba(34, 211, 238, 0.20), 0 24px 48px rgba(0, 0, 0, 0.45)",
      }}>
        {/* === ヒーローヘッダ === */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64,
            margin: "0 auto",
            borderRadius: 18,
            background: "linear-gradient(135deg, #22D3EE 0%, #2563EB 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(34, 211, 238, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.30)",
            fontSize: 32,
          }}>
            🚤
          </div>
          <h2 className="brand-logo" style={{
            fontSize: 26,
            fontWeight: 800,
            marginTop: 14,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}>
            競艇 EV アシスタント
          </h2>
          <div style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            marginTop: 6,
            letterSpacing: "0.04em",
            lineHeight: 1.5,
          }}>
            最初に資金とスタイルを設定してください
          </div>
        </div>

        {/* === 資金管理 3 項目 === */}
        <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <Field label="現在の資金 (円)" value={bankroll} onChange={setBankroll} placeholder="50000" />
          <Field
            label="1日の予算 (円)"
            sublabel={`推奨: 資金の 5% — 現在 約 ${ratio}%`}
            value={dailyBudget} onChange={setDailyBudget} placeholder="2500"
          />
          <Field
            label="1レースの上限 (円)"
            sublabel="推奨: 1日予算の 1/2〜1/3"
            value={perRace} onChange={setPerRace} placeholder="1000"
          />
        </div>

        {/* === スタイル選択 (Header と同じデザイン) === */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginBottom: 8,
            letterSpacing: "0.06em",
            fontWeight: 600,
            textTransform: "uppercase",
          }}>
            予想スタイル
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "steady",     icon: "🛡️", title: "安定型",   desc: "的中率特化",   color: "#3B82F6" },
              { k: "balanced",   icon: "⚖️", title: "バランス型", desc: "実戦最適",     color: "#F59E0B" },
              { k: "aggressive", icon: "🎯", title: "攻め型",   desc: "高配当狙い",   color: "#EF4444" },
            ].map((o) => {
              const active = risk === o.k;
              return (
                <button key={o.k} type="button" onClick={() => setRisk(o.k)}
                  style={{
                    minHeight: 88,
                    padding: "12px 8px",
                    borderRadius: 12,
                    border: active ? `1.5px solid ${o.color}` : "1.5px solid var(--border-soft)",
                    background: active
                      ? `linear-gradient(180deg, ${o.color}1A 0%, rgba(255,255,255,0.02) 100%)`
                      : "rgba(255, 255, 255, 0.02)",
                    color: active ? o.color : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    boxShadow: active
                      ? `0 0 0 1px ${o.color}40, 0 4px 16px ${o.color}25`
                      : "inset 0 1px 0 rgba(255, 255, 255, 0.02)",
                    transform: active ? "translateY(-1px)" : "translateY(0)",
                  }}>
                  <div style={{ fontSize: 22, lineHeight: 1 }}>{o.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1, letterSpacing: "0.01em" }}>{o.title}</div>
                  <div style={{ fontSize: 10, opacity: active ? 0.95 : 0.65, fontWeight: 500, letterSpacing: "0.04em" }}>
                    {o.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* === 注意 (cyan info) === */}
        <div className="alert-info" style={{ fontSize: 11.5, marginBottom: 16, lineHeight: 1.55, padding: "10px 14px" }}>
          このアプリは買い目提案 · EV · オッズの表示のみ。<br/>
          購入判断は最終的にユーザーが行います (自動停止機能なし)。
        </div>

        {/* === 利用同意 === */}
        <div style={{
          padding: 14,
          borderRadius: 12,
          background: "rgba(239, 68, 68, 0.06)",
          border: "1px solid rgba(239, 68, 68, 0.32)",
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 10,
            color: "var(--c-danger-text)",
            letterSpacing: "0.02em",
          }}>
            ⚠️ ご利用にあたっての確認
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <ConsentRow
              checked={agreedAge}
              onChange={setAgreedAge}
              text={<>私は <b>20 歳以上</b> です。 競艇の舟券購入は 20 歳以上のみ可能です。</>}
            />
            <ConsentRow
              checked={agreedNoGuarantee}
              onChange={setAgreedNoGuarantee}
              text={
                <>
                  本アプリの予想は <b>勝利を保証しません</b>。 購入は自己責任で、 損失を被る可能性があります。
                  依存症が気になる方は{" "}
                  <a href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000160118.html" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-text)", textDecoration: "underline" }}>
                    厚生労働省窓口
                  </a>{" "}
                  (TEL 0570-061-330) へ。
                </>
              }
            />
          </div>
        </div>

        {/* === アクションボタン === */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            後で設定
          </button>
          <button type="button"
            className={"btn " + (canStart ? "btn-primary" : "btn-ghost")}
            onClick={save}
            disabled={!canStart}
            aria-disabled={!canStart}
            title={!canStart ? "両方の項目への同意が必要です" : ""}
            style={{ minWidth: 160 }}
          >
            ✅ 同意して開始
          </button>
        </div>
      </div>
    </div>
  );
}

/* === 入力フィールド === */
function Field({ label, sublabel, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.01em" }}>
        {label}
      </label>
      {sublabel && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
          {sublabel}
        </div>
      )}
      <input className="input num" type="number" value={value} placeholder={placeholder}
        style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* === 同意行 === */
function ConsentRow({ checked, onChange, text }) {
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      cursor: "pointer", userSelect: "none",
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          marginTop: 2,
          minWidth: 18, minHeight: 18,
          accentColor: "#10B981",
          cursor: "pointer",
        }}
      />
      <span style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--text-secondary)", letterSpacing: "0.005em" }}>
        {text}
      </span>
    </label>
  );
}
