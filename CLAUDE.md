# CLAUDE.md — 万舟研究所

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **🌊 万舟研究所 Phase 1 + 1.5 完了** — Phase 1: ① アプリ名「競艇 AI」→「万舟研究所」、② 対象 5 場限定 (戸田/江戸川/平和島/鳴門/桐生)、③ 荒れスコア 100 点満点ロジック (`src/lib/mansyu.js`)、④ 新トップ画面 `MansyuTop.jsx` (荒れスコア 75 以上のみ表示、買い目最大 5 点、折りたたみ詳細)。Phase 1.5: ⑤ **更新失敗バナー** (失敗時刻+原因を常時表示)、⑥ **古いデータ警告** (5 分超で 🟡 / 15 分超で 🔴)、⑦ **次回自動更新カウントダウン** (3 分間隔、 1 秒刻みで残り秒数表示)、⑧ **タップ反応強化** (TapButton: scale 0.96 + tap-highlight 除去 + touchAction: manipulation)、⑨ **PC/スマホ レスポンシブグリッド** (auto-fit minmax(420px, 1fr) → PC 2 列・スマホ 1 列)、⑩ 件数サマリ box 3 個 (激荒れ/荒れ注意/監視中)。
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
- **保存**: localStorage (`kyoteiAssistantV2`) + 任意 Supabase 同期
- **デプロイ**: Vercel (main 自動)

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
