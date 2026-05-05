import { useMemo, useState, useCallback, memo } from "react";
import { cloudEnabled } from "../lib/supabaseClient.js";

/**
 * Round 101: CloudSyncCheckPanel premium polish
 *
 * クラウド同期検証を folding card で 表示。
 * 開いた瞬間に「クラウド復元 OK」 が分かる UI。
 */
export default memo(CloudSyncCheckPanel);

function CloudSyncCheckPanel({ authUser, predictions, syncStatus, isSampleMode }) {
  const [expanded, setExpanded] = useState(false);
  const cloudOk = cloudEnabled();

  const stats = useMemo(() => {
    const all = Object.values(predictions || {});
    const buys = all.filter((p) => p?.decision === "buy");
    const withBoats = buys.filter((p) => Array.isArray(p.boatsSnapshot) && p.boatsSnapshot.length === 6);
    const withWeather = buys.filter((p) => p.weatherSnapshot != null);
    const withReasoning = buys.filter((p) => p.reasoning != null);
    const withInTrust = buys.filter((p) => p.inTrust != null);
    const finalized = buys.filter((p) => p.finalized && p.result?.first);
    const withVerificationVersion = buys.filter((p) => typeof p.verificationVersion === "string");

    const byStyle = { steady: 0, balanced: 0, aggressive: 0 };
    for (const p of buys) {
      if (byStyle[p.profile] != null) byStyle[p.profile]++;
    }

    let keyMismatch = 0;
    const mismatchSamples = [];
    for (const p of buys) {
      const parts = (p.key || "").split("_");
      if (parts.length >= 3) {
        const suffix = parts[parts.length - 1];
        if (suffix !== p.profile) {
          keyMismatch++;
          if (mismatchSamples.length < 3) mismatchSamples.push({ key: p.key, profile: p.profile });
        }
      }
    }

    const settled = finalized;
    let stake = 0, ret = 0, hits = 0;
    for (const p of settled) {
      stake += p.totalStake || 0;
      ret += p.payout || 0;
      if (p.hit) hits++;
    }
    const roi = stake > 0 ? ret / stake : null;

    return {
      total: all.length,
      buys: buys.length,
      withBoats: withBoats.length,
      withWeather: withWeather.length,
      withReasoning: withReasoning.length,
      withInTrust: withInTrust.length,
      withVerificationVersion: withVerificationVersion.length,
      finalized: finalized.length,
      byStyle,
      keyMismatch,
      mismatchSamples,
      pnl: { stake, ret, hits, roi },
    };
  }, [predictions]);

  const overallStatus = useMemo(() => {
    if (!cloudOk) return { level: "info", text: "ローカルのみ動作", icon: "💾", color: "#94A3B8", bg: "rgba(148, 163, 184, 0.10)" };
    if (!authUser) return { level: "info", text: "未ログイン (ローカルのみ)", icon: "🔓", color: "#FCD34D", bg: "rgba(245, 158, 11, 0.10)" };
    if (syncStatus?.state === "syncing") return { level: "info", text: "同期中…", icon: "🔄", color: "#67E8F9", bg: "rgba(34, 211, 238, 0.10)" };
    if (syncStatus?.state === "error") return { level: "error", text: "同期失敗", icon: "🚨", color: "#FCA5A5", bg: "rgba(239, 68, 68, 0.10)" };
    if (stats.keyMismatch > 0) return { level: "error", text: "key 不整合あり", icon: "🚨", color: "#FCA5A5", bg: "rgba(239, 68, 68, 0.10)" };
    if (syncStatus?.state === "synced") return { level: "ok", text: "クラウド同期 OK", icon: "✅", color: "#34D399", bg: "rgba(16, 185, 129, 0.10)" };
    return { level: "info", text: "未同期", icon: "⏳", color: "#94A3B8", bg: "rgba(148, 163, 184, 0.06)" };
  }, [cloudOk, authUser, syncStatus, stats.keyMismatch]);

  const restoredCount = syncStatus?.stats?.cloudOnly || 0;
  const lastSyncAgo = syncStatus?.lastAt ? Math.floor((Date.now() - syncStatus.lastAt) / 60000) : null;
  const detailRate = stats.buys > 0 ? Math.round((stats.withBoats / stats.buys) * 100) : null;
  const verdictGood = stats.keyMismatch === 0 && (detailRate === null || detailRate >= 80);

  return (
    <section className="card mb-3" style={{ padding: 14 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, color: "inherit",
          fontFamily: "inherit",
        }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.01em" }}>
              ☁️ クラウド同期チェック
            </span>
            <span style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: overallStatus.bg,
              border: `1px solid ${overallStatus.color}50`,
              color: overallStatus.color,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}>
              {overallStatus.icon} {overallStatus.text}
            </span>
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 500 }}>
            {expanded ? "▲ 閉じる" : "▼ 詳細"}
          </span>
        </div>
        {!expanded && cloudOk && authUser && stats.buys > 0 && (
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.5 }}>
            買い推奨 <b className="num" style={{ color: "var(--text-secondary)" }}>{stats.buys}</b> 件
            {" · "}
            詳細ログ <b className="num" style={{ color: "var(--text-secondary)" }}>{stats.withBoats}</b> 件
            {" · "}
            結果反映 <b className="num" style={{ color: "var(--text-secondary)" }}>{stats.finalized}</b> 件
            {restoredCount > 0 && <span> · クラウドから復元 <b className="num" style={{ color: "var(--brand-text)" }}>{restoredCount}</b> 件</span>}
          </div>
        )}
      </button>

      {expanded && (
        <div className="fade-in" style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 11.5 }}>
          {/* === ① ログイン状態 === */}
          <Row
            ok={cloudOk && !!authUser}
            warn={cloudOk && !authUser}
            label={
              cloudOk
                ? authUser
                  ? `ログイン中 (${authUser.email || authUser.username || "user"})`
                  : "未ログイン — タップしてログインするとクラウド同期が始まります"
                : "Supabase 環境変数が未設定 — ローカルのみで動作中"
            }
            note={!cloudOk ? "詳細手順: Header の「⚠️ クラウド未設定」 ボタン → セットアップガイド" : null}
          />

          {/* === ② 最終同期 === */}
          {cloudOk && authUser && (
            <Row
              ok={syncStatus?.state === "synced"}
              warn={syncStatus?.state === "error"}
              label={
                syncStatus?.state === "syncing" ? "🔄 同期中…"
                : syncStatus?.state === "error" ? `❌ 同期失敗: ${syncStatus.error || "不明"}`
                : lastSyncAgo != null ? `最終同期: ${lastSyncAgo === 0 ? "今" : `${lastSyncAgo} 分前`}`
                : "未同期"
              }
              note={
                syncStatus?.stats
                  ? `pulled ${syncStatus.stats.pulled} 件 · pushed ${syncStatus.stats.pushed} 件 · cloudOnly ${syncStatus.stats.cloudOnly} 件 · localOnly ${syncStatus.stats.localOnly} 件`
                  : null
              }
            />
          )}

          {/* === ③ 別端末復元 === */}
          {cloudOk && authUser && restoredCount > 0 && (
            <Row
              ok={true}
              label={`✨ クラウドから復元: ${restoredCount} 件`}
              note="このデバイスにはなく、 別端末で記録された予想を取り込みました"
            />
          )}
          {cloudOk && authUser && restoredCount === 0 && stats.buys > 0 && (
            <Row
              ok={true}
              label={`📱 全 ${stats.buys} 件はこのデバイス起源`}
              note="別端末でログインすればここに復元件数が表示されます"
            />
          )}

          {/* === ④ 詳細ログ保持率 === */}
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(0, 0, 0, 0.18)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--brand-text)", fontSize: 11.5, letterSpacing: "0.02em" }}>
              📦 詳細ログ保持 (買い推奨 {stats.buys} 件中)
            </div>
            <div style={{ paddingLeft: 8, display: "grid", gap: 2, fontSize: 10.5 }}>
              <Mini ok={stats.withBoats === stats.buys} label="boatsSnapshot (6 艇分)" got={stats.withBoats} of={stats.buys} />
              <Mini ok={stats.withWeather === stats.buys} label="weatherSnapshot (風/波)" got={stats.withWeather} of={stats.buys} />
              <Mini ok={stats.withReasoning === stats.buys} label="reasoning (whyBuy / maxRisk)" got={stats.withReasoning} of={stats.buys} />
              <Mini ok={stats.withInTrust === stats.buys} label="inTrust (1号艇信頼度)" got={stats.withInTrust} of={stats.buys} />
              <Mini ok={stats.withVerificationVersion === stats.buys} label="verificationVersion" got={stats.withVerificationVersion} of={stats.buys} />
            </div>
            {detailRate !== null && (
              <div style={{ fontSize: 10.5, marginTop: 6, paddingLeft: 8, lineHeight: 1.5,
                color: detailRate === 100 ? "#A7F3D0" : detailRate >= 80 ? "#FCD34D" : "#FCA5A5",
              }}>
                {detailRate === 100 ? "✅ すべての買い推奨に判断材料が完全保存されています"
                : detailRate >= 80 ? `🟡 ${detailRate}% 保持 (一部古いデータに欠落あり)`
                : `🔴 ${detailRate}% — 詳細ログが大半欠落 (Supabase migration を確認)`}
              </div>
            )}
          </div>

          {/* === ⑤ 3 スタイル分離 === */}
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(0, 0, 0, 0.18)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--brand-text)", fontSize: 11.5, letterSpacing: "0.02em" }}>
              🏆 3 スタイル分離 ({stats.keyMismatch === 0 ? "✅ 維持" : "🚨 不整合あり"})
            </div>
            <div style={{ paddingLeft: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
              <span>🛡️ 安定: <b className="num">{stats.byStyle.steady}</b> 件</span>
              <span>⚖️ バランス: <b className="num">{stats.byStyle.balanced}</b> 件</span>
              <span>🎯 攻め: <b className="num">{stats.byStyle.aggressive}</b> 件</span>
            </div>
            {stats.keyMismatch > 0 && (
              <div style={{ fontSize: 10, color: "#FCA5A5", marginTop: 5, paddingLeft: 8, lineHeight: 1.5 }}>
                🚨 key suffix と profile が不一致: {stats.keyMismatch} 件
                {stats.mismatchSamples.length > 0 && (
                  <div style={{ opacity: 0.85, marginTop: 2 }}>
                    例: {stats.mismatchSamples.map((s) => `${s.key} (profile=${s.profile})`).join(" / ")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* === ⑥ 結果固定 + 収支 === */}
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(0, 0, 0, 0.18)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--brand-text)", fontSize: 11.5, letterSpacing: "0.02em" }}>
              🔒 結果反映 + 収支再現
            </div>
            <div style={{ paddingLeft: 8, fontSize: 11, lineHeight: 1.6 }}>
              <div>結果確定済み: <b className="num">{stats.finalized}</b> / {stats.buys} 件</div>
              {stats.pnl.stake > 0 && (
                <>
                  <div>賭金: <span className="num">{stats.pnl.stake.toLocaleString()}</span> 円 → 戻り: <span className="num">{stats.pnl.ret.toLocaleString()}</span> 円</div>
                  <div style={{ color: stats.pnl.roi >= 1 ? "#34D399" : "#FCA5A5", fontWeight: 700, marginTop: 2 }}>
                    ROI: <span className="num">{Math.round(stats.pnl.roi * 100)}%</span> · 的中: {stats.pnl.hits} / {stats.finalized}
                  </div>
                </>
              )}
              {stats.pnl.stake === 0 && stats.buys > 0 && (
                <div style={{ opacity: 0.7 }}>結果確定待ち (発走 + 5 分後に「🔄 更新」)</div>
              )}
            </div>
          </div>

          {/* === 仮データ警告 === */}
          {isSampleMode && (
            <div style={{
              padding: "8px 12px", borderRadius: 8,
              background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.30)",
              color: "var(--c-danger-text)", fontSize: 11, lineHeight: 1.5,
            }}>
              ⚠️ 仮データ動作中 — このセッションのデータは公開ログには反映されません
            </div>
          )}

          {/* === まとめ判定 === */}
          {cloudOk && authUser && stats.buys > 0 && (
            <div style={{
              padding: "10px 12px", borderRadius: 10, marginTop: 4,
              background: verdictGood
                ? "linear-gradient(180deg, rgba(16, 185, 129, 0.10) 0%, rgba(16, 185, 129, 0.04) 100%)"
                : "rgba(245, 158, 11, 0.08)",
              border: `1px solid ${verdictGood ? "rgba(16, 185, 129, 0.45)" : "rgba(245, 158, 11, 0.40)"}`,
              color: verdictGood ? "#A7F3D0" : "#FCD34D",
              fontSize: 12, lineHeight: 1.6, fontWeight: 700,
            }}>
              {verdictGood ? (
                <>
                  ✅ <b>クラウド復元 OK</b>
                  <div style={{ fontWeight: 500, fontSize: 11, marginTop: 2 }}>
                    詳細ログも保持されています · 3 スタイル分離も維持されています
                  </div>
                </>
              ) : (
                <>
                  ⚠️ <b>確認が必要です</b>
                  <div style={{ fontWeight: 500, fontSize: 11, marginTop: 2 }}>
                    {stats.keyMismatch > 0 && `key 不整合 ${stats.keyMismatch} 件 / `}
                    {detailRate !== null && detailRate < 80 && `詳細ログ保持 ${detailRate}%`}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ ok, warn, label, note }) {
  const tint = ok ? { bg: "rgba(16, 185, 129, 0.06)", border: "rgba(16, 185, 129, 0.30)", color: "#A7F3D0", icon: "✅" }
            : warn ? { bg: "rgba(245, 158, 11, 0.06)", border: "rgba(245, 158, 11, 0.30)", color: "#FCD34D", icon: "⚠️" }
            : { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.30)", color: "#FCA5A5", icon: "❌" };
  return (
    <div style={{
      padding: "7px 12px", borderRadius: 8,
      background: tint.bg, border: `1px solid ${tint.border}`,
      color: tint.color, lineHeight: 1.55,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600 }}>{tint.icon} {label}</div>
      {note && <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2, fontWeight: 500 }}>{note}</div>}
    </div>
  );
}

function Mini({ ok, label, got, of }) {
  return (
    <div style={{
      fontSize: 10.5,
      color: ok ? "#A7F3D0" : "#FCD34D",
      fontWeight: 500,
      letterSpacing: "0.005em",
    }}>
      <span style={{ fontWeight: 700, marginRight: 3 }}>{ok ? "✓" : "⚠"}</span>
      {label}: <b className="num">{got}</b> / <span className="num">{of}</span>
    </div>
  );
}
