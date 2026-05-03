# Supabase クラウド同期 セットアップガイド (Round 45)

## 概要

このアプリは **ログインなし (現状維持)** でも動きますが、 Supabase を設定すると
- ユーザー登録 (username + password のみ)
- PC / iPhone / 別ブラウザ で同じ履歴を共有
- ブラウザクリアしても消えない (クラウドにバックアップ)

が可能になります。

**個人情報は一切扱いません。** メール・名前・住所すべて不要。

## 1. Supabase プロジェクト作成

1. https://supabase.com にアクセス → Sign up (GitHub アカウント等で OK)
2. 「New project」 → プロジェクト名 (例: `kyotei-cloud`) と DB パスワードを設定
3. リージョンは「Northeast Asia (Tokyo)」 を推奨

## 2. テーブル作成 (SQL Editor)

Supabase ダッシュボード → 左メニュー「SQL Editor」 → 新規クエリで以下を実行:

```sql
create table predictions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  key text not null,                -- ${dateKey}_${raceId}_${style} 形式 (3 スタイルが別 key で保存される)
  date date,
  race_id text,
  venue text,
  jcd text,
  race_no int,
  start_time text,
  decision text,
  combos jsonb,
  total_stake int default 0,
  profile text,                     -- 'steady' | 'balanced' | 'aggressive' (key にも含まれるが二重防御で別カラム)
  virtual boolean,
  result jsonb,
  payout int default 0,
  hit boolean default false,
  pnl int,
  manually_recorded boolean default false,
  memo text,
  reflection text,
  image_data text,                  -- 画像 (base64)。 不要ならカラム削除
  matched_ai boolean,
  snapshot_at timestamptz default now(),
  updated_at timestamptz default now(),
  details jsonb,                    -- Round 85: 判断材料 + 検証メタ (boatsSnapshot/reasoning/preCloseTarget/verificationVersion 等)
  unique (user_id, key)             -- 3 スタイル (異なる key) は衝突しない
);

-- インデックス (検索高速化)
create index predictions_user_date_idx on predictions(user_id, date desc);
create index predictions_user_updated_idx on predictions(user_id, updated_at desc);
create index predictions_user_profile_idx on predictions(user_id, profile);   -- スタイル別集計用 (Round 85)

-- 行レベルセキュリティ (RLS) 有効化 — 他人のデータが見えないように
alter table predictions enable row level security;

-- ユーザーは自分のデータだけ操作可
create policy "Users can read own predictions" on predictions
  for select using (auth.uid() = user_id);
create policy "Users can insert own predictions" on predictions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own predictions" on predictions
  for update using (auth.uid() = user_id);
create policy "Users can delete own predictions" on predictions
  for delete using (auth.uid() = user_id);
```

### 既存テーブルからのマイグレーション (Round 84 以前から使っている場合)

既に predictions テーブルが存在する場合、 details カラムだけ後から追加:

```sql
alter table predictions add column if not exists details jsonb;
create index if not exists predictions_user_profile_idx on predictions(user_id, profile);
```

これだけで Round 85 の検証フィールド (boatsSnapshot / reasoning / verificationVersion 等)
が round-trip 保存されるようになります。 既存行は details=null のままでも動作します。

## 3. Auth 設定

Supabase ダッシュボード → 左メニュー「Authentication」 → 「Providers」:
- **Email** プロバイダーを **有効** にする
- 「Confirm email」 を **OFF** にする (友達同士なので簡略化)
  - ON のままだと `username@kyotei.local` という偽 email にも確認メール送信される (届かない)
  - OFF にすれば即ログイン可能

「Authentication」 → 「URL Configuration」:
- Site URL: `https://kyotei-two.vercel.app` (本番) または `http://localhost:5173` (開発)

## 4. 環境変数を Vercel に設定

Supabase ダッシュボード → 「Settings」 → 「API」 で以下をコピー:
- `Project URL` (例: `https://abcdefg.supabase.co`)
- `anon public` キー (eyJ... で始まる長い文字列)

Vercel ダッシュボード → このプロジェクト → 「Settings」 → 「Environment Variables」 に追加:
| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://abcdefg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` |

→ 「Redeploy」 で反映。

ローカル開発時は `.env.local` に同じ値を:
```
VITE_SUPABASE_URL=https://abcdefg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 5. 動作確認

1. アプリを開く → Header 右上に「🔑 ログイン」 ボタンが出る
2. 「新規登録」 タブで:
   - ユーザー名: `myname` (3-32 文字 / 英数字 + _ + -)
   - パスワード: `12345678` (8 文字以上)
3. 登録 → 即ログイン
4. Header に「👤 myname」 + 「✅ 同期済」 表示
5. 別ブラウザ / iPhone でも同じ ID + パスワードでログインすれば履歴が見える

## セキュリティ確認

| 項目 | 実装 |
|---|---|
| パスワード平文保存 | ❌ Supabase Auth が bcrypt でサーバー側ハッシュ |
| クライアント側パスワード保存 | ❌ サインイン後すぐ破棄、JWT トークンのみ localStorage |
| 他人のデータ閲覧 | ❌ RLS ポリシーで `auth.uid() = user_id` 必須 |
| 個人情報収集 | ❌ ユーザー名 + パスワードのみ |
| email 確認 | OFF (届かない偽 email) |
| HTTPS 通信 | ✅ Supabase は TLS 必須 |

## 容量見積もり (無料枠)

- 1 レース あたり ~2KB (画像なし)、~50KB (画像あり)
- 無料枠: DB 500MB / Auth 50,000 ユーザー
- 1 ユーザー 1 日 50 レース × 365 日 = 18,250 件 = 約 36MB / 年
- 数十人で 1 年使っても余裕

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| ログインボタンが出ない | 環境変数が反映されていない → Vercel を Redeploy |
| 「クラウド機能が無効」 表示 | `cloudEnabled() === false` → 環境変数確認 |
| 「ユーザー名またはパスワードが違います」 | 大文字小文字に注意 (username は小文字化される) |
| 「このユーザー名は既に使われています」 | 他のユーザー名を試す |
| 同期失敗 (red banner) | RLS ポリシー漏れ または ネットワーク → SQL Editor で再確認 |

## 設定なしで動かすには?

環境変数を **設定しないだけ**。 すべての Supabase 機能は無効化され、
ローカル localStorage のみで通常動作します (Round 44 までと同じ挙動)。
