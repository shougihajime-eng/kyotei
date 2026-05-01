# 保存仕様 ロードマップ (現状 + 選択肢)

## 現状 (Round 44 時点)

| 項目 | 仕様 |
|---|---|
| **ログイン** | なし |
| **保存先** | 各ユーザーのブラウザの localStorage (`kyoteiAssistantV2`) のみ |
| **サーバー送信** | なし (boatrace.jp スクレイピングのみ) |
| **端末間同期** | **なし** (別端末では別々のデータ) |
| **長期保存** | このブラウザ内に直近 30 日 (90 日超は GC、手動記録は GC 対象外) |
| **データ消失リスク** | キャッシュクリア / シークレットモード / 別ブラウザ |

## 今後の選択肢

### 選択肢 A: ログインなし継続 (現状維持) — 推奨度 ★★

**メリット**
- ユーザー登録不要 — 即使える
- プライバシー完全 (サーバーにデータ送らない)
- インフラコストゼロ
- 実装コストゼロ (今のまま)

**デメリット**
- 別端末で履歴が見えない
- ブラウザクリアで消える
- ログインアプリと比べて「永続性」 で劣る

**向いている層**: 1 端末で個人検証する層

---

### 選択肢 B: Supabase で クラウド保存 — 推奨度 ★★★

**メリット**
- 別端末で同じ履歴が見える
- ブラウザクリアしても消えない
- 30 日 / 1 年 の長期保存が現実的
- 認証は Supabase Auth で簡単
- 無料枠で十分動く (50,000 行 / 500MB)

**デメリット**
- ユーザー登録が必要 (Email + パスワード or OAuth)
- バックエンド設定が必要
- プライバシー: Supabase に予測データが渡る

**実装コスト**
- Supabase プロジェクト作成 (15 分)
- Auth UI (10 行 React)
- predictions テーブル設計 + RLS ポリシー
- saveState / loadState を Supabase 経由に置換 (互換性維持)
- 既存の localStorage データを移行 (任意)

**Supabase テーブル設計案**
```sql
create table predictions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  key text not null,
  date date not null,
  race_id text not null,
  venue text,
  race_no int,
  start_time text,
  decision text,
  combos jsonb,
  total_stake int,
  profile text,
  virtual boolean,
  result jsonb,
  payout int,
  hit boolean,
  pnl int,
  manually_recorded boolean default false,
  snapshot_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, key)
);

-- 行レベルセキュリティ: ユーザー本人のデータのみ参照可能
alter table predictions enable row level security;
create policy "Users can read own predictions" on predictions
  for select using (auth.uid() = user_id);
create policy "Users can insert own predictions" on predictions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own predictions" on predictions
  for update using (auth.uid() = user_id);
```

---

### 選択肢 C: A + B 併用 (オフラインファースト) — 推奨度 ★★★★

**メリット**
- ログイン**なし**でもオフラインで動く (今と同じ)
- ログイン**あり**ならクラウド同期される
- ベスト・オブ・ボース・ワールド

**デメリット**
- 実装コスト中 (同期戦略の設計)

**実装方針**
- ログイン未登録: localStorage のみ (現状維持)
- ログイン後: localStorage を保持しつつ、変更を Supabase にプッシュ
- 起動時: Supabase からプル → localStorage と マージ

これが現実的な「将来形」 です。

---

## 推奨

1. **短期 (今すぐ)**: Round 44 完了 — 現状の表現を正確に (`このブラウザに保存`)
2. **中期 (週単位)**: Supabase 検討 — 選択肢 C (オフラインファースト) を実装
3. **長期 (月単位)**: 同期 / コンフリクト解決 / マルチデバイス UX を改善

実装着手のご希望があれば、Supabase の設定からお手伝いします。
