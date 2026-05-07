# CLAUDE.md — 競艇 EV Assistant

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **Round 120-143 完了**。120-138 予想精度系、 139 BattleMode パターンバッジ、 140 連敗/連勝アラート、 **141 = データ蓄積進捗バー** (`DataProgressCard` — 10 件で得意パターン、 30 件で学習機能の解禁までの残り件数を進捗バーで)、 **142 = 直前情報補正の強化** (`computeConditionMod` 拡張: 1 号艇ペラ/エンジン交換 -12%、 中間チルト 1.0-1.4 補正、 展示タイム同レース最速 +4%/最遅 -4%、 波 6cm 以上で 1 号艇 -3%/外艇 +2%)、 **143 = 公式予想印 (◎○▲△×) 取得・反映** (新 `api/forecast.js` で boatrace.jp pcexpect ページから取得 → `forecastMod` で ◎ +5%, ○ +3%, ▲ +1%, × -2% を補正反映、 機械×人間の集合知へ)。
- 🟡 進行中: なし
- 🔜 次の一歩: 本番で記者予想が取れているか確認 → 1 週間実運用してデータ蓄積観察 → Round 144 (学習拡張) → Round 145 (機械学習化)。

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
