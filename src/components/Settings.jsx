import { useMemo } from "react";
import { yen } from "../lib/format.js";
import { getStorageStats, estimateStorageSize, getLastSaveStatus } from "../lib/storage.js";

/**
 * 設定 — 資金管理 + リスク感覚 + 仮想モード切替 + リセット + 保存ステータス
 */
export default function Settings({ settings, setSettings, switchVirtualMode, switchProfile, onReset, predictions, authUser, onOpenLogin, onLogout, onManualSync, syncStatus }) {
  const stats = useMemo(() => getStorageStats(predictions || {}), [predictions]);
  const sz = useMemo(() => estimateStorageSize(), [predictions]);
  const lastSave = getLastSaveStatus();
  const isVirtual = !!settings.virtualMode;
  function setMode(virtual) {
    if (virtual === isVirtual) return;
    if (switchVirtualMode) switchVirtualMode(virtual);
    else setSettings((prev) => ({ ...prev, virtualMode: virtual }));
  }
  function handleProfileChange(p) {
    if (settings.riskProfile === p) return;
    if (switchProfile) switchProfile(p);
    else setSettings((prev) => ({ ...prev, riskProfile: p }));
  }
  function field(key, label) {
    return (
      <div>
        <label className="text-xs opacity-80">{label}</label>
        <input className="input mt-1 num" type="number" value={settings[key] ?? 0}
          onChange={(e) => {
            const v = +e.target.value || 0;
            setSettings((prev) => ({ ...prev, [key]: v })); // functional: stale closure 撃退
          }} />
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
                style={{ minHeight: 88, cursor: "pointer", transition: "all 0.12s" }}
                className={"p-2 rounded-lg border-2 text-left " + (settings.riskProfile === o.k ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830]")}
                onClick={() => handleProfileChange(o.k)}>
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

      {/* Round 45: クラウド同期パネル */}
      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">☁️ クラウド同期 (任意)</h2>
        {authUser ? (
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 22 }}>👤</span>
                <div>
                  <div className="font-bold text-sm">{authUser.username}</div>
                  <div className="text-xs opacity-70">ログイン中 (個人情報なし)</div>
                </div>
              </div>
              <button onClick={onLogout} className="btn btn-ghost text-xs" style={{ minHeight: 36 }}>
                🚪 ログアウト
              </button>
            </div>
            <div className="alert-ok text-xs mb-3" style={{ lineHeight: 1.55 }}>
              ✅ 別端末・別ブラウザでも同じ履歴が見られます<br/>
              5 秒ごとに変更を自動同期します (debounced)
            </div>
            <button onClick={onManualSync} className="btn btn-primary w-full text-xs"
              disabled={syncStatus?.state === "syncing"}
              style={{ minHeight: 44 }}>
              {syncStatus?.state === "syncing" ? "🔄 同期中…" : "🔄 今すぐ全件同期"}
            </button>
            <div className="text-xs mt-2" style={{ lineHeight: 1.55 }}>
              {syncStatus?.state === "synced" && (
                <span style={{ color: "#a7f3d0" }}>
                  ✅ 同期完了 ({syncStatus.lastAt ? new Date(syncStatus.lastAt).toLocaleTimeString("ja-JP") : "—"})
                  {syncStatus.stats && (
                    <> / pulled {syncStatus.stats.pulled || 0} pushed {syncStatus.stats.pushed || 0}</>
                  )}
                </span>
              )}
              {syncStatus?.state === "syncing" && <span style={{ color: "#bae6fd" }}>🔄 同期中…</span>}
              {syncStatus?.state === "error" && (
                <span style={{ color: "#fecaca" }}>❌ 同期失敗: {syncStatus.error}</span>
              )}
              {syncStatus?.state === "idle" && <span className="opacity-60">待機中</span>}
            </div>
          </div>
        ) : (
          <div>
            <div className="alert-info text-xs mb-3" style={{ lineHeight: 1.55 }}>
              💡 ログインすると <b>PC / iPhone / 別ブラウザ</b> で同じ履歴を共有できます。<br/>
              <b>個人情報は不要</b> (ユーザー名 + パスワードのみ)。<br/>
              ログインしなくても、これまで通り使えます。
            </div>
            <button onClick={onOpenLogin} className="btn btn-primary w-full"
              style={{ minHeight: 48 }}>
              🔑 ログイン / 新規登録
            </button>
          </div>
        )}
      </section>

      {/* Round 43-44: 保存ステータスパネル (正確な表記) */}
      <section className="card p-4">
        <h2 className="text-lg font-bold mb-3">💾 保存ステータス (この端末)</h2>

        {/* 注意書き: 保存仕様 — 誤解させない */}
        <div className="alert-warn text-xs mb-3" style={{ lineHeight: 1.55 }}>
          ⚠️ <b>このアプリにはログイン機能がありません。</b><br/>
          データは <b>このブラウザの localStorage に保存</b> されています。<br/>
          以下の場合、データは <b>消える可能性</b> があります:
          <ul className="mt-1" style={{ paddingLeft: 16, listStyle: "disc" }}>
            <li>ブラウザのキャッシュ・サイトデータを削除した</li>
            <li>シークレットモード (プライベートブラウズ) で利用した</li>
            <li>別端末・別ブラウザでアクセスした (共有されません)</li>
            <li>ブラウザ設定でストレージを制限している</li>
          </ul>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <Stat label="総保存件数" value={stats.total} />
          <Stat label="今日" value={stats.today} />
          <Stat label="直近 7 日" value={stats.last7days} />
          <Stat label="直近 30 日" value={stats.last30days} />
          <Stat label="🧪 エア" value={stats.air} color="#67e8f9" />
          <Stat label="💰 リアル" value={stats.real} color="#fcd34d" />
          <Stat label="✏️ 手動記録" value={stats.manual} />
          <Stat label="✅ 確定済" value={stats.settled} />
          <Stat label="⏳ 未確定" value={stats.pending} />
        </div>
        {/* Round 51-E: 3 スタイル別件数 */}
        <div className="mt-3 pt-3" style={{ borderTop: "1px dashed rgba(255,255,255,0.1)" }}>
          <div className="text-xs opacity-70 mb-2 font-bold">📋 スタイル別 (3 タイプ完全分離)</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="🛡️ 本命型" value={stats.steady} color="#93c5fd" />
            <Stat label="⚖️ バランス型" value={stats.balanced} color="#fcd34d" />
            <Stat label="🎯 穴狙い型" value={stats.aggressive} color="#fca5a5" />
          </div>
        </div>
        <div className="text-xs opacity-70 mt-3" style={{ lineHeight: 1.55 }}>
          📅 最古: <b>{stats.oldestDate || "—"}</b> / 最新: <b>{stats.newestDate || "—"}</b>
          {sz && <> / ストレージ使用: <b>{sz.kb} KB</b></>}
        </div>
        <div className="text-xs mt-2" style={{ lineHeight: 1.55, color: lastSave.ok ? "#a7f3d0" : "#fecaca" }}>
          {lastSave.ok
            ? `✅ 保存 OK${lastSave.lastSavedAt ? ` (最終 ${new Date(lastSave.lastSavedAt).toLocaleTimeString("ja-JP")})` : ""}`
            : `❌ 保存失敗: ${lastSave.error || "不明なエラー"}`}
        </div>
        <div className="text-xs opacity-70 mt-3 p-2 rounded" style={{ background: "rgba(0,0,0,0.18)", lineHeight: 1.55 }}>
          📦 <b>保存仕様</b> (このブラウザ内):<br/>
          ・<b>このブラウザに直近 30 日の AI 記録を保持</b> (90 日超は自動整理)<br/>
          ・<b>手動記録は GC されない</b> — ただしブラウザデータを削除すれば消えます<br/>
          ・エア / リアル / スタイル別 を分離して集計<br/>
          ・<b>サーバーには一切送信していません</b> (プライバシー優先)
        </div>
        <div className="text-xs opacity-60 mt-3 p-2 rounded" style={{ background: "rgba(56,189,248,0.08)", lineHeight: 1.55 }}>
          💡 <b>長期保管したい場合の今の対処法</b>:<br/>
          ・大事な記録は手動で控えを取る (スクリーンショット等)<br/>
          ・常用ブラウザを固定する (キャッシュクリアの影響を最小化)<br/>
          ・将来、ログイン + クラウド保存対応の予定はあります (現時点では未実装)
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

function Stat({ label, value, color }) {
  return (
    <div className="p-2 rounded" style={{ background: "rgba(0,0,0,0.22)" }}>
      <div className="opacity-70">{label}</div>
      <div className="num font-bold mt-1" style={{ fontSize: 18, color: color || "#e7eef8" }}>{value}</div>
    </div>
  );
}
