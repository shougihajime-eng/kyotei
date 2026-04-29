# Vercel + GitHub で公開する手順 (コマンドライン不要)

「git管理してVercelで公開する」を、すべて**ブラウザ操作**だけで完結させます。所要時間 約10分。

---

## 全体の流れ

1. GitHub に無料アカウントを作る (持っていれば不要) — 2分
2. GitHub に新しいリポジトリを作って `index.html` をアップロード — 3分
3. Vercel に GitHub アカウントでサインインして、リポジトリを連携 — 3分
4. 公開URL発行 (例: `https://kyotei-ev.vercel.app`) — 自動

以降、index.html を更新したい時は、GitHub のWeb UIで上書きアップロードするだけで Vercel が自動的に再デプロイします。

---

## 事前に用意するもの

私 (Claude) が用意した outputs フォルダの中の以下のファイルを、shougさんのデスクトップなどに**まとめてコピー**しておいてください:

- `index.html` (アプリ本体)
- `vercel.json` (Vercel 設定)
- `README.md` (プロジェクト説明)
- `.gitignore` (Git 除外設定)

📂 ファイルの場所:
```
C:\Users\shoug\AppData\Roaming\Claude\local-agent-mode-sessions\9632aa97-f847-41fc-b3f1-f9d27a12f06c\ca3b62bd-0936-4337-bb90-79395c77083e\local_97130d8c-7932-473e-b470-021ac9ffad50\outputs\
```

---

## STEP 1: GitHubアカウントを作る (持っていれば飛ばす)

1. https://github.com/signup を開く
2. メールアドレス → パスワード → ユーザー名 を入力
3. 「Verify (認証)」を完了
4. プランは **Free** (無料) を選択 → Continue

---

## STEP 2: 新しいリポジトリを作る

1. GitHub にログインした状態で https://github.com/new を開く

2. 入力内容:
   - **Repository name**: `kyotei-ev` (好きな名前でOK、英数字とハイフンのみ)
   - **Public** を選択 (Privateだと Vercel無料プランで制限あり)
   - **「Add a README file」のチェックは外す** (自前で用意するため)
   - その他はデフォルトのまま

3. 一番下の `Create repository` ボタンをクリック

---

## STEP 3: ファイルをアップロード

1. 作成されたリポジトリのページに移動 (例: `https://github.com/shougi-hajime/kyotei-ev`)

2. 画面中央の「**uploading an existing file**」というリンクをクリック
   - 見つからない場合: `https://github.com/[ユーザー名]/kyotei-ev/upload/main` に直接アクセス

3. 表示されたドロップエリアに、デスクトップにコピーしておいた4ファイルを **まとめてドラッグ&ドロップ**:
   - index.html
   - vercel.json
   - README.md
   - .gitignore

4. 下にある「Commit changes」をクリック (タイトルは「Initial commit」のままでOK)

---

## STEP 4: Vercel にサインイン

1. https://vercel.com/signup を開く

2. **「Continue with GitHub」** ボタンをクリック (一番楽)

3. GitHub の認証画面が出たら `Authorize Vercel` をクリック

4. プランは **Hobby (無料)** を選択

---

## STEP 5: GitHubリポジトリを連携してデプロイ

1. Vercel のダッシュボードで **「Add New」 → 「Project」** をクリック

2. 「Import Git Repository」のリストに、先ほど作った `kyotei-ev` が表示されます
   - 表示されない場合: 「Adjust GitHub App Permissions」をクリックして該当リポジトリを許可

3. `Import` ボタンをクリック

4. 設定画面が出ますが **何も触らずに** 一番下の `Deploy` ボタンをクリック

5. 30秒〜1分でデプロイが完了し、`https://kyotei-ev-xxxxxxxx.vercel.app` のような公開URLが発行されます

---

## STEP 6: URLをコピーして友達に送る

ダッシュボードに表示される `Visit` ボタンの横の URL をコピーして、LINE などで友達に送ります。

> 💡 ヒント: URL を `https://kyotei-shoug.vercel.app` のような短いものに変更したい場合は、Vercel ダッシュボード → Project Settings → Domains で変更可能 (無料)。

---

## 今後の更新フロー (アプリを修正した時)

1. GitHub の該当ファイル (例: index.html) を開く
2. 鉛筆アイコン (Edit this file) をクリック
3. 内容を貼り替えて Commit changes
4. Vercel が自動的に再デプロイ (URL は変わらない)

または、GitHub のリポジトリページで `Add file` → `Upload files` で上書きアップロード。

---

## 私 (Claude) が完了済み / shougさんが行うこと

| 作業 | 担当 |
|---|---|
| アプリのコード作成 | ✅ Claude |
| index.html の最新化 | ✅ Claude |
| vercel.json の作成 | ✅ Claude |
| README.md の作成 | ✅ Claude |
| .gitignore の作成 | ✅ Claude |
| GitHubアカウント作成 | 👉 shougさん |
| GitHubリポジトリ作成 | 👉 shougさん |
| ファイルをドラッグでアップロード | 👉 shougさん |
| Vercelサインイン | 👉 shougさん |
| Vercelでリポジトリ連携 | 👉 shougさん |
| URLを友達に送る | 👉 shougさん |

---

## つまずきポイントとリカバリ

### Q. GitHubで「ファイルをアップロード」が見つからない
リポジトリのトップページで `Add file` ボタン (緑の Code ボタンの右隣) をクリック → `Upload files` を選択。

### Q. Vercel に GitHub のリポジトリが表示されない
`Adjust GitHub App Permissions` をクリック → 「Only select repositories」で `kyotei-ev` にチェック → Save。

### Q. デプロイは成功したが画面が真っ白
v23 で対策済み。CDN自動フォールバック+10秒タイムアウト+詳細エラー表示が組み込まれているので、何も表示されないことは無いはず。出る場合は赤いエラー画面に原因が表示されるので、その内容を共有してください。

### Q. デプロイ後にスマホで開いたら遅い
初回はCDN読込で5〜10秒かかります。2回目以降はキャッシュで即座に表示されます。

### Q. もっと簡単な方法はないの?
**Netlify Drop** (https://app.netlify.com/drop) なら、index.html を1ファイルだけドラッグするだけで、git無し・アカウント無しで30秒で公開できます。git管理は不要なら、これが最速です。Vercel + git は「履歴管理したい」「複数人で更新したい」場合の選択肢。

---

## データの分離・プライバシー

このアプリは全てのデータを **ブラウザの localStorage** に保存します。

- 各ユーザーのデータは**そのブラウザ内にのみ保存**
- 他人のデータは絶対に見えない (サーバーに送信されない)
- 同じURLを開いても、ユーザーごとに完全独立
- アプリは外部 (BOAT RACE 公式サイト等) と一切通信しません

唯一の通信は CDN (jsdelivr/unpkg/cdnjs/cdn.tailwindcss.com) からのライブラリ読み込みのみ。

---

## 共有時のおすすめ文言

```
競艇の期待値分析アシスタントを作りました。
「全レースを予想する」のではなく「勝負条件のレースだけ買う」AIです。
URLを開くだけで使えます。データはブラウザに保存されるので他人には見えません。
自動購入・自動ログインはありません。最終判断は自分で。

→ [URL]
```
