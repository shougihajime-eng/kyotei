# CLAUDE.md — 競艇 EV Assistant

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **Round 120-156 完了**。120-150 予想精度+UX、 150「0 件問題」 緊急修正、 151 セーフティ 5 件保証、 152 ヘッダ件数+異常通知、 153 RaceList 発走時刻順、 154 ビープ+買い忘れ警告+自動更新カウントダウン、 **155 = BuyOrderHero に 🏆勝負度+⚠️危険度+🎯買い目点数+💡理由 を派手に追加** (ユーザー仕様 「結論をデカ表示」 への対応)、 **156 = 結果取得信頼性強化** (発走 5 分後に result が無いレースは nocache 強制再取得 = 「終わってるのに更新されない重大エラー」 を防ぐ) + `docs/HISSATSU-MIGRATION-GUIDE.md` で必殺１ごうてい への移植指示書をドキュメント化。
- 🟡 進行中: なし
- 🔜 次の一歩: 本番で 「1 日 5+ 件 buy が出るか」 + 「結論カードの分かりやすさ」 + 「結果が必ず取れているか」 を確認 → Round 157 (色 UI 統一見直し) → Round 158 (学習拡張)。

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
