# CLAUDE.md — 万舟研究所

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **🌊 万舟研究所 Phase 1 + 1.5 完了 + 専用スキーマ `manfune_lab` 開設** — Phase 1: ① アプリ名「競艇 AI」→「万舟研究所」、② 対象 5 場限定 (戸田/江戸川/平和島/鳴門/桐生)、③ 荒れスコア 100 点満点ロジック (`src/lib/mansyu.js`)、④ 新トップ画面 `MansyuTop.jsx` (荒れスコア 75 以上のみ表示、買い目最大 5 点、折りたたみ詳細)。Phase 1.5: ⑤ 更新失敗バナー、⑥ 古いデータ警告、⑦ 次回自動更新カウントダウン、⑧ タップ反応強化、⑨ PC/スマホ レスポンシブグリッド、⑩ 件数サマリ box 3 個。**Supabase スキーマ分離**: ⑪ Supabase 専用スキーマ `manfune_lab.predictions` を新規作成 (RLS 4 ポリシー + auth.users CASCADE)、Postgrest 公開リスト更新 (旧 kyotei_app 除外)、`supabaseClient.js` で `db: { schema: 'manfune_lab' }` 指定 → 他プロジェクトと完全分離。
- 🟡 進行中: なし
- 🔜 次の一歩: 朝起きて本番で UI 確認 → 5 場 + 荒れスコア + 自動更新 + 更新失敗バナー + タップ反応 + レスポンシブ をチェック → 必要なら Phase 2 (見送りログ・詳細画面・学習を万舟向けに再構成)。

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
