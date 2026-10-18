# Sites deployment

既存Site: https://practice-signs-with-dots.yurinakanishi33.chatgpt.site

2026-10-18: 静的配信から、公式Sites Vinextスターターに基づくWorker配信へ移行する版。既存のSite ID・本人限定アクセス・4教材・カメラ認識を維持する。アプリ独自のChatGPTサインインは追加しない。

現在のUIはユーザー指定により **選択モードのみ**。音声入力モードはComing Soonの無効ボタンで、音声操作コンポーネントを描画しない。内部処理を残し、SitesのAPIキー登録・実音声接続は今回行わない。

## 構成

- `app/page.tsx` が既存のReact画面を表示する。画像インポートの `?url` はVite/Vinext共通でURL文字列を取得するため。
- `/api/live/status`・`/api/live/session`・`/api/practice/hint` は `server/hosted-api.ts` が処理する。
- APIキーはSites秘密設定の `OPENAI_API_KEY`。必要権限はLive / Decisions / Responses Write。ブラウザに返すのはセッションIDとSDPのみ。
- 音声なしの練習ヒントはDecisions Write権限を使い、ヒントIDだけを返す。練習状態の要約を送信し、映像・音声・座標は送信しない。既存Siteへの反映には新しいビルドと秘密設定が必要。
- `DB` はSites管理のD1。`drizzle/` のスキーマを公開時に適用する。音声、字幕、カメラ映像、ユーザーIDは保存しない。
- 本人限定アクセスはSitesが処理する。公開範囲を広げる場合は、この共有APIと上限の認可設計も見直すこと。

## 利用上限

練習ヒントは最短20秒間隔、全利用者・全Worker共通で1日60回まで。既存の `live_usage` テーブルに `hint:YYYY-MM-DD` の別キーで計上し、音声枠を消費しない。追加スキーマ移行は不要。クライアント側も1回のカメラ開始／やり直しにつき6回までに制限する。

通常画面では1回60秒で切断する。サーバーでは全利用者・全Worker共通で1日10回、開始間隔90秒をD1の条件付き書き込みで制限する。失敗・キャンセルも1回として残し、自動再接続しない。日付はUTC（日本時間9時更新）。D1が読めない・書けないときは有料APIを呼ばない。

初回公開時には `LIVE_INITIAL_USAGE_DAY` と `LIVE_INITIAL_USAGE_COUNT` に当日のローカル利用済み回数を設定する。初期値は既存の公開側カウントを下げず、その日だけ適用される。ローカルの `.local/live-usage.json` とD1は別ストアなので、その後のローカル利用とは同期しない。金額は同じAPIプロジェクトの月額$1 hard limitで制限する。キーの期限は2026-10-25。期限後は再設定が必要。

## 開発・プレビュー

```powershell
npm ci
npm run dev
```

従来のローカル画面・APIは http://127.0.0.1:5173/ 。`.env` のキーをサーバーのみが使用する。

Sites相当のプレビュー:

```powershell
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_nasty_landau.sql
npm run preview -- --port 5174
```

SQLの適用は初回だけ行う。以後は未適用の追加マイグレーションだけを適用する。プレビューの有料音声検証には、Git除外済みの `.dev.vars` に `OPENAI_API_KEY` を設定する。設定がなくても教材選択とカメラは使える。ローカルWorker用DBと公開DBは別物。

バインディング変更後は型を再生成する:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js types --config dist/server/wrangler.json worker-configuration.d.ts --include-runtime false
```

## 公開手順

Sitesスキルのソース同期・ビルド・梱包・本人限定デプロイを使う。秘密設定を先に適用し、その環境リビジョンで公開する。元のGitHubリモートは保持し、勝手にpushしない。

Windowsでは公式ヘルパーからの `npm.cmd` パス解決とWSLの `bash` 選択で失敗する場合がある。今回の環境では作業フォルダ内のnpm shimで絶対パスのnpm CLIを呼び、ヘルパー起動時だけGit for Windowsの `bin` をPATHに加える。アーカイブのWindowsドライブ文字をリモートホストと誤認させないよう、梱包プロセスでは `TAR_OPTIONS=--force-local` を設定する。グローバル設定・プラグイン本体は変更しない。

## 検証状況（2026-10-18）

- 自動テスト149件成功。並行して行われた音声・指判定の修正も含む。公開用にD1相当のSQLite SQL・同時予約・日次上限・初回引き継ぎ・障害時停止・API境界16件を追加。
- 公開用ビルド成功。
- WorkerプレビューでComing Soon・4教材・画像・モデル推論・秘密ファイル非公開・320px表示など12項目成功。教材選択から音声APIが呼ばれないことも確認。
- 音声UIを隠す前の画面検証は28項目成功（模擬通信、課金なし）。内部処理とテストは維持。
- 音声操作をComing Soonへ変更。音声の内部テストは保持し、画面からは有料APIを呼ばない。秘密設定は登録せず、選択モード版を公開する。
