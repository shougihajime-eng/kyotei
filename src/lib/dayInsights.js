/**
 * Round 59: 日次インサイト計算
 *
 *   ・computeGoModeStats(predictions, n)   - 直近 n 件 Go 実績 (勝敗 / 回収率 / 収支)
 *   ・computeSkipImpact(predictions)       - 見送りの仮想収支 (回避損失)
 *   ・computeDaySummary(goMode, ...)       - 「本日: 安定寄り / 荒れ日 / 勝負日」 短文
 *   ・computeStreakStats(predictions)      - 連勝・連敗
 *
 * すべて visibleData (filtered v2 only) を入力に取り、 純粋関数として動作。
 */

/* === 1. Go モード実績 (直近 N 件) ===
   Go モード履歴の特定: predictions[].decision === "buy" + result?.first 確定済 + virtual !== false (リアル) ※将来の実装変更可能
   現状は v2 の全 buy 確定レコードを Go 実績とみなす。 */
export function computeGoModeStats(predictions, n = 10) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first)
    .sort((a, b) => {
      const ka = (a.date || "") + (a.startTime || "");
      const kb = (b.date || "") + (b.startTime || "");
      return kb.localeCompare(ka);
    });
  const recent = all.slice(0, n);
  let wins = 0, stake = 0, ret = 0;
  for (const p of recent) {
    if (p.hit) wins++;
    stake += p.totalStake || 0;
    ret += p.payout || 0;
  }
  const losses = recent.length - wins;
  const roi = stake > 0 ? ret / stake : null;
  const pnl = ret - stake;
  return {
    sampleSize: recent.length,
    requestedSize: n,
    wins,
    losses,
    hitRate: recent.length > 0 ? wins / recent.length : null,
    stake,
    ret,
    pnl,
    roi,
    label: recent.length === 0
      ? "実績なし"
      : `${wins}勝${losses}敗 / 回収率 ${roi != null ? Math.round(roi * 100) + "%" : "—"}`,
    isPositive: roi != null && roi >= 1,
  };
}

/* === 2. 見送り効果 (skipImpact) ===
   見送りレースで「もし買っていたら」 の仮想収支:
   ・skip 記録 + result が確定 → intendedMain (もし買っていたら) と勝者比較
   ・hit  なら +X 円, miss なら -1000 円 (仮想 stake) と仮定
   ・回避損失 = ネット損失 (見送りによる)
*/
export function computeSkipImpact(predictions) {
  const VIRTUAL_STAKE = 1000;
  const all = Object.values(predictions || {});
  const skips = all.filter((p) => p.decision === "skip" && p.result?.first);
  let avoided = 0;     // 回避できた損失 (本来買ったら負けていた)
  let missed = 0;      // 取り逃した利益 (本来買ったら勝っていた)
  let virtualPnl = 0;  // ネット (avoided - missed)
  let correctSkips = 0;
  let missedSkips = 0;
  for (const p of skips) {
    const im = p.intendedMain;
    if (!im?.combo || !im?.kind) continue;
    const r = p.result;
    const winnerForKind = im.kind === "3連単" ? `${r.first}-${r.second}-${r.third}`
                       : im.kind === "2連単" ? `${r.first}-${r.second}`
                       : im.kind === "2連複" ? [r.first, r.second].sort((a,b) => a-b).join("=")
                       : im.kind === "3連複" ? [r.first, r.second, r.third].sort((a,b) => a-b).join("=")
                       : String(r.first);
    if (im.combo === winnerForKind) {
      // もし買っていたら勝っていた → 取り逃し
      const oddsBased = (im.odds || 0) * VIRTUAL_STAKE;
      missed += Math.max(0, oddsBased - VIRTUAL_STAKE);
      virtualPnl -= Math.max(0, oddsBased - VIRTUAL_STAKE);
      missedSkips++;
    } else {
      // もし買っていたら負けていた → 回避
      avoided += VIRTUAL_STAKE;
      virtualPnl += VIRTUAL_STAKE;
      correctSkips++;
    }
  }
  return {
    sampleSize: skips.length,
    correctSkips,
    missedSkips,
    avoided,                          // 仮想 回避損失 (正の値)
    missed,                           // 仮想 取り逃した利益 (正の値)
    virtualPnl,                       // ネット (avoided - missed)
    quality: (correctSkips + missedSkips) > 0
      ? correctSkips / (correctSkips + missedSkips)
      : null,
    label: skips.length === 0
      ? "見送り実績なし"
      : virtualPnl >= 0
        ? `見送りで ${virtualPnl.toLocaleString()} 円の損失を回避`
        : `見送りで ${Math.abs(virtualPnl).toLocaleString()} 円取り逃し`,
    isPositive: virtualPnl >= 0,
  };
}

/* === 3. 本日サマリ (短文 1 行) ===
   dayConfidence + 荒れ度 (accident severity 平均) + EV 分布 から:
   ・「本日: 勝負日」 (Go ラベル + EV 高い)
   ・「本日: 安定寄り」 (本命型割当多い + 平水面)
   ・「本日: 荒れ日 (注意)」 (accident 多発 / 風波強)
   ・「本日: 様子見日」 (中庸)
   ・「本日: 見送り推奨」 (候補ゼロ or 信頼度低)
*/
export function computeDaySummary(goMode, races, evals) {
  if (!goMode || !races || races.length === 0) {
    return {
      label: "📭 データなし",
      detail: "「🔄 更新」 でレース情報を取得してください",
      tone: "mute",
    };
  }
  const { dayConfidence = 0, confidenceLabel, totalCandidates = 0 } = goMode;
  // 荒れ度 (accident severity 平均)
  let accidentSum = 0, accidentCount = 0;
  let highEvCount = 0, lowEvCount = 0;
  for (const r of races) {
    const ev = evals?.[r.id];
    if (!ev?.ok) continue;
    if (ev.accident?.isAccident) {
      accidentSum += ev.accident.severity || 50;
      accidentCount++;
    }
    if (ev.maxEV >= 1.30) highEvCount++;
    if (ev.maxEV < 1.10) lowEvCount++;
  }
  const avgAccident = accidentCount > 0 ? accidentSum / accidentCount : 0;
  const accidentRate = races.length > 0 ? accidentCount / races.length : 0;

  if (totalCandidates === 0 || dayConfidence < 30) {
    return {
      label: "📊 本日: 見送り推奨日",
      detail: "期待値プラスの候補が見つかりません。 無理に買わない判断推奨。",
      tone: "neg",
    };
  }
  if (accidentRate >= 0.4) {
    return {
      label: "⚠️ 本日: 荒れ日 (注意)",
      detail: `危険レース ${accidentCount} 件 / 平均 severity ${Math.round(avgAccident)} — 慎重に`,
      tone: "warn",
    };
  }
  if (confidenceLabel === "Go" && highEvCount >= 3) {
    return {
      label: "🎯 本日: 条件達成日",
      detail: `S 級候補 ${highEvCount} 件 / 信頼度 ${dayConfidence}/100 — 厳選 ${Math.min(3, totalCandidates)} 件 (勝利保証なし)`,
      tone: "ok",
    };
  }
  if (confidenceLabel === "Go" && totalCandidates >= 3) {
    return {
      label: "✅ 本日: 安定寄り",
      detail: `候補 ${totalCandidates} 件 / 信頼度 ${dayConfidence}/100 — イン強めの平水面が中心`,
      tone: "info",
    };
  }
  if (confidenceLabel === "様子見") {
    return {
      label: "🤔 本日: 様子見日",
      detail: `候補 ${totalCandidates} 件 / 信頼度 ${dayConfidence}/100 — 厳選してリスク回避`,
      tone: "warn",
    };
  }
  return {
    label: "💡 本日: 通常",
    detail: `候補 ${totalCandidates} 件 / 信頼度 ${dayConfidence}/100`,
    tone: "info",
  };
}

/* === 4. 連勝連敗トラッキング ===
   最新の確定済 buy 記録から連続する勝/敗をカウント。
   ・現在の連勝/連敗
   ・最大連勝/連敗 (履歴内)
*/
export function computeStreakStats(predictions) {
  const all = Object.values(predictions || {})
    .filter((p) => p.decision === "buy" && (p.totalStake || 0) > 0 && p.result?.first)
    .sort((a, b) => {
      const ka = (a.date || "") + (a.startTime || "");
      const kb = (b.date || "") + (b.startTime || "");
      return kb.localeCompare(ka);
    });
  if (all.length === 0) {
    return {
      currentStreakKind: null,
      currentStreakCount: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      label: "実績なし",
      tone: "mute",
    };
  }
  // 現在の連勝/連敗
  const firstHit = all[0].hit;
  let currentCount = 0;
  for (const p of all) {
    if (p.hit === firstHit) currentCount++;
    else break;
  }
  // 最大連勝/連敗 (古い順に走査)
  const oldFirst = [...all].reverse();
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  for (const p of oldFirst) {
    if (p.hit) {
      curWin++; curLoss = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else {
      curLoss++; curWin = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    }
  }
  const kind = firstHit ? "win" : "loss";
  const label = firstHit
    ? `🔥 現在 ${currentCount} 連勝中`
    : `❄️ 現在 ${currentCount} 連敗中`;
  return {
    currentStreakKind: kind,
    currentStreakCount: currentCount,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    label,
    tone: firstHit ? "ok" : "neg",
    sampleSize: all.length,
  };
}
