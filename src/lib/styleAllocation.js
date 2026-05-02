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
   ・割当済みで decision="buy" のレースが最優先
   ・なければ「最も fit の高い」 レース (skip でも表示)
   ・それも無ければ「全候補の中で最も近い」 レース
   返り値: { steady: { raceId, kind: "buy" | "near-skip" | null }, balanced, aggressive }
*/
export function pickHeadlineForEachStyle(races, evals, allStyleRecommendations, allocation) {
  const out = { steady: null, balanced: null, aggressive: null };
  const STYLES = ["steady", "balanced", "aggressive"];

  for (const style of STYLES) {
    const bucket = allocation?.buckets?.[style] || [];
    // 1) bucket 内で decision = "buy" のレースを優先
    let pick = null;
    for (const it of bucket) {
      const rec = allStyleRecommendations?.[style]?.[it.raceId];
      if (rec?.decision === "buy") {
        pick = { raceId: it.raceId, kind: "buy", fit: it.fitScore };
        break;
      }
    }
    // 2) bucket 内で fit が最も高いレース (skip でも表示)
    if (!pick && bucket.length > 0) {
      const sorted = [...bucket].sort((a, b) => b.fitScore - a.fitScore);
      pick = { raceId: sorted[0].raceId, kind: "near-skip", fit: sorted[0].fitScore };
    }
    // 3) bucket 空 → 全レース中で fit が最も高いものを fallback
    if (!pick) {
      let bestId = null, bestFit = -1;
      for (const r of races || []) {
        const ev = evals?.[r.id];
        if (!ev) continue;
        const fit = styleFit(r, ev, style);
        if (fit > bestFit) { bestFit = fit; bestId = r.id; }
      }
      if (bestId) {
        pick = { raceId: bestId, kind: "fallback", fit: bestFit };
      }
    }
    out[style] = pick;
  }
  return out;
}

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
