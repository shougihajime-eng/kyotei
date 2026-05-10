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
- 🟡 進行中: なし
- 🔜 次の一歩: **SPEC §9 ロードマップに従って Round 172 から実装**。 ① Round 172: 買い目 5,000 円配分統一 (sizing.js / styleAllocation.js 簡素化) → ② Round 173: 「⚙️ 設定」 タブ 4 項目化 (ログイン/ログアウト/データ削除/通知 ON/OFF) → ③ Round 174: ホーム強化 → ④ Round 175: 「🔬 研究所」 タブ整理。

## 🌐 本番URL

- **本番**: https://kyotei-two.vercel.app/
- **Vercel プロジェクト**: main ブランチ自動デプロイ
- **GitHub**: https://github.com/shougihajime-eng/kyotei

## 📂 主要ドキュメント

| ファイル | 内容 |
|---|---|
| **`docs/SPEC.md`** | ⭐ **最終仕様書 (2026-05-10 確定)。 これが唯一の仕様。 過去ドキュメントとの矛盾はこれが優先** |
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
