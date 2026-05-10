# CLAUDE.md — 万舟研究所

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **🔬 Round 166 — 学習データソース修正 + 重み補正適用 UI** — ① **致命バグ修正**: `mansyuLearning.analyzeMansyuLearning` が `predictions.mansyuSnapshot` (保存されない) を読んでいて永久に「データ 0 件」 になっていた → `mansyuSkipLog.getJudgementLog()` を主データソースに切替 (MansyuTop が races 更新ごとに自動記録しているので 1 日目から学習が回る)。② **重み補正適用 UI**: `mansyuWeights.js` 新規 (load/save/apply 重み係数 0.5-1.5)、`mansyu.js` に `setMansyuWeights/getMansyuWeights/applyWeight` (各成分スコアに係数を掛ける)、MansyuLab に「この提案を適用」 「全提案を一括適用」 「リセット」 ボタン追加。③ summary に「分析待ち: 結果確定 N 件 / 監視中 M 件」 を表示 (進捗が見える)。 / 直前 Round 165 (UI polish)。 — ① **タブを 4 つに整理** (検証・グラフを Header から外し、 ホーム/一覧/研究所/設定 の 4 タブのみ表示。 検証・グラフは研究所タブに集約済)、② **激荒れバッジに脈動アニメ** (`mansyu-pulse` 1.4 秒周期 scale + glow)、③ **締切 5 分以内に点滅** (`mansyu-blink` 0.9 秒周期 opacity)、④ **激荒れスコアバッジに発光** (`mansyu-glow` 2.2 秒周期 box-shadow)、⑤ 空状態を「🌙 今は荒れそうなレースなし」 + 監視中件数を強調表示に刷新、⑥ prefers-reduced-motion 対応 (アクセシビリティ)。 / 直前 Phase 2 (Round 164): 万舟向け学習 + 研究所タブ。
- ✅ Phase 2 (Round 164): **🔬 万舟向け学習 + 研究所タブ** — ① **`mansyuLearning.js` 新規** (荒れスコアの精度集計 / 各成分 entry/weather/leader/attackers/exhibition/odds の階級別 荒れ率 / 重み補正提案 boost/reduce/inverse / `findMissedRoughRaces` で取りこぼし抽出)、② **`MansyuLab.jsx` 新規** (KPI 3 box: 見立て的中率 / 見送り正答率 / 取りこぼし件数 / 重み補正提案 / 成分別 荒れ率テーブル / 取りこぼしレース一覧 配当順)、③ 「分析」 タブを **「研究所」 (🔬)** にリネーム → MansyuLab 最上段 + 既存 LossAnalysis を併設。 / 直前 Phase 1+1.5+1.6: アプリ名・5 場限定・荒れスコア 100 点・MansyuTop・30 秒自動更新・タップ反応・レスポンシブ・UI 細部調整 (フォント大型化 + コントラスト強化) + Supabase manfune_lab スキーマ分離。
- ✅ Round 166 続き — Phase 2.5 完了: **🎬 MansyuDetail + Supabase 同期** — ① **`MansyuDetail.jsx` 新規** (1 レース深掘り画面: recharts レーダーチャート 6 成分 0-100% / 各成分の理由一覧 / 買い目 / 公式リンク 5 種 / 気象・水面)、② App.jsx の detail タブに上段 MansyuDetail / 下段 RaceDetail 併設、 MansyuTop の RaceCard に「🔬 詳しく見る」 ボタン追加、③ **Supabase 同期拡張**: `cloudSync.js` の details JSONB に `mansyuSnapshot` / `whatIfBuy` を追加 — `manfune_lab` スキーマで端末間共有可能。
- ✅ Round 167 — **見送りログのクラウド同期** (Phase 2.5 補完): ① Supabase に `manfune_lab.skip_log` テーブル新規作成 (RLS 4 ポリシー / auth.users CASCADE / 19 カラム)、② `src/lib/skipLogSync.js` 新規 (toRow / fromRow / pushSkipLog / pullSkipLog / mergeSkipLogs / fullSyncSkipLog / lightPushSkipLog — finalized 行は cloud で上書きされない保護)、③ `mansyuSkipLog.js` に `replaceLog()` 追加 (cloud から merge 結果を localStorage に書き戻すための入口)、④ App.jsx に同期 useEffect 2 つ追加 (ログイン直後の fullSync / races 更新ごとの lightPush 1.5s debounce)、⑤ `findMissedRoughRaces` を skipLog 主データ化 (predictions だけだったバグも合わせて修正)。 → これで端末をまたいでも見送りログ・万舟見逃しが共有され、 学習データの母数が伸びる。
- ✅ Round 168 — スタイル 3 択 UI (steady/balanced/aggressive) 全廃止 (4 箇所)、 内部 balanced 固定。
- ✅ Round 168.5 — 最終仕様書 docs/SPEC.md 確定 (shoug 4 項目レビュー反映)。
- ✅ Round 169 — 金額入力 UI 削除 (Settings 4 入力欄 + セーフティ ON/OFF + Onboarding 3 入力欄)、 起動時に金額を 5,000 円固定で強制矯正 (App.jsx)。 Onboarding は同意 2 項目のみに簡素化。
- ✅ Round 170 — 数字バッジ整理 (SPEC §5)。 MansyuTop の 5 バッジ → 2 バッジ (🚨激荒れ / ⚠️荒れ注意 のみ)、 Header の「💰 N件 buy」 件数バッジ + 「💰リアル/🧪エア」 切替ボタン撤去 (収支表示は単純チップに置換)、 画面下固定バーのモード切替・スタイル循環撤去。 内部記録 (見送りログ・skip count) は学習用に温存。
- ✅ Round 171 — 「📋 一覧」 タブ完全廃止 (SPEC §6)。 タブ構成 4 → 3 に (🏠ホーム / 🔬研究所 / ⚙️設定)。 RaceList.jsx ファイル削除、 App.jsx の `tab === "list"` ブロック・import 削除、 Header の TABS から list 除去、 MansyuTop の「📊 一覧で見る」 ボタン削除、 RaceDetail の onBack を home に変更。 index.js バンドル −8.6 kB。
- ✅ Round 171.5 — SPEC §6.1.2 追記: **場別ランキング機能** (信頼感の中核) を仕様化。 動的 5 場参照 / 全場混合禁止 / 「なぜ上位か」 一言タグ必須 / AI 評価ロジック連動。 §9 ロードマップに Round 179-181 (設計 / モーター TOP10 / 選手 TOP10) 追加。
- ✅ Round 171.6 — SPEC §12 追記: **AI 進化ロードマップ** (使うほど賢くなる構造) を起案。 段階 A (自動ループ) / B (細粒度学習) / C (ディープラーニング) の 3 段階。 §9 ロードマップに Round 172/172.5 (段階 A) と Round 182/200 (段階 B/C) 追加。
- ✅ Round 172 — **AI 進化 段階 A 前半: 自動学習ループ実装**。 新ライブラリ `src/lib/mansyuLearningAuto.js`。 1 日 1 回 analyzeMansyuLearning を自動実行 → 安定性チェック (確定済 ≥ 10 件 / 同提案 3 連続却下で停止) → 通れば applyAllRecommendations で重み自動適用 → mansyu モジュールに即時反映 → トースト通知。 履歴は `mansyuLearningHistory` (localStorage 直近 30 件) に保存。
- ✅ Round 172.5 — **AI 進化 段階 A 後半: 自動ロールバック実装**。 `mansyuLearningAuto.js` に `checkAndRollback()` 追加。 直近の applied エントリから 7-14 日経過した時に、 適用後の skipLog 確定済 5 件以上で見送り正答率 / 見立て正答率を再集計 → baseline と比較 → どちらか 5pt 以上悪化していたら前重みに自動復元。 結果は履歴に kind: kept / rolledback として記録。 同じ applied は二度判定しない (rolledBackAt マーク)。 これで AI 進化 段階 A の閉ループが完成。
- ✅ Round 173 — **買い目 5,000 円配分統一** (SPEC §3, §4)。 `mansyu.js` の `buildMansyuBuyOrders` に `distributeStake()` 追加 — 5,000 円を点数で均等配分、 100 円単位、 余りは最初 (一番強い) に上乗せ。 各買い目 order に `stake` 円を付与 (例: 5 点 → 各 1,000 円 / 4 点 → 1,400/1,200/1,200/1,200 / 3 点 → 1,700/1,700/1,600 / 2 点 → 各 2,500 円 / 1 点 → 5,000 円)。 MansyuTop で買い目右側に黄色金額チップを表示、 ヘッダーに「合計 5,000 円」 表示。 export `MANSYU_STAKE` 定数 = 5000 を追加 (将来の参照用)。
- ✅ Round 174 — **「⚙️ 設定」 タブ全面刷新 (4 項目化)** (SPEC §6.2)。 Settings.jsx を 442 行 → 約 200 行に削減。 SPEC 通り 4 項目のみ: ① ログイン (Supabase) ② ログアウト ③ データ削除 (フレッシュスタート) ④ 通知 ON/OFF (将来通知機能の土台 — 大きなトグルスイッチ UI)。 削除: 「🧪 購入モード エア/リアル切替」 / 「🆕 バージョン管理 v2/legacy」 / 「💾 保存ステータス」 / 「✏️ 手動記録 件数」 / VersionCompareTable / Stat 関数。 settings.notificationsEnabled (boolean) を localStorage に保存。 通知の実体は Round 177 で実装予定。
- ✅ Round 175 — **ホーム強化 (ヒーロー表現 + 理由 3 行)** (SPEC §0.1, §4, §8)。 ① ブランドバナー直下の 2 個の SumBox (激荒れ/荒れ注意) を Hero コンポーネントに統合。 「今日の勝負」 を超大文字 (44px) で表示、 アラーム時は赤グラデ + glow 18px、 注意時は橙、 0 件は控えめに「🌙 現時点で勝負レースなし」。 ② RaceCard の理由表示を 1 行スラッシュ連結 → 3 行リスト (各行頭に色付き •) に。 「💡 なぜこのレースか」 のラベル付き。
- ✅ Round 176 — **「🔬 研究所」 タブ整理** (SPEC §6.1)。 新規コンポーネント `src/components/ResearchOverview.jsx` 作成、 タブの最上段に配置。 構成: ① 上級者向け注意バナー ② 学習履歴カード ③ Coming soon 予告。
- ✅ Round 177 — **通知システム土台** (SPEC §6.2)。 既存の `notifyBuy.js` を再利用、 トグル ↔ ブラウザ許可連動 + 激荒れ自動検出。
- ✅ Round 178 — **スマホ最適化 第 1 弾 (タップ領域 + アニメ)** (SPEC §8)。 タブ minHeight 40→48、 padding 拡大、 折りたたみアニメ (max-height トランジション)、 ▶ アイコン回転。
- ✅ Round 179 — **場別ランキング機能 設計フェーズ** (SPEC §6.1.2)。 新規 `docs/RANKING-DESIGN.md` 起案 (8 章 / 約 285 行)。 既存 API 実機調査、 スコア式・タグ生成ルール・UI 設計を確定。
- ✅ Round 180 — **場別 モーター TOP10 実装** (SPEC §6.1.2)。 新規 3 ファイル (venueRanking.js / MotorRankingTable.jsx / VenueRankings.jsx)。 motor2 60% + boat2 25% + 展示 15% スコア、 タグ 4 種 (展示気配◎/部品交換/人気の割に強い/安定)、 場切替タブ動的生成。
- ✅ Round 181 — **場別 選手 TOP10 実装** (SPEC §6.1.2)。 当地勝率 30% (全国 20% より重く)、 タグ 6 種 (🌊会場巧者 / 🎯ST安定 / 🚀イン巧者 / 🔥マクリ得意 / 💎相性良好 / ⚖安定)、 クラスバッジ。 「場別ランキング機能」 完成。
- ✅ Round 182 — **AI 進化 段階 B 場別重み学習実装** (SPEC §12 段階 B)。 5 場が独立重みを持つ、 場別学習サイクル、 scoreMansyu の場別重み優先。
- ✅ Round 183 — **PC 最適化** (SPEC §8)。 maxWidth 920→1280、 CardGrid 1/2/3 列自動切替。
- ✅ Round 184 — **SPEC §13 安全設計 3 層 追記** (shoug 必須要件)。 自己学習 AI に必須の 3 層を仕様化: ① 学習データ完全保存 (Round 185) ② バックテスト機能 (Round 186) ③ 本番/検証 AI シャドーモード (Round 187)。 §9 ロードマップに Round 184-187 追加。 コード変更なし。
- ✅ Round 185 — **第 1 層: 学習データ完全保存実装** (SPEC §13.1)。 mansyuSkipLog に snapshot (boats/apiOdds/weather/reasons/buyOrders) + virtualPnl 追加。
- ✅ Round 186 — **第 2 層: バックテスト機能実装** (SPEC §13.2)。 mansyuBacktest.js + BacktestPanel.jsx 新規、 5 指標 (的中率/回収率/期待値/最大連敗/見送り精度)、 期間切替タブ。
- ✅ Round 187 — **第 3 層: シャドーモード (最低限版) 実装** (SPEC §13.3)。 ① `mansyuWeights.js` にシャドーストレージ追加 — `loadShadowWeights/saveShadowWeights/clearShadowWeights` (全場共通) + `loadShadowVenueWeights/saveShadowVenueWeights/clearShadowVenueWeights/loadAllShadowVenueWeightsMap` (場別)、 localStorage キー `mansyuShadowWeights` / `mansyuShadowVenueWeights` (savedDate 付き)。 ② `mansyuLearningAuto.js` を改修 — `runLearningCycle` / `runOneVenueLearning` の保存先を本番 → シャドーに変更 (kind: shadow_applied / venue_shadow_applied)、 既存の本番直書きを廃止。 ③ 新関数 `checkAndPromoteShadows()` — 1 日 1 回チェック、 シャドーの savedDate から `SHADOW_PROMOTION_DAYS = 7` 日経過したら本番に昇格 (saveMansyuWeights / saveVenueWeights) + シャドークリア + 履歴に shadow_promoted / venue_shadow_promoted を記録。 ④ App.jsx の useEffect に `checkAndPromoteShadows` 追加、 昇格時はトースト + setMansyuWeights / setVenueWeights で即時反映。 ⑤ ResearchOverview の KIND_META にシャドー関連 6 種追加、 Coming soon を「シャドー成績比較 (Round 187.5)」 に更新。 これで「学習結果は即本番反映せず 7 日待って昇格」 の安全装置完成 (= shoug 必須要件「いきなり反映するな」 達成)。 厳密な「本番 vs 検証 のバックテスト ROI 比較」 による昇格判定は Round 187.5 で別日対応。
- 🟡 進行中: なし
- 🔜 次の一歩: **AI 進化 段階 A/B + 安全設計 3 層がほぼ完成**。 残: ① Round 187.5: シャドー成績比較を時間ベース → バックテスト ROI 比較に強化 (本番 vs 検証 で +5% 改善なら昇格、 同等以下なら破棄) ② Round 200 想定: 段階 C ディープラーニング ③ Round 184+ (任意): モーター別 / 選手別 細粒度学習 / 大規模 PC 2 カラムレイアウト / Service Worker 化。

## 🌐 本番URL

- **本番**: https://kyotei-two.vercel.app/
- **Vercel プロジェクト**: main ブランチ自動デプロイ
- **GitHub**: https://github.com/shougihajime-eng/kyotei

## 📂 主要ドキュメント

| ファイル | 内容 |
|---|---|
| **`docs/SPEC.md`** | ⭐ **最終仕様書 (2026-05-10 確定)。 これが唯一の仕様。 過去ドキュメントとの矛盾はこれが優先** |
| `docs/RANKING-DESIGN.md` | 場別ランキング機能の設計ドキュメント (Round 179 起案 / Round 180-181 で実装) |
| `README.md` | 公開用 README (機能/思想/保存仕様/Supabase セットアップ) |
| `DEPLOY.md` | Vercel デプロイ手順 |
| `docs/manual-test-playbook.md` | 手動回帰テスト手順 |
| `docs/cloud-sync-test-playbook.md` | Supabase 同期テスト手順 |
| `docs/supabase-setup.md` | Supabase テーブル / 認証セットアップ |
| `docs/ROADMAP-WORLD-CHAMPION.md` | 予想精度向上の中期計画 (Round 120-) |
| `docs/REDESIGN-ROADMAP.md` | デザイン刷新 + 動作信頼性のロードマップ (SPEC 起案前の Phase 分け・現在は SPEC §9 が優先) |

## 🛠 技術構成

- **フロント**: Vite + React 18 + Tailwind v3 + Recharts
- **API**: Vercel Serverless Functions (`/api/*`) — boatrace.jp スクレイピング
- **保存**: localStorage (`kyoteiAssistantV2`) + 任意 Supabase 同期 (専用スキーマ `manfune_lab`)
- **デプロイ**: Vercel (main 自動)

## 🗄 Supabase スキーマ

- **専用スキーマ**: `manfune_lab` (他プロジェクトとデータ完全分離)
- **テーブル**:
  - `manfune_lab.predictions` (`PRIMARY KEY (user_id, key)`、 ユーザーが能動的に保存した予想 / 買い目)
  - `manfune_lab.skip_log` (`PRIMARY KEY (user_id, key)`、 自動記録された全レース判定 — 見送りログのクラウド版)
  - 両方とも RLS で自分の行のみアクセス可
- **クライアント設定**: `src/lib/supabaseClient.js` で `db: { schema: APP_SCHEMA }` を渡す → このアプリは `manfune_lab` 以外のスキーマには触れない
- **Postgrest 公開**: `public, graphql_public, manfune_lab, hissatsu, keiba, kabu_watch` (旧 `kyotei_app` は除外済)

## ✅ 検証コマンド

```sh
npm run check       # 全テスト + ビルド (PR 前に必須)
npm run test:all    # 全テストのみ
npm run tdz         # TDZ audit (prebuild で自動実行)
npm run build       # ビルド (prebuild → TDZ fail で中止)
```

## 📝 開発フロー (このプロジェクトでの自動化)

- 編集 → commit → `git push origin main` まで連続実行 (確認不要)
- 「いいですか?」を出さない — 連続で完走させる
- ビルド検証や追加修正もそのまま走らせる

## 🚫 禁止事項

- 自動ログイン / 自動購入の実装
- パスワード / クレカ情報の保存
- 規約違反のスクレイピング
