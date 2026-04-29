/**
 * 実データ取得失敗時のフォールバックサンプル。
 * 「ボートレース場 X 会場 × 各 12R」程度を生成し、合成データで予測ロジックの動作を担保。
 * sourceMode: "sample" を付けて、UI でサンプル動作中だと判別できるようにする。
 */
import { todayDate } from "./format.js";

const VENUES = [
  { jcd: "01", name: "桐生" },
  { jcd: "04", name: "平和島" },
  { jcd: "07", name: "蒲郡" },
  { jcd: "12", name: "住之江" },
  { jcd: "22", name: "福岡" },
  { jcd: "24", name: "大村" },
];

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function sampleBoats(seed) {
  const r = rng(seed);
  const boats = [];
  for (let i = 1; i <= 6; i++) {
    boats.push({
      boatNo: i,
      racer: ["山田", "鈴木", "佐藤", "田中", "高橋", "渡辺"][i - 1] + " " +
             ["太郎", "健", "誠", "勇", "翔", "蓮"][Math.floor(r() * 6)],
      class: ["A1", "A2", "B1", "B2"][Math.floor(r() * 4)],
      winRate: +(3 + r() * 5).toFixed(2),
      placeRate: +(20 + r() * 40).toFixed(1),
      motor2: +(20 + r() * 30).toFixed(1),
      boat2: +(20 + r() * 30).toFixed(1),
      exTime: +(6.65 + r() * 0.4).toFixed(2),
      ST: +(0.10 + r() * 0.18).toFixed(2),
    });
  }
  return boats;
}

export function generateSampleRaces() {
  const date = todayDate();
  const races = [];
  for (const v of VENUES) {
    for (let rn = 1; rn <= 12; rn++) {
      const seed = +v.jcd * 1000 + rn;
      const r = rng(seed);
      const startHour = 10 + Math.floor(r() * 8);
      const startMin = ["00", "15", "30", "45"][Math.floor(r() * 4)];
      races.push({
        id: `R${v.jcd}-${String(rn).padStart(2, "0")}`,
        date,
        venue: v.name,
        jcd: v.jcd,
        raceNo: rn,
        startTime: `${String(startHour).padStart(2, "0")}:${startMin}`,
        weather: ["晴", "曇", "雨"][Math.floor(r() * 3)],
        wind: +(r() * 8).toFixed(1),
        windDir: ["追い風", "向かい風", "横風"][Math.floor(r() * 3)],
        wave: Math.floor(r() * 15),
        boats: sampleBoats(seed),
        currentWinOdds: null,
        sourceMode: "sample",
      });
    }
  }
  return races;
}

/**
 * /api/today レスポンスからレース骨格を組み立て、ボート詳細はサンプル。
 * (実データのスケジュール × 合成ボート — 必要時 /api/program で上書き)
 */
export function buildRacesFromSchedule(today) {
  if (!today?.ok || !Array.isArray(today.venues)) return [];
  const date = today.date && today.date.length === 8
    ? `${today.date.slice(0,4)}-${today.date.slice(4,6)}-${today.date.slice(6,8)}`
    : todayDate();
  const races = [];
  for (const v of today.venues) {
    for (const r of (v.races || [])) {
      const seed = (Number(v.jcd) || 0) * 1000 + (r.raceNo || 0);
      const rng2 = rng(seed);
      races.push({
        id: `R${v.jcd}-${String(r.raceNo).padStart(2, "0")}`,
        date,
        venue: v.name,
        jcd: v.jcd,
        raceNo: r.raceNo,
        startTime: r.startTime || "",
        weather: ["晴", "曇", "雨"][Math.floor(rng2() * 3)],
        wind: +(rng2() * 6).toFixed(1),
        windDir: ["追い風", "向かい風", "横風"][Math.floor(rng2() * 3)],
        wave: Math.floor(rng2() * 12),
        boats: sampleBoats(seed),
        currentWinOdds: null,
        sourceMode: "real-schedule",
      });
    }
  }
  return races;
}

/**
 * /api/program のレスポンスでボート情報を上書き。
 */
export function mergeProgram(race, prog) {
  if (!prog?.ok || !Array.isArray(prog.boats)) return race;
  const merged = race.boats.map((b) => {
    const p = prog.boats.find((x) => x.boatNo === b.boatNo);
    if (!p) return b;
    return {
      ...b,
      racer: p.racer || b.racer,
      class: p.class || b.class,
      winRate: p.winRate ?? b.winRate,
      placeRate: p.placeRate ?? b.placeRate,
      localWinRate: p.localWinRate,
      localPlaceRate: p.localPlaceRate,
      motor2: p.motor2 ?? b.motor2,
      boat2: p.boat2 ?? b.boat2,
      sourceMode: "real",
    };
  });
  return {
    ...race,
    boats: merged,
    weather: prog.weather || race.weather,
    wind: prog.wind ?? race.wind,
    windDir: prog.windDir || race.windDir,
    wave: prog.wave ?? race.wave,
    startTime: prog.startTime || race.startTime,
    sourceMode: "real",
  };
}

/**
 * /api/odds のレスポンスで currentWinOdds を上書き。
 */
export function mergeOdds(race, odds) {
  if (!odds?.win) return race;
  const arr = race.boats.map((b) => +odds.win[String(b.boatNo)] || null);
  return {
    ...race,
    currentWinOdds: arr,
    apiOdds: odds,
  };
}

/**
 * /api/beforeinfo のレスポンスで直前情報を上書き。
 *  - チルト / 部品交換 / 展示気配メモ / スタート展示 ST を boats にマージ
 *  - 気象は race level
 */
export function mergeBeforeInfo(race, info) {
  if (!info?.boats) return race;
  const merged = race.boats.map((b) => {
    const i = info.boats.find((x) => x.boatNo === b.boatNo);
    if (!i) return b;
    return {
      ...b,
      // 既存値を優先し、直前情報の方が新しい場合のみ上書き
      exTime: i.exTime ?? b.exTime,
      tilt: i.tilt ?? b.tilt,
      partsExchange: i.partsExchange?.length ? i.partsExchange : b.partsExchange,
      exhibitionNote: i.note || b.exhibitionNote || "",
      ST: i.startEx ?? b.ST,
      sourceMode: "real",
    };
  });
  const w = info.weather || {};
  return {
    ...race,
    boats: merged,
    weather: w.weather || race.weather,
    wind: w.wind ?? race.wind,
    windDir: w.windDir || race.windDir,
    wave: w.wave ?? race.wave,
    temp: w.temp ?? race.temp,
    waterTemp: w.waterTemp ?? race.waterTemp,
    apiBeforeInfo: info,
  };
}
