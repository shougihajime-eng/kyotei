# CLAUDE.md — 万舟研究所

このファイルは Claude Code 用のプロジェクトメモ。**本番URL や主要リソースの所在をここに集約する**。

## 🎯 進捗（いまここ）

- ✅ 直近で済んだこと: **🌊 万舟研究所 Phase 1 完了 (Round 161 + 162 合わせ込み)** — ① **アプリ名「競艇 AI」→「万舟研究所」** (Header / index.html / package.json)、② **対象 5 場限定** (戸田 02 / 江戸川 03 / 平和島 04 / 鳴門 14 / 桐生 01) — `isTargetVenue()` で他場フィルタ、③ **荒れスコア 100 点満点ロジック** `src/lib/mansyu.js` (進入20+風波15+1号艇不安20+攻め手20+展示異変15+オッズ妙味10、85+ 激荒れ警報 / 75-84 荒れ注意)、④ **新トップ画面 `MansyuTop.jsx`** (荒れスコア 75 以上のみ表示、買い目最大 5 点、理由コメント、折りたたみスコア内訳、外部リンク 4 種)、⑤ **Round 161 既存実装** — 自己学習自動再計算 / 多軸スコア補正 / 5000 円固定+5 点+重複除外 / 敗因 8 分類 / 通知 4 種 / リンク 5 種、⑥ UI を黒紺ベース + 赤黄危険感に塗り替え。
- 🟡 進行中: なし
- 🔜 次の一歩: ユーザーから UI/UX 改善・自動更新強化の追加指示あり → Phase 1.5 で「① 自動バックグラウンド更新 (30 秒ポーリング)、② 更新失敗 UI (失敗/最終時刻/原因の常時表示)、③ ボタンタップ反応 (scale 0.95 + tap-highlight 除去)、④ PC とスマホの最適化レイアウト」 を実装予定。

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
