import { useMemo, useState } from "react";
import { yen } from "../lib/format.js";
import { getStorageStats, estimateStorageSize, getLastSaveStatus } from "../lib/storage.js";

/**
 * 設定 — 資金管理 + リスク感覚 + 仮想モード切替 + リセット + 保存ステータス
 */
export default function Settings({ settings, setSettings, switchVirtualMode, switchProfile, onReset, predictions, visiblePredictions, versionInfo, onPurgeLegacy, authUser, onOpenLogin, onLogout, onManualSync, syncStatus }) {
  // Round 94: フレッシュスタート オプション
  const [includeCloud, setIncludeCloud] = useState(false);
  const [keepSettings, setKeepSettings] = useState(true);
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
      {/* Round 95: 保存方式表示 (Supabase 主管理化) */}
      <section className="card p-4" style={{
        border: authUser ? "2px solid rgba(16,185,129,0.4)" : "2px solid rgba(251,191,36,0.4)",
        background: authUser ? "rgba(16,185,129,0.04)" : "rgba(251,191,36,0.04)",
      }}>
        <h2 className="text-base font-bold mb-2" style={{ color: authUser ? "#a7f3d0" : "#fde68a" }}>
          {authUser ? "☁️ 現在: Supabase 主管理 (推奨)" : "💾 現在: ローカル管理のみ"}
        </h2>
        {authUser ? (
          <div className="text-xs opacity-90" style={{ lineHeight: 1.6 }}>
            ・データは <b>Supabase クラウド</b> に保存され、 別端末からも同じ履歴を参照できます<br/>
            ・1 秒ごとに自動同期 (debounced)<br/>
            ・ローカル localStorage は一時キャッシュとして併用<br/>
            ・現在のログイン: <b>{authUser.email || authUser.username}</b>
          </div>
        ) : (
          <div className="text-xs" style={{ lineHeight: 1.6 }}>
            <div style={{ color: "#fde68a", marginBottom: 8 }}>
              ⚠️ 現在は <b>このブラウザの localStorage のみ</b> に保存されています。
              <br/>
              ・別端末では履歴が見られません<br/>
              ・ブラウザクリアで全データ消失します
            </div>
            <button
              onClick={onOpenLogin}
              style={{
                width: "100%", minHeight: 44, padding: "8px 16px",
                borderRadius: 10, border: "1.5px solid rgba(56,189,248,0.6)",
                background: "rgba(56,189,248,0.15)",
                color: "#bae6fd",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
              🔑 ログイン or 新規登録 → クラウド管理に切替
            </button>
            <div className="opacity-70 mt-2" style={{ fontSize: 10 }}>
              ※ Supabase 環境変数が未設定の場合は LoginModal で詳細手順を案内します
            </div>
          </div>
        )}
      </section>

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

      {/* Round 52: v2 / legacy 分離パネル + 比較表示 */}
      <section id="version-panel" className="card p-4">
        <h2 className="text-lg font-bold mb-3">🆕 バージョン管理 (v2 / legacy)</h2>
        <div className="alert-info text-xs mb-3" style={{ lineHeight: 1.55 }}>
          このアプリは新ロジック (v2) で<b>新規スタート</b>しています。<br/>
          以前の不完全データ (legacy) は<b>自動的に分離</b>され、デフォルトの集計には使われません。<br/>
          v2 データのみで成績・グラフ・収支が完結します。
        </div>

        {/* v2 / legacy 比較パネル */}
        <VersionCompareTable predictions={predictions} />

        <div className="mt-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!settings.showLegacy}
              onChange={(e) => {
                const newVal = e.target.checked;
                setSettings((prev) => ({ ...prev, showLegacy: newVal }));
                // トースト通知 (即時フィードバック)
                if (typeof window !== "undefined" && window.__kyoteiToast) {
                  window.__kyoteiToast(newVal ? "⚠️ legacy 含めて表示に切替" : "✅ v2 のみ表示に切替", newVal ? "info" : "ok");
                }
              }} />
            <span>legacy データも表示する (比較用 — 通常は OFF 推奨)</span>
          </label>
          <div className="text-xs opacity-70 mt-1" style={{ lineHeight: 1.5 }}>
            ON にすると Stats / 検証 / グラフで legacy も含めて集計されます。<br/>
            OFF (デフォルト) なら v2 のみで完全分離。
          </div>
        </div>
        {versionInfo?.legacyCount > 0 && (
          <div className="mt-3 p-2 rounded" style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.3)" }}>
            <div className="text-xs mb-2" style={{ color: "#fde68a", lineHeight: 1.5 }}>
              ⚠️ legacy データ {versionInfo.legacyCount} 件 (古いロジックで保存)。<br/>
              ストレージを節約したい場合は削除できます (v2 には影響なし)。
            </div>
            <button onClick={onPurgeLegacy} className="btn btn-ghost text-xs" style={{ minHeight: 36 }}>
              🗑 legacy データを完全削除 (v2 は残ります)
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

      {/* Round 94: フレッシュスタート (大きく目立つ位置に) */}
      <section className="card p-4" style={{
        border: "2px solid rgba(239,68,68,0.4)",
        background: "rgba(239,68,68,0.04)",
      }}>
        <h3 className="text-base font-bold mb-2" style={{ color: "#fca5a5" }}>
          🗑 フレッシュスタート (全データリセット)
        </h3>
        <div className="text-xs opacity-85 mb-3" style={{ lineHeight: 1.6 }}>
          以下を完全消去します:
          <ul className="mt-1" style={{ paddingLeft: 18, listStyle: "disc" }}>
            <li>全 AI 予想 / 買い目 / 結果記録</li>
            <li>公開検証ログ (kyoteiPublicLog)</li>
            <li>学習履歴 (kyoteiLearningLog)</li>
            <li>累計成績 / 連敗 / ROI</li>
          </ul>
        </div>

        {/* オプション */}
        <div className="space-y-2 mb-3 p-3 rounded" style={{
          background: "rgba(0,0,0,0.20)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <label className="flex items-start gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={keepSettings}
              onChange={(e) => setKeepSettings(e.target.checked)}
              style={{ marginTop: 3, minWidth: 16, minHeight: 16 }}
            />
            <span style={{ lineHeight: 1.5 }}>
              設定 (予算 / リスク感覚 / モード) を保持する
              <br />
              <span className="opacity-70">OFF にすると初期設定にも戻ります</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer text-xs" style={{
            opacity: authUser ? 1 : 0.5,
          }}>
            <input
              type="checkbox"
              checked={includeCloud && !!authUser}
              disabled={!authUser}
              onChange={(e) => setIncludeCloud(e.target.checked)}
              style={{ marginTop: 3, minWidth: 16, minHeight: 16 }}
            />
            <span style={{ lineHeight: 1.5 }}>
              ☁️ Supabase クラウドデータも削除
              <br />
              <span className="opacity-70">
                {authUser
                  ? "ログイン中のため有効 (取り消し不可)"
                  : "未ログインのため無効 (ローカルのみ削除されます)"}
              </span>
            </span>
          </label>
        </div>

        <button
          onClick={() => onReset && onReset({ preserveSettings: keepSettings, deleteCloud: includeCloud && !!authUser })}
          style={{
            width: "100%", minHeight: 50, padding: "10px 16px",
            borderRadius: 10, border: "2px solid rgba(239,68,68,0.6)",
            background: "rgba(239,68,68,0.18)",
            color: "#fecaca",
            fontSize: 14, fontWeight: 800, cursor: "pointer",
            transition: "all 0.12s",
          }}>
          🗑 フレッシュスタートを実行
        </button>
        <div className="text-xs opacity-70 mt-2" style={{ lineHeight: 1.5 }}>
          ※ 確認ダイアログで再度 「OK」 が必要です。 取り消しできません。
          <br />
          ※ 本日からの新規 AI 予想 (verificationVersion=v3) で蓄積を再開します。
        </div>
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

/* === Round 52: v2 / legacy 比較テーブル === */
function VersionCompareTable({ predictions }) {
  const all = useMemo(() => Object.values(predictions || {}), [predictions]);
  const v2 = useMemo(() => all.filter(p => p?.version === "v2"), [all]);
  const legacy = useMemo(() => all.filter(p => !p?.version || p?.version === "v1"), [all]);
  function summarize(arr) {
    const buys = arr.filter(p => p.decision === "buy" && (p.totalStake || 0) > 0);
    const settled = buys.filter(p => p.result?.first);
    let stake = 0, ret = 0, hits = 0;
    settled.forEach(p => { stake += p.totalStake; ret += p.payout || 0; if (p.hit) hits++; });
    const dates = arr.map(p => p.date).filter(Boolean).sort();
    return {
      count: arr.length,
      buys: buys.length,
      settled: settled.length,
      hits,
      hitRate: settled.length > 0 ? hits / settled.length : null,
      pnl: ret - stake,
      roi: stake > 0 ? ret / stake : null,
      oldest: dates[0] || null,
      newest: dates[dates.length - 1] || null,
    };
  }
  const v2Sum = summarize(v2);
  const legSum = summarize(legacy);
  const fmt = (v) => v == null ? "—" : `${Math.round(v * 100)}%`;
  const fmtPnl = (v) => `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString()}円`;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full text-xs num" style={{ borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #243154", color: "#9fb0c9" }}>
            <th className="text-left p-2">バージョン</th>
            <th className="text-right p-2">件数</th>
            <th className="text-right p-2">買い</th>
            <th className="text-right p-2">的中率</th>
            <th className="text-right p-2">回収率</th>
            <th className="text-right p-2">PnL</th>
            <th className="text-right p-2">期間</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(56,189,248,0.06)" }}>
            <td className="p-2 font-bold" style={{ color: "#67e8f9" }}>🆕 v2 (新ロジック)</td>
            <td className="text-right p-2">{v2Sum.count}</td>
            <td className="text-right p-2">{v2Sum.buys}</td>
            <td className="text-right p-2">{fmt(v2Sum.hitRate)}</td>
            <td className="text-right p-2 font-bold" style={{ color: v2Sum.roi >= 1 ? "#34d399" : v2Sum.roi != null ? "#f87171" : "#9fb0c9" }}>{fmt(v2Sum.roi)}</td>
            <td className="text-right p-2" style={{ color: v2Sum.pnl >= 0 ? "#34d399" : "#f87171" }}>{fmtPnl(v2Sum.pnl)}</td>
            <td className="text-right p-2 opacity-70 text-xs">{v2Sum.oldest || "—"}〜{v2Sum.newest || "—"}</td>
          </tr>
          {legSum.count > 0 && (
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(107,114,128,0.06)" }}>
              <td className="p-2 font-bold opacity-80">📦 legacy (旧)</td>
              <td className="text-right p-2 opacity-80">{legSum.count}</td>
              <td className="text-right p-2 opacity-80">{legSum.buys}</td>
              <td className="text-right p-2 opacity-80">{fmt(legSum.hitRate)}</td>
              <td className="text-right p-2 opacity-80">{fmt(legSum.roi)}</td>
              <td className="text-right p-2 opacity-80">{fmtPnl(legSum.pnl)}</td>
              <td className="text-right p-2 opacity-70 text-xs">{legSum.oldest || "—"}〜{legSum.newest || "—"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
