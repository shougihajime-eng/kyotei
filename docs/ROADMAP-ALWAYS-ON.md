# 万舟研究所 — 常時監視ロードマップ (Round 189 起案)

> 「アプリを閉じてても 5 場を監視・予想・通知する」 を実現する設計。
> 起案: 2026-05-11 / 目標 Round: 189 (設計) → 190-194 (実装)

---

## 0. 現状と目標

### いま (Round 188 時点)
- アプリ (ブラウザのタブ) を **開いている間だけ** 30 秒ごとに自動巡回。
- ブラウザを閉じる / PC スリープ / スマホロック → 監視停止。
- 通知も「アプリを開いていれば届くトースト」 だけ。

### 目標 (Round 194 完成時)
- スマホをポケットに入れていても、 PC を閉じていても、 サーバが自動で 5 場を巡回。
- 激荒れスコア 85+ を検出した瞬間に **スマホに Push 通知**。
- 通知をタップ → アプリが開く → 該当レースの大判カードが先頭表示。
- 結果と収支も寝てる間に自動反映。

---

## 1. 全体像 (1 枚図)

```
┌─────────────────┐   ┌───────────────────────┐
│ Vercel Cron     │   │ Vercel Serverless API │
│ 5 分間隔        │──▶│ /api/cron/scan-races  │
└─────────────────┘   │  ・5 場の最新取得     │
                      │  ・荒れスコア計算     │
                      │  ・skip_log に書込    │──┐
                      │  ・85+ なら通知発火   │  │
                      └───────────────────────┘  │
                                                 │
                      ┌───────────────────────┐  │
                      │ Supabase              │◀─┘
                      │  manfune_lab.         │
                      │    skip_log           │
                      │    push_subscriptions │
                      │    cron_log           │
                      └───────────────────────┘
                                 ▲
        ┌─────────────────┐      │
        │ Web Push        │◀─────┘
        │ (FCM/APNs 経由) │
        └────────┬────────┘
                 │
                 ▼
         ┌───────────────┐
         │ ユーザー端末  │
         │ Service Worker│
         │  → 通知表示   │
         └───────────────┘
```

---

## 2. 必要なもの (お金の話)

### Vercel Pro プラン課金 ($20/月 ≒ 3,000 円/月)
**理由**: Cron Jobs が 1 分間隔で何個でも動かせる。
Hobby (無料) プランは **1 日 2 回まで** しか動かないので、 監視には全く足りない。

→ **これが「閉じてても動く」 の最大の前提**。

### Supabase
**無料枠で OK**。 既存スキーマ (`manfune_lab`) に 2 テーブル追加するだけ。
DB 容量・帯域とも無料枠 (500 MB / 5 GB) で十分。

### Web Push (通知)
**追加コスト 0 円**。
VAPID キー (公開鍵 / 秘密鍵) を 1 回生成して Vercel 環境変数に置くだけ。
FCM (Android) / APNs (iOS) に直接届く。

### 合計
**月 3,000 円**で「閉じてても動く」 が完成。

---

## 3. 設計詳細

### 3.1 Vercel Cron

`vercel.json` に `crons` セクションを追加:

```json
{
  "crons": [
    { "path": "/api/cron/scan-races",  "schedule": "*/5 * * * *" },
    { "path": "/api/cron/finalize",    "schedule": "*/15 * * * *" }
  ]
}
```

- `scan-races`: 5 分ごと
  - 5 場のスケジュール + 進行中レースの program/odds/before を取得
  - 各レースの荒れスコア計算
  - Supabase `skip_log` に upsert
  - 直前 30 分以内で 85+ を **初検出** したら通知発火
- `finalize`: 15 分ごと
  - 終了レースの結果を取得 → `skip_log` の virtualPnl を確定
  - 「収支寝てる間に反映」 はこれ

#### 動作時間
- 競艇開催時間は 8:00-22:00 → cron も `0-21 * * *` のように絞って無駄打ち削減
- Vercel Cron は UTC なので時刻換算注意 (JST 8:00 = UTC 23:00)

### 3.2 Supabase 新規テーブル

```sql
-- 通知サブスクリプション (端末ごとに 1 行)
CREATE TABLE manfune_lab.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh_key  TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  enabled     BOOLEAN DEFAULT TRUE
);
ALTER TABLE manfune_lab.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- RLS: 自分の行のみ insert/select/update/delete

-- cron 実行ログ (ヘルスチェック用)
CREATE TABLE manfune_lab.cron_log (
  id          BIGSERIAL PRIMARY KEY,
  job         TEXT NOT NULL,           -- 'scan-races' or 'finalize'
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  races_scanned INT,
  alarms_found  INT,
  notifications_sent INT,
  error       TEXT
);
```

既存の `manfune_lab.skip_log` は既に Round 167 で作成済み。
そのまま「サーバ書込 + クライアント読込」 の主データソースとして使う。

### 3.3 Service Worker

新規 `public/sw.js` (約 80 行):
- `push` イベント受信 → `event.waitUntil(self.registration.showNotification(...))`
- `notificationclick` → `clients.openWindow('/?race=race-xxx')` で該当レースに飛ばす
- 通知タップ → アプリ起動 → URL クエリから race を読み取り MansyuDetail を開く

### 3.4 通知許可フロー

設定タブの「🔔 通知 ON/OFF」 トグル (Round 177 で土台あり) を発展:

1. ユーザーが ON にする
2. ブラウザに `Notification.requestPermission()`
3. 許可された → `serviceWorker.ready` → `pushManager.subscribe({ applicationServerKey: VAPID_PUB })`
4. 結果の `endpoint` + `keys` を Supabase `push_subscriptions` に upsert
5. ログイン中ユーザーの全端末に送るので、 PC・スマホ両方に同じ通知が届く

### 3.5 通知送信ロジック (Vercel 側)

`/api/cron/scan-races.js` 内 で:

```js
import webpush from 'web-push';
webpush.setVapidDetails(
  'mailto:shougi.hajime@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// 85+ を初検出したら
for (const race of newAlarms) {
  for (const sub of subscriptions) {
    await webpush.sendNotification(sub, JSON.stringify({
      title: `🚨 ${race.venue} ${race.raceNo}R 激荒れ警報`,
      body: `スコア ${race.score} / 締切 ${formatMinutesToClose(close)}`,
      url: `/?race=${race.id}`,
      tag: race.id, // 同レースの重複通知を抑制
    }));
  }
}
```

「初検出」 判定は `skip_log` の `notified_at` カラム (要追加) で:
`UPDATE skip_log SET notified_at = NOW() WHERE key = $1 AND notified_at IS NULL`

---

## 4. フェーズ分け

### Round 190 — 基盤 (2-3 日)
- [ ] Vercel Pro 課金
- [ ] `vercel.json` に crons 追加
- [ ] `/api/cron/scan-races.js` 新規 (refreshAll のサーバ版)
- [ ] `/api/cron/finalize.js` 新規
- [ ] `manfune_lab.cron_log` テーブル追加
- [ ] cron_log を ResearchOverview で可視化 (動いてる証拠)

### Round 191 — クラウド主データ化 (2-3 日)
- [ ] `manfune_lab.skip_log` を主データ、 localStorage はキャッシュへ
- [ ] アプリ起動時に Supabase pull → merge → ローカル書戻し
- [ ] サーバ側 cron が書いた予想・買い目もクライアントが拾えることを確認

### Round 192 — Web Push 基盤 (2-3 日)
- [ ] VAPID キー生成・Vercel 環境変数に登録
- [ ] `manfune_lab.push_subscriptions` テーブル追加
- [ ] `public/sw.js` 新規 (push 受信・通知表示・click ハンドラ)
- [ ] 設定タブの「通知 ON」 で subscribe → Supabase 保存

### Round 193 — 通知配信 (1-2 日)
- [ ] `scan-races` cron に通知発火ロジック追加
- [ ] skip_log に `notified_at` カラム追加 (重複防止)
- [ ] 通知文面の調整 (タイトル / 本文 / アイコン / バッジ)

### Round 194 — 通知タップで該当レースへ (1 日)
- [ ] URL クエリ `?race=xxx` を App.jsx で読み取り、 自動的に該当レースのカードを最上部に
- [ ] 「通知から開いた感」 の演出 (短い highlight アニメ)

合計 **8-12 日** で完成見込み。

---

## 5. リスクと未解決事項

| リスク | 影響 | 対策 |
|---|---|---|
| Vercel Cron は最大 60 秒で打ち切り | 5 場全レース fetch は重い | 並列度を絞る (FULL_DAY_FETCH_CONCURRENCY=4)・場ごとに別 cron に分割も可 |
| boatrace.jp 側のレート制限 | エラーで cron 失敗 | 既存の 429 ハンドリングを再利用・cron_log に記録 |
| iOS Safari の Web Push | 16.4 以降のみ・PWA インストール必須の場合あり | iOS 利用時のみ PWA インストール導線を出す |
| 通知が連発される | スパム化 | 同レース通知は `tag` で重複抑制・`notified_at` で初検出のみ |
| Service Worker のキャッシュ問題 | 古いアプリが残る | `skipWaiting` + バージョン管理 |
| Supabase RLS の漏れ | 他人の subscription を見えてしまう | RLS 4 ポリシー (select/insert/update/delete) を最初に書く |

---

## 6. このまま進める前の確認事項

1. **Vercel Pro 課金 ($20/月)** を承認する必要がある。
   - 課金タイミング: Round 190 開始時
   - 解約: いつでも (月単位)
2. **VAPID 秘密鍵** は git にコミット禁止。 Vercel 環境変数のみ。
3. **`shougi.hajime@gmail.com`** を通知発信元として使う (VAPID の `subject`)。
4. **iOS Safari (Web Push)** は 16.4 以降 + ホーム画面追加 (PWA) 必須。 これを許容するか、 Android のみで進めるかを後で決める。

---

## 7. やらないこと (今回は対象外)

- アプリ自体を iOS/Android のネイティブアプリ化 (App Store 申請等)
- 自動購入・自動ログイン (規約違反 + CLAUDE.md 禁止事項)
- 競艇場側のリアルタイム映像連携
- 機械学習サーバ (これは Round 200 の段階 C で別途検討)
