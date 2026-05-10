import { useState } from "react";

/**
 * Onboarding (2026-05-10 Round 169 簡素化)
 * SPEC §2-3 に従いユーザー入力を全廃止。 残るのは 20 歳以上 + 自己責任の同意 2 項目のみ。
 *  ・金額入力 (現在の資金 / 1 日予算 / 1 レース上限) → 削除 (アプリ側 5,000 円固定)
 *  ・スタイル選択 (3 択) → Round 168 で削除済 (balanced 固定)
 */
export default function Onboarding({ settings, setSettings, onClose }) {
  const [agreedAge, setAgreedAge] = useState(false);
  const [agreedNoGuarantee, setAgreedNoGuarantee] = useState(false);

  function save() {
    if (!agreedAge || !agreedNoGuarantee) return;
    setSettings({
      ...settings,
      // 金額 / スタイルは App.jsx の起動時強制矯正で確定するため、 ここでは触らない
      onboardingDone: true,
      agreedAt: new Date().toISOString(),
      agreedAge: true,
      agreedNoGuarantee: true,
    });
    onClose && onClose();
  }

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
            color: "#FBBF24",
          }}>
            🌊 万舟研究所
          </h2>
          <div style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            marginTop: 6,
            letterSpacing: "0.04em",
            lineHeight: 1.5,
          }}>
            5 場 (戸田・江戸川・平和島・鳴門・桐生) の荒れレースだけを監視します
          </div>
        </div>

        {/* === アプリ側で固定する内容のお知らせ === */}
        <div style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: "rgba(251, 191, 36, 0.08)",
          border: "1px solid rgba(251, 191, 36, 0.30)",
          marginBottom: 18,
          fontSize: 12.5, lineHeight: 1.7,
          color: "#FCD34D",
        }}>
          このアプリは設定不要です。 アプリ側がすべて決めます。
          <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, color: "#fef3c7", fontSize: 12 }}>
            <li>1 レースの購入額: <b>5,000 円固定</b></li>
            <li>監視対象: 5 場 (戸田・江戸川・平和島・鳴門・桐生)</li>
            <li>表示: 荒れスコア 75 点以上のレースだけ</li>
          </ul>
        </div>

        {/* 旧 資金 3 項目入力 / スタイル 3 択は 2026-05-10 (Round 168-169) に廃止。 */}

        {/* === 注意 (cyan info) === */}
        <div className="alert-info" style={{ fontSize: 11.5, marginBottom: 16, lineHeight: 1.55, padding: "10px 14px" }}>
          このアプリは買い目提案 · 荒れスコア · オッズの表示のみ。<br/>
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
