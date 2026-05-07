import { memo, useEffect, useState, useMemo } from "react";
import { yen, startEpoch } from "../lib/format.js";
import { isNotificationSupported, getPermissionState, isNotificationEnabled, enableNotifications } from "../lib/notifyBuy.js";

/**
 * Round 114: 「もうすぐ判定」 専用ミニ一覧
 *
 * 競艇のオッズは発走 15 分前にならないと安定しないため、 このアプリは
 * 「-15 分の安定オッズで予想を出す」 ことを軸にしている。
 *
 * 本コンポーネントは:
 *   ・「いま判定中」 (発走 0〜15 分前) の買い/見送り判定を強調表示
 *   ・「もうすぐ判定」 (発走 15〜20 分前) のレースをカウントダウン表示
 *   ・1 秒ごとに残り時間を更新 (見ているだけで時計が進む)
 *
 * 画面冒頭に置くことで、 ユーザーは 50+ レース全体を見渡さなくても
 * 「次に何が判定されるか」 だけ集中して見られる。
 */
const SOON_WINDOW_MIN = 20; // 「もうすぐ判定」 はゲートまであと 5 分以内 (= 発走 15-20 分前) に絞る

export default memo(ImminentRaces);

function ImminentRaces({ races, recommendations, onPickRace }) {
  // 1 秒ごとに残り時間表示を更新 (countdown 体験)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 通知 ON/OFF 状態 (= 許可済 + ユーザー有効化済)
  const [notifyState, setNotifyState] = useState({
    supported: isNotificationSupported(),
    perm: getPermissionState(),
    enabled: isNotificationEnabled(),
    busy: false,
    msg: "",
  });
  const handleEnableNotify = async () => {
    setNotifyState((s) => ({ ...s, busy: true, msg: "" }));
    const r = await enableNotifications();
    setNotifyState({
      supported: isNotificationSupported(),
      perm: getPermissionState(),
      enabled: isNotificationEnabled(),
      busy: false,
      msg: r.ok ? "✅ 通知を ON にしました" : `⚠️ ${r.reason}`,
    });
  };

  const { active, soon } = useMemo(() => {
    if (!races || races.length === 0) return { active: [], soon: [] };
    const a = [];
    const s = [];
    for (const r of races) {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) continue;
      const minutesToStart = (e - now) / 60000;
      if (minutesToStart <= 0) continue; // 締切後はスキップ
      if (minutesToStart <= 15) {
        a.push({ race: r, minutesToStart });
      } else if (minutesToStart <= SOON_WINDOW_MIN) {
        s.push({ race: r, minutesToStart });
      }
    }
    a.sort((x, y) => x.minutesToStart - y.minutesToStart);
    s.sort((x, y) => x.minutesToStart - y.minutesToStart);
    return { active: a, soon: s };
  }, [races, now]);

  if (active.length === 0 && soon.length === 0) return null;

  return (
    <section className="card p-3 card-glow" style={{
      minHeight: 100,
      background: "linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(167, 139, 250, 0.04) 100%), var(--bg-card)",
      border: "1px solid rgba(56, 189, 248, 0.32)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#bae6fd", letterSpacing: "0.02em" }}>
          🎯 もうすぐ判定 — 発走 20 分前から始まる注目レース
        </div>
        {/* Round 114: 通知 ON ボタン (許可状態に応じた表示) */}
        {notifyState.supported && !notifyState.enabled && notifyState.perm !== "denied" && (
          <button
            type="button"
            onClick={handleEnableNotify}
            disabled={notifyState.busy}
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              padding: "5px 11px",
              borderRadius: 8,
              border: "1px solid rgba(251,191,36,0.45)",
              background: "rgba(251,191,36,0.16)",
              color: "#fde68a",
              cursor: notifyState.busy ? "wait" : "pointer",
            }}>
            {notifyState.busy ? "..." : "🔔 買い判定が出たら通知する"}
          </button>
        )}
        {notifyState.supported && notifyState.enabled && (
          <span style={{ fontSize: 10.5, color: "#a7f3d0" }}>🔔 通知 ON</span>
        )}
        {notifyState.perm === "denied" && (
          <span style={{ fontSize: 10.5, color: "#fca5a5" }} title="ブラウザ設定で再度許可してください">🔕 通知 拒否</span>
        )}
      </div>
      {notifyState.msg && (
        <div style={{ fontSize: 11.5, color: notifyState.msg.startsWith("✅") ? "#a7f3d0" : "#fcd34d", marginBottom: 8 }}>
          {notifyState.msg}
        </div>
      )}

      {/* === いま判定中 (-15 分以内) === */}
      {active.length > 0 && (
        <div className="mb-3">
          <div style={{
            fontSize: 11,
            color: "#a7f3d0",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            ⚡ いま判定中 ({active.length})
          </div>
          <div className="grid grid-cols-1 gap-2">
            {active.slice(0, 6).map(({ race, minutesToStart }) => (
              <ActiveRow key={race.id} race={race} minutesToStart={minutesToStart}
                rec={recommendations?.[race.id]} onPick={onPickRace} />
            ))}
            {active.length > 6 && (
              <div className="text-xs opacity-70 text-center" style={{ paddingTop: 4 }}>
                ...他 {active.length - 6} レース
              </div>
            )}
          </div>
        </div>
      )}

      {/* === もうすぐ判定 (15-20 分前) === */}
      {soon.length > 0 && (
        <div>
          <div style={{
            fontSize: 11,
            color: "#ddd6fe",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            ⏳ もうすぐ判定 ({soon.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {soon.slice(0, 8).map(({ race, minutesToStart }) => {
              const eta = Math.max(0, Math.ceil(minutesToStart - 15));
              return (
                <button key={race.id}
                  onClick={() => onPickRace?.(race.id)}
                  className="btn btn-ghost"
                  style={{
                    fontSize: 11.5,
                    padding: "6px 10px",
                    minHeight: 32,
                    color: "#ddd6fe",
                    border: "1px solid rgba(167,139,250,0.40)",
                  }}>
                  {race.venue} {race.raceNo}R · あと <span className="num">{eta}</span> 分で開始
                </button>
              );
            })}
            {soon.length > 8 && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", alignSelf: "center" }}>
                ...他 {soon.length - 8}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* === いま判定中レースの 1 行カード === */
function ActiveRow({ race, minutesToStart, rec, onPick }) {
  const dec = rec?.decision;
  const m = Math.max(0, Math.ceil(minutesToStart));
  const sec = Math.max(0, Math.floor(minutesToStart * 60) % 60);

  let chip = null;
  let bg = "rgba(0,0,0,0.22)";
  let border = "1px solid rgba(255,255,255,0.06)";
  let labelText, labelColor;

  if (dec === "buy" && rec?.grade === "S") {
    chip = "🟢 勝負"; labelColor = "#10b981";
    bg = "linear-gradient(180deg, rgba(16, 185, 129, 0.16), rgba(0,0,0,0.20))";
    border = "1px solid rgba(16, 185, 129, 0.55)";
    labelText = rec.main ? `${rec.main.kind} ${rec.main.combo}` : "—";
  } else if (dec === "buy") {
    chip = "🟢 買い"; labelColor = "#34d399";
    bg = "linear-gradient(180deg, rgba(16, 185, 129, 0.10), rgba(0,0,0,0.18))";
    border = "1px solid rgba(16, 185, 129, 0.40)";
    labelText = rec.main ? `${rec.main.kind} ${rec.main.combo}` : "—";
  } else if (dec === "odds-pending") {
    chip = "⏳ 確定待ち"; labelColor = "#a78bfa";
    border = "1px solid rgba(167, 139, 250, 0.40)";
    labelText = rec?.reason || "オッズ確定待ち";
  } else if (dec === "no-odds") {
    chip = "⚠️ オッズ未取得"; labelColor = "#f59e0b";
    border = "1px solid rgba(245, 158, 11, 0.40)";
    labelText = "オッズ取得不可";
  } else if (dec === "data-checking") {
    chip = "🔄 確認中"; labelColor = "#3b82f6";
    border = "1px solid rgba(59, 130, 246, 0.40)";
    labelText = "整合性チェック中";
  } else {
    chip = "🔴 見送り"; labelColor = "#f87171";
    border = "1px solid rgba(239, 68, 68, 0.32)";
    labelText = rec?.reason || "見送り";
  }

  return (
    <button
      onClick={() => onPick?.(race.id)}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 10,
        background: bg,
        border,
        cursor: "pointer",
        color: "var(--text-primary)",
        transition: "transform 0.1s ease",
        minHeight: 60,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: labelColor }}>{chip}</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {race.venue} <span className="num">{race.raceNo}R</span>
          </span>
          <span style={{ fontSize: 11, opacity: 0.75 }} className="num">
            ({race.startTime})
          </span>
        </div>
        <span className="num" style={{
          fontSize: 13,
          fontWeight: 800,
          color: m <= 5 ? "#fca5a5" : m <= 10 ? "#fde68a" : "#bae6fd",
          background: "rgba(0,0,0,0.30)",
          padding: "3px 10px",
          borderRadius: 999,
          letterSpacing: "0.02em",
        }}>
          {m === 0 ? `あと ${sec}秒` : `あと ${m} 分`}
        </span>
      </div>
      <div style={{
        fontSize: 12,
        color: dec === "buy" ? "#a7f3d0" : "var(--text-secondary)",
        marginTop: 4,
        letterSpacing: "0.005em",
      }}>
        {labelText}
        {dec === "buy" && rec?.main && (
          <>
            <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
            <span style={{ color: "#fde68a", fontWeight: 700 }}>
              EV {rec.main.ev?.toFixed(2)}
            </span>
            <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
            <span className="num">{yen(rec.main.stake)}</span>
          </>
        )}
      </div>
    </button>
  );
}
