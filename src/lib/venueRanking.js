/**
 * 場別ランキング集計ロジック (Round 180-181 / SPEC §6.1.2 / docs/RANKING-DESIGN.md)
 *
 * 担当 5 場ごとに モーター / 選手 の TOP10 を計算する。
 * 全場混合は禁止。 必ず jcd でフィルタしてから集計。
 *
 * このファイルは UI を持たない。 純粋関数のみ。
 */

import { TARGET_VENUES } from "./mansyu.js";

/* ===== ユーティリティ ===== */

/** races を場別 (jcd) にグループ化、 各艇を平らな配列に展開 */
function flattenBoatsByVenue(races) {
  const out = {};
  for (const v of TARGET_VENUES) out[v] = [];
  if (!Array.isArray(races)) return out;
  for (const race of races) {
    const jcd = String(race?.jcd || "").padStart(2, "0");
    if (!TARGET_VENUES.includes(jcd)) continue;
    if (!Array.isArray(race?.boats)) continue;
    for (const b of race.boats) {
      if (!b) continue;
      out[jcd].push({
        ...b,
        raceNo: race.raceNo,
        venue: race.venue,
        jcd,
        // 展示タイム偏差用に同レース他艇の平均も持たせる
        _raceAvgExTime: avgExTime(race.boats),
      });
    }
  }
  return out;
}

function avgExTime(boats) {
  const ts = (boats || []).map((b) => +b?.exTime).filter((x) => x > 0);
  if (ts.length === 0) return null;
  return ts.reduce((a, b) => a + b, 0) / ts.length;
}

/* ===== モーター TOP10 (Round 180) ===== */

/**
 * 1 場分のモーター TOP10 を計算
 * @param {Array} races - 全レース (内部で jcd フィルタ)
 * @param {string} jcd  - "01" "02" "03" "04" "14" のいずれか
 * @returns {object} { jcd, venue, ranking: [{ rank, motorScore, motor2, boat2, racer, boatNo, raceNo, tag, tagReason }] }
 */
export function computeMotorRanking(races, jcd) {
  jcd = String(jcd || "").padStart(2, "0");
  if (!TARGET_VENUES.includes(jcd)) {
    return { jcd, venue: "", ranking: [] };
  }
  const grouped = flattenBoatsByVenue(races);
  const boats = grouped[jcd] || [];
  if (boats.length === 0) return { jcd, venue: "", ranking: [] };

  // 場全体の motor2 平均 (人気の割に強い 判定用)
  const motor2List = boats.map((b) => +b?.motor2).filter((x) => x > 0);
  const venueAvgMotor2 = motor2List.length > 0
    ? motor2List.reduce((a, b) => a + b, 0) / motor2List.length
    : 0;

  const venue = boats[0].venue || "";

  // スコア計算
  const scored = boats.map((b) => {
    const motor2 = +b.motor2 || 0;
    const boat2 = +b.boat2 || 0;
    const exTime = +b.exTime || 0;
    const exDelta = (b._raceAvgExTime != null && exTime > 0)
      ? (b._raceAvgExTime - exTime) // 正なら良い (=他艇より速い)
      : 0;

    // exhibitionBonus: -0.10 → 15点、 +0.10 → 0点 (リニア・clamped)
    const exBonus = clamp((exDelta + 0.05) * 100, 0, 15); // 0.05 改善で 10 点、 0.10 で 15 点

    const motorScore = clamp(
      motor2 * 0.60 +     // 0-60 (motor2 100% で 60 点)
      boat2 * 0.25 +      // 0-25
      exBonus,            // 0-15
      0, 100
    );

    return {
      racer: b.racer || "",
      boatNo: b.boatNo,
      raceNo: b.raceNo,
      motor2,
      boat2,
      exTime,
      exDelta,
      partsExchange: Array.isArray(b.partsExchange) ? b.partsExchange : [],
      motorScore: Math.round(motorScore),
      _raceAvgExTime: b._raceAvgExTime,
    };
  });

  // タグ生成 (優先順位: 展示気配◎ > 部品交換ハマり > 人気の割に強い > 安定)
  for (const m of scored) {
    if (m.exDelta >= 0.10 && m.exTime > 0) {
      m.tag = "🔥 展示気配◎";
      m.tagReason = `展示 ${m.exTime.toFixed(2)} (場内 -${m.exDelta.toFixed(2)})`;
    } else if (m.partsExchange.length > 0) {
      m.tag = "🛠 部品交換";
      m.tagReason = m.partsExchange.slice(0, 2).join(" / ");
    } else if (m.motor2 - venueAvgMotor2 >= 10) {
      m.tag = "💎 人気の割に強い";
      m.tagReason = `モーター ${m.motor2}% (場平均 ${venueAvgMotor2.toFixed(0)}%)`;
    } else if (m.motor2 >= 40) {
      m.tag = "🟢 安定";
      m.tagReason = `モーター 2 連率 ${m.motor2}%`;
    } else {
      m.tag = null;
      m.tagReason = "";
    }
  }

  // ソート (スコア降順) + ランク付け
  const ranking = scored
    .filter((m) => m.motor2 > 0) // データなしは除外
    .sort((a, b) => b.motorScore - a.motorScore)
    .slice(0, 10)
    .map((m, i) => ({ rank: i + 1, ...m }));

  return { jcd, venue, ranking };
}

/* ===== 選手 TOP10 (Round 181 / docs/RANKING-DESIGN.md §4) =====
 * 同一選手が同じ場で複数 R に出る場合は平均で集計 (= 評価の安定性)。
 * 「会場相性 (localWinRate)」 を全国成績 (winRate) より重く配分 = shoug 指示
 * 「会場巧者を発見」 を実現する。 */

const CLASS_BONUS = { A1: 15, A2: 10, B1: 5, B2: 0 };

/**
 * 1 場分の選手 TOP10 を計算
 * @param {Array} races - 全レース (内部で jcd フィルタ)
 * @param {string} jcd  - "01" "02" "03" "04" "14" のいずれか
 * @returns {object} { jcd, venue, ranking: [{ rank, racerScore, racer, ... }] }
 */
export function computeRacerRanking(races, jcd) {
  jcd = String(jcd || "").padStart(2, "0");
  if (!TARGET_VENUES.includes(jcd)) {
    return { jcd, venue: "", ranking: [] };
  }
  const grouped = flattenBoatsByVenue(races);
  const boats = grouped[jcd] || [];
  if (boats.length === 0) return { jcd, venue: "", ranking: [] };
  const venue = boats[0].venue || "";

  // 同一選手 (名前ベース) でグループ化、 平均集計
  const byRacer = {};
  for (const b of boats) {
    const name = String(b.racer || "").trim();
    if (!name) continue;
    if (!byRacer[name]) {
      byRacer[name] = {
        racer: name,
        appearances: 0,
        boatNos: [],
        raceNos: [],
        cls: b.class || "",
        winRateSum: 0,
        localWinRateSum: 0,
        STSum: 0,
        STCount: 0,
        motor2Sum: 0,
      };
    }
    const r = byRacer[name];
    r.appearances += 1;
    r.boatNos.push(b.boatNo);
    r.raceNos.push(b.raceNo);
    r.winRateSum += +b.winRate || 0;
    r.localWinRateSum += +b.localWinRate || 0;
    if (b.ST != null && +b.ST > 0) {
      r.STSum += +b.ST;
      r.STCount += 1;
    }
    r.motor2Sum += +b.motor2 || 0;
    // 級別は最初に出てきたものを採用 (普通 1 場では同じ)
    if (!r.cls && b.class) r.cls = b.class;
  }

  // スコア計算
  const scored = Object.values(byRacer).map((r) => {
    const winRate = r.appearances > 0 ? r.winRateSum / r.appearances : 0;
    const localWinRate = r.appearances > 0 ? r.localWinRateSum / r.appearances : 0;
    const avgST = r.STCount > 0 ? r.STSum / r.STCount : null;
    const motor2 = r.appearances > 0 ? r.motor2Sum / r.appearances : 0;

    // 0-100 化:
    //   winRate 0-8.0 → 0-100 (× 12.5)
    //   localWinRate 0-8.0 → 0-100 (× 12.5)
    //   class A1=15 / A2=10 / B1=5 / B2=0 を 0-100 に再スケーリング (×6.67) → A1=100
    //   ST 0.20 → 0、 0.10 → 100 (リニア・clamped)
    //   motor2 0-100 (生)
    const winScore   = clamp(winRate * 12.5, 0, 100);
    const localScore = clamp(localWinRate * 12.5, 0, 100);
    const clsBonus = CLASS_BONUS[r.cls] ?? 0;
    const classScore = clamp(clsBonus * (100 / 15), 0, 100); // A1=100
    const stScore = avgST != null
      ? clamp((0.20 - avgST) * 1000, 0, 100) // 0.10 → 100, 0.20 → 0
      : 50; // 不明時は中庸
    const motorScore = clamp(motor2, 0, 100); // motor2 自体が 0-100

    const racerScore = clamp(
      winScore   * 0.20 +
      localScore * 0.30 +   // 会場相性を最も重く (shoug 指示)
      classScore * 0.15 +
      stScore    * 0.15 +
      motorScore * 0.10 +
      0          * 0.10,    // recentTrend は Round 181 では未実装 (toban 取得課題)
      0, 100
    );

    // 代表レース (最初の登場 = 一番早い R) を表示用に
    const repBoatNo = r.boatNos[0];
    const repRaceNo = r.raceNos[0];

    return {
      racer: r.racer,
      cls: r.cls,
      boatNo: repBoatNo,
      raceNo: repRaceNo,
      appearances: r.appearances,
      winRate: round2(winRate),
      localWinRate: round2(localWinRate),
      avgST,
      motor2: Math.round(motor2),
      racerScore: Math.round(racerScore),
    };
  });

  // タグ生成 (優先順位: 会場巧者 > ST 安定 > イン巧者 > マクリ得意 > 相性良好 > 安定)
  for (const m of scored) {
    if (m.localWinRate - m.winRate >= 1.5) {
      m.tag = "🌊 会場巧者";
      m.tagReason = `当地 ${m.localWinRate} (全国比 +${(m.localWinRate - m.winRate).toFixed(2)})`;
    } else if (m.avgST != null && m.avgST <= 0.13) {
      m.tag = "🎯 ST 安定";
      m.tagReason = `平均 ST ${m.avgST.toFixed(2)}`;
    } else if (m.boatNo === 1 && m.winRate >= 6.5) {
      m.tag = "🚀 イン巧者";
      m.tagReason = `1 号艇 + 勝率 ${m.winRate}`;
    } else if ((m.boatNo === 3 || m.boatNo === 4) && m.cls === "A1" && m.avgST != null && m.avgST <= 0.14) {
      m.tag = "🔥 マクリ得意";
      m.tagReason = `${m.boatNo}号艇 A1 + ST ${m.avgST.toFixed(2)}`;
    } else if (m.motor2 >= 45 && m.winRate >= 6.0) {
      m.tag = "💎 相性良好";
      m.tagReason = `モーター ${m.motor2}% + 勝率 ${m.winRate}`;
    } else if (m.cls === "A1" || m.cls === "A2") {
      m.tag = "⚖ 安定";
      m.tagReason = `${m.cls} 級`;
    } else {
      m.tag = null;
      m.tagReason = "";
    }
  }

  const ranking = scored
    .filter((m) => m.winRate > 0 || m.localWinRate > 0) // データなし除外
    .sort((a, b) => b.racerScore - a.racerScore)
    .slice(0, 10)
    .map((m, i) => ({ rank: i + 1, ...m }));

  return { jcd, venue, ranking };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* ===== ヘルパー ===== */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
