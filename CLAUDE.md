# CLAUDE.md — 競艇 EV Assistant

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **Round 120-150 完了**。120-149 予想精度+UX系、 **150 = 緊急修正 「1 日 0 件問題」 を解消** — ❶ Page Visibility 対応 (タブ非アクティブで自動更新が止まる問題、 visibilitychange + focus で復帰時に即更新)、 ❷ スキップゲート全面緩和 (steady: 勝率 5.20→5.00 / モーター 32→28 / 風 6→7 / 波 7→9、 balanced/aggressive も同様に約 20% 緩和、 「混戦」 シナリオは買い OK へ)、 ❸ SkipBreakdownCard 新設で 「今日の全レース / 買い / 見送り / 待機」 + 主要 skip 理由 Top 3 を Dashboard に表示、 buy=0 + skip 30 件超なら 🚨 赤バナーで異常を即気付ける。
- 🟡 進行中: なし
- 🔜 次の一歩: 本番で 「明日は 1 日 5-15 件の buy が出るか」 確認 → 出ない場合は SkipBreakdown を見て個別ゲート再緩和 → Round 151 (学習拡張) → Round 152 (機械学習化)。

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
