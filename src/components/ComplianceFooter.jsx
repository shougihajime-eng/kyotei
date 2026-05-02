import { memo } from "react";

/**
 * Round 74: 公営競技責任表示フッタ
 *
 * 全画面常時表示 (画面下部の sticky モードバーの上に配置):
 *   ・20 歳以上のみ利用可
 *   ・依存症相談窓口
 *   ・予想保証なし
 *   ・このアプリは公式ではありません
 *
 * 法令: 競艇は 20 歳以上のみ購入可。 アプリ内で誘導する以上、 表示義務がある。
 */
export default memo(ComplianceFooter);

function ComplianceFooter() {
  return (
    <div
      style={{
        background: "rgba(15,24,48,0.96)",
        borderTop: "1px solid rgba(239,68,68,0.25)",
        padding: "8px 12px",
        fontSize: 9,
        lineHeight: 1.45,
        color: "#94a3b8",
        textAlign: "center",
      }}
    >
      <div style={{ color: "#fca5a5", fontWeight: 700, marginBottom: 2 }}>
        ⚠️ 20 歳以上のみご利用ください / 本アプリは予想を保証しません / 公式ではありません
      </div>
      <div>
        ギャンブル等依存症相談:{" "}
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000160118.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#bae6fd", textDecoration: "underline" }}
        >
          厚生労働省窓口
        </a>{" "}
        / TEL{" "}
        <a href="tel:0570-061-330" style={{ color: "#bae6fd" }}>
          0570-061-330
        </a>{" "}
        (全国共通)
      </div>
      <div style={{ marginTop: 4 }}>
        <a href="?log=public" style={{ color: "#bae6fd", textDecoration: "underline", fontSize: 9 }}>
          📊 公開検証ログを見る (全 Go 判定の結果を append-only で公開)
        </a>
      </div>
    </div>
  );
}
