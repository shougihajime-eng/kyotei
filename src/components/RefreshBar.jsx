import { useEffect, useState } from "react";

/**
 * 「最新にする」ボタン + クールダウン (60秒) + 状態表示。
 * ユーザーが押した時だけデータ取得。
 */
export default function RefreshBar({ onRefresh, refreshing, refreshMsg, lastRefreshAt, cooldownSec = 60 }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // 30秒間隔で十分 (1秒だと毎秒再レンダで画面揺れの原因)
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const since = lastRefreshAt ? Math.floor((now - new Date(lastRefreshAt).getTime()) / 1000) : null;
  const cooldownLeft = since != null && since < cooldownSec ? cooldownSec - since : 0;
  const lastLabel = since == null ? "未取得"
    : since < 5 ? "たった今"
    : since < 60 ? `${since}秒前`
    : `${Math.floor(since / 60)}分前`;
  const buttonLabel = refreshing ? "🔄 取得中…"
    : cooldownLeft > 0 ? `あと ${cooldownLeft}秒`
    : "🔄 最新にする";
  const disabled = refreshing || cooldownLeft > 0;

  return (
    <div className="card p-3" style={{ borderWidth: 2, borderColor: "#22d3ee" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn btn-primary" disabled={disabled} onClick={onRefresh}
          style={{ minWidth: 180, padding: "10px 22px", fontSize: 15, fontWeight: 800 }}>
          {buttonLabel}
        </button>
        <div className="text-xs opacity-70">
          最終更新: <b>{lastLabel}</b>
        </div>
      </div>
      {refreshMsg && (
        <div className={"mt-2 text-sm " + (refreshMsg.startsWith("✅") ? "alert-ok" : refreshMsg.startsWith("⚠") ? "alert-warn" : "alert-info")}>
          {refreshMsg}
        </div>
      )}
    </div>
  );
}
