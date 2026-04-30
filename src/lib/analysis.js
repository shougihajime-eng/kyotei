/**
 * 外れ理由 AI 分析 + 自己学習メモ
 *
 *   レース結果 (prediction.result) と AI 予想 (prediction.combos / prediction.evalSnapshot)
 *   を比較して、なぜ外れたのか / なぜ当たったのかを分析する。
 *
 *   出力:
 *     {
 *       outcome: "hit" | "miss" | "pending",
 *       headline: 「外れ — 1号艇が転覆」 のような一行要約,
 *       reasons: [{ kind: "missed" | "wrong" | "good", text: "..." }],
 *       lessons: [string]  // 次回への教訓 (自己学習メモに追加候補)
 *     }
 */

export function analyzePrediction(prediction, race) {
  if (!prediction) return null;
  const result = prediction.result;
  if (!result?.first) return { outcome: "pending", headline: "結果待ち", reasons: [], lessons: [] };

  const aiMain = (prediction.combos || [])[0];
  const aiBoats = (prediction.combos || []).map(c => parseInt(c.combo[0])).filter(b => b >= 1 && b <= 6);
  const aiPrimary = aiBoats[0] || 1;
  const winnerCombo = `${result.first}-${result.second}-${result.third}`;
  const reasons = [];
  const lessons = [];

  // 当落
  const hit = !!prediction.hit;
  const outcome = hit ? "hit" : "miss";

  // 1号艇本命だったか
  const aiBoughtIn = aiBoats.includes(1);
  const inWon = result.first === 1;

  if (hit) {
    // 当たった理由を整理
    reasons.push({ kind: "good", text: `本命 ${aiMain?.combo} が的中。EV ${aiMain?.ev?.toFixed(2)} の妙味を取れた` });
    if (aiPrimary === result.first) {
      reasons.push({ kind: "good", text: `1着予想 ${result.first}号艇 が的中` });
    }
  } else {
    // 外れの典型パターン
    const headline =
      aiPrimary === 1 && !inWon ? `1号艇が逃げ切れず、${result.first}号艇に押し切られた`
    : aiPrimary !== 1 && inWon ? `1号艇が普通に逃げて、外艇本命が裏目に出た`
    : `${aiPrimary}号艇本命だったが、${result.first}号艇が勝利`;

    reasons.push({ kind: "wrong", text: `予想本命 ${aiPrimary}号艇 — 結果 1着 ${result.first}号艇` });

    // 1号艇本命で 1号艇が崩れた
    if (aiPrimary === 1 && !inWon) {
      reasons.push({ kind: "missed", text: "イン信頼度を過大評価していた可能性 (展示気配・モーター・風波を再確認)" });
      lessons.push("1号艇逃げを基本にしつつ、展示タイム/風向 6m 以上/波 8cm 以上では信頼度を下げる");
    }

    // 外艇本命で 1号艇が逃げた
    if (aiPrimary !== 1 && inWon) {
      reasons.push({ kind: "missed", text: "1号艇のイン信頼度を過小評価した可能性 (荒れ判定が強すぎたかも)" });
      lessons.push("荒れ要素 (風波/部品交換/インSTバラつき) が薄いレースでは安易に外艇本命にしない");
    }

    // 展示が良かった艇 (race から推測)
    if (race?.boats) {
      const winBoat = race.boats.find(b => b.boatNo === result.first);
      if (winBoat?.exTime != null && winBoat.exTime <= 6.75) {
        reasons.push({ kind: "missed", text: `1着 ${result.first}号艇 の展示タイム ${winBoat.exTime} が良好だった` });
        lessons.push("展示タイム 6.75 秒以下の艇は本命候補として再評価する");
      }
      if (winBoat?.motor2 != null && winBoat.motor2 >= 45) {
        reasons.push({ kind: "missed", text: `1着 ${result.first}号艇 のモーター 2連率 ${winBoat.motor2}% が高水準だった` });
        lessons.push("モーター 2連率 45% 以上の艇は本命候補に必ず入れる");
      }
      if (winBoat?.partsExchange?.length) {
        reasons.push({ kind: "missed", text: `1着 ${result.first}号艇 は部品交換 (${winBoat.partsExchange.join("/")}) を行っていたが、それが奏功した可能性` });
      }
    }

    // 風波
    if (race?.wave > 8 || race?.wind > 6) {
      reasons.push({ kind: "missed", text: `荒水面 (風${race.wind}m / 波${race.wave}cm) で本命崩れ` });
      lessons.push(`風${race.wind}m / 波${race.wave}cm 以上の荒水面では本命点数を絞り、見送りも候補に`);
    }

    // 買い目を絞りすぎたか / 広げすぎたか
    const points = (prediction.combos || []).length;
    if (!hit && points <= 2) {
      reasons.push({ kind: "wrong", text: `買い目が ${points} 点と絞り過ぎだった (荒れる場合は広めに)` });
      lessons.push("展開不透明なレースでは 5-10 点に広げて回収率を狙う");
    }
    if (!hit && points >= 8) {
      reasons.push({ kind: "wrong", text: `買い目が ${points} 点と広すぎて回収率が悪化した` });
      lessons.push("S 級が 1 つしか無いレースで広げすぎない (3-5 点で十分)");
    }

    return { outcome, headline, reasons, lessons };
  }

  return { outcome, headline: "的中 — 想定通り", reasons, lessons };
}

/**
 * 見送り精度の集計 — 「見送って正解」と「買って外れ」のバランスから判断する。
 *
 * 見送って正解 = AI が見送ったレースで、結果も荒れた / 1着候補が穴だった (買っていたら外していた可能性)
 * 見送って失敗 = AI が見送ったレースだが、結果は本命通り (買えば当たっていた)
 *
 * 簡略実装: 結果が記録されていない見送りは集計対象外。
 *  ・raceId に対する result がある predictions だけを集計対象とする。
 *  ・見送りレースは prediction で decision="skip" だが、
 *    現状の auto-save では「skip」予測も記録される (predict.js から見れば)。
 *  ・本来は別途 race の result を予測と紐付けて見送り精度を計算するが、
 *    raceId と result から AI が予想した買い目に対して当落判定を試行する。
 */
export function evaluateSkipQuality(predictions) {
  const all = Object.values(predictions || {}).filter((p) => p.result?.first);
  let skippedCorrect = 0; // 見送り → 高配当 (荒れ) だった
  let skippedMissed = 0;  // 見送り → 本命通りだった (買えばよかった)
  let boughtHit = 0;
  let boughtMiss = 0;
  for (const p of all) {
    if (p.decision === "skip") {
      // 結果の本命らしさ: 1号艇の 1着 = 普通 / それ以外 = 荒れ
      if (p.result.first === 1) skippedMissed++;
      else skippedCorrect++;
    } else {
      if (p.hit) boughtHit++;
      else boughtMiss++;
    }
  }
  const skipQuality = (skippedCorrect + skippedMissed) > 0
    ? skippedCorrect / (skippedCorrect + skippedMissed) : null;
  return {
    boughtHit, boughtMiss,
    skippedCorrect, skippedMissed,
    skipQuality,
    total: all.length,
  };
}

/**
 * AI 信頼度判定 — 「このAIを信じていいか」 を 5 段階で判定。
 *  ・累計回収率 (real or air)
 *  ・的中率
 *  ・見送り精度
 *  ・サンプル数
 * を元にスコアリング。
 */
export function judgeAIReliability(predictions) {
  const all = Object.values(predictions || {}).filter((p) => p.result?.first);
  const buys = all.filter((p) => p.decision === "buy");
  if (buys.length < 10) {
    return {
      level: "判断保留",
      message: `データ不足 (購入 ${buys.length} 件 / 10件未満)`,
      stars: 0, color: "#9fb0c9",
    };
  }
  let stake = 0, ret = 0, hits = 0;
  buys.forEach((p) => { stake += p.totalStake; ret += p.payout || 0; if (p.hit) hits++; });
  const roi = stake > 0 ? ret / stake : 0;
  const hitRate = buys.length > 0 ? hits / buys.length : 0;
  const skipQ = evaluateSkipQuality(predictions);
  let stars = 0;
  let level, message, color;
  if (roi >= 1.20 && buys.length >= 30) { stars = 5; level = "信頼度高"; message = `回収率 ${Math.round(roi*100)}% (${buys.length}件) — 信じて良い水準`; color = "#10b981"; }
  else if (roi >= 1.05) { stars = 4; level = "信頼できる"; message = `回収率 ${Math.round(roi*100)}% — 公営の壁を超えています`; color = "#34d399"; }
  else if (roi >= 0.95) { stars = 3; level = "様子見"; message = `回収率 ${Math.round(roi*100)}% — 大きな勝ちも負けも無し`; color = "#fde68a"; }
  else if (roi >= 0.80) { stars = 2; level = "改善余地"; message = `回収率 ${Math.round(roi*100)}% — マイナス傾向、戦略見直し推奨`; color = "#f59e0b"; }
  else { stars = 1; level = "信頼度低"; message = `回収率 ${Math.round(roi*100)}% — 大きく負け越し、見送り判定の見直しが必要`; color = "#f87171"; }
  return {
    stars, level, message, color,
    roi, hitRate,
    skipQuality: skipQ.skipQuality,
    sampleSize: buys.length,
    totalRaces: all.length,
    skippedCorrect: skipQ.skippedCorrect,
    skippedMissed: skipQ.skippedMissed,
  };
}

/**
 * 全予測の集計から学習メモを生成
 *  既に記録された past の hit/miss から自動的に「気をつける条件」を抽出。
 */
export function aggregateLessons(predictions) {
  const all = Object.values(predictions || {}).filter(p => p.result?.first);
  if (all.length === 0) return [];
  const counters = {
    inFailHigh: 0,    // 1号艇本命で外れた回数
    inSuccessExternal: 0,  // 外艇本命で 1号艇が逃げた回数 (空振り)
    fewPointsMiss: 0, // 2点以下で外れ
    manyPointsMiss: 0, // 8点以上で外れ
    roughMiss: 0,     // 荒水面で外れ
  };
  for (const p of all) {
    if (p.hit) continue;
    const aiPrimary = parseInt((p.combos || [])[0]?.combo[0] || "0");
    const winFirst = p.result.first;
    if (aiPrimary === 1 && winFirst !== 1) counters.inFailHigh++;
    if (aiPrimary !== 1 && winFirst === 1) counters.inSuccessExternal++;
    const points = (p.combos || []).length;
    if (points <= 2) counters.fewPointsMiss++;
    if (points >= 8) counters.manyPointsMiss++;
  }

  const memos = [];
  if (counters.inFailHigh >= 3) memos.push({ kind: "warn", text: `🚨 1号艇本命の外れが ${counters.inFailHigh} 回。展示・モーター・風波を再確認しイン信頼度を下げる条件を追加してください。` });
  if (counters.inSuccessExternal >= 3) memos.push({ kind: "warn", text: `🚨 外艇本命で 1号艇が逃げた回数が ${counters.inSuccessExternal} 回。荒れ判定が早すぎる可能性。荒れ要素を厳しめに判定してください。` });
  if (counters.fewPointsMiss >= 4) memos.push({ kind: "info", text: `💡 2点以下の絞りで外す回数が多いです (${counters.fewPointsMiss}回)。展開不透明なレースは点数を広げてみる。` });
  if (counters.manyPointsMiss >= 4) memos.push({ kind: "info", text: `💡 8点以上の広げ買いで回収率が悪い (${counters.manyPointsMiss}回)。S級が無いレースは見送りも検討。` });

  return { counters, memos, totalSettled: all.length };
}
