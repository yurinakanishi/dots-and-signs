# ローカル音声アシストの構成と検証

対象: 2026-10-18、Windows、Node.js 24.16.0、Chromeの隔離された検証用プロファイル。仕様は [SPEC.md](../SPEC.md)。実カメラの認識精度については [QA.md](QA.md) を参照。

## 起動

```powershell
npm ci
npm run dev
```

http://127.0.0.1:5173/ を開く。Node.js 22.18以上が必要。音声用の `.env` には `OPENAI_API_KEY` を設定する。キーは **Live Write・Decisions Write・Responses Write** のみ許可し、公開クライアント用の `VITE_` 変数へ入れない。未設定でも4教材の選択・画像練習は使える（自動判定は最初の3教材）。

ビルド済みで起動する場合は `npm run build` → `npm start`。別のポートはPowerShellで `$env:PORT='5174'` を指定してから起動する。`npm run preview` は静的出力の確認用で、音声APIを含まない。音声には外部のOpenAI APIへ到達できるネットワークが必要。

## ChatGPTサインインを使わない構成

2026-10-18の利用者指定により、ローカル版はChatGPTサインインを使わない。ソース、設定、`.env` / `.env.previous` の変数名、`.local` を確認し、サインイン用実装・OAuth設定・保存トークンは見つからなかったため、アプリ側の削除対象はない。

既存のChatGPT SitesにはSites管理の認証登録が残っている。利用可能な管理ツールとサイト設定画面には、認証登録だけを削除する操作がなく、サイト全体の永久削除のみ確認できた。サイト全体の削除は今回のサインイン連携削除より範囲が広いため実行していない。この認証登録はローカル版の実行には使わない。

## 費用の制御

- このローカル用キーを置いた **Defaultプロジェクト全体** に、月額 **$1**、**Enforce a hard limit** を設定。管理画面の `Limit enforced` を確認した。通知だけの設定ではない。APIキーの有効期限は2026-10-25。
- 1回1分で自動終了。マイクを無音化して `session.close` を送り、最大3秒でローカル資源を解放する。タブを離れた時も停止する。
- サーバーはAPI呼び出し前に1日10回の枠を確保する。`.local/live-usage.json` に日付と回数だけを保存。失敗した試行も消費し、再起動や複数サーバーで枠を二重に使わない。更新はUTC日付（日本時間9時）。
- 1分5回、同時作成1件、20秒のAPIタイムアウトも設定。自動再接続・有料リトライは行わない。
- 会計ファイルの破損・書き込み失敗・別プロセスのロック中はAPI接続を止める。異常終了で `.local/live-usage.json.lock` だけ残った場合は、アプリサーバーが停止していることを確認してからロックだけを除く。会計JSONを削除して回数をリセットしない。

GPT-Liveの音声は$0.05/分で、委任先モデルの使用料は別途発生する。アプリの時間制限だけで金額上限を保証することはできない。プロジェクトのハード上限も反映は即時ではなく、少額超過がありえる。[モデル料金](https://developers.openai.com/api/docs/models/gpt-live-1)・[ハード上限の公式説明](https://developers.openai.com/api/docs/guides/spend-limits)。

## 通信の流れ

1. 音声入力モードでスイッチをON → 設定の有無を確認 → 音声専用 `getUserMedia`。モードを選んだだけでは接続しない。
2. データチャネル `oai-events` のハンドラーを登録 → SDP offer → 同一Originの `/api/live/session`。
3. サーバーが固定のモデル・指示・choice questionでOpenAIへ要求。キーはサーバーだけで使用し、ブラウザにはIDとSDP answerだけを返す。
4. `session.started` 後に対話開始。字幕は元のdeltaと時刻を保持し、同じevent_idを重複表示しない。
5. native Decisionsの委任IDを照合 → 候補だけ表示 → 利用者が確認 → Reactの表示反映後に同じ委任へcommentary。
6. 対象外・取消・失敗にも結果通知。OFF・選択モードへの切り替えで入力と再生を即停止し、`session.closed` を待って解放する。応答がなければ確認できなかった旨を表示する。

音声接続とMediaPipeのカメラは独立する。カメラ映像・骨格はAPIに送らない。音声コーチは映像の正誤を判定しない。会話・字幕・学習記録をアプリのディスクに保存しない（手動実行した検証用スクリプトの固定テスト発話は検証ログに残る）。

## 再実行できる検証

無料のローカル検証:

```powershell
npm run check
npx --yes --package @playwright/cli playwright-cli -s=dots-check open http://127.0.0.1:5173/
npx --yes --package @playwright/cli playwright-cli -s=dots-check run-code --filename scripts/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=dots-check run-code --filename scripts/verify-checkpoints.cjs
npx --yes --package @playwright/cli playwright-cli -s=dots-check run-code --filename scripts/verify-voice-ui.cjs
```

以下だけは実APIを使用して課金されるため、任意実行とする。通常の `npm run check` やCIから呼ばない。

```powershell
# 日本語22例を実Decisions APIへ送る（単語だけ・言いよどみ・訂正・対象外を含む）
npm run verify:api
# Windowsのインストール済み日本語音声から固定発話のWAVを端末内生成
powershell.exe -NoProfile -File scripts/generate-test-speech.ps1
# 生成した音声のみを使う、実Live WebRTC + native Decisionsの通し検証
npx --yes --package @playwright/cli playwright-cli -s=dots-check run-code --filename scripts/verify-live.cjs
npx --yes --package @playwright/cli playwright-cli -s=dots-check close
```

`verify:api` は固定22件の単独API検証なのでアプリの日次接続枠は使わないが、同じプロジェクトの金額上限が適用される。音声の通し検証はアプリの接続枠も使う。人のマイク音声は録音しない。生成音声の仕組みは [Windows SpeechSynthesizer](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer.synthesizetexttostreamasync?view=winrt-26100) を使用。

本番形式の無料検証は、開発サーバーを5173で起動したまま別のPowerShellで `$env:PORT='5174'; npm start` を実行し、検証ブラウザで `run-code --filename scripts/verify-production.cjs` を実行する。終了後、5174のサーバーをCtrl+Cで止める。

## 教材名だけの音声入力の修正（2026-10-18）

修正前の実Decisions APIで「こんにちは」単独も「こんにちはいや、あるあるよ入っちゃ」も `none` になることを再現。画面は「練習したいことばを話してね」と案内している一方、分類指示は明示的な練習依頼だけを対象とし、雑談・否定を一括で除外していた。従来の実API検証5例には教材名だけの発話がなかった。

分類と音声コーチの両方に画面の文脈を加え、教材名だけでも委任・候補表示する。同じ教材名の繰り返しや言いよどみを許容し、明確な訂正・取り消しと区別する。曖昧な入力は新しい `unclear` で聞き直し、教材がないと断定しない。文章全体の未対応な翻訳依頼は引き続き `none`。候補は利用者の確認まで教材を変更しない。

- 実Decisions API：固定22例すべて成功。上記2発話は `hello`、明確な取り消し・曖昧な入力は `unclear`、未対応文章は `none`。
- ブラウザ：模擬通信で34項目成功。聞き直し、次の候補の確認、同じ委任への通知、遅延応答、モバイル表示を含む。
- 実Live WebRTC：合成音声の「こんにちは」単独で17項目成功。`hello` の候補表示・確認・教材表示・音声返答、未対応文章の `none`、正常終了まで確認。API報告24秒、日次接続は7回から8回へ。実マイクは使用していない。
- ローカル：149テスト・型検査・`npm run build:local` 成功。`npm run check` のSites向けビルドは既存の `dist` の削除がEPERMとなり完了せず、ローカル用ビルドで確認した。

`server/session-config.ts` の変更にはローカルサーバーの再起動が必要。検証時は5173のサーバーを再起動済み。ブラウザも再読み込みし、新しい音声接続で試す。実マイクの周囲音や音声認識の精度そのものを変更する修正ではない。

## 入力モードと4教材への更新（2026-10-18）

[追加の共有チャット](https://chatgpt.com/s/cx_6ad46a7fa2688191bf70f38d25f207e5)の4画像をそのまま組み込んだ。選択モードを初期状態とし、音声は明示的にONにした場合だけ接続する。モードを変えても選択中の教材・カメラ・完了済みの進行は維持する。`welcome` は画像を見比べる練習で、指文字や動作の自動判定は未実装。定義と画像の範囲は [LESSON_IMAGES.md](LESSON_IMAGES.md)。

| 検証                   | 更新後の結果                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`        | 119テスト、型検査、本番ビルド成功                                                                                                                                   |
| 音声UI・モード切り替え | 模擬通信で28項目成功。初期OFF、4画像、2×2の正方形サムネイル、提案と確認、音声停止、遅延した結果の無効化、マイク拒否、API上限エラー、許可待ち中の切り替え、390px表示 |
| カメラUI               | 26項目成功。既存3教材の完了と、ありがとうの動きをwelcomeに誤適用しないことを確認                                                                                    |
| 途中再開               | 24項目成功。入力モードを切り替えてもカメラと完了済みのステップを維持。画像の横に再開時の始点を文章で表示                                                            |
| 実Decisions API        | 固定5例がHTTP200。hello / evening / thanks / welcome / noneをそれぞれ期待通り選択                                                                                   |
| 本番形式               | 8項目成功。4教材・4画像、音声初期OFF、費用制限、秘密ファイル非公開、モデルの実ロード・空画像処理                                                                    |

最終ビルドでは幅320pxでも両モードに横スクロールがなく、長い教材名と黄色いdotsがカード内に収まることを確認した。

新しい音声UIの通信は模擬検証、分類は実API検証。以前に成功した実Liveの17項目は下記の記録を参照。費用を抑えるため、この更新では実Liveの音声セッションを追加していない。日次接続枠は `2026-10-18` の6回のまま維持した。月額$1・1分・1日10回の上限も変更していない。下記の$0.09は今回の5件を送る前の表示であり、更新後の利用額ではない。

## 前回の実API接続までに確認した結果

| 確認               | 結果と範囲                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`           | 成功。モデルのSHA-256確認と92依存パッケージの再導入                                                                                                                            |
| `npm run check`    | 117テスト・型検査・本番ビルド成功                                                                                                                                              |
| 既存カメラUI       | 24項目成功。実モデル初期化、合成骨格で3教材完了、停止・権限拒否・機器解放                                                                                                      |
| 途中再開           | 21項目成功。同じ教材を押す、停止、検出切れでもチェックを保持                                                                                                                   |
| 音声UI（模擬通信） | 12項目成功。確認前に変更しない、表示後の結果通知、対象外、マイク拒否、手動操作、390px表示                                                                                      |
| 実Decisions API    | 日本語4例がHTTP200。hello/evening/thanks/noneを期待通り選択                                                                                                                    |
| 実Live WebRTC      | 合成日本語音声で17項目成功。thanks提案→利用者確認→表示反映の通知、対象外の文→none、入出力字幕と実際の音声受信、`session.closed`、機器解放を確認。最後の通し検証はAPI報告で20秒 |
| 本番形式の起動     | 最終ビルドで6項目成功。3教材の表示、1分・10回のAPI設定、秘密ファイル非公開、両モデルの初期化と空画像の処理、実行時エラーなし                                                   |
| 秘密情報の混入     | Git対象とビルド出力の計225ファイルを確認し、発行したキー文字列の一致0件                                                                                                        |

検証後の管理画面は `$0.09 / $1.00`、`Limit enforced` と表示（利用額の反映には遅延がありえる）。アプリの日次枠は10月18日UTC分を6回使用し、残り4回。検証後に回数をリセットしていない。

本物のマイク・スピーカーでの会話品質、実利用者の手話認識率、Safari/iPhoneの実機は未測定。模擬通信のUI検証、合成日本語音声のAPI検証、実機で人が操作した検証を同一視しない。

## 実装中に見つけて直した点

- 作成時のLive/Decisions権限だけでは、実音声接続が `api.responses.write` の不足を返した。Responses Write追加後も旧キーではLiveのみ同じエラーが続いたため、同じ3権限・期限のキーを再発行して接続成功を確認した。権限情報の反映遅延かどうかは断定できない。READMEにも必要権限を明記。現在のキーは `dots-sign-local-live-2026-10-18`。旧キー `dots-sign-local-2026-10-18` はアプリでは使わず、同じ10月25日に失効する。切り替え時のバックアップ `.env.previous` もGit対象外。
- `session.started` より前のエラーを即座に処理するよう修正。古い委任や同じ教材の手動再選択でも遅延結果を破棄する。
- 終了時に未完了のcommentaryが取り消されると `context_injection_incomplete` が来る場合がある。終了処理中はこれで接続を即断せず、`session.closed` まで待つよう修正し、回帰テストと実接続で確認。
- ノートPCの高さ720pxでカメラ開始ボタンを表示内に収めるよう余白を調整。
- Windowsで生成中のWAVファイルをViteが監視するとEBUSYで終了したため、検証出力・ローカル会計ファイルを監視対象から外した。
- Windowsの制限付き実行環境ではファイルのrenameがEPERMになるため、永続化テストは通常のホスト権限で実行して成功を確認。失敗時に課金を止める実装は維持。

## 参照した公式API仕様

- [音声WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)
- [native Decisionsとの接続](https://developers.openai.com/api/docs/guides/decisions-voice)
- [Liveセッションの作成](https://developers.openai.com/api/reference/resources/live/methods/create)
- [音声会話のイベントと終了](https://developers.openai.com/api/docs/guides/live-conversations)

外部公開・GitHubへのpush・既存Siteの更新は行っていない。ローカルサーバーはloopback専用であり、公開用の認証サーバーとして利用しない。
