# 場別ランキング機能 — 設計ドキュメント

> 起案日: **2026-05-10** (Round 179 — SPEC §6.1.2 設計フェーズ)
> 実装フェーズ: Round 180 (モーター TOP10) → Round 181 (選手 TOP10)
> 関連: `docs/SPEC.md` §6.1.2

このドキュメントは **コードを書く前の準備**。 これを固めてから Round 180-181 で実装する。

---

## 1. ゴール (再掲)

shoug 思想:「研究感・分析感・信頼感」 を作る。 「このアプリ、 本当に研究してる」 と思わせる。

- **担当 5 場ごと** にモーター / 選手 TOP10 を見せる
- **全場混合禁止** (5 場それぞれで独立)
- **「なぜ上位か」 の一言タグ** を必ず付ける
- **AI 評価ロジックと連動** (見せかけ別計算禁止)
- **入口は小さく** (🔬 研究所タブ内)

---

## 2. 利用可能なデータ (実機調査結果)

### 2.1 `/api/program?jcd=XX&rno=N&date=YYYYMMDD` (出走表)

1 レース 6 艇分:
```
boats[i] = {
  boatNo,        // 艇番 1-6
  racer,         // 選手名
  class,         // 級別 (A1/A2/B1/B2)
  winRate,       // 全国勝率
  placeRate,     // 全国 2 連率
  localWinRate,  // 当地勝率
  localPlaceRate,// 当地 2 連率 ← 「会場相性」 の主指標
  motor2,        // モーター 2 連率 ← モーターの主指標
  boat2,         // ボート 2 連率
  ST,            // 平均 ST
}
```

### 2.2 `/api/racer-recent?toban=NNNN` (選手 直近 3 節)
```
{
  results: [3,3,5,2,4,...],  // 直近着順の羅列
  count,                      // 総レース数
  avg,                        // 平均着順
  firstRate,                  // 1 着率
  showRate,                   // 3 連対率
  fNum, lNum,                 // F (フライング) / L (レイト)
  last5,                      // 直近 5 走
}
```
キャッシュ 86400 秒 (1 日)。

### 2.3 `/api/beforeinfo?jcd=XX&rno=N&date=YYYYMMDD` (展示)
- 展示タイム、 展示 ST、 部品交換、 気配 等

### 2.4 制約事項 (必読)

⚠️ **モーター ID** は program.js では取得できない (機械単体識別なし → 履歴追跡不可)。
→ **モーター TOP10 = 「今日その場で走るモーターの 2 連率順」**しか出せない。
   過去成績で並べ替えるには、 別 API (今節モーター成績ページ) のスクレイピングが必要 (Round 180.5 で別途検討)。

⚠️ **モーター上昇傾向** は 1 日のスナップショットしかないので、 「日次保存 → 比較」 が必要。
   Round 180 では「今日の motor2 の値」 を主軸にし、 「上昇傾向」 タグは部分的に対応。

⚠️ **選手 ID (toban)** は program.js の戻り値に含まれていない可能性が高い → racer-recent を呼ぶには toban が必要。
   → **Round 181 では選手名ベースで集計**する方向で設計 (toban 取得は別途検討)。

---

## 3. モーター TOP10 — 集計式 (Round 180 実装)

### 3.1 入力

担当 5 場のうち、 **今日開催されている場のすべてのレース** を取得 → 全モーター情報を平らな配列に。

```js
// pseudo
const TARGET_VENUES = ["01", "02", "03", "04", "14"]; // mansyu.js から動的取得
const todayRaces = races.filter(r => isTargetVenue(r.jcd));

// 場ごとにグループ化
const byVenue = {};
for (const venue of TARGET_VENUES) {
  byVenue[venue] = todayRaces
    .filter(r => r.jcd === venue)
    .flatMap(r => r.boats.map(b => ({
      ...b,
      raceNo: r.raceNo,
      venue: r.venue,
      jcd: r.jcd,
    })));
}
```

### 3.2 スコア式 (0-100)

```
motorScore =
    motor2 * 0.50              // モーター 2 連率 (主指標) — 100 点満点換算
  + boat2  * 0.20              // ボート 2 連率 (補助)
  + (ageBonus(motor2) * 0.15)  // 「今節伸び」 ボーナス (※ Round 180 では仮実装)
  + (exhibitionBonus * 0.15)   // 展示気配 (befoinfo から取得した展示偏差 0-100 点)
```

※ 各成分は 0-100 にスケーリングしてから重み合算。

### 3.3 一言タグ生成ルール

| タグ | 条件 |
|---|---|
| 🔥 展示気配◎ | 展示タイムが艇内偏差で +0.10 以上良い |
| 📈 今節伸び型 | 前節モーター 2 連率を保存していて、 +5pt 以上向上 (Round 180.5 で対応) |
| 🛠 部品交換ハマり | 直近で部品交換あり (befoinfo.partsExchange) |
| 💎 人気の割に強い | motor2 が場平均より +10pt 以上 (人気度合いはオッズで近似) |
| 🟢 安定 | motor2 ≥ 40 |

タグは最大 1 個。 優先順位: 展示気配◎ > 部品交換ハマり > 今節伸び型 > 人気の割に強い > 安定。

### 3.4 出力

```js
{
  jcd: "02",
  venue: "戸田",
  ranking: [
    { rank: 1, motor2: 52, boat2: 38, racer: "中野次郎", boatNo: 1, raceNo: 5,
      motorScore: 87, tag: "🔥 展示気配◎", tagReason: "展示 6.62 (場内 -0.12)" },
    ...
  ]
}
```

5 場 × TOP10 = 最大 50 行。

---

## 4. 選手 TOP10 — 集計式 (Round 181 実装)

### 4.1 入力

`byVenue[jcd]` から選手単位に集計 (1 選手が 1 場で複数 R に出る場合は合算 / 平均)。

### 4.2 スコア式 (0-100)

```
racerScore =
    winRate         * 0.20   // 全国勝率 (上限 8.0 想定)
  + localWinRate    * 0.30   // 当地勝率 (= 会場相性) — 全国より重い
  + classBonus      * 0.15   // A1=15, A2=10, B1=5, B2=0
  + stBonus         * 0.15   // ST スコア (0.10 → 15, 0.20 → 0)
  + motorAffinity   * 0.10   // 当日のモーター motor2 (相性スコア)
  + recentTrend     * 0.10   // 直近 3 節 (racer-recent から、 1着率や平均着順で 0-10)
```

各成分は 0-100 (またはそれぞれの最大値) にスケーリングしてから重み合算。

### 4.3 一言タグ生成ルール (例)

| タグ | 条件 |
|---|---|
| 🎯 ST 安定 | ST ≤ 0.13 |
| 🌊 会場巧者 | localWinRate - winRate ≥ 1.5 (=この場では明らかに強い) |
| 🚀 イン巧者 | boatNo === 1 + winRate ≥ 6.5 |
| 🔥 マクリ得意 | boatNo ∈ {3,4} + class === "A1" + ST ≤ 0.14 |
| 💎 相性良好 | motor2 ≥ 45 + winRate ≥ 6.0 |
| ⚖ 安定 | class === "A1" or A2 |

タグは最大 1 個。 優先順位: 会場巧者 > ST 安定 > イン巧者 > マクリ得意 > 相性良好 > 安定。

### 4.4 出力

```js
{
  jcd: "02",
  venue: "戸田",
  ranking: [
    { rank: 1, racer: "中野次郎", boatNo: 1, raceNo: 5, class: "A1",
      winRate: 6.85, localWinRate: 7.20,
      racerScore: 84, tag: "🌊 会場巧者", tagReason: "当地勝率 7.20 (全国比 +0.35)" },
    ...
  ]
}
```

---

## 5. UI 設計

### 5.1 配置

🔬 研究所タブの中、 **`ResearchOverview` の下、 `MansyuLab` の上**:

```
🔬 研究所タブ
 ├─ ResearchOverview (上級者向けバナー / 学習履歴 / Coming soon)
 ├─ ★ NEW: VenueRankings  ← Round 180-181 で追加
 │   ├─ 場切替タブ (戸田 | 江戸川 | 平和島 | 鳴門 | 桐生)
 │   ├─ モーター TOP10 (Round 180)
 │   └─ 選手 TOP10 (Round 181)
 ├─ MansyuLab
 └─ LossAnalysis
```

### 5.2 コンポーネント構成

```
src/components/VenueRankings.jsx          // 親 — 場切替タブ + 子 2 つ
src/components/MotorRankingTable.jsx       // モーター TOP10 (Round 180)
src/components/RacerRankingTable.jsx       // 選手 TOP10 (Round 181)
src/lib/venueRanking.js                    // 集計ロジック (両方が使う)
```

### 5.3 場切替タブ

```jsx
const TAGS = TARGET_VENUES.map(jcd => ({ jcd, name: VENUE_BASE[jcd].name }));
// 動的取得 — コードに「戸田」 等を直書きしない (SPEC §6.1.2 設計原則)

[戸田] [江戸川] [平和島] [鳴門] [桐生]
```

### 5.4 ランキング表 (1 行 1 件・SPEC §6.1.2 「一瞬で読める」)

```
TOP10 モーター (戸田)

1.  ●  №3 中野次郎    🔥 展示気配◎       [モーター 2連率 52% / 展示 6.62]
2.  ●  №1 山田太郎    💎 人気の割に強い   [モーター 2連率 48%]
3.  ●  №5 鈴木一郎    🛠 部品交換ハマり   [モーター 2連率 45% / 交換: ピストン]
...
```

色は黒・濃紺ベース、 タグだけ控えめなアクセント色 (赤/黄を使い分け)。 SPEC §6.1.2 の「色 1-2 色のみ / 一瞬で読める / 情報密度上げすぎない」 を遵守。

### 5.5 「データなし」 ハンドリング

- 当日その場が開催なし → 「📅 戸田は今日開催なし」
- データ取得失敗 → 「⚠️ データ取得に失敗しました (リロードしてください)」

---

## 6. 実装ステップ (Round 180-181)

### Round 180: モーター TOP10
1. `src/lib/venueRanking.js` 新規 — `computeMotorRanking(races, jcd)` を export
2. `src/components/MotorRankingTable.jsx` 新規 — UI
3. `src/components/VenueRankings.jsx` 新規 — 親コンポーネント (場切替タブ + MotorRankingTable のみ)
4. `App.jsx` の analysis ブロックに `<VenueRankings races={races} />` 追加
5. ビルド + push

### Round 181: 選手 TOP10
1. `venueRanking.js` に `computeRacerRanking(races, jcd)` 追加
2. `src/components/RacerRankingTable.jsx` 新規
3. `VenueRankings.jsx` に RacerRankingTable を追加 (モーター TOP10 の下)
4. ビルド + push

---

## 7. 後回し事項 (Round 180.5 / 別 Round)

- モーター ID 別の履歴追跡 (今節成績ページのスクレイピング)
- 選手 toban の取得方法 (toban → racer-recent の連動)
- 「上昇傾向」 タグ (前節→今節の motor2 比較) — 日次スナップショット保存が必要
- 場別重み調整 (SPEC §12 段階 B / Round 182)

---

## 8. 設計上の決定事項

| 決定 | 理由 |
|---|---|
| ランキング対象 = 「今日開催の 5 場のレースから」 | リアルタイム性重視。 過去日のデータは別途 (将来) |
| 同一選手が複数 R に出る場合は **平均** で集計 | 評価の安定性 |
| 一言タグは **最大 1 個** | SPEC §6.1.2 「一瞬で読める」 |
| 5 場リストは `mansyu.js:TARGET_VENUES` を import | SPEC §6.1.2 「動的取得・固定埋め込み禁止」 |
| 場切替タブは「戸田」 等の名前で表示、 内部は jcd | UX と保守性の両立 |
| データ取得は既存の races (App.jsx state) を使用 | 二重 fetch を避ける |
