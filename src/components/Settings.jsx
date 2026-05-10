/**
 * 設定 (2026-05-10 Round 174 全面刷新)
 * SPEC §6.2 に厳密に従い 4 項目のみ:
 *   ① ログイン (Supabase)
 *   ② ログアウト
 *   ③ データ削除 (フレッシュスタート)
 *   ④ 通知 ON/OFF (将来の通知機能の土台)
 *
 * 削除済 (Round 168-169 / Round 174):
 *   - スタイル 3 択 (Round 168)
 *   - 資金 4 入力欄 + セーフティ買い ON/OFF (Round 169)
 *   - 「🧪 購入モード」 エア/リアル切替 (Round 174 — SPEC §5 で切替禁止)
 *   - 「🆕 バージョン管理 (v2/legacy)」 (Round 174 — 旧 EV 用)
 *   - 「💾 保存ステータス」 (Round 174 — ユーザーが見たい情報ではない)
 */
import { useState } from "react";
import {
  enableNotifications,
  disableNotifications,
  isNotificationSupported,
  getPermissionState,
} from "../lib/notifyBuy.js";

export default function Settings({
  settings,
  setSettings,
  onReset,
  authUser,
  onOpenLogin,
  onLogout,
  onManualSync,
  syncStatus,
}) {
  const [includeCloud, setIncludeCloud] = useState(false);
  const [keepSettings, setKeepSettings] = useState(true);
  const notificationsEnabled = settings.notificationsEnabled ?? false;
  const notifSupported = isNotificationSupported();
  const notifPermission = getPermissionState();

  /* Round 177: トグル ON → ブラウザ通知許可リクエスト連動。
     許可されなかった場合は settings 側も OFF に戻す (UI を実態に揃える)。 */
  async function toggleNotifications(next) {
    if (next) {
      const r = await enableNotifications();
      if (!r.ok) {
        // 許可拒否や非対応 → トグルを OFF のまま
        setSettings((prev) => ({ ...prev, notificationsEnabled: false }));
        if (typeof window !== "undefined" && window.__kyoteiToast) {
          window.__kyoteiToast(`⚠️ ${r.reason}`, "neg");
        }
        return;
      }
      setSettings((prev) => ({ ...prev, notificationsEnabled: true }));
      if (typeof window !== "undefined" && window.__kyoteiToast) {
        window.__kyoteiToast("🔔 通知 ON — 激荒れ警報をお届けします", "ok");
      }
    } else {
      disableNotifications();
      setSettings((prev) => ({ ...prev, notificationsEnabled: false }));
      if (typeof window !== "undefined" && window.__kyoteiToast) {
        window.__kyoteiToast("🔕 通知 OFF にしました", "info");
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">

      {/* ===== ① / ② ログイン / ログアウト ===== */}
      <section className="card p-4" style={{
        border: authUser ? "2px solid rgba(16,185,129,0.4)" : "2px solid rgba(251,191,36,0.4)",
        background: authUser ? "rgba(16,185,129,0.04)" : "rgba(251,191,36,0.04)",
      }}>
        <h2 className="text-base font-bold mb-2" style={{ color: authUser ? "#a7f3d0" : "#fde68a" }}>
          {authUser ? "☁️ ログイン中 (端末間同期 ON)" : "💾 ログインなし (この端末のみ保存)"}
        </h2>
        {authUser ? (
          <div>
            <div className="text-xs opacity-90 mb-3" style={{ lineHeight: 1.6 }}>
              ・データは <b>Supabase クラウド</b> に保存されます<br/>
              ・別端末からも同じ履歴を参照できます<br/>
              ・現在のログイン: <b>{authUser.email || authUser.username}</b>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={onManualSync}
                disabled={syncStatus?.state === "syncing"}
                style={{
                  flex: 1, minHeight: 44, padding: "8px 12px",
                  borderRadius: 10, border: "1.5px solid rgba(56,189,248,0.55)",
                  background: "rgba(56,189,248,0.10)",
                  color: "#bae6fd", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                {syncStatus?.state === "syncing" ? "🔄 同期中…" : "🔄 今すぐ同期"}
              </button>
              <button
                onClick={onLogout}
                style={{
                  flex: 1, minHeight: 44, padding: "8px 12px",
                  borderRadius: 10, border: "1.5px solid rgba(148, 163, 184, 0.40)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#cbd5e1", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                🚪 ログアウト
              </button>
            </div>
            {syncStatus?.state === "synced" && (
              <div style={{ fontSize: 11, color: "#a7f3d0", marginTop: 8 }}>
                ✅ 同期完了 ({syncStatus.lastAt ? new Date(syncStatus.lastAt).toLocaleTimeString("ja-JP") : "—"})
              </div>
            )}
            {syncStatus?.state === "error" && (
              <div style={{ fontSize: 11, color: "#fecaca", marginTop: 8 }}>
                ❌ 同期失敗: {syncStatus.error || "原因不明"}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="text-xs mb-3" style={{ lineHeight: 1.6, color: "#fde68a" }}>
              ⚠️ 現在は <b>このブラウザ内</b> のみに保存されています。<br/>
              ・別端末では履歴が見られません<br/>
              ・ブラウザクリアで全データ消失します
            </div>
            <button
              onClick={onOpenLogin}
              style={{
                width: "100%", minHeight: 48, padding: "10px 16px",
                borderRadius: 10, border: "1.5px solid rgba(56,189,248,0.6)",
                background: "rgba(56,189,248,0.15)",
                color: "#bae6fd",
                fontSize: 14, fontWeight: 800, cursor: "pointer",
              }}>
              🔑 ログイン / 新規登録 → 端末間同期を開始
            </button>
          </div>
        )}
      </section>

      {/* ===== ④ 通知 ON/OFF ===== */}
      <section className="card p-4">
        <h2 className="text-base font-bold mb-2" style={{ color: "#FCD34D" }}>
          🔔 通知
        </h2>
        <div className="text-xs opacity-85 mb-3" style={{ lineHeight: 1.6 }}>
          将来、 以下のタイミングで通知をお届けする予定です:
          <ul className="mt-1" style={{ paddingLeft: 18, listStyle: "disc" }}>
            <li>「今ここだけ勝負」 — 5 場で激荒れ警報が出た時</li>
            <li>「期待値急上昇」 — オッズが想定より美味しくなった時</li>
            <li>「危険レース」 — 1 号艇が飛びそうな兆候が強まった時</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={() => toggleNotifications(!notificationsEnabled)}
          aria-pressed={notificationsEnabled}
          style={{
            width: "100%", minHeight: 56, padding: "12px 16px",
            borderRadius: 12,
            border: notificationsEnabled
              ? "2px solid rgba(34, 211, 238, 0.55)"
              : "1.5px solid rgba(148, 163, 184, 0.35)",
            background: notificationsEnabled
              ? "linear-gradient(180deg, rgba(34, 211, 238, 0.18) 0%, rgba(255,255,255,0.02) 100%)"
              : "rgba(255,255,255,0.03)",
            color: notificationsEnabled ? "#67E8F9" : "#cbd5e1",
            fontSize: 15, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            letterSpacing: "0.02em",
            boxShadow: notificationsEnabled
              ? "0 0 0 1px rgba(34, 211, 238, 0.40), 0 4px 16px rgba(34, 211, 238, 0.20)"
              : "inset 0 1px 0 rgba(255,255,255,0.02)",
          }}>
          <span>{notificationsEnabled ? "🔔 通知 ON" : "🔕 通知 OFF"}</span>
          <span style={{
            display: "inline-block",
            width: 50, height: 28, borderRadius: 999,
            background: notificationsEnabled ? "#22D3EE" : "#475569",
            position: "relative",
            transition: "background 0.18s ease",
          }}>
            <span style={{
              position: "absolute",
              top: 3, left: notificationsEnabled ? 25 : 3,
              width: 22, height: 22, borderRadius: "50%",
              background: "#fff",
              transition: "left 0.18s ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.30)",
            }} />
          </span>
        </button>
        <div className="text-xs opacity-70 mt-2" style={{ lineHeight: 1.5 }}>
          {!notifSupported && (
            <span style={{ color: "#FCA5A5" }}>⚠️ このブラウザは通知に対応していません</span>
          )}
          {notifSupported && notifPermission === "denied" && (
            <span style={{ color: "#FCA5A5" }}>
              ⚠️ ブラウザで通知が拒否されています。 アドレスバー左の鍵 / 情報アイコンから許可し直してください
            </span>
          )}
          {notifSupported && notifPermission === "granted" && notificationsEnabled && (
            <span style={{ color: "#A7F3D0" }}>✅ ブラウザ通知の許可済み — 激荒れ警報をリアルタイムでお届けします</span>
          )}
          {notifSupported && notifPermission === "default" && (
            <span>※ ON にすると通知許可をリクエストします</span>
          )}
        </div>
      </section>

      {/* ===== ③ データ削除 (フレッシュスタート) ===== */}
      <section className="card p-4" style={{
        border: "2px solid rgba(239,68,68,0.35)",
        background: "rgba(239,68,68,0.04)",
      }}>
        <h2 className="text-base font-bold mb-2" style={{ color: "#fca5a5" }}>
          🗑 データ削除 (フレッシュスタート)
        </h2>
        <div className="text-xs opacity-85 mb-3" style={{ lineHeight: 1.6 }}>
          以下を完全消去します:
          <ul className="mt-1" style={{ paddingLeft: 18, listStyle: "disc" }}>
            <li>全予想 / 買い目 / 結果記録</li>
            <li>見送りログ / 万舟見逃し記録</li>
            <li>学習履歴 / 重み調整履歴</li>
            <li>累計成績 / 収支</li>
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
              設定 (通知 ON/OFF など) を保持する
              <br />
              <span className="opacity-70">OFF にすると初期状態に戻ります</span>
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
                  : "未ログインのため無効 (このブラウザのみ削除)"}
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
          }}>
          🗑 すべてのデータを削除する
        </button>
        <div className="text-xs opacity-70 mt-2" style={{ lineHeight: 1.5 }}>
          ※ 確認ダイアログで再度 「OK」 が必要です。 取り消しできません。
        </div>
      </section>

    </div>
  );
}
