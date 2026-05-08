# CLAUDE.md — 競艇 EV Assistant

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **Round 120-154 完了**。120-150 予想精度+UX、 150「1 日 0 件問題」 緊急修正、 **151 = 最低 5 件保証セーフティネット** (buy < 5 件なら EV ≥ 1.0 の skip を救済して grade=C で昇格 / 🛟 マーク)、 **152 = ヘッダ買い件数バッジ常駐 + データ取得異常通知 + フォールバック強化** (どのタブにいても 「💰 N 件」 バッジ、 出走表 50% 以上未取得で警告、 BattleMode none に未評価レース数表示)、 **153 = RaceList を発走時刻順 + セーフティ買い対応**、 **154 = BuyOrderHero ビープ音 + 買い忘れ警告 (MissedBuyCard) + 自動更新カウントダウン** (買い忘れたレースで的中なら 「+XXX 円逃した」、 RefreshBar に 「次の自動更新まで N 分 N 秒」 を 1 秒刻み表示)。
- 🟡 進行中: なし
- 🔜 次の一歩: 本番で 1 日 5+ 件 buy が出るか確認 → 「買い忘れ警告」 で機会損失が見えるか確認 → Round 155 (学習拡張) → Round 156 (機械学習化)。

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
