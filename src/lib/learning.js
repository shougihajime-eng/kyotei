/**
 * 自己進化エンジン (検証 + ロールバック + 過学習防止)
 *
 *   重要な設計方針:
 *     ・「重みを変える = 回収率が上がる」とは限らない。学習効果は必ず検証する。
 *     ・10 件程度の少数サンプルで強い重み変更はしない。
 *     ・7 日 / 14 日 / 30 日 の 3 期間で安定した傾向だけを採用する。
 *     ・学習後に回収率が下がった場合は前の重みに戻す (自動ロールバック)。
 *     ・採用/不採用と理由を学習ログに保存し、後から検証できるようにする。
 *
 *   localStorage キー: kyoteiLearningLog (直近 20 件のログを保存)
 */

const LEARNING_LOG_KEY = "kyoteiLearningLog";
const MAX_LOG = 20;

/* === 補助 === */
function settledList(predictions) {
  return Object.values(predictions || {})
    .filter((p) => p.result?.first && p.decision === "buy" && p.totalStake > 0);
}
function settledByDays(predictions, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return settledList(predictions).filter((p) => p.date >= cutoff);
}
function summarize(arr) {
  let stake = 0, ret = 0, hits = 0;
  for (const p of arr) {
    stake += p.totalStake || 0;
    ret += p.payout || 0;
    if (p.hit) hits++;
  }
  return {
    count: arr.length, hits,
    stake, ret, pnl: ret - stake,
    roi: stake > 0 ? ret / stake : 0,
    hitRate: arr.length > 0 ? hits / arr.length : 0,
  };
}
function group(arr, keyFn) {
  const m = new Map();
  for (const p of arr) {
    const k = keyFn(p);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return m;
}

/* === 学習ログの読み書き === */
function loadLearningLog() {
  try {
    const raw = localStorage.getItem(LEARNING_LOG_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
function saveLearningLog(log) {
  try {
    localStorage.setItem(LEARNING_LOG_KEY, JSON.stringify(log.slice(0, MAX_LOG)));
  } catch {}
}
export function getLearningLog() {
  return loadLearningLog();
}

/* === ① 過学習防止 + 安定性チェック ===
   3 期間 (7日 / 14日 / 30日) すべてで同じ方向の傾向があるときだけ採用。
   1 期間だけの偏りは「一時的」と判断して不採用。 */
function checkStability(predictions, predicate) {
  const samples = [
    settledByDays(predictions, 7),
    settledByDays(predictions, 14),
    settledByDays(predictions, 30),
  ];
  const results = samples.map(predicate); // [true/false/null] each
  const valid = results.filter((r) => r !== null);
  if (valid.length === 0) return { stable: false, reason: "サンプル不足" };
  // すべて true → 採用 / すべて false → 不採用 / 混在 → 不採用 (一時的)
  if (valid.every((v) => v === true)) return { stable: true, valid };
  return { stable: false, reason: "期間ごとに傾向が異なる (一時的な偏りの可能性)" };
}

/* === ② バックテスト比較 ===
   学習前後で 7 日 / 14 日 / 30 日 の ROI と的中率を比較。
   学習後に「悪化」 した場合は不採用。 */
function backtestRange(predictions, days) {
  const arr = settledByDays(predictions, days);
  return summarize(arr);
}
export function backtestComparison(predictions) {
  const all = summarize(settledList(predictions));
  const r7 = backtestRange(predictions, 7);
  const r14 = backtestRange(predictions, 14);
  const r30 = backtestRange(predictions, 30);
  // 「直近 7 日が極端に悪化」 = 30日 ROI - 7日 ROI > 0.20 (20pt) なら悪化と判定
  const recentDrop = (r30.stake > 0 && r7.stake > 0) ? (r30.roi - r7.roi) : 0;
  const recentDropPct = Math.round(recentDrop * 100);
  const isDeteriorating = recentDropPct >= 20;
  return {
    all, r7, r14, r30,
    recentDrop, recentDropPct,
    isDeteriorating,
    summary:
      isDeteriorating ? `直近7日 ROI が 30日比 ${recentDropPct}pt 悪化 — 学習を保守的に`
                      : `直近 7 日 ROI ${Math.round(r7.roi * 100)}% / 30日 ROI ${Math.round(r30.roi * 100)}%`,
  };
}

/* === ③ 学習済み重み計算 (検証 + 自動ロールバック付き) ===
   ・最低 30 件の確定済みサンプル必要 (10 件では強く変えない)
   ・3 期間 (7/14/30 日) で安定した傾向だけ採用
   ・直近 7 日が大きく悪化していれば学習を全部不採用
   ・採用/不採用と理由を学習ログに保存 (1 日 1 回まで)
*/
export function getLearnedWeights(predictions) {
  const settled = settledList(predictions);
  const total = settled.length;

  // Round 159: 学習発動閾値を 30 → 15 件に下げて早く効くように
  // 30 件はサンプル数として保守的だったが、 自動 snapshot で予想が貯まるのを早めるため緩和
  // 15 件あれば各艇の傾向 (3 期間) を見るには最小限十分
  const MIN_LEARNING_SIZE = 15;
  if (total < MIN_LEARNING_SIZE) {
    return {
      ready: false,
      sampleSize: total,
      adjustments: {},
      notes: [{ kind: "info", text: `学習にはまず ${MIN_LEARNING_SIZE} 件以上の確定レースが必要 (現在 ${total} 件)` }],
      decision: "pending",
      reason: "サンプル不足",
    };
  }

  // バックテスト: 直近の悪化を検出
  const bt = backtestComparison(predictions);
  if (bt.isDeteriorating) {
    return {
      ready: true,
      sampleSize: total,
      adjustments: {},
      notes: [{ kind: "neg", text: `🛑 学習を一時停止: ${bt.summary}。重みは前回の値に戻します。` }],
      decision: "rollback",
      reason: bt.summary,
      backtest: bt,
    };
  }

  // 1号艇本命の的中率 (3 期間)
  const inMainPredicate = (arr) => {
    const inMain = arr.filter((p) => parseInt((p.combos || [])[0]?.combo[0]) === 1);
    if (inMain.length < 3) return null;
    const hitRate = inMain.filter((p) => p.hit).length / inMain.length;
    return hitRate; // 各期間で hitRate を返す
  };

  // 全期間の hitRate
  const inAll = settled.filter((p) => parseInt((p.combos || [])[0]?.combo[0]) === 1);
  const inHitRate = inAll.length >= 5 ? inAll.filter((p) => p.hit).length / inAll.length : null;

  const adj = {};
  const notes = [];

  // 安定して 1号艇本命的中率が高いか低いかを 3 期間チェック
  const stableHigh = checkStability(predictions, (arr) => {
    const r = inMainPredicate(arr);
    return r === null ? null : r >= 0.50;
  });
  const stableLow = checkStability(predictions, (arr) => {
    const r = inMainPredicate(arr);
    return r === null ? null : r < 0.30;
  });
  if (stableHigh.stable && inHitRate != null) {
    adj.inAdvantage = 0.02; // 控えめな +0.02 (過去の +0.03 より保守的)
    notes.push({ kind: "pos", text: `1号艇本命的中率 ${Math.round(inHitRate*100)}% が 7/14/30日で安定 → イン有利度 +0.02 採用` });
  } else if (stableLow.stable && inHitRate != null) {
    adj.inAdvantage = -0.02;
    notes.push({ kind: "neg", text: `1号艇本命的中率 ${Math.round(inHitRate*100)}% が 7/14/30日で安定的に低い → イン有利度 -0.02 採用` });
  } else if (inHitRate != null) {
    notes.push({ kind: "info", text: `1号艇本命的中率 ${Math.round(inHitRate*100)}% — 期間で傾向が異なるため重み変更を見送り (過学習防止)` });
  }

  /* === Round 161: 多軸 ROI 補正 (荒れスコア重みの自動改善) ===
     ・強風 (>=5m): 荒れた回数 / 万舟率 を集計 → 「強風加点を強める」 提案
     ・深イン (1号艇 inProb >= 0.55): 1号艇 1 着率 → 「深インの加点」 提案
     ・展示悪化: 本命艇 exTime が遅い時の的中率
     ・カド攻め (4号艇本命 / 4号艇1着): 4 カドの ROI
     全て ±0.02 の控えめ補正、最低 5 件以上のサンプルが必要。 */
  // 強風 ROI
  const strongWind = settled.filter((p) => (p.weatherSnapshot?.wind ?? p.wind ?? 0) >= 5);
  if (strongWind.length >= 5) {
    const sw = summarize(strongWind);
    if (sw.roi >= 1.10) {
      adj.windPenalty = (adj.windPenalty || 0) + 0.02;
      notes.push({ kind: "pos", text: `強風時 ROI ${Math.round(sw.roi*100)}% (${strongWind.length}件) → 強風加点 +0.02 採用` });
    } else if (sw.roi <= 0.85) {
      adj.windPenalty = (adj.windPenalty || 0) - 0.02;
      notes.push({ kind: "neg", text: `強風時 ROI ${Math.round(sw.roi*100)}% (${strongWind.length}件) → 強風加点 -0.02 (慎重に)` });
    }
  }
  // 深イン (1号艇 inProb >= 0.55)
  const deepIn = settled.filter((p) => Array.isArray(p.probs) && p.probs[0] >= 0.55);
  if (deepIn.length >= 5) {
    const di = summarize(deepIn);
    if (di.roi >= 1.10) {
      adj.deepInBoost = 0.02;
      notes.push({ kind: "pos", text: `深イン (確率55%↑) ROI ${Math.round(di.roi*100)}% (${deepIn.length}件) → 深イン加点 +0.02 採用` });
    } else if (di.roi <= 0.85) {
      adj.deepInBoost = -0.02;
      notes.push({ kind: "neg", text: `深イン ROI ${Math.round(di.roi*100)}% (${deepIn.length}件) → 深イン加点 -0.02 (過信注意)` });
    }
  }
  // 展示評価 (本命艇 exTime ベース)
  const exDataAll = settled.filter((p) => {
    const mainBoatNum = parseInt((p.combos || [])[0]?.combo?.[0] || "0");
    const boats = p.boats || p.weatherSnapshot?.boats;
    return mainBoatNum && Array.isArray(boats) && boats[mainBoatNum - 1]?.exTime != null;
  });
  if (exDataAll.length >= 5) {
    const exGood = exDataAll.filter((p) => {
      const mainBoatNum = parseInt((p.combos || [])[0]?.combo?.[0] || "0");
      const boats = p.boats || p.weatherSnapshot?.boats;
      return boats[mainBoatNum - 1].exTime <= 6.85;
    });
    if (exGood.length >= 5) {
      const xg = summarize(exGood);
      if (xg.roi >= 1.10) {
        adj.exhibitionBoost = 0.02;
        notes.push({ kind: "pos", text: `展示◎ (≤6.85) ROI ${Math.round(xg.roi*100)}% (${exGood.length}件) → 展示加点 +0.02 採用` });
      } else if (xg.roi <= 0.85) {
        adj.exhibitionBoost = -0.02;
        notes.push({ kind: "info", text: `展示◎ ROI ${Math.round(xg.roi*100)}% (${exGood.length}件) → 展示重みを下げる -0.02` });
      }
    }
  }
  // カド攻め (4号艇本命 / 4号艇1着の的中・回収)
  const cad = settled.filter((p) => parseInt((p.combos || [])[0]?.combo?.[0]) === 4);
  if (cad.length >= 5) {
    const cd = summarize(cad);
    if (cd.roi >= 1.20) {
      adj.cadAdvantage = 0.02;
      notes.push({ kind: "pos", text: `4カド本命 ROI ${Math.round(cd.roi*100)}% (${cad.length}件) → カド攻め加点 +0.02 採用` });
    } else if (cd.roi <= 0.80) {
      adj.cadAdvantage = -0.02;
      notes.push({ kind: "neg", text: `4カド本命 ROI ${Math.round(cd.roi*100)}% (${cad.length}件) → カド過信減点 -0.02` });
    }
  }

  // 学習ログに記録 (同日内の重複は避ける)
  const today = new Date().toISOString().slice(0, 10);
  const log = loadLearningLog();
  const existing = log.find((l) => l.date === today);
  if (!existing) {
    log.unshift({
      date: today,
      timestamp: new Date().toISOString(),
      sampleSize: total,
      adjustments: { ...adj },
      notes: notes.map(n => n.text),
      decision: Object.keys(adj).length > 0 ? "accepted" : "rejected",
      backtest: { r7Roi: bt.r7.roi, r30Roi: bt.r30.roi, allRoi: bt.all.roi },
    });
    saveLearningLog(log);
  }

  return {
    ready: true,
    sampleSize: total,
    adjustments: adj,
    notes,
    decision: Object.keys(adj).length > 0 ? "accepted" : "neutral",
    reason: notes[0]?.text || "学習結果は中立",
    backtest: bt,
  };
}

/* === ④ 得意 / 苦手 条件の抽出 (Round 10 から継承) === */
export function analyzeStrengthsAndWeaknesses(predictions) {
  const settled = settledList(predictions);
  if (settled.length < 5) return { strengths: [], weaknesses: [], hasEnoughData: false, sampleSize: settled.length };

  const buckets = [];
  // 会場別
  for (const [v, arr] of group(settled, (p) => p.venue)) {
    if (arr.length < 3) continue;
    buckets.push({ category: "会場", label: v, ...summarize(arr) });
  }
  // 1着艇番別
  for (const [b, arr] of group(settled, (p) => parseInt((p.combos || [])[0]?.combo[0] || "0"))) {
    if (!b || arr.length < 3) continue;
    buckets.push({ category: "本命艇番", label: `${b}号艇`, ...summarize(arr) });
  }
  // スタイル別
  for (const [pr, arr] of group(settled, (p) => p.profile)) {
    if (!pr || arr.length < 3) continue;
    const label = pr === "steady" ? "本命党" : pr === "balanced" ? "中堅党" : pr === "aggressive" ? "穴党" : pr;
    buckets.push({ category: "スタイル", label, ...summarize(arr) });
  }
  // 券種別
  for (const [k, arr] of group(settled, (p) => (p.combos || [])[0]?.kind)) {
    if (!k || arr.length < 3) continue;
    buckets.push({ category: "券種", label: k, ...summarize(arr) });
  }
  buckets.sort((a, b) => b.roi - a.roi);
  return {
    hasEnoughData: true,
    sampleSize: settled.length,
    strengths: buckets.filter((b) => b.roi >= 1.10),
    weaknesses: buckets.filter((b) => b.roi <= 0.85),
    allBuckets: buckets,
  };
}

/* === ⑤ 現在レース向けの状況的アドバイス === */
export function getSituationalAdvice(race, predictions) {
  const settled = settledList(predictions);
  if (settled.length < 10 || !race) return null;
  const sameVenue = settled.filter((p) => p.venue === race.venue);
  if (sameVenue.length < 3) return { message: `${race.venue} の過去データ不足 (${sameVenue.length} 件)`, kind: "info" };
  const s = summarize(sameVenue);
  if (s.roi >= 1.20) return { kind: "pos", message: `🔥 ${race.venue} は得意会場 (回収率 ${Math.round(s.roi*100)}% / ${sameVenue.length}件)` };
  if (s.roi >= 1.05) return { kind: "pos", message: `✅ ${race.venue} は好相性 (回収率 ${Math.round(s.roi*100)}%)` };
  if (s.roi <= 0.85) return { kind: "neg", message: `⚠️ ${race.venue} は苦手会場 (回収率 ${Math.round(s.roi*100)}%) — 慎重に` };
  return { kind: "neutral", message: `${race.venue} 平均的 (回収率 ${Math.round(s.roi*100)}%)` };
}
