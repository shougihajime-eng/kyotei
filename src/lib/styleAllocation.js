/**
 * スタイル別 レース割当 (Round 51-D)
 *
 * ・全レースを一度評価して「買う価値のあるレース」 を抽出
 * ・各レースに 3 スタイル (steady/balanced/aggressive) のフィット度を計算
 * ・候補をスタイルに 「三等分」 して割り当て
 * ・各スタイルが必ず headline race を持つ → 「押した瞬間に必ず表示」 を保証
 *
 * 関数:
 *   globalBuyabilityScore(race, ev) — 「買える可能性」 の総合スコア (0-100)
 *   styleFit(race, ev, style) — そのスタイルへの適性スコア (0-100)
 *   allocateRacesToStyles(races, evals) — 三等分割当 → { steady: [], balanced: [], aggressive: [] }
 *   pickHeadlineForEachStyle(allStyleRecommendations, allocation, evals) — 各スタイルが必ず headline を持つよう選定
 */

/* === 「買える可能性」 を表す総合スコア (0-100) ===
   荒れやすさ / インの強さ / 風 / 波 / 展示 / モーター / オッズ妙味を加味 */
export function globalBuyabilityScore(race, ev) {
  if (!ev || !ev.ok) return 0;
  let score = 0;

  // (1) EV 強さ (max 30 点)
  const maxEV = ev.maxEV || 0;
  if (maxEV >= 1.30) score += 30;
  else if (maxEV >= 1.20) score += 20;
  else if (maxEV >= 1.10) score += 10;

  // (2) 1 号艇信頼度 (max 15 点)
  const inProb = ev.probs?.[0] || 0;
  if (inProb >= 0.55) score += 15;
  else if (inProb >= 0.45) score += 10;
  else if (inProb >= 0.35) score += 5;

  // (3) モーター上位 (max 10 点)
  const topMotor = (ev.scores || []).filter((s) => s.factors?.motor >= 0.7).length;
  score += Math.min(10, topMotor * 5);

  // (4) 展示タイム◎ (max 10 点)
  const topEx = (ev.scores || []).filter((s) => s.factors?.exhibition >= 0.7).length;
  score += Math.min(10, topEx * 5);

  // (5) 確率整合性 OK (10 点)
  if (ev.probConsistency && Math.abs(ev.probConsistency.oneFirstSum - 1) < 0.05) {
    score += 10;
  }

  // (6) 危険レースは大幅減点
  if (ev.accident?.isAccident) {
    score -= Math.min(40, ev.accident.severity || 30);
  }

  // (7) 暴荒れ (lightSkipped) なら 0
  if (ev.lightSkipped) return 0;

  return Math.max(0, Math.min(100, score));
}

/* === 各スタイルへのフィット度 (0-100) === */
export function styleFit(race, ev, style) {
  if (!ev || !ev.ok) return 0;
  const inProb = ev.probs?.[0] || 0;
  const wind = race.wind || 0;
  const wave = race.wave || 0;
  const inTrust = ev.inTrust?.level || "";

  if (style === "steady") {
    // 本命型: 1 号艇濃厚 + 平水面 + 安定
    let s = 0;
    if (inProb >= 0.55) s += 35;
    else if (inProb >= 0.45) s += 20;
    if (wind <= 3 && wave <= 4) s += 20;
    if (inTrust === "イン逃げ濃厚") s += 25;
    if (ev.development?.scenario === "逃げ") s += 15;
    if (ev.accident?.isAccident) s -= 50;
    return Math.max(0, Math.min(100, s));
  }
  if (style === "balanced") {
    // バランス型: 中庸 — 中穴混じり
    let s = 0;
    if (inProb >= 0.40 && inProb <= 0.60) s += 30;
    if (ev.maxEV >= 1.25) s += 20;
    if (wind >= 2 && wind <= 5) s += 15;
    if (ev.development?.scenario === "標準") s += 15;
    if (inTrust === "1号艇やや有利" || inTrust === "1号艇不安あり") s += 15;
    if (ev.accident?.isAccident) s -= 30;
    return Math.max(0, Math.min(100, s));
  }
  if (style === "aggressive") {
    // 穴狙い型: 荒れ + 高配当 + 穴根拠
    let s = 0;
    if (inProb < 0.45) s += 25;
    if (wind >= 5 || wave >= 6) s += 20;
    const sc = ev.development?.scenario;
    if (sc === "荒れ" || sc === "まくり" || sc === "まくり差し") s += 25;
    // 4-6 号艇に穴根拠 (展示/モーター/勝率) がある艇数
    const holeBoats = (race.boats || []).slice(3, 6).filter((b) =>
      (b.exTime != null && b.exTime <= 6.85) ||
      (b.motor2 != null && b.motor2 >= 40) ||
      (b.winRate != null && b.winRate >= 5.5)
    ).length;
    s += Math.min(20, holeBoats * 7);
    if (inTrust === "荒れ注意" || inTrust === "イン崩壊警戒") s += 15;
    return Math.max(0, Math.min(100, s));
  }
  return 0;
}

/* === 三等分割当: 候補レースを 3 スタイルに分配 ===
   各レースは「最もフィットするスタイル」 に割り当てる。
   ただし各スタイルが ceil(total/3) を超えないよう調整 (公平な分配)。 */
export function allocateRacesToStyles(races, evals) {
  // Step 1: 各レースのスコアと fit を計算
  const scored = [];
  for (const r of races || []) {
    const ev = evals?.[r.id];
    if (!ev) continue;
    const buyability = globalBuyabilityScore(r, ev);
    if (buyability < 25) continue; // 「最低限買えそう」 ライン
    const fits = {
      steady: styleFit(r, ev, "steady"),
      balanced: styleFit(r, ev, "balanced"),
      aggressive: styleFit(r, ev, "aggressive"),
    };
    scored.push({ raceId: r.id, race: r, ev, buyability, fits });
  }

  // Step 2: buyability 高い順に並べて、最も fit の高いスタイルに割当
  // 上限 = ceil(total / 3) で「三等分」 を実現
  scored.sort((a, b) => b.buyability - a.buyability);
  const total = scored.length;
  const cap = Math.max(1, Math.ceil(total / 3));
  const buckets = { steady: [], balanced: [], aggressive: [] };

  for (const item of scored) {
    const styleOrder = Object.entries(item.fits)
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s);
    let assigned = false;
    for (const style of styleOrder) {
      if (buckets[style].length < cap) {
        buckets[style].push({ raceId: item.raceId, fitScore: item.fits[style], buyability: item.buyability });
        assigned = true;
        break;
      }
    }
    // すべて満杯なら、最大 fit のスタイルに「あふれ」 として追加
    if (!assigned) {
      const top = styleOrder[0];
      buckets[top].push({ raceId: item.raceId, fitScore: item.fits[top], buyability: item.buyability, overflow: true });
    }
  }

  return { buckets, totalCandidates: total };
}

/* === 各スタイルの「ヘッドラインレース」 を必ず 1 つ選ぶ ===
   優先度:
   1. 割当 bucket 内で decision="buy" のレース (最高 buyability)
   2. 割当 bucket 内で 最も fit の高いレース (skip でも表示)
   3. 全レースから 最も fit の高いレース (fallback)
   4. 何もなければ races[0] (絶対に null を返さない)

   返り値: { steady: {raceId, kind, fit, reasonShort}, ... }
   kind:
     "buy"        — このスタイルで買い判定
     "near-skip"  — このスタイル割当だが skip 判定
     "fallback"   — 割当外、 全レースから最も近いものを表示
     "none"       — 全レース存在しない (races=空)
*/
export function pickHeadlineForEachStyle(races, evals, allStyleRecommendations, allocation) {
  const out = { steady: null, balanced: null, aggressive: null };
  const STYLES = ["steady", "balanced", "aggressive"];
  const STYLE_LABELS = { steady: "本命型", balanced: "バランス型", aggressive: "穴狙い型" };

  for (const style of STYLES) {
    const bucket = allocation?.buckets?.[style] || [];
    let pick = null;
    // 1) bucket 内 buy 候補
    for (const it of bucket) {
      const rec = allStyleRecommendations?.[style]?.[it.raceId];
      if (rec?.decision === "buy") {
        pick = {
          raceId: it.raceId, kind: "buy", fit: it.fitScore,
          reasonShort: `🎯 ${STYLE_LABELS[style]} 割当 (適性 ${it.fitScore}/100)`,
        };
        break;
      }
    }
    // 2) bucket 内 best fit (skip でも表示)
    if (!pick && bucket.length > 0) {
      const sorted = [...bucket].sort((a, b) => b.fitScore - a.fitScore);
      pick = {
        raceId: sorted[0].raceId, kind: "near-skip", fit: sorted[0].fitScore,
        reasonShort: `📋 ${STYLE_LABELS[style]} 割当 (適性 ${sorted[0].fitScore}/100) — 厳選見送り`,
      };
    }
    // 3) 全レース中で最も fit の高いもの (fallback)
    if (!pick && races?.length > 0) {
      let bestId = null, bestFit = -1;
      for (const r of races) {
        const ev = evals?.[r.id];
        if (!ev) continue;
        const fit = styleFit(r, ev, style);
        if (fit > bestFit) { bestFit = fit; bestId = r.id; }
      }
      // ev が null だらけでも races[0] を fallback
      const fallbackId = bestId || races[0]?.id;
      if (fallbackId) {
        pick = {
          raceId: fallbackId, kind: "fallback", fit: bestFit > 0 ? bestFit : 0,
          reasonShort: bestFit > 0
            ? `🔍 ${STYLE_LABELS[style]} に最も近いレース (適性 ${bestFit}/100)`
            : `🤖 ${STYLE_LABELS[style]} に合うレースが今日はありません — 最も近いレースを表示`,
        };
      }
    }
    // 4) 何もなければ none (races が空のとき)
    if (!pick) {
      pick = {
        raceId: null, kind: "none", fit: 0,
        reasonShort: "🤖 本日対象レースなし — 「🔄 更新」 を押してください",
      };
    }
    out[style] = pick;
  }
  return out;
}

/* === Round 57-58: Go モード — その日最も期待値の高いレースを top N に絞る ===
   引数:
     races / evals / allStyleRecommendations: 通常データ
     currentStyle: 現在選択中のスタイル
     topN: 絞り込み件数 (デフォルト 3)
   返り値:
     goPicks: [{ raceId, race, ev, style, recommendation, simpleReason }] (買い候補のみ、最大 topN)
     dayConfidence: 0-100 (本日の信頼度スコア)
     confidenceLabel: "Go" | "様子見" | "見送り推奨"
     confidenceReason: 1 行説明
     suppressedReason: 抑制理由 (閾値未満時)
     excludedCount / excludedReasons: 除外件数とその理由
*/
export const GO_CONFIDENCE_THRESHOLD = 60;
/* Round 60: Go モード「かなり厳しめ」 基準 — 確信度高のみ採用 */
export const GO_MIN_EV = 1.20;             // EV 120% 未満は除外
export const GO_MIN_CONFIDENCE = 65;       // confidence 65 未満は除外
export const GO_DEGRADED_EV = 1.25;        // 直近成績悪化時は 125% に引き上げ

export function computeGoMode(races, evals, allStyleRecommendations, currentStyle = "balanced", topN = 3, opts = {}) {
  // Round 60: 直近成績悪化時は EV 閾値を保守的に
  const evMin = opts?.degraded ? GO_DEGRADED_EV : GO_MIN_EV;
  const confMin = GO_MIN_CONFIDENCE;
  const candidates = [];
  const excludedReasons = []; // 除外されたレースとその理由

  for (const r of races || []) {
    const ev = evals?.[r.id];
    if (!ev) continue;
    if (!ev.ok) {
      // ev が ok でない理由を記録
      excludedReasons.push({
        raceId: r.id, venue: r.venue, raceNo: r.raceNo,
        reason: ev.reason === "no-odds" ? "オッズ未取得"
              : ev.reason === "stale-odds" ? "オッズ参考値"
              : ev.reason === "no-boats" ? "出走表未取得"
              : ev.reason === "closed" ? "締切済"
              : ev.reason === "extreme-rough" ? "暴荒れ"
              : ev.message || "データ不足",
      });
      continue;
    }
    let best = null;
    for (const style of ["steady", "balanced", "aggressive"]) {
      const rec = allStyleRecommendations?.[style]?.[r.id];
      if (rec?.decision !== "buy") continue;
      const evScore = rec.main?.ev || 0;
      const conf = rec.confidence || 0;
      // Round 60: 厳格基準 — EV 120% 未満 OR 自信 65 未満は Go 候補から除外
      if (evScore < evMin) continue;
      if (conf < confMin) continue;
      if (!best || evScore > best.ev) {
        best = {
          raceId: r.id, race: r, ev: evScore, style, recommendation: rec,
          confidence: conf,
          mainCombo: rec.main?.combo,
          mainOdds: rec.main?.odds,
          mainProb: rec.main?.prob,
          simpleReason: `${STYLE_LABELS_GO[style] || style} EV ${Math.round(evScore * 100)}% / 自信 ${conf}`,
        };
      }
    }
    if (best) candidates.push(best);
    else {
      // 全スタイルが Go 基準未達
      excludedReasons.push({
        raceId: r.id, venue: r.venue, raceNo: r.raceNo,
        reason: `Go 基準未達 (EV<${Math.round(evMin*100)}% or 自信<${confMin})`,
      });
    }
  }
  // EV × 自信スコアでランキング (重み付けランキング)
  candidates.sort((a, b) => {
    const sa = a.ev * (1 + (a.confidence || 0) / 200);
    const sb = b.ev * (1 + (b.confidence || 0) / 200);
    return sb - sa;
  });
  const goPicks = candidates.slice(0, topN);

  // === 本日の信頼度スコア (0-100) ===
  let confidence = 30;
  if (candidates.length >= 3) confidence += 35;
  else if (candidates.length === 2) confidence += 25;
  else if (candidates.length === 1) confidence += 15;
  const avgEv = goPicks.length > 0
    ? goPicks.reduce((s, p) => s + p.ev, 0) / goPicks.length
    : 0;
  if (avgEv >= 1.30) confidence += 20;
  else if (avgEv >= 1.20) confidence += 10;
  const avgConfidence = goPicks.length > 0
    ? goPicks.reduce((s, p) => s + (p.confidence || 0), 0) / goPicks.length
    : 0;
  if (avgConfidence >= 75) confidence += 15;
  else if (avgConfidence >= 65) confidence += 8;

  // データ完全性: 除外率が高いと減点
  const totalRaces = (races || []).length;
  const exclusionRate = totalRaces > 0 ? excludedReasons.length / totalRaces : 0;
  if (exclusionRate >= 0.7) confidence -= 15;
  else if (exclusionRate >= 0.5) confidence -= 8;

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  let confidenceLabel, confidenceReason, suppressedReason = null;
  // Round 60: 候補 0-1 件は「打たない判断」 を優先 (無理に出さない)
  if (candidates.length === 0) {
    confidenceLabel = "見送り推奨";
    confidenceReason = "本日は買い候補ゼロ。 厳選見送り日です。";
    confidence = 10;
    suppressedReason = excludedReasons.length > 0
      ? `候補ゼロ — 除外 ${excludedReasons.length} 件 (Go 基準未達: EV<${Math.round(evMin*100)}% or 自信<${confMin})`
      : "候補ゼロ — 期待値プラスのレースが見つかりませんでした";
  } else if (candidates.length === 1) {
    // 1 件のみは「少ないが強い」 ケース。 信頼度 80+ なら採用、 それ未満なら見送り推奨
    if (confidence < 80) {
      confidenceLabel = "見送り推奨";
      confidenceReason = `候補 1 件のみ — 「少ないが強い」 基準 (信頼度 80+) 未達 → 打たない判断推奨`;
      suppressedReason = `候補 1 件のみで信頼度 ${confidence}/100 < 80 — 単発勝負はリスク大`;
    } else {
      confidenceLabel = "Go";
      confidenceReason = `単発勝負 (1 件) — 信頼度 ${confidence}/100、 EV ${Math.round(avgEv*100)}% — 高確信日`;
    }
  } else if (confidence < GO_CONFIDENCE_THRESHOLD) {
    confidenceLabel = "見送り推奨";
    confidenceReason = `候補 ${candidates.length} 件あるが信頼度 ${confidence}/100 — 慎重に`;
    // 抑制理由を詳細に
    const reasons = [];
    if (avgEv < 1.20) reasons.push(`平均 EV ${Math.round(avgEv * 100)}% (低い)`);
    if (avgConfidence < 65) reasons.push(`自信スコア平均 ${Math.round(avgConfidence)}/100 (低い)`);
    if (exclusionRate >= 0.5) reasons.push(`データ欠損率 ${Math.round(exclusionRate * 100)}% (高い)`);
    suppressedReason = reasons.length > 0
      ? `信頼度抑制: ${reasons.join(" / ")}`
      : "信頼度が閾値 60 未満 — 慎重に判断してください";
  } else if (confidence >= 75) {
    confidenceLabel = "Go";
    confidenceReason = `候補 ${candidates.length} 件 / 平均 EV ${Math.round(avgEv * 100)}% / 自信 ${Math.round(avgConfidence)}/100 — 勝負日`;
  } else {
    confidenceLabel = "様子見";
    confidenceReason = `候補 ${candidates.length} 件 / 平均 EV ${Math.round(avgEv * 100)}% — 慎重に選定`;
  }

  return {
    goPicks,
    topPicks: goPicks, // 後方互換
    dayConfidence: confidence,
    todayConfidence: confidence, // 後方互換
    confidenceLabel,
    confidenceReason,
    suppressedReason,
    totalCandidates: candidates.length,
    excludedCount: excludedReasons.length,
    excludedReasons: excludedReasons.slice(0, 10), // 最大 10 件まで
    avgEv,
    avgConfidence,
    exclusionRate,
    threshold: GO_CONFIDENCE_THRESHOLD,
  };
}

const STYLE_LABELS_GO = {
  steady: "🛡️ 本命",
  balanced: "⚖️ バランス",
  aggressive: "🎯 穴",
};

/* === スタイル別「なぜ候補なし」 の理由生成 (UI 表示用) === */
export function explainEmptyBucket(style, races, evals) {
  const STYLE_LABELS = {
    steady: "本命型",
    balanced: "バランス型",
    aggressive: "穴狙い型",
  };
  const label = STYLE_LABELS[style] || style;
  const total = (races || []).length;
  if (total === 0) {
    return {
      title: `本日対象レースなし`,
      body: `「🔄 更新」 でレース情報を取得してください`,
    };
  }
  // 各レースの fit スコアの分布
  const fits = (races || []).map((r) => styleFit(r, evals?.[r.id], style)).filter((s) => s > 0);
  const maxFit = fits.length > 0 ? Math.max(...fits) : 0;
  if (maxFit < 30) {
    let reasonDetail = "";
    if (style === "steady") reasonDetail = "全レースで 1 号艇信頼度が低い、または荒れ要素強い日です";
    else if (style === "balanced") reasonDetail = "全レースで EV 妙味が薄い、または極端 (本命濃厚 or 大荒れ) です";
    else if (style === "aggressive") reasonDetail = "全レースで穴の根拠 (展示/モーター/進入歴/荒水面) が弱い日です";
    return {
      title: `${label} に合うレースが今日はありません`,
      body: reasonDetail,
    };
  }
  return {
    title: `${label} の候補が少ない日です`,
    body: `他スタイル (バランス / 攻め) を試すか、「📅 検証」 で過去の結果を確認してください`,
  };
}
