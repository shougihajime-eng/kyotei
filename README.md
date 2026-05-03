# 競艇 期待値分析アシスタント (Kyotei EV Assistant)

> **このアプリは的中を保証するものではなく、期待値・リスク・検証を見える化するための競艇 AI 評価アプリです。**

「全レース予想 AI」 ではなく、**勝てる条件だけやる「買わない AI」**。
長期回収率を残すために、買うべきレースだけを厳選します。

🌐 デモ: https://kyotei-two.vercel.app/

## 特徴

- **🟢 買い / 🔴 見送り / 🚨 危険レース / ⚠️ オッズ取得不可** の判定を 1 枚カードで即時提示
- **本命レースは厳格に絞る (1〜2 点)** + **トリガミ自動除外**
- **24 場のバイアス** (イン強め/まくり場/差し場) を期待値に反映
- **昼/ナイター適性** + **戦法相性** (まくり型/差し型 vs 1号艇) で補正
- **事故レース検知** (ST ばらつき大/モーター差極端/拮抗/大荒れ) → 自動見送り提示
- **学習効果検証 + 自動ロールバック** (悪化を検知したら直前の重みに戻す)
- **エア舟券 / リアル舟券** を分けて記録 + 結果自動照合
- **今日 / 今週 / 今月 / 全期間** の収支グラフ + スタイル別ロイ
- **負けパターン分析** (刺され負け/まくり負け/まくり差し負け/展開負け)
- **会場別 ROI** + **苦手/得意条件** + **AI 信頼度** の自己診断
- すべて **localStorage に保存**。サーバーへ個人データは送らない

## 思想

- 買うレースを増やすより **買わない精度** を上げる
- 的中率より **回収率** を最優先
- 妙味のないオッズは絶対に買わない
- データ不足・オッズ未取得・危険要素は**隠さず明示**
- 「見送り」 は失敗ではなく**価値ある判断**

## 数値の読み方 (画面に出る言葉)

| 指標 | 意味 |
|---|---|
| 推定的中確率 | AI がそのレースで該当買い目が当たる確率 (Plackett-Luce) |
| オッズ | 当たった場合の払戻倍率 (boatrace.jp 実オッズ) |
| 期待回収率 | 確率 × オッズ × 100% — 100% 超なら期待値プラス |
| EV (期待値) | 期待回収率 − 100% — 0 超なら長期プラス |
| 事故 (severity) | 危険要素の重大度 (0-100) |

## 使い方

1. 初回アクセス時にガイドが表示されます
2. 「🔄 更新」 ボタンを押して当日のレース情報を取得
3. ホーム画面の **クイックジャッジ** で「買う/見送る/危険」を即判断
4. 「▼ 詳細を見る」 で買い目内訳・採用理由・予想分解
5. 結果は時間が経てば自動で取得され、PnL に反映

## 技術構成

- **フロント**: Vite + React 18 + Tailwind v3 + Recharts
- **API**: Vercel Serverless Functions (`/api/*`) で boatrace.jp の公開ページをスクレイピング
- **保存先**: 各ユーザーのブラウザの localStorage (`kyoteiAssistantV2`) のみ — サーバー DB なし、ログイン機能なし
- **デプロイ**: Vercel (main ブランチ自動デプロイ)

## 保存仕様 (重要)

### このアプリの保存範囲

- **ログイン機能なし** — ユーザーアカウントは作りません
- 設定・予想スナップショット・購入記録は **このブラウザの localStorage のみ** に保存
- **サーバーには一切送信していません** (プライバシー優先)

### データが消える可能性があるケース

- ブラウザのキャッシュ・サイトデータを削除した
- シークレットモード (プライベートブラウズ) で利用した
- 別端末・別ブラウザでアクセスした (**共有されません**)
- ブラウザ設定でストレージを制限している

### 保存の挙動 (このブラウザ内)

- **直近 30 日の AI 記録** はこのブラウザ内に保持
- **90 日超の AI 自動記録は GC** (容量上限を回避)
- **手動記録 (✏️) は GC されない** — ただしブラウザデータをクリアすれば消えます
- エア / リアル / スタイル別 を分離して集計

### 長期保管したい場合 (Supabase クラウド同期 — 任意)

ログイン + クラウド同期に対応 (Round 45+, Round 85 拡張):

- **任意機能**: 環境変数を設定しなければ ローカルのみで通常動作
- **3 スタイル分離保証**: `key = ${dateKey}_${raceId}_${style}` でクラウドでも完全分離
- **検証メタ完全保持**: boatsSnapshot / weatherSnapshot / reasoning / verificationVersion / preCloseTarget /
  isGoCandidate / finalized などすべて round-trip (`details JSONB` カラムに格納)
- **詳細ログも復元可**: 別端末でログインしても 「なぜ買いと判断したか」 が完全に見られる

#### セットアップ手順 (Vercel)

1. **Supabase プロジェクト作成** (無料枠) → [supabase.com](https://supabase.com)
2. **テーブル作成** (詳細は [`docs/supabase-setup.md`](docs/supabase-setup.md)):
   ```sql
   create table predictions (
     id uuid default gen_random_uuid() primary key,
     user_id uuid references auth.users not null,
     key text not null,         -- ${dateKey}_${raceId}_${style} で 3 スタイル分離
     date date, race_id text, venue text, jcd text, race_no int, start_time text,
     decision text, combos jsonb, total_stake int default 0,
     profile text,              -- 'steady' | 'balanced' | 'aggressive'
     virtual boolean, result jsonb,
     payout int default 0, hit boolean default false, pnl int,
     manually_recorded boolean default false, memo text, reflection text, image_data text,
     matched_ai boolean,
     snapshot_at timestamptz default now(), updated_at timestamptz default now(),
     details jsonb,             -- Round 85: 判断材料 (boats/reasoning/verificationVersion 等)
     unique (user_id, key)
   );
   ```
3. **Authentication → Providers → Email** → 「Confirm email」 を **OFF**
4. **Vercel Environment Variables**:
   - `VITE_SUPABASE_URL` = `https://xxxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJ…` (anon public key)
5. **Vercel で Redeploy** (環境変数は再ビルド時のみ反映)

#### 既存テーブルからのマイグレーション (Round 84 以前)

```sql
alter table predictions add column if not exists details jsonb;
create index if not exists predictions_user_profile_idx on predictions(user_id, profile);
```

#### 動作確認

- 設定済みなら Header の「🔑 ログイン」 ボタンが青色で表示
- 未設定なら「⚠️ クラウド未設定」 が黄色で表示 + ログインモーダルにセットアップ手順
- ログイン後、 別端末 / 別ブラウザで同じ email + password で同期可能

### 検証

開発時のチェック (PR 前に実行):

```sh
npm run check          # 全テスト + ビルド (TDZ + sanity + pnl + storage + cloud + build)
npm run test:all       # 全テストのみ (build なし)
npm run tdz            # TDZ audit のみ (致命的初期化順バグの検出)
npm run build          # ビルド (prebuild で TDZ audit が自動実行 → fail 時は build 中止)
```

個別テスト:

```sh
npm run test:sanity    # 予想ロジック 43 アサート (12 シナリオ × 3 スタイル)
npm run test:pnl       # 収支ロジック 31 アサート (期間/エア・リアル/スタイル)
npm run test:storage   # 保存ロジック 41 アサート (リテンション/GC/分離)
npm run test:cloud     # 同期安全性 29 アサート (TDZ なし/破壊なし)
```

`npm run build` は **必ず TDZ audit を先に実行** します (`prebuild` フック)。
TDZ リスクが検出されたら build は中止 → Vercel デプロイも走りません (本番事故防止)。

## 禁止事項 (実装していません)

- 自動ログイン / 自動購入
- パスワード保存 / クレジットカード保存
- 規約違反のスクレイピング

## 注意

- ギャンブルは**余剰資金の範囲**で。生活費や借金で行うものではありません
- 最終判断と購入操作は**必ずご自身で**行ってください
- このアプリは投資助言や勝利保証を行うものではなく、**期待値ベースの判断材料**を提供する評価ツールです
