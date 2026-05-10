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

/* ===== 選手 TOP10 (Round 181 で使用予定 — スケルトン) ===== */
// 設計書 §4 を参照。 Round 181 で実装。

/* ===== ヘルパー ===== */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
