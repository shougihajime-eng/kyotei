import { useEffect, useMemo, useState, useCallback } from "react";
import Header from "./components/Header.jsx";
import Dashboard from "./components/Dashboard.jsx";
import RaceList from "./components/RaceList.jsx";
import RaceDetail from "./components/RaceDetail.jsx";
import Verify from "./components/Verify.jsx";
import Stats from "./components/Stats.jsx";
import LossAnalysis from "./components/LossAnalysis.jsx";
import Settings from "./components/Settings.jsx";
import Onboarding from "./components/Onboarding.jsx";

import { loadState, saveState, clearState } from "./lib/storage.js";
import { fetchTodaySchedule, fetchRaceProgram, fetchRaceOdds, fetchRaceResult, fetchBeforeInfo } from "./lib/api.js";
import { evaluateRace, buildBuyRecommendation, computeOverallGrade } from "./lib/predict.js";
import { suggestStyle } from "./components/StyleSelector.jsx";
import { defaultSettings, summarizeToday, perRaceCap } from "./lib/money.js";
import { todayDate, todayKey, startEpoch } from "./lib/format.js";
import { generateSampleRaces, buildRacesFromSchedule, mergeProgram, mergeOdds, mergeBeforeInfo } from "./lib/sample.js";

const REFRESH_COOLDOWN_MS = 60 * 1000;

export default function App() {
  /* === Persistent state === */
  const initial = loadState() || {};
  const [settings, setSettings] = useState({ ...defaultSettings(), ...(initial.settings || {}) });
  const [predictions, setPredictions] = useState(initial.predictions || {});

  /* === Volatile state === */
  const [tab, setTab] = useState("home");
  const [races, setRaces] = useState([]);
  const [selectedRaceId, setSelectedRaceId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  /* news: マウント時に 1 回だけ取得 (キャッシュ s-maxage=600s なので軽量) */
  const [news, setNews] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/news").then(r => r.ok ? r.json() : null).then(j => {
      if (cancelled || !j?.items) return;
      setNews(j.items);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [settings.onboardingDone]);

  /* === Persist on change === */
  useEffect(() => {
    saveState({ settings, predictions });
  }, [settings, predictions]);

  /* === Compute evals + recommendations for all races === */
  const today = useMemo(() => summarizeToday(predictions), [predictions]);
  const cap = useMemo(() => perRaceCap(settings, today), [settings, today]);

  const evals = useMemo(() => {
    const map = {};
    for (const r of races) map[r.id] = evaluateRace(r, news);
    return map;
  }, [races, news]);

  const recommendations = useMemo(() => {
    const map = {};
    for (const r of races) {
      const ev = evals[r.id];
      const rec = buildBuyRecommendation(ev, settings.riskProfile, cap, false);
      // 総合評価 ★ (荒れ期待度を加味して再評価)
      rec.overall = computeOverallGrade(ev, rec, ev?.windWave);
      map[r.id] = rec;
    }
    return map;
  }, [races, evals, settings.riskProfile, cap]);

  /* === AI判断スナップショット ===
       無限ループ防止のため、races の変更時のみ記録 (recommendations 依存は削除)。
       記録のタイミング: 「最新にする」ボタンで races が更新された直後の 1 回のみ。 */
  const racesSignature = useMemo(() =>
    races.map((r) => r.id + ":" + (r.startTime || "")).join("|"),
  [races]);

  useEffect(() => {
    if (races.length === 0) return;
    // recommendations が未計算の場合があるため、recommendations を直接読み取らず
    // races のみに依存して snapshot
    setPredictions((prev) => {
      const next = { ...prev };
      let changed = false;
      const stamp = new Date().toISOString();
      for (const r of races) {
        const rec = recommendations[r.id];
        if (!rec) continue;
        const dateKey = (r.date || "").replace(/-/g, "");
        const key = `${dateKey}_${r.id}`;
        const existing = next[key] || {};
        const combos = rec.decision === "buy"
          ? rec.items.map((it) => ({ kind: it.kind, combo: it.combo, stake: it.stake, odds: it.odds, prob: it.prob, ev: it.ev, role: it.role, grade: it.grade }))
          : [];
        const updated = {
          ...existing,
          key, date: r.date, raceId: r.id, venue: r.venue, jcd: r.jcd, raceNo: r.raceNo,
          startTime: r.startTime, decision: rec.decision, combos,
          totalStake: rec.decision === "buy" ? rec.total : 0,
          grade: rec.grade || null,
          profile: rec.profile || settings.riskProfile, // スタイル別集計のため
          snapshotAt: stamp,
        };
        const cmp = (o) => JSON.stringify({
          d: o.decision || "",
          c: (o.combos || []).map(c => `${c.kind}:${c.combo}`).join("|"),
        });
        if (cmp(existing) !== cmp(updated)) {
          next[key] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racesSignature]); // ⚠ 重要: recommendations 依存を外して無限ループ撃退

  /* === 「最新にする」ボタン: 一括取得 ===
     try-finally で setRefreshing(false) を保証。
     API 失敗時はサンプルにフォールバックし、画面は壊さない。
     連打防止: 60 秒クールダウン + refreshing フラグで二重実行禁止。 */
  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    const since = lastRefreshAt ? Date.now() - new Date(lastRefreshAt).getTime() : Infinity;
    if (since < REFRESH_COOLDOWN_MS) {
      const left = Math.ceil((REFRESH_COOLDOWN_MS - since) / 1000);
      setRefreshMsg(`⏳ あと ${left} 秒お待ちください (連打防止)`);
      setTimeout(() => setRefreshMsg(""), 2500);
      return;
    }
    setRefreshing(true);
    setRefreshMsg("🔄 最新データを確認中…");
    const startedAt = Date.now();
    try {

    /* ① 今日のスケジュール */
    const sched = await fetchTodaySchedule();
    let baseRaces;
    if (sched?.ok && sched.total_races > 0) {
      baseRaces = buildRacesFromSchedule(sched);
    } else {
      baseRaces = generateSampleRaces();
    }

    /* ② 勝負候補 (発走±60分) を絞る → program/odds/result を並列取得 */
    const now = Date.now();
    const candidates = baseRaces.filter((r) => {
      const e = startEpoch(r.date, r.startTime);
      if (e == null) return false;
      const diff = (e - now) / 60000;
      return diff >= -30 && diff <= 60;
    }).slice(0, 12);
    setRefreshMsg(`🔄 確認中… (候補 ${candidates.length} レース)`);

    const dateK = todayKey();
    const enriched = await Promise.all(candidates.map(async (r) => {
      const e = startEpoch(r.date, r.startTime);
      const finished = e != null && now > e + 5 * 60 * 1000;
      // 直前情報は発走前 30 分以内 + 発走後 10 分のみ取得 (それ以外は不要 / 未公開)
      const fetchBefore = e != null && now > e - 30 * 60 * 1000 && now < e + 10 * 60 * 1000;
      const [prog, odds, before, result] = await Promise.all([
        fetchRaceProgram(r.jcd, r.raceNo, dateK),
        fetchRaceOdds(r.jcd, r.raceNo, dateK),
        fetchBefore ? fetchBeforeInfo(r.jcd, r.raceNo, dateK) : Promise.resolve(null),
        finished ? fetchRaceResult(r.jcd, r.raceNo, dateK) : Promise.resolve(null),
      ]);
      return { id: r.id, prog, odds, before, result };
    }));

    const enrichedMap = Object.fromEntries(enriched.map((e) => [e.id, e]));
    const merged = baseRaces.map((r) => {
      const enr = enrichedMap[r.id];
      if (!enr) return r;
      let next = r;
      if (enr.prog)   next = mergeProgram(next, enr.prog);
      if (enr.odds)   next = mergeOdds(next, enr.odds);
      if (enr.before) next = mergeBeforeInfo(next, enr.before);
      if (enr.result?.first) next = { ...next, apiResult: enr.result };
      return next;
    });
    setRaces(merged);

    /* ③ 結果をあずかる予測へマージ */
    const dateKey = todayDate().replace(/-/g, "");
    const stamp = new Date().toISOString();
    setPredictions((prev) => {
      const out = { ...prev };
      for (const r of merged) {
        if (!r.apiResult?.first) continue;
        const key = `${dateKey}_${r.id}`;
        const existing = out[key];
        if (!existing) continue;
        if (existing.result?.first) continue;
        const winnerTri = `${r.apiResult.first}-${r.apiResult.second}-${r.apiResult.third}`;
        const winnerEx = `${r.apiResult.first}-${r.apiResult.second}`;
        const winnerWin = String(r.apiResult.first);
        let payout = 0, hit = false;
        for (const c of (existing.combos || [])) {
          const yenPer100 = c.kind === "3連単" ? r.apiResult.payouts?.trifecta?.[winnerTri]
                          : c.kind === "2連単" ? r.apiResult.payouts?.exacta?.[winnerEx]
                          : c.kind === "単勝" ? r.apiResult.payouts?.tan?.[winnerWin]
                          : 0;
          const matched = c.combo === (c.kind === "3連単" ? winnerTri : c.kind === "2連単" ? winnerEx : winnerWin);
          if (matched && yenPer100) {
            payout += (c.stake / 100) * yenPer100;
            hit = true;
          }
        }
        out[key] = {
          ...existing,
          result: {
            first: r.apiResult.first, second: r.apiResult.second, third: r.apiResult.third,
            payouts: r.apiResult.payouts, fetchedAt: stamp,
          },
          payout, hit, pnl: payout - (existing.totalStake || 0),
        };
      }
      return out;
    });

    /* ④ 高速 2 段階追加取得 — オッズだけ 5秒間隔で 2 回追い更新
       (発走直前のオッズ変動を捉えやすくする / 連打防止のため最大 2 回まで) */
    const fastTargets = candidates.filter((r) => {
      const e = startEpoch(r.date, r.startTime);
      const m = e != null ? (e - Date.now()) / 60000 : null;
      return m != null && m >= -5 && m <= 30; // 発走前 30 分〜発走後 5 分のみ
    }).slice(0, 8); // 最大 8 レース

    if (fastTargets.length > 0) {
      for (let pass = 1; pass <= 2; pass++) {
        await new Promise((r) => setTimeout(r, 5000)); // 5 秒間隔
        setRefreshMsg(`🔄 オッズ追い更新 ${pass}/2 (${fastTargets.length}レース)…`);
        const oddsResults = await Promise.all(fastTargets.map(async (r) => {
          const odds = await fetchRaceOdds(r.jcd, r.raceNo, dateK);
          return { id: r.id, odds };
        }));
        setRaces((prev) => {
          if (!prev || prev.length === 0) return prev;
          const idx = Object.fromEntries(oddsResults.filter(x => x.odds).map(x => [x.id, x.odds]));
          let changed = false;
          const next = prev.map((r) => {
            if (!idx[r.id]) return r;
            changed = true;
            return mergeOdds(r, idx[r.id]);
          });
          return changed ? next : prev;
        });
      }
    }

    /* ⑤ 完了 (最低 400 ms 表示) */
    const elapsed = Date.now() - startedAt;
    if (elapsed < 400) await new Promise((r2) => setTimeout(r2, 400 - elapsed));
    const ts = new Date().toISOString();
    setLastRefreshAt(ts);
    if (sched?.ok) {
      setRefreshMsg(`✅ 更新しました (${sched.total_venues}会場 / ${sched.total_races}レース / 詳細 ${candidates.length}件 / オッズ ${fastTargets.length}件 ×3 段階)`);
    } else {
      setRefreshMsg(`⚠️ 一時的に取得できません。少し時間を空けて再実行してください — サンプル動作中`);
    }
    setTimeout(() => setRefreshMsg(""), 5000);
    } catch (err) {
      // 例外時は前回データを保持し、UI を壊さない
      console.error("[refreshAll] error:", err);
      setRefreshMsg("⚠️ 一時的に混雑しています。少し時間を空けて再実行してください");
      setTimeout(() => setRefreshMsg(""), 5000);
    } finally {
      // finally で必ずフラグを下ろす (永続的にボタンが無効化されるのを防止)
      setRefreshing(false);
    }
  }, [refreshing, lastRefreshAt]);

  /* === 起動時に 1 回だけ取得 (cooldown bypass) === */
  useEffect(() => {
    if (!settings.onboardingDone) return;
    setLastRefreshAt(null); // bypass cooldown for first call
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.onboardingDone]);

  /* === 手動記録 (リアル/エア舟券フォーム) === */
  const handleManualBet = useCallback((record) => {
    // 現在のスタイルも記録に含めて、後で集計
    const enhanced = { ...record, profile: record.profile || settings.riskProfile };
    setPredictions((prev) => ({ ...prev, [record.key]: enhanced }));
  }, [settings.riskProfile]);

  const handleDeleteRecord = useCallback((key) => {
    setPredictions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /* === ユーザーアクション: 結論カードから「記録する」 ===
        virtualOverride を渡せば仮想/実 の選択を強制 (例: 「リアル購入として記録」 ボタンから true) */
  const handleRecord = useCallback((race, rec, opts = {}) => {
    const dateKey = (race.date || "").replace(/-/g, "");
    const key = `${dateKey}_${race.id}`;
    const virtual = opts.real === true ? false
                  : opts.real === false ? true
                  : !!settings.virtualMode;
    setPredictions((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        recorded: true,
        recordedAt: new Date().toISOString(),
        virtual,
      },
    }));
  }, [settings.virtualMode]);

  /* === Reset === */
  const handleReset = useCallback(() => {
    if (!confirm("全データを消去します。よろしいですか?")) return;
    clearState();
    setSettings(defaultSettings());
    setPredictions({});
    setRaces([]);
    setLastRefreshAt(null);
    setRefreshMsg("リセットしました");
    setTimeout(() => setRefreshMsg(""), 3000);
  }, []);

  /* === Weekly summary for badge === */
  const weekly = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const arr = Object.values(predictions || {}).filter((p) => p.date >= weekAgo);
    const buys = arr.filter((p) => p.decision === "buy" && p.totalStake > 0);
    const settled = buys.filter((p) => p.result?.first);
    let stake = 0, ret = 0, hits = 0;
    settled.forEach((p) => { stake += p.totalStake; ret += p.payout || 0; if (p.hit) hits++; });
    return { count: buys.length, settled: settled.length, hits, stake, ret, pnl: ret - stake, roi: stake > 0 ? ret / stake : 0 };
  }, [predictions]);

  /* === Onboarding === */
  if (!settings.onboardingDone) {
    return (
      <Onboarding settings={settings} setSettings={setSettings}
        onClose={() => setSettings((prev) => ({ ...prev, onboardingDone: true }))} />
    );
  }

  /* === Main === */
  const selectedRace = selectedRaceId ? races.find((r) => r.id === selectedRaceId) : null;

  return (
    <div className="min-h-screen">
      <Header tab={tab} setTab={(t) => { setTab(t); setSelectedRaceId(null); }}
        today={today} settings={settings} setSettings={setSettings}
        refreshing={refreshing} onRefresh={refreshAll} lastRefreshAt={lastRefreshAt}
        suggestedStyle={suggestStyle(evals, predictions)} />

      <main className="pb-20">
        {tab === "home" && (
          <Dashboard
            races={races} predictions={predictions} recommendations={recommendations}
            today={today} weekly={weekly}
            refreshing={refreshing} refreshMsg={refreshMsg} lastRefreshAt={lastRefreshAt}
            onRefresh={refreshAll} onRecord={handleRecord} settings={settings}
            onPickRace={(t) => setTab(t)}
          />
        )}
        {tab === "list" && (
          <RaceList
            races={races} evals={evals} recommendations={recommendations}
            onPickRace={(id) => { setSelectedRaceId(id); setTab("detail"); }}
          />
        )}
        {tab === "detail" && (
          <RaceDetail
            race={selectedRace}
            evalRes={selectedRace ? evals[selectedRace.id] : null}
            recommendation={selectedRace ? recommendations[selectedRace.id] : null}
            onRecord={handleRecord}
            onBack={() => setTab("list")}
            virtualMode={settings.virtualMode}
          />
        )}
        {tab === "verify" && (
          <Verify predictions={predictions}
            onManualBet={handleManualBet}
            onDeleteRecord={handleDeleteRecord} />
        )}
        {tab === "stats" && (
          <Stats predictions={predictions} lastRefreshAt={lastRefreshAt} />
        )}
        {tab === "analysis" && (
          <LossAnalysis predictions={predictions} races={races} />
        )}
        {tab === "settings" && (
          <Settings settings={settings} setSettings={setSettings} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
