/**
 * Round 110: 結果バックフィル + 状態遷移サニティテスト
 *
 * 検証する状態遷移:
 *   ① 終了前のレース       → 結果無し / 「未確定」 のまま
 *   ② 締切直後 (ゴール後 5 分以内) → API がまだ結果を返さない場合 → 「未確定」 のまま
 *   ③ 終了直後 (結果公開済) → applyResultToPrediction で finalize される
 *   ④ 結果確定後の再実行     → 既に finalize 済はスキップ (重複処理防止)
 *   ⑤ 手動更新後             → 全件 finalize に揃う
 *   ⑥ 画面開きっぱなし       → 同じ predictions が重複処理されない
 *   ⑦ 再読み込み (新セッション) → 旧 finalize は維持、 残り未確定だけ取りに行く
 *
 * 実行: node scripts/backfill-results-check.mjs
 */
import {
  applyResultToPrediction,
  findUnresolvedRaces,
  backfillResults,
} from "../src/lib/finalizeResult.js";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else      { fail++; console.error("  ✗ " + label); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), `${label} → ${JSON.stringify(a)} == ${JSON.stringify(b)}`); }

console.log("\n========== 結果バックフィル / 状態遷移チェック ==========\n");

/* === 共通フィクスチャ === */
const apiResult = {
  first: 1, second: 2, third: 3,
  payouts: {
    tan: { "1": 160 },
    exacta: { "1-2": 1340 },
    trifecta: { "1-2-3": 17300 },
    quinella: { "1=2": 700 },
    trio: { "1=2=3": 2100 },
  },
};
const stamp = "2026-05-06T15:00:00.000Z";

/* === [1] applyResultToPrediction (純粋関数) === */
console.log("[1] applyResultToPrediction (純粋関数)");

// 1-A: 買い + 3連単 当たり
{
  const p = {
    decision: "buy",
    combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }],
    totalStake: 100,
  };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r.hit === true, "1-A: 3連単 1-2-3 ヒット → hit=true");
  ok(r.payout === 17300, "1-A: payout = 17300 円");
  ok(r.pnl === 17200, "1-A: pnl = 17200 (17300 - 100)");
  ok(r.finalized === true, "1-A: finalized=true");
  ok(r.result?.first === 1, "1-A: result.first=1");
}

// 1-B: 買い + 3連単 外れ
{
  const p = {
    decision: "buy",
    combos: [{ kind: "3連単", combo: "1-2-4", stake: 200 }],
    totalStake: 200,
  };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r.hit === false, "1-B: 外れ → hit=false");
  ok(r.payout === 0, "1-B: payout=0");
  ok(r.pnl === -200, "1-B: pnl=-200");
}

// 1-C: 買い + 2連複 当たり (1=2)
{
  const p = {
    decision: "buy",
    combos: [{ kind: "2連複", combo: "1=2", stake: 100 }],
    totalStake: 100,
  };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r.hit === true, "1-C: 2連複 1=2 ヒット");
  ok(r.payout === 700, "1-C: 2連複 payout=700");
}

// 1-D: 買い + 単勝 当たり
{
  const p = { decision: "buy", combos: [{ kind: "単勝", combo: "1", stake: 500 }], totalStake: 500 };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r.hit === true, "1-D: 単勝 1 ヒット");
  ok(r.payout === 800, "1-D: 単勝 payout=800 (500/100 * 160)");
  ok(r.pnl === 300, "1-D: pnl=300");
}

// 1-E: skip + intendedMain が当たっていた → skipMissed=true
{
  const p = {
    decision: "skip",
    intendedMain: { kind: "3連単", combo: "1-2-3" },
  };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r.skipMissed === true, "1-E: 見送り だが intended が的中 → skipMissed=true");
  ok(r.skipCorrect === false, "1-E: skipCorrect=false");
}

// 1-F: skip + intendedMain 外れ → skipCorrect=true
{
  const p = {
    decision: "skip",
    intendedMain: { kind: "3連単", combo: "5-6-1" },
  };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r.skipCorrect === true, "1-F: 見送り + intended 外れ → skipCorrect=true");
  ok(r.skipMissed === false, "1-F: skipMissed=false");
}

// 1-G: 既に finalize 済 → 同じ参照を返す (重複処理防止)
{
  const p = {
    decision: "buy",
    combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }],
    totalStake: 100,
    result: { first: 1, second: 2, third: 3 },
    finalized: true,
  };
  const r = applyResultToPrediction(p, apiResult, stamp);
  ok(r === p, "1-G: 既に result.first 設定済 → 元参照そのまま (重複処理防止)");
}

// 1-H: result.first 不在の apiResult はスキップ
{
  const p = { decision: "buy", combos: [], totalStake: 100 };
  const r = applyResultToPrediction(p, { first: null }, stamp);
  ok(r === p, "1-H: apiResult.first=null → 元参照そのまま");
}

/* === [2] findUnresolvedRaces (グルーピング + 過去判定) === */
console.log("\n[2] findUnresolvedRaces");

const TODAY_K = "20260506";
const predictions = {
  // 過去 (5/4) + 結果無し → 対象
  "20260504_R12-07_steady": {
    key: "20260504_R12-07_steady",
    date: "2026-05-04", venue: "住之江", jcd: "12", raceNo: 7,
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100, virtual: true,
  },
  "20260504_R12-07_aggressive": {
    key: "20260504_R12-07_aggressive",
    date: "2026-05-04", venue: "住之江", jcd: "12", raceNo: 7,
    decision: "skip", intendedMain: { kind: "3連単", combo: "1-2-3" }, virtual: true,
  },
  // 別レース (5/4 桐生 11R)
  "20260504_R01-11_balanced": {
    key: "20260504_R01-11_balanced",
    date: "2026-05-04", venue: "桐生", jcd: "01", raceNo: 11,
    decision: "buy", combos: [{ kind: "2連単", combo: "1-2", stake: 200 }], totalStake: 200, virtual: true,
  },
  // 当日 (5/6) → 過去判定では含まれる
  "20260506_R05-01_balanced": {
    key: "20260506_R05-01_balanced",
    date: "2026-05-06", venue: "多摩川", jcd: "05", raceNo: 1,
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100, virtual: true,
  },
  // 未来 (5/8) → 除外
  "20260508_R05-01_balanced": {
    key: "20260508_R05-01_balanced",
    date: "2026-05-08", venue: "多摩川", jcd: "05", raceNo: 1,
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100, virtual: true,
  },
  // 既に finalize 済 → 除外
  "20260504_R12-08_steady": {
    key: "20260504_R12-08_steady",
    date: "2026-05-04", venue: "住之江", jcd: "12", raceNo: 8,
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100,
    result: { first: 1, second: 2, third: 3 }, finalized: true, virtual: true,
  },
  // jcd 無し → resolveJcd で venue 名から解決可能
  "20260504_R-99_misc": {
    key: "20260504_R-99_misc",
    date: "2026-05-04", venue: "大村", raceNo: 5,
    decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100, virtual: true,
  },
  // venue / jcd 両方無し → 除外
  "20260504_R-broken": {
    key: "20260504_R-broken",
    date: "2026-05-04", raceNo: 1,
    decision: "buy", combos: [], totalStake: 0, virtual: true,
  },
};

const groups = findUnresolvedRaces(predictions, { todayKey: TODAY_K });
ok(groups.length === 4, `グループ数 = 4 (実際: ${groups.length})`);

const targetByKey = (gKey) => groups.find(g => `${g.jcd}-${g.rno}-${g.hd}` === gKey);
ok(targetByKey("12-7-20260504")?.keys.length === 2, "住之江 7R 5/4: steady + aggressive を 1 グループにまとめる");
ok(!!targetByKey("01-11-20260504"), "桐生 11R 5/4 を抽出");
ok(!!targetByKey("05-1-20260506"), "多摩川 1R 5/6 (当日) も対象に含む");
ok(!targetByKey("05-1-20260508"), "未来日は除外");
ok(!groups.some(g => g.keys.includes("20260504_R12-08_steady")), "finalize 済は除外");
ok(!!targetByKey("24-5-20260504"), "venue=大村 → jcd=24 で解決");
ok(!groups.some(g => g.keys.includes("20260504_R-broken")), "venue/jcd 両方欠損は除外");

/* === [3] backfillResults (本体) === */
console.log("\n[3] backfillResults (モック fetchFn 注入)");

// 全グループ成功するモック
async function fetchOk(jcd, rno, hd) {
  return {
    first: 1, second: 2, third: 3,
    payouts: {
      tan: { "1": 160 },
      exacta: { "1-2": 1340 },
      trifecta: { "1-2-3": 17300 },
      quinella: { "1=2": 700 },
      trio: { "1=2=3": 2100 },
    },
  };
}

// 全グループ失敗するモック
async function fetchFail() { return { ok: false, error: "HTTP 503" }; }
async function fetchEmpty() { return null; }
async function fetchThrow() { throw new Error("network down"); }

// 3-A: 全件成功 → updated = 4 グループ (住之江7R が 2 件あっても 1 グループ)
{
  const r = await backfillResults(predictions, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(r.attempted === 4, `3-A: 試行数 4 (実際: ${r.attempted})`);
  ok(r.updated === 4, `3-A: 更新グループ 4 (実際: ${r.updated})`);
  ok(r.failed === 0, "3-A: failed=0");
  // 住之江 7R steady は 3連単 1-2-3 当たり → hit / pnl
  const next = r.nextPredictions;
  ok(next["20260504_R12-07_steady"].hit === true, "3-A: steady ヒット反映");
  ok(next["20260504_R12-07_steady"].pnl === 17200, "3-A: pnl=17200");
  ok(next["20260504_R12-07_aggressive"].skipMissed === true, "3-A: skip + intendedが的中 → skipMissed=true");
  // 既に finalize 済は触らない
  ok(next["20260504_R12-08_steady"].result?.first === 1, "3-A: 既 finalize は維持");
  // 未来日は触らない
  ok(!next["20260508_R05-01_balanced"].result, "3-A: 未来日は無変更");
}

// 3-B: 全失敗 → 何も更新しない
{
  const r = await backfillResults(predictions, { todayKey: TODAY_K, fetchFn: fetchFail });
  ok(r.updated === 0, "3-B: 失敗時 updated=0");
  ok(r.failed === r.attempted, "3-B: 全 failed");
  // predictions は変更されない
  for (const k of Object.keys(predictions)) {
    ok(r.nextPredictions[k] === predictions[k], `3-B: ${k} は元参照のまま (= ${predictions[k] === r.nextPredictions[k]})`);
  }
}

// 3-C: 例外発生 → エラー記録 + 他のグループは継続
{
  const r = await backfillResults(predictions, { todayKey: TODAY_K, fetchFn: fetchThrow });
  ok(r.errors.length > 0, "3-C: errors に記録");
  ok(r.failed === r.attempted, "3-C: 全 failed");
}

// 3-D: 空 result → updated=0 / failed=attempted
{
  const r = await backfillResults(predictions, { todayKey: TODAY_K, fetchFn: fetchEmpty });
  ok(r.updated === 0, "3-D: result null → updated=0");
  ok(r.failed === r.attempted, "3-D: 全 failed");
}

// 3-E: 二度目の呼び出し (= 状態遷移後) → 全件 finalize 済なので attempted=0
{
  const first = await backfillResults(predictions, { todayKey: TODAY_K, fetchFn: fetchOk });
  const second = await backfillResults(first.nextPredictions, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(second.attempted === 0, "3-E: 二度目は attempted=0 (重複処理防止)");
  ok(second.updated === 0, "3-E: updated=0");
}

// 3-F: 進捗コールバック
{
  const events = [];
  await backfillResults(predictions, {
    todayKey: TODAY_K,
    fetchFn: fetchOk,
    onProgress: (done, total, label) => events.push({ done, total, label }),
  });
  ok(events.length > 0, "3-F: onProgress が呼ばれる");
  ok(events[events.length - 1].done === events[events.length - 1].total, "3-F: 最後は done==total");
}

// 3-G: maxFetch で件数制限
{
  const r = await backfillResults(predictions, { todayKey: TODAY_K, fetchFn: fetchOk, maxFetch: 2 });
  ok(r.attempted === 2, "3-G: maxFetch=2 で 2 件のみ試行");
  ok(r.skipped === 2, "3-G: skipped=2 (4 グループ中 2 件残り)");
}

/* === [4] 状態遷移シナリオ (ユーザー指定) === */
console.log("\n[4] 状態遷移シナリオ (7 つ)");

// ④-1 終了前のレース (未来日) → 結果取得対象に含まれない
{
  const r = await backfillResults({
    "future_race": {
      key: "future_race",
      date: "2026-05-08", venue: "桐生", jcd: "01", raceNo: 1,
      decision: "buy", combos: [], totalStake: 100,
    },
  }, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(r.attempted === 0, "④-1: 終了前 (未来日) → 試行 0");
}

// ④-2 締切直後 (当日 + API がまだ返さない) → 未確定のまま
{
  const r = await backfillResults({
    "today_just_closed": {
      key: "today_just_closed",
      date: "2026-05-06", venue: "桐生", jcd: "01", raceNo: 1,
      decision: "buy", combos: [], totalStake: 100,
    },
  }, { todayKey: TODAY_K, fetchFn: fetchEmpty });
  ok(r.attempted === 1, "④-2: 当日レース → 試行 1");
  ok(r.updated === 0, "④-2: API 結果無し → updated=0 (未確定維持)");
}

// ④-3 終了直後 (結果公開) → finalize される
{
  const r = await backfillResults({
    "today_finished": {
      key: "today_finished",
      date: "2026-05-06", venue: "桐生", jcd: "01", raceNo: 1,
      decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100,
    },
  }, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(r.updated === 1, "④-3: 結果取得成功 → updated=1");
  ok(r.nextPredictions["today_finished"].finalized === true, "④-3: finalized=true");
}

// ④-4 結果確定後の再実行 → 重複しない
{
  const seed = {
    "old_done": {
      key: "old_done",
      date: "2026-05-04", venue: "桐生", jcd: "01", raceNo: 1,
      decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100,
      result: { first: 1, second: 2, third: 3 }, finalized: true, hit: true, payout: 17300, pnl: 17200,
    },
  };
  const r = await backfillResults(seed, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(r.attempted === 0, "④-4: 再実行 → attempted=0 (確定済はスキップ)");
}

// ④-5 手動更新後 → 全件 finalized に揃う
{
  const seed = {
    "p1": { key: "p1", date: "2026-05-04", venue: "桐生", jcd: "01", raceNo: 1, decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100 },
    "p2": { key: "p2", date: "2026-05-05", venue: "住之江", jcd: "12", raceNo: 7, decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100 },
  };
  const r = await backfillResults(seed, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(Object.values(r.nextPredictions).every(p => p.finalized === true), "④-5: 全件 finalized=true");
}

// ④-6 画面開きっぱなし (同じ predictions を再評価) → 重複しない
{
  const seed = {
    "p1": { key: "p1", date: "2026-05-04", venue: "桐生", jcd: "01", raceNo: 1, decision: "buy", combos: [], totalStake: 100 },
  };
  const r1 = await backfillResults(seed, { todayKey: TODAY_K, fetchFn: fetchOk });
  const r2 = await backfillResults(r1.nextPredictions, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(r2.attempted === 0, "④-6: 同じ predictions 再評価 → attempted=0");
}

// ④-7 再読み込み (新セッション) → 旧 finalize 維持 + 残り未確定だけ取りに行く
{
  const seed = {
    "old_done": { key: "old_done", date: "2026-05-04", venue: "桐生", jcd: "01", raceNo: 1, decision: "buy",
      combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100,
      result: { first: 1, second: 2, third: 3 }, finalized: true, hit: true, payout: 17300, pnl: 17200 },
    "still_pending": { key: "still_pending", date: "2026-05-05", venue: "住之江", jcd: "12", raceNo: 7,
      decision: "buy", combos: [{ kind: "3連単", combo: "1-2-3", stake: 100 }], totalStake: 100 },
  };
  const r = await backfillResults(seed, { todayKey: TODAY_K, fetchFn: fetchOk });
  ok(r.attempted === 1, "④-7: 残り未確定 1 件のみ試行");
  ok(r.nextPredictions["old_done"].pnl === 17200, "④-7: 旧 finalize は維持");
  ok(r.nextPredictions["still_pending"].finalized === true, "④-7: 残りも確定");
}

console.log("\n========== 結果 ==========");
console.log(`成功: ${pass} / 失敗: ${fail}`);
if (fail > 0) process.exit(1);
console.log("✅ 結果バックフィル + 状態遷移テスト全件 OK");
