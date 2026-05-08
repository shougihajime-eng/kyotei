# CLAUDE.md — 競艇 EV Assistant

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **Round 120-158 完了** (徹夜セッション)。150「0 件問題」 緊急修正、 151 セーフティ 5 件保証、 152 ヘッダ件数+異常通知+フォールバック、 153 RaceList 発走時刻順、 154 ビープ+買い忘れ警告 (MissedBuyCard) +自動更新カウントダウン、 155 BuyOrderHero に勝負度+危険度+買い目点数+理由、 156 結果取得信頼性強化+移植ガイド (`docs/HISSATSU-MIGRATION-GUIDE.md`)、 **157 = Settings に 🛟 セーフティ買い ON/OFF トグル** (上級者向け OFF 切替可)、 **158 = BuyOrderHero に 📊 データ厚さ ★1-5 バッジ** (緑★4-5/シアン★3/黄★2/赤★1 で「これ買って大丈夫?」 を即把握)。
- 🟡 進行中: なし
- 🔜 次の一歩: 本番で 1 日 5+ 件 buy が出るか確認 → 「結論カード ぱっと見」 確認 → Round 159 (色 UI 統一) → Round 160 (学習拡張)。

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
