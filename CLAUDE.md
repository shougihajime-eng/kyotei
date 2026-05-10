# CLAUDE.md — 万舟研究所

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **🔬 Round 166 — 学習データソース修正 + 重み補正適用 UI** — ① **致命バグ修正**: `mansyuLearning.analyzeMansyuLearning` が `predictions.mansyuSnapshot` (保存されない) を読んでいて永久に「データ 0 件」 になっていた → `mansyuSkipLog.getJudgementLog()` を主データソースに切替 (MansyuTop が races 更新ごとに自動記録しているので 1 日目から学習が回る)。② **重み補正適用 UI**: `mansyuWeights.js` 新規 (load/save/apply 重み係数 0.5-1.5)、`mansyu.js` に `setMansyuWeights/getMansyuWeights/applyWeight` (各成分スコアに係数を掛ける)、MansyuLab に「この提案を適用」 「全提案を一括適用」 「リセット」 ボタン追加。③ summary に「分析待ち: 結果確定 N 件 / 監視中 M 件」 を表示 (進捗が見える)。 / 直前 Round 165 (UI polish)。 — ① **タブを 4 つに整理** (検証・グラフを Header から外し、 ホーム/一覧/研究所/設定 の 4 タブのみ表示。 検証・グラフは研究所タブに集約済)、② **激荒れバッジに脈動アニメ** (`mansyu-pulse` 1.4 秒周期 scale + glow)、③ **締切 5 分以内に点滅** (`mansyu-blink` 0.9 秒周期 opacity)、④ **激荒れスコアバッジに発光** (`mansyu-glow` 2.2 秒周期 box-shadow)、⑤ 空状態を「🌙 今は荒れそうなレースなし」 + 監視中件数を強調表示に刷新、⑥ prefers-reduced-motion 対応 (アクセシビリティ)。 / 直前 Phase 2 (Round 164): 万舟向け学習 + 研究所タブ。
- ✅ Phase 2 (Round 164): **🔬 万舟向け学習 + 研究所タブ** — ① **`mansyuLearning.js` 新規** (荒れスコアの精度集計 / 各成分 entry/weather/leader/attackers/exhibition/odds の階級別 荒れ率 / 重み補正提案 boost/reduce/inverse / `findMissedRoughRaces` で取りこぼし抽出)、② **`MansyuLab.jsx` 新規** (KPI 3 box: 見立て的中率 / 見送り正答率 / 取りこぼし件数 / 重み補正提案 / 成分別 荒れ率テーブル / 取りこぼしレース一覧 配当順)、③ 「分析」 タブを **「研究所」 (🔬)** にリネーム → MansyuLab 最上段 + 既存 LossAnalysis を併設。 / 直前 Phase 1+1.5+1.6: アプリ名・5 場限定・荒れスコア 100 点・MansyuTop・30 秒自動更新・タップ反応・レスポンシブ・UI 細部調整 (フォント大型化 + コントラスト強化) + Supabase manfune_lab スキーマ分離。
- ✅ Round 166 続き — Phase 2.5 完了: **🎬 MansyuDetail + Supabase 同期** — ① **`MansyuDetail.jsx` 新規** (1 レース深掘り画面: recharts レーダーチャート 6 成分 0-100% / 各成分の理由一覧 / 買い目 / 公式リンク 5 種 / 気象・水面)、② App.jsx の detail タブに上段 MansyuDetail / 下段 RaceDetail 併設、 MansyuTop の RaceCard に「🔬 詳しく見る」 ボタン追加、③ **Supabase 同期拡張**: `cloudSync.js` の details JSONB に `mansyuSnapshot` / `whatIfBuy` を追加 — `manfune_lab` スキーマで端末間共有可能。
- 🟡 進行中: なし
- 🔜 次の一歩: 朝起きて本番で MansyuTop の 「🔬 詳しく見る」 → MansyuDetail のレーダーチャート確認 → 研究所で「重みを適用」 を押して荒れスコア計算が変わるか / Supabase ログインで端末間同期できるか試す → 必要なら Phase 3 (機械学習化 / 自動買い目記録 / 月次レポート)。

## 🌐 本番URL

- **本番**: https://kyotei-two.vercel.app/
- **Vercel プロジェクト**: main ブランチ自動デプロイ
- **GitHub**: https://github.com/shougihajime-eng/kyotei

## 📂 主要ドキュメント

| ファイル | 内容 |
|---|---|
| `README.md` | 公開用 README (機能/思想/保存仕様/Supabase セットアップ) |
| `DEPLOY.md` | Vercel デプロイ手順 |
| `docs/manual-test-playbook.md` | 手動回帰テスト手順 |
| `docs/cloud-sync-test-playbook.md` | Supabase 同期テスト手順 |
| `docs/supabase-setup.md` | Supabase テーブル / 認証セットアップ |

## 🛠 技術構成

- **フロント**: Vite + React 18 + Tailwind v3 + Recharts
- **API**: Vercel Serverless Functions (`/api/*`) — boatrace.jp スクレイピング
- **保存**: localStorage (`kyoteiAssistantV2`) + 任意 Supabase 同期 (専用スキーマ `manfune_lab`)
- **デプロイ**: Vercel (main 自動)

## 🗄 Supabase スキーマ

- **専用スキーマ**: `manfune_lab` (他プロジェクトとデータ完全分離)
- **テーブル**: `manfune_lab.predictions` (`PRIMARY KEY (user_id, key)`、 RLS で自分の行のみアクセス可)
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
