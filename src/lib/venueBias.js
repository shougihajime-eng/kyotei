/**
 * 会場別バイアス + 昼/ナイター適性 + 負けパターン分析
 *
 * Round 17: 各レースの EV 計算に会場特性 / 時間帯特性 を補正係数として掛ける。
 * - 会場ごとに「インが強い / 差しが入る / まくりが決まる」傾向データ
 * - レース発走時刻から「昼レース / ナイター」 を判定
 * - 過去の結果から「刺され負け / まくり負け / まくり差し負け / 展開負け」 を分類
 *
 * すべて公知の傾向 (boatrace.jp / 公営競技紙 集計) を参考に
 * 実測ベース (±5〜10% 程度) の控えめな補正にしている。過剰補正は禁物。
 */

/* === 競艇場 24 場 (jcd → 名前 & ナイター開催 / 特性) ===
   inAdv: 1コース1着率の全国平均比 (%pt)
   makuri: まくり決まり率の全国平均比 (%pt)
   sashi: 差し決まり率の全国平均比 (%pt)
   nightOften: ナイター開催が多い場 (true=主にナイター)
   note: 一言ノート (UI 表示用) */
export const VENUE_PROFILE = {
  "01": { name: "桐生",    inAdv: -2,  makuri: +3,  sashi: -1, nightOften: true,  note: "ナイター中心、風で荒れやすい" },
  "02": { name: "戸田",    inAdv: -7,  makuri: +5,  sashi: +1, nightOften: false, note: "全国一狭い水面、まくり決まりやすい" },
  "03": { name: "江戸川",  inAdv: -3,  makuri: +2,  sashi: 0,  nightOften: false, note: "潮位差激しく荒れる" },
  "04": { name: "平和島",  inAdv: -2,  makuri: +1,  sashi: 0,  nightOften: true,  note: "風の影響を受けやすい" },
  "05": { name: "多摩川",  inAdv: +2,  makuri: -1,  sashi: 0,  nightOften: false, note: "静水面、実力通り出やすい" },
  "06": { name: "浜名湖",  inAdv: 0,   makuri: +1,  sashi: 0,  nightOften: false, note: "広い水面、外艇まくり残る" },
  "07": { name: "蒲郡",    inAdv: +1,  makuri: 0,   sashi: +1, nightOften: true,  note: "ナイター、イン安定 / 差しも入る" },
  "08": { name: "常滑",    inAdv: 0,   makuri: +1,  sashi: 0,  nightOften: false, note: "風と潮で読みづらい" },
  "09": { name: "津",      inAdv: -1,  makuri: +1,  sashi: 0,  nightOften: false, note: "普通水面" },
  "10": { name: "三国",    inAdv: -3,  makuri: +3,  sashi: +1, nightOften: false, note: "海水、夏は荒れやすい" },
  "11": { name: "びわこ",  inAdv: -4,  makuri: +3,  sashi: +1, nightOften: false, note: "標高高く外艇まくりが入る" },
  "12": { name: "住之江",  inAdv: +5,  makuri: -2,  sashi: -1, nightOften: true,  note: "ナイター、イン最強水面" },
  "13": { name: "尼崎",    inAdv: +3,  makuri: -1,  sashi: 0,  nightOften: false, note: "イン強め" },
  "14": { name: "鳴門",    inAdv: -2,  makuri: +2,  sashi: 0,  nightOften: false, note: "潮で大荒れもある" },
  "15": { name: "丸亀",    inAdv: -1,  makuri: +1,  sashi: 0,  nightOften: true,  note: "ナイター、潮の影響" },
  "16": { name: "児島",    inAdv: 0,   makuri: 0,   sashi: 0,  nightOften: false, note: "標準" },
  "17": { name: "宮島",    inAdv: -2,  makuri: +2,  sashi: 0,  nightOften: false, note: "潮で外も活躍" },
  "18": { name: "徳山",    inAdv: +6,  makuri: -2,  sashi: -1, nightOften: false, note: "全国屈指のイン水面" },
  "19": { name: "下関",    inAdv: -1,  makuri: 0,   sashi: +2, nightOften: true,  note: "ナイター、差しが決まる" },
  "20": { name: "若松",    inAdv: -1,  makuri: +1,  sashi: 0,  nightOften: true,  note: "ナイター" },
  "21": { name: "芦屋",    inAdv: +3,  makuri: -1,  sashi: 0,  nightOften: false, note: "イン強め静水面" },
  "22": { name: "福岡",    inAdv: -2,  makuri: +1,  sashi: +1, nightOften: false, note: "潮で差しも入る" },
  "23": { name: "唐津",    inAdv: 0,   makuri: 0,   sashi: 0,  nightOften: false, note: "標準" },
  "24": { name: "大村",    inAdv: +6,  makuri: -3,  sashi: -1, nightOften: false, note: "全国一のイン水面" },
};

/** 会場名から jcd を推定 (apiResult が name のみの場合のフォールバック) */
export function resolveJcd(jcd, venueName) {
  if (jcd && VENUE_PROFILE[jcd]) return jcd;
  if (!venueName) return null;
  for (const [k, v] of Object.entries(VENUE_PROFILE)) {
    if (v.name === venueName) return k;
  }
  return null;
}

/** レース発走時刻 (HH:MM) から 昼/ナイター を判定。17:00 以降ナイター。 */
export function classifyRaceTime(startTime) {
  if (!startTime) return "day";
  const h = +startTime.split(":")[0];
  if (isNaN(h)) return "day";
  if (h >= 17) return "night";
  if (h >= 14) return "evening";
  return "day";
}

/** 会場 + 時間帯 から 各艇の EV 補正係数を返す (中心 1.0)
 *  例: 大村でイン → 1.06、戸田でイン → 0.94
 *  返り値: [boat1Mod, boat2Mod, ..., boat6Mod] (倍率)
 */
export function venueTimeMods(jcd, venueName, startTime) {
  const k = resolveJcd(jcd, venueName);
  const v = k ? VENUE_PROFILE[k] : null;
  const slot = classifyRaceTime(startTime);
  const isNight = slot === "night";
  // ベース倍率
  const mods = [1, 1, 1, 1, 1, 1];
  if (!v) return { mods, profile: null, slot, nightActiveVenue: false };

  // インバイアス: 1号艇に直接、4-6号艇に逆方向
  const inAdvFactor = 1 + (v.inAdv / 100);
  mods[0] *= inAdvFactor;
  // 外艇は逆: ただし inAdv の半分の影響
  const outFactor = 1 - (v.inAdv / 200);
  mods[3] *= outFactor;
  mods[4] *= outFactor;
  mods[5] *= outFactor;

  // まくり決まり率: 2-3号艇に有利 (まくりは2/3コースから)
  const makuriFactor = 1 + (v.makuri / 200);
  mods[1] *= makuriFactor;
  mods[2] *= makuriFactor;

  // 差し決まり率: 2号艇 (主に2コース差し) に有利
  const sashiFactor = 1 + (v.sashi / 200);
  mods[1] *= sashiFactor;

  // ナイター開催場 + 夜時間帯: 一定の補正なし (ナイター適性は選手別)
  const nightActiveVenue = !!v.nightOften && isNight;

  // 倍率を [0.88, 1.12] にクリップ
  for (let i = 0; i < 6; i++) {
    mods[i] = Math.max(0.88, Math.min(1.12, mods[i]));
  }
  return { mods, profile: v, slot, nightActiveVenue, jcd: k };
}

/** 選手の昼/ナイター適性 (winRateNight があれば使う、無ければ winRate からの控えめ補正)
 *  返り値: 倍率 (0.95〜1.05)
 */
export function timeAptitudeMod(boat, slot) {
  if (!boat) return 1;
  // 直接の night/day 勝率があれば使う (将来 API 拡張用)
  if (slot === "night" && typeof boat.winRateNight === "number" && typeof boat.winRate === "number") {
    const diff = boat.winRateNight - boat.winRate;
    if (diff >= 1.0) return 1.05;
    if (diff >= 0.5) return 1.03;
    if (diff <= -1.0) return 0.95;
    if (diff <= -0.5) return 0.97;
  }
  if (slot === "day" && typeof boat.winRateDay === "number" && typeof boat.winRate === "number") {
    const diff = boat.winRateDay - boat.winRate;
    if (diff >= 1.0) return 1.05;
    if (diff >= 0.5) return 1.03;
    if (diff <= -1.0) return 0.95;
    if (diff <= -0.5) return 0.97;
  }
  return 1;
}

/** 戦法相性補正:
 *  対戦相手の得意戦法 (まくり型/差し型) を見て、本命艇との相性を計算。
 *  ・1号艇本命 vs 2号艇まくり型 → 刺されリスク → -3%
 *  ・1号艇本命 vs 3号艇まくり型 → まくられリスク → -3%
 *  返り値: 倍率 (0.94〜1.04)
 */
export function styleMatchupMod(boats) {
  if (!Array.isArray(boats) || boats.length !== 6) return [1, 1, 1, 1, 1, 1];
  const mods = [1, 1, 1, 1, 1, 1];
  const styleOf = (b) => {
    // ST が早い+winRate高 → まくり型 (簡易判定)
    const st = b.ST;
    const wr = b.winRate;
    if (st != null && st <= 0.16 && wr != null && wr >= 6.0) return "まくり";
    if (st != null && st <= 0.18 && wr != null && wr >= 5.0) return "差し";
    return null;
  };
  // 2/3コースに「まくり型」 がいれば 1号艇に -3%
  for (let i = 1; i <= 2; i++) {
    if (styleOf(boats[i]) === "まくり") mods[0] *= 0.97;
  }
  // 2コースに「差し型」 がいれば 1号艇に -2% (刺されリスク)
  if (styleOf(boats[1]) === "差し") mods[0] *= 0.98;
  return mods;
}

/** 警戒判定: 「このレースは要注意」 なポイントを文字列配列で返す */
export function buildWarnings(race, evals) {
  const warnings = [];
  const k = resolveJcd(race?.jcd, race?.venue);
  const v = k ? VENUE_PROFILE[k] : null;

  // 会場特性
  if (v) {
    if (v.inAdv >= 4) warnings.push({ kind: "info", text: `${v.name}は全国屈指のイン水面 (1号艇有利)` });
    else if (v.inAdv <= -4) warnings.push({ kind: "warn", text: `${v.name}はイン弱め (まくり/差しに注意)` });
    if (v.makuri >= 3) warnings.push({ kind: "warn", text: `${v.name}はまくりが決まりやすい場 → 2-3コース警戒` });
    if (v.sashi >= 2) warnings.push({ kind: "warn", text: `${v.name}は差しが入りやすい場 → 2号艇差し警戒` });
  }

  // 風波
  const wave = race?.wave ?? 0;
  const wind = race?.wind ?? 0;
  if (wind >= 7 || wave >= 8) warnings.push({ kind: "warn", text: `荒水面 (風${wind}m / 波${wave}cm) — 荒れる可能性` });

  // 1号艇信頼度
  const inTrust = evals?.inTrust;
  if (inTrust?.level === "イン崩壊警戒" || inTrust?.level === "荒れ注意") {
    warnings.push({ kind: "warn", text: `1号艇信頼度低 (${inTrust.level}) — 高配当に振れる可能性` });
  }
  if (inTrust?.level === "イン逃げ濃厚") {
    warnings.push({ kind: "ok", text: `1号艇逃げ濃厚 — 1着固定の本線で十分` });
  }

  // 戦法相性 (簡易)
  const boats = race?.boats || [];
  const wakuriRisk = boats.slice(1, 3).some((b) => b?.ST != null && b.ST <= 0.16 && b?.winRate >= 6.0);
  if (wakuriRisk) warnings.push({ kind: "warn", text: `2-3号艇に「まくり型」 → 1号艇まくられリスク` });
  const sashiRisk = boats[1]?.ST != null && boats[1]?.ST <= 0.18 && boats[1]?.winRate >= 5.0 && !wakuriRisk;
  if (sashiRisk) warnings.push({ kind: "warn", text: `2号艇に「差し型」 → 1号艇刺されリスク` });

  // ナイター適性
  const slot = classifyRaceTime(race?.startTime);
  if (v?.nightOften && slot === "night") {
    warnings.push({ kind: "info", text: `ナイター開催 — 夜に強い選手は穴候補に格上げ` });
  }
  return warnings;
}

/** 負けパターン分類 (確定済みレースで「本命=1号艇 が 1着でなかった場合」の負け方) */
export function classifyLossPattern(race, prediction) {
  if (!race?.apiResult || !prediction) return null;
  const r = race.apiResult;
  if (!r.first) return null;
  const expectedHead = parseInt(prediction.combos?.[0]?.combo?.[0] || "0");
  if (!expectedHead) return null;
  if (r.first === expectedHead) return null; // 1着的中は対象外
  // 1号艇本命のとき
  if (expectedHead === 1) {
    // 1号艇が3着以下なら大敗
    // 2着以内かつ 1着が他艇なら「展開負け / まくり負け / まくり差し負け / 刺され負け」
    const inFirst = r.first;
    const inSecond = r.second;
    const ourPos = (r.first === 1 ? 1 : r.second === 1 ? 2 : r.third === 1 ? 3 : 4);
    if (inFirst === 2 && ourPos === 2) return { kind: "刺され負け", desc: "2号艇に内側から差されました" };
    if (inFirst === 3) return { kind: "まくり負け", desc: "3号艇のまくりに屈しました" };
    if (inFirst === 4 || inFirst === 5 || inFirst === 6) return { kind: "外艇まくり負け", desc: `${inFirst}号艇まくり/まくり差し` };
    if (ourPos >= 3) return { kind: "展開負け", desc: "スタート遅れまたは進入で崩れた可能性" };
  }
  // 外艇本命のとき
  if (r.first === 1) return { kind: "外艇選定ミス", desc: "1号艇が逃げ切り" };
  return { kind: "外艇選定ミス", desc: `${r.first}号艇が1着 (本命${expectedHead}号艇は${r.first === expectedHead ? "1着" : "外れ"})` };
}
