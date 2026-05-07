import { useState, useMemo } from "react";

/**
 * Round 115: 「-15 分前で予想したものではない過去データ」 を一括削除するバナー
 *
 * 背景:
 *   Round 113 で -15 分ゲートを導入したが、 それ以前に蓄積された予想ログは
 *   不安定オッズで作られたもので、 ユーザーから 「全部意味がない」 と判定された。
 *
 *   1 クリックで全予想 / 公開検証ログ / 学習履歴 / クラウド行を削除して、
 *   今日からは "-15 分前の予想" だけが蓄積される状態にする。
 *
 * 表示条件:
 *   ・予想ログが 1 件以上ある
 *   ・かつ クリーンアップ完了フラグ (FLAG_KEY) が未設定
 *   = 既にクリアした人 / 全くデータがない人には表示しない
 */
const FLAG_KEY = "kyoteiRound115CleanupDone";

export default function LegacyDataBanner({ predictions, onReset, authUser }) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const showByFlag = useMemo(() => {
    try { return localStorage.getItem(FLAG_KEY) !== "1"; } catch { return true; }
  }, []);

  const count = useMemo(() => Object.keys(predictions || {}).length, [predictions]);

  if (dismissed || !showByFlag || count === 0) return null;

  function setFlag() {
    try { localStorage.setItem(FLAG_KEY, "1"); } catch {}
    setDismissed(true);
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    try {
      // handleReset 内で confirm() ダイアログが出る (二段確認 — preserveSettings + cloud)
      // クラウドログイン中なら cloud 行も削除
      await onReset({ preserveSettings: true, deleteCloud: !!authUser });
      setFlag();
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    setFlag();
  }

  return (
    <section className="card" style={{
      padding: "16px 18px",
      minHeight: 120,
      background: "linear-gradient(180deg, rgba(239, 68, 68, 0.10) 0%, rgba(127, 29, 29, 0.20) 100%), var(--bg-card)",
      border: "1.5px solid rgba(239, 68, 68, 0.55)",
      boxShadow: "0 0 32px -12px rgba(239, 68, 68, 0.40)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🗑️</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fecaca", letterSpacing: "0.01em", marginBottom: 6 }}>
            これまでの予想・グラフ・検証データは意味がない可能性があります
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 4 }}>
            このアプリは <b>発走 15 分前</b> のオッズで予想を出すよう作り直されました。<br/>
            それ以前に保存された <b className="num">{count}</b> 件の予想ログは不安定オッズで作られているため、
            <b>削除して新しくスタート</b> することをおすすめします。
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.55, marginBottom: 10 }}>
            削除対象: 全予想ログ / 公開検証ログ / 学習履歴
            {authUser && " / クラウド (Supabase) 同期データ"}
            <br/>
            ※ 設定 (予算 / リスク感覚) は保持されます
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          style={{
            flex: "1 1 220px",
            minHeight: 44,
            padding: "10px 16px",
            borderRadius: 10,
            background: "linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%)",
            color: "#7F1D1D",
            fontWeight: 800,
            fontSize: 14,
            border: "none",
            cursor: busy ? "wait" : "pointer",
            letterSpacing: "0.01em",
            boxShadow: "0 1px 0 rgba(255, 255, 255, 0.5) inset, 0 4px 14px rgba(127, 29, 29, 0.30)",
          }}>
          {busy ? "削除中…" : "🗑 すべて削除して新規スタート"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={busy}
          style={{
            minHeight: 44,
            padding: "10px 16px",
            borderRadius: 10,
            background: "transparent",
            color: "var(--text-secondary)",
            fontWeight: 600,
            fontSize: 12.5,
            border: "1px solid rgba(255,255,255,0.18)",
            cursor: "pointer",
          }}>
          今は削除しない
        </button>
      </div>
    </section>
  );
}
