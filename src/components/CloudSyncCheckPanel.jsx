import { useMemo, useState, memo } from "react";
import { cloudEnabled } from "../lib/supabaseClient.js";

/**
 * Round 87: クラウド同期チェックパネル
 *
 * DevTools / Supabase 管理画面を見なくても、 画面上で:
 *   ・クラウド同期済みか
 *   ・Supabase に詳細ログが保存されているか
 *   ・別端末から復元されたデータか
 *   ・style が保持されているか (key 整合性)
 *   ・reasoning / boatsSnapshot / weatherSnapshot が復元されているか
 *   ・結果 / 収支 / ROI が復元されているか
 * を一目で確認できる。
 *
 * 折りたたみ式 (デフォルト閉)。 ユーザーが必要時に開いて確認。
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

    // スタイル別件数
    const byStyle = { steady: 0, balanced: 0, aggressive: 0 };
    for (const p of buys) {
      if (byStyle[p.profile] != null) byStyle[p.profile]++;
    }

    // key 整合性: ${dateKey}_${raceId}_${style} の suffix が profile と一致するか
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

    // 収支再現可否
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

  // 全体ステータス判定
  const overallStatus = (() => {
    if (!cloudOk) return { level: "info", text: "ローカルのみ動作", icon: "💾", color: "#94a3b8" };
    if (!authUser) return { level: "info", text: "未ログイン (ローカルのみ)", icon: "🔓", color: "#fbbf24" };
    if (syncStatus?.state === "syncing") return { level: "info", text: "同期中…", icon: "🔄", color: "#bae6fd" };
    if (syncStatus?.state === "error") return { level: "error", text: "同期失敗", icon: "🚨", color: "#fca5a5" };
    if (stats.keyMismatch > 0) return { level: "error", text: "key 不整合あり", icon: "🚨", color: "#fca5a5" };
    if (syncStatus?.state === "synced") return { level: "ok", text: "クラウド同期 OK", icon: "✅", color: "#34d399" };
    return { level: "info", text: "未同期", icon: "⏳", color: "#94a3b8" };
  })();

  const restoredCount = syncStatus?.stats?.cloudOnly || 0;
  const lastSyncAgo = syncStatus?.lastAt ? Math.floor((Date.now() - syncStatus.lastAt) / 60000) : null;

  // 詳細ログ完全率
  const detailRate = stats.buys > 0 ? Math.round((stats.withBoats / stats.buys) * 100) : null;

  return (
    <section className="card p-3 mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, color: "inherit",
        }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 14, fontWeight: 700 }}>☁️ クラウド同期チェック</span>
            <span style={{
              padding: "2px 10px", borderRadius: 999,
              background: overallStatus.color + "20",
              border: `1px solid ${overallStatus.color}80`,
              color: overallStatus.color,
              fontSize: 11, fontWeight: 700,
            }}>
              {overallStatus.icon} {overallStatus.text}
            </span>
          </div>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {expanded ? "▲ 閉じる" : "▼ 詳細を見る"}
          </span>
        </div>
        {!expanded && cloudOk && authUser && stats.buys > 0 && (
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
            買い推奨 {stats.buys} 件 / 詳細ログ {stats.withBoats} 件 / 結果反映 {stats.finalized} 件
            {restoredCount > 0 && <span> / クラウドから復元 {restoredCount} 件</span>}
          </div>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2" style={{ fontSize: 12 }}>
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
                  ? `pulled ${syncStatus.stats.pulled} 件 / pushed ${syncStatus.stats.pushed} 件 / cloudOnly ${syncStatus.stats.cloudOnly} 件 / localOnly ${syncStatus.stats.localOnly} 件`
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
          <div>
            <div className="font-bold mb-1" style={{ color: "#bae6fd", fontSize: 11 }}>
              📦 詳細ログ保持 (買い推奨 {stats.buys} 件中)
            </div>
            <div style={{ paddingLeft: 12 }}>
              <Mini ok={stats.withBoats === stats.buys} label="boatsSnapshot (6 艇分)" got={stats.withBoats} of={stats.buys} />
              <Mini ok={stats.withWeather === stats.buys} label="weatherSnapshot (風/波)" got={stats.withWeather} of={stats.buys} />
              <Mini ok={stats.withReasoning === stats.buys} label="reasoning (whyBuy / maxRisk)" got={stats.withReasoning} of={stats.buys} />
              <Mini ok={stats.withInTrust === stats.buys} label="inTrust (1号艇信頼度)" got={stats.withInTrust} of={stats.buys} />
              <Mini ok={stats.withVerificationVersion === stats.buys} label="verificationVersion" got={stats.withVerificationVersion} of={stats.buys} />
            </div>
            {detailRate !== null && (
              <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4, paddingLeft: 12 }}>
                {detailRate === 100 ? "✅ すべての買い推奨に判断材料が完全保存されています"
                : detailRate >= 80 ? `🟡 ${detailRate}% 保持 (一部古いデータに欠落あり)`
                : `🔴 ${detailRate}% — 詳細ログが大半欠落 (Supabase migration を確認)`}
              </div>
            )}
          </div>

          {/* === ⑤ 3 スタイル分離維持 === */}
          <div>
            <div className="font-bold mb-1" style={{ color: "#bae6fd", fontSize: 11 }}>
              🏆 3 スタイル分離 ({stats.keyMismatch === 0 ? "✅ 維持" : "🚨 不整合あり"})
            </div>
            <div style={{ paddingLeft: 12, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
              <span>🛡️ 安定: <b>{stats.byStyle.steady}</b> 件</span>
              <span>⚖️ バランス: <b>{stats.byStyle.balanced}</b> 件</span>
              <span>🎯 攻め: <b>{stats.byStyle.aggressive}</b> 件</span>
            </div>
            {stats.keyMismatch > 0 && (
              <div style={{ fontSize: 10, color: "#fca5a5", marginTop: 4, paddingLeft: 12 }}>
                🚨 key suffix と profile が不一致: {stats.keyMismatch} 件
                {stats.mismatchSamples.length > 0 && (
                  <div className="opacity-90">
                    例: {stats.mismatchSamples.map((s) => `${s.key} (profile=${s.profile})`).join(" / ")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* === ⑥ 結果固定 + 収支再現 === */}
          <div>
            <div className="font-bold mb-1" style={{ color: "#bae6fd", fontSize: 11 }}>
              🔒 結果反映 + 収支再現
            </div>
            <div style={{ paddingLeft: 12, fontSize: 11 }}>
              <div>
                結果確定済み: <b>{stats.finalized}</b> / {stats.buys} 件
              </div>
              {stats.pnl.stake > 0 && (
                <>
                  <div>
                    賭金: {stats.pnl.stake.toLocaleString()} 円 / 戻り: {stats.pnl.ret.toLocaleString()} 円
                  </div>
                  <div style={{ color: stats.pnl.roi >= 1 ? "#34d399" : "#fca5a5", fontWeight: 700 }}>
                    ROI: {Math.round(stats.pnl.roi * 100)}% / 的中: {stats.pnl.hits} / {stats.finalized}
                  </div>
                </>
              )}
              {stats.pnl.stake === 0 && stats.buys > 0 && (
                <div style={{ opacity: 0.7 }}>結果確定待ち (発走 + 5 分後に「🔄 最新にする」)</div>
              )}
            </div>
          </div>

          {/* === 仮データ警告 === */}
          {isSampleMode && (
            <div style={{
              padding: "6px 10px", borderRadius: 6,
              background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)",
              color: "#fca5a5", fontSize: 11, lineHeight: 1.5,
            }}>
              ⚠️ 仮データ動作中 — このセッションのデータは公開ログには反映されません
            </div>
          )}

          {/* === まとめ判定 === */}
          {cloudOk && authUser && stats.buys > 0 && (
            <div style={{
              padding: "8px 10px", borderRadius: 6, marginTop: 6,
              background: stats.keyMismatch === 0 && (detailRate === null || detailRate >= 80)
                ? "rgba(16,185,129,0.10)"
                : "rgba(251,191,36,0.10)",
              border: `1px solid ${stats.keyMismatch === 0 && (detailRate === null || detailRate >= 80) ? "rgba(16,185,129,0.4)" : "rgba(251,191,36,0.4)"}`,
              color: stats.keyMismatch === 0 && (detailRate === null || detailRate >= 80) ? "#a7f3d0" : "#fde68a",
              fontSize: 12, lineHeight: 1.6, fontWeight: 700,
            }}>
              {stats.keyMismatch === 0 && (detailRate === null || detailRate >= 80) ? (
                <>
                  ✅ <b>クラウド復元 OK</b><br/>
                  <span style={{ fontWeight: 500, fontSize: 11 }}>
                    詳細ログも保持されています / 3 スタイル分離も維持されています
                  </span>
                </>
              ) : (
                <>
                  ⚠️ <b>確認が必要です</b><br/>
                  <span style={{ fontWeight: 500, fontSize: 11 }}>
                    {stats.keyMismatch > 0 && `key 不整合 ${stats.keyMismatch} 件 / `}
                    {detailRate !== null && detailRate < 80 && `詳細ログ保持 ${detailRate}%`}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* === チェック行 (ok / warn / error 表示) === */
function Row({ ok, warn, label, note }) {
  const color = ok ? "#a7f3d0" : warn ? "#fde68a" : "#fca5a5";
  const bg = ok ? "rgba(16,185,129,0.06)" : warn ? "rgba(251,191,36,0.06)" : "rgba(239,68,68,0.06)";
  const border = ok ? "rgba(16,185,129,0.3)" : warn ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.3)";
  const icon = ok ? "✅" : warn ? "⚠️" : "❌";
  return (
    <div style={{
      padding: "6px 10px", borderRadius: 6,
      background: bg, border: `1px solid ${border}`,
      color, lineHeight: 1.5,
    }}>
      <div style={{ fontSize: 12 }}>{icon} {label}</div>
      {note && <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

/* === ミニ チェック (詳細ログ各項目用) === */
function Mini({ ok, label, got, of }) {
  return (
    <div style={{ fontSize: 11, marginBottom: 1, color: ok ? "#a7f3d0" : "#fde68a" }}>
      {ok ? "✓" : "⚠"} {label}: <b>{got}</b> / {of}
    </div>
  );
}
