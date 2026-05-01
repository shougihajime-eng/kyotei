import { useState, useEffect } from "react";
import { todayDate } from "../lib/format.js";

/**
 * 手動記録フォーム — リアル / エア の舟券をユーザー自身で登録できる。
 *
 *   保存先: predictions[`manual_<id>`] (既存の AI スナップショットと同じ辞書に統一)
 *   - manuallyRecorded: true
 *   - virtual: true (エア) | false (リアル)
 *   - 日付/場/R/方式/買い目/金額/メモ/結果/払戻 (結果と払戻は後で更新可)
 *
 *   使い方: Verify から「+ 手動記録」ボタン → モーダル表示 → 入力 → 保存
 */

const VENUES = ["桐生","戸田","江戸川","平和島","多摩川","浜名湖","蒲郡","常滑","津","三国","びわこ","住之江","尼崎","鳴門","丸亀","児島","宮島","徳山","下関","若松","芦屋","福岡","唐津","大村"];
const KINDS = ["3連単", "2連単", "3連複", "2連複"];

export default function ManualBetForm({ open, onClose, onSubmit, initial }) {
  const [mode, setMode] = useState("real"); // real | air
  const [date, setDate] = useState(todayDate());
  const [venue, setVenue] = useState("桐生");
  const [raceNo, setRaceNo] = useState(1);
  const [kind, setKind] = useState("3連単");
  const [combo, setCombo] = useState("");
  const [stake, setStake] = useState(1000);
  const [memo, setMemo] = useState("");
  const [reflection, setReflection] = useState("");
  const [imageData, setImageData] = useState(null);   // base64 (Data URL) — OCR は将来
  const [matchedAi, setMatchedAi] = useState(null);   // "yes" | "no" | null
  const [hasResult, setHasResult] = useState(false);
  const [first, setFirst] = useState(1);
  const [second, setSecond] = useState(2);
  const [third, setThird] = useState(3);
  const [payout, setPayout] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setMode(initial.virtual === false ? "real" : "air");
      setDate(initial.date || todayDate());
      setVenue(initial.venue || "桐生");
      setRaceNo(initial.raceNo || 1);
      setKind(initial.combos?.[0]?.kind || "3連単");
      setCombo(initial.combos?.[0]?.combo || "");
      setStake(initial.totalStake || 1000);
      setMemo(initial.memo || "");
      if (initial.result?.first) {
        setHasResult(true);
        setFirst(initial.result.first);
        setSecond(initial.result.second);
        setThird(initial.result.third);
        setPayout(initial.payout || 0);
      }
      setReflection(initial.reflection || "");
      setImageData(initial.imageData || null);
      setMatchedAi(initial.matchedAi != null ? (initial.matchedAi ? "yes" : "no") : null);
    } else {
      setDate(todayDate());
      setError("");
      setReflection("");
      setImageData(null);
      setMatchedAi(null);
    }
  }, [open, initial]);

  /* 画像アップロード (OCR は将来。今は base64 で保存) */
  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("画像サイズは 4MB 以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result);
      setError("");
    };
    reader.onerror = () => setError("画像の読み込みに失敗しました");
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  function validateCombo(s, k) {
    const t = (s || "").trim();
    if (!t) return "買い目を入力してください";
    const sep = k.includes("複") ? /[=\-]/ : /-/;
    const parts = t.split(sep).map(p => p.trim());
    const expectN = k.startsWith("3") ? 3 : 2;
    if (parts.length !== expectN) return `${k}は ${expectN} 艇を ${k.includes("複") ? "= または -" : "-"} で区切って入力してください (例: 1-2${expectN === 3 ? "-3" : ""})`;
    for (const p of parts) {
      if (!/^[1-6]$/.test(p)) return "艇番は 1〜6 で入力してください";
    }
    if (new Set(parts).size !== parts.length) return "同じ艇番を重複して指定できません";
    return null;
  }

  function normalizeCombo(s, k) {
    const sep = k.includes("複") ? /[=\-]/ : /-/;
    const parts = s.trim().split(sep).map(p => p.trim());
    if (k.includes("複")) {
      // 連複は昇順
      parts.sort((a, b) => +a - +b);
      return parts.join("=");
    }
    return parts.join("-");
  }

  function submit() {
    const err = validateCombo(combo, kind);
    if (err) { setError(err); return; }
    if (!stake || stake < 100) { setError("金額は 100 円以上で入力してください"); return; }
    setError("");
    const normalized = normalizeCombo(combo, kind);
    const id = initial?.key || `manual_${Date.now().toString(36)}_${Math.floor(Math.random() * 9999)}`;
    let resultObj = null;
    let pnl = 0;
    let hit = false;
    if (hasResult) {
      const setBoats = new Set([first, second, third]);
      if (setBoats.size !== 3) { setError("着順は 1着・2着・3着すべて違う艇番を指定してください"); return; }
      resultObj = {
        first, second, third,
        payouts: { tan: {}, exacta: {}, trifecta: {} },
        fetchedAt: new Date().toISOString(),
      };
      // 当落判定
      const winnerTri = `${first}-${second}-${third}`;
      const winnerEx = `${first}-${second}`;
      const winnerQui = [first, second].sort((a, b) => a - b).join("=");
      const winnerTrio = [first, second, third].sort((a, b) => a - b).join("=");
      const matched =
        kind === "3連単" ? normalized === winnerTri
      : kind === "2連単" ? normalized === winnerEx
      : kind === "2連複" ? normalized === winnerQui
      : kind === "3連複" ? normalized === winnerTrio
      : false;
      if (matched) {
        hit = true;
        pnl = (payout || 0) - stake;
      } else {
        pnl = -stake;
      }
    }

    const record = {
      key: id,
      date,
      raceId: id,
      venue,
      raceNo: +raceNo,
      startTime: "",
      decision: "buy",
      combos: [{ kind, combo: normalized, stake, odds: payout > 0 && stake > 0 ? +(payout / stake).toFixed(2) : 0, prob: null, ev: null, role: "本命", grade: "—" }],
      totalStake: stake,
      grade: null,
      virtual: mode === "air",
      manuallyRecorded: true,
      memo,                                                 // 購入理由メモ
      reflection,                                           // 反省メモ (新規)
      imageData,                                            // base64 (画像アップロード — 将来 OCR)
      matchedAi: matchedAi == null ? null : matchedAi === "yes",
      result: resultObj || undefined,
      payout: hasResult ? (payout || 0) : 0,
      hit,
      pnl,
      recordedAt: new Date().toISOString(),
      snapshotAt: new Date().toISOString(),
    };
    onSubmit(record);
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="card" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">{initial ? "✏️ 舟券を編集" : "📝 舟券を手動記録"}</h3>
          <button onClick={onClose} className="btn btn-ghost text-xs">✕</button>
        </div>

        {/* エア / リアル 切替 */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMode("real")}
            className={"flex-1 p-2 rounded-lg border-2 " + (mode === "real" ? "border-amber-400 bg-[#3a2d0a]" : "border-[#243154] bg-[#0f1830] opacity-60")}>
            💰 リアル舟券
          </button>
          <button onClick={() => setMode("air")}
            className={"flex-1 p-2 rounded-lg border-2 " + (mode === "air" ? "border-cyan-400 bg-[#0e2440]" : "border-[#243154] bg-[#0f1830] opacity-60")}>
            🧪 エア舟券
          </button>
        </div>

        {/* 日付 / 場 / R */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="text-xs opacity-70">日付</label>
            <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs opacity-70">場</label>
            <select className="select mt-1" value={venue} onChange={(e) => setVenue(e.target.value)}>
              {VENUES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs opacity-70">レース</label>
            <select className="select mt-1" value={raceNo} onChange={(e) => setRaceNo(+e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}R</option>)}
            </select>
          </div>
        </div>

        {/* 方式 / 買い目 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="text-xs opacity-70">方式</label>
            <select className="select mt-1" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs opacity-70">買い目 (例: 1-2-3 / 1=2)</label>
            <input className="input mt-1 font-mono" value={combo} onChange={(e) => setCombo(e.target.value)} placeholder={kind === "3連単" || kind === "2連単" ? "1-2-3" : "1=2=3"} />
          </div>
        </div>

        {/* 金額 / メモ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs opacity-70">金額 (円)</label>
            <input className="input mt-1 num" type="number" min="100" step="100" value={stake} onChange={(e) => setStake(+e.target.value || 0)} />
          </div>
          <div>
            <label className="text-xs opacity-70">購入理由 (任意)</label>
            <input className="input mt-1" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 1号艇のイン逃げ狙い" />
          </div>
        </div>

        {/* AI 一致判定 (任意) */}
        <div className="mt-3 p-2 rounded bg-[#0f1830]/60 border border-[#243154]">
          <label className="text-xs opacity-70">🤖 この買い目は AI の予想と一致していましたか？ (任意)</label>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setMatchedAi(matchedAi === "yes" ? null : "yes")}
              className={"flex-1 p-2 rounded-lg border-2 text-xs " + (matchedAi === "yes" ? "border-emerald-400 bg-[#053527] text-emerald-200" : "border-[#243154] bg-[#0f1830] opacity-60")}>
              ✅ 一致 (AI 推奨どおり)
            </button>
            <button
              type="button"
              onClick={() => setMatchedAi(matchedAi === "no" ? null : "no")}
              className={"flex-1 p-2 rounded-lg border-2 text-xs " + (matchedAi === "no" ? "border-rose-400 bg-[#3b1d1d] text-rose-200" : "border-[#243154] bg-[#0f1830] opacity-60")}>
              ❌ 不一致 (自分の判断)
            </button>
          </div>
          <div className="text-xs opacity-60 mt-1">→ 自分の判断 vs AI の的中率を後で比較できます</div>
        </div>

        {/* 反省メモ (任意) */}
        <div className="mt-3">
          <label className="text-xs opacity-70">📝 反省メモ / 気付き (任意)</label>
          <textarea
            className="input mt-1"
            rows={2}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="例: 強風だったのに穴を狙ってしまった / 1号艇のSTが遅かった"
            style={{ resize: "vertical" }}
          />
        </div>

        {/* 画像アップロード (スクショ / 写真 — OCR は将来) */}
        <div className="mt-3">
          <label className="text-xs opacity-70">📸 舟券画像 (スクショ / 写真 — 任意)</label>
          <input
            className="input mt-1 text-xs"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ padding: "6px 8px" }}
          />
          {imageData && (
            <div className="mt-2 relative">
              <img
                src={imageData}
                alt="舟券画像"
                style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid #243154", display: "block" }}
              />
              <button
                type="button"
                onClick={() => setImageData(null)}
                className="btn btn-ghost text-xs"
                style={{ position: "absolute", top: 4, right: 4, padding: "2px 8px" }}>
                ✕ 削除
              </button>
            </div>
          )}
          <div className="text-xs opacity-60 mt-1">※ 画像 OCR で買い目を自動入力する機能は今後追加予定</div>
        </div>

        {/* 結果 (任意) */}
        <div className="mt-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={hasResult} onChange={(e) => setHasResult(e.target.checked)} />
            <span>結果を入力する (払戻 / 着順)</span>
          </label>
          {hasResult && (
            <div className="mt-2 p-2 rounded bg-[#0f1830]/60">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs opacity-70">1着</label>
                  <select className="select mt-1" value={first} onChange={(e) => setFirst(+e.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}号艇</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs opacity-70">2着</label>
                  <select className="select mt-1" value={second} onChange={(e) => setSecond(+e.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}号艇</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs opacity-70">3着</label>
                  <select className="select mt-1" value={third} onChange={(e) => setThird(+e.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}号艇</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs opacity-70">払戻金 (的中時)</label>
                <input className="input mt-1 num" type="number" min="0" step="100" value={payout} onChange={(e) => setPayout(+e.target.value || 0)} placeholder="例: 17300" />
                <div className="text-xs opacity-60 mt-1">未的中の場合は 0 のままで OK (収支は -{stake}円)</div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="alert-warn text-xs mt-3">{error}</div>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn btn-ghost">キャンセル</button>
          <button onClick={submit} className="btn btn-success">
            {initial ? "更新" : "記録する"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(11,18,32,0.85)", zIndex: 50,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)",
};
const modalStyle = {
  maxWidth: 580, width: "100%", padding: 20, border: "2px solid #22d3ee",
  maxHeight: "90vh", overflowY: "auto",
};
