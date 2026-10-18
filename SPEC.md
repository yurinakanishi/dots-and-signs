# 音声アシスト付き手話練習 — 引き継ぎ仕様

2026-10-18。[共有された設計・差分](https://chatgpt.com/s/cx_6ad45e40c8fc81919c6f5a98182720d4)の最終版（`none` の結果通知を含む）を、このリポジトリで実行できる形に整理したもの。元のチェックアウトには SPEC.md がなかったため復元した。技術検証の記録は [docs/LIVE.md](docs/LIVE.md)。

## 今回の完成範囲

イベントスタッフが音声入力モードまたは選択モードで教材を選び、カメラ練習へ進める。[追加の共有内容](https://chatgpt.com/s/cx_6ad46a7fa2688191bf70f38d25f207e5)に合わせ、対象は `hello`（こんにちは）、`evening`（こんばんは）、`thanks`（ありがとう）、`welcome`（OpenAIへようこそ）の4つ。GPT-Live (`gpt-live-1`) の音声 WebRTC と native Decisions delegation (`gpt-6-luna`) を使う。

提供された青いdotsの4枚を、2×2の選択欄と教材のお手本に使う。画像は静止ポーズの参考であり、3教材の動きの順序は既存の文章手順で示す。MediaPipe、独自判定器、途中再開、dotsの動きは維持する。

共有内容内の訂正に従い、`welcome` は歓迎のポーズを見比べる画像練習とする。「OpenAI」の指文字は未確認で、文章全体の手話を完成済みとして扱わない。別の教材の自動判定を流用せず、カメラは鏡として使う。この範囲を教材・音声の提案・コーチへの結果通知に明記する。新しい文章の教材化、自由文の手話翻訳、3D・モーションキャプチャー、専門家による教材監修は別の段階とする。画像の由来は [docs/LESSON_IMAGES.md](docs/LESSON_IMAGES.md)。

利用者の追加指定により、今回のアプリは **ChatGPTサインインを使わない**。ローカル版にはログイン画面、OAuthクライアント、認証コールバック、ログイン用トークンの保存を設けない。音声APIはサーバー側の `OPENAI_API_KEY` を使う。

## 利用者の操作

1. 初期表示は選択モード。4つの画像付きボタンから教材を選んで練習できる。APIやマイクは使わない。
2. 音声入力モードに切り替えても音声はOFF。「音声入力」スイッチをONにした時だけマイクの許可と接続を始める。送信先と有料であることを開始前に表示する。
3. 日本語で話すと、利用者とコーチの字幕、教材候補が表示される。
4. 「このことばを練習する」で確認した時だけ教材を切り替える。音声接続や教材確認でカメラを自動開始しない。
5. 対象外・曖昧な依頼は `none` とし、「この文章の手話はまだ教材化していません」と表示する。登録語を含む未対応の文章を、近い単語に置き換えない。
6. スイッチをOFF、選択モードへ切り替える、タブを離れる、1分経過で音声を終了する。入力とコーチの再生を即座に止め、終了応答を待って通信資源を解放する。許可待ち中に切り替えても、遅れて許可されたマイクを解放する。
7. 音声の障害時も「選択モードに切り替える」から4教材を選べる。モードの切り替えは教材・カメラ・完了済みのステップを変更しない。別の教材を選ぶと練習の進行だけをリセットする。

### 利用者の追加条件：費用制限

「リミットを決めて安く抑える」という依頼により、音声は1回1分・1日10回までに制限する。回数はAPIを呼ぶ前に排他的に確保・永続化し、エラーやキャンセルでも返却しない。保存不能・破損時は接続を止める。日本時間9時（UTC日付）に更新する。APIプロジェクトでは月額$1のハード上限を有効化する。プラットフォーム側の反映遅延による少額超過は保証できない。利用者による変更なしに上限を引き上げない。

## 通信と信頼境界

- `POST /api/live/session` は `{ sdp }` を受け取り、サーバーが固定した設定で OpenAI `/v1/live/sessions` を呼ぶ。クライアントへはセッションIDとSDP answerだけを返す。
- `OPENAI_API_KEY` はGit管理対象外の `.env` からNodeサーバーが読む。ブラウザ、Viteの公開環境変数、ログ、ビルド出力へ含めない。
- ローカルサーバーは127.0.0.1だけにbindし、Hostと同一Originを検証する。JSONは64KiBまで、SDPは音声のみ、セッション作成は1分5回まで・同時実行1件。
- カメラ映像・画像・ランドマークをAPIへ送信しない。マイク音声は音声専用WebRTCへ送る。字幕と学習進行はページのメモリだけで保持する。
- 本番の外部公開には別途認証と利用者単位の制限が必要。今回のサーバーはローカル実行用。

## GPT-LiveとDecisions

- offer前にデータチャネルとイベントハンドラーを登録する。チャネルopenではなく `session.started` を待って準備完了とする。WebRTCでは `session.start` を送らない。
- `session.input_transcript.delta` / `session.output_transcript.delta` の断片・時刻・話者を保持する。存在しない確定イベントや文末を仮定しない。同一event_idの重複だけ除外する。
- サーバー設定の `delegation.type` は `decisions`。choice question `lesson_id` の候補は `hello` / `evening` / `thanks` / `welcome` / `none`。手動選択・音声・画像パス・教材の注意書きは `src/lib/lessons.ts` を共通定義とする。
- `session.delegation.created.delegation.id` と `decision.event.delegation_id` を照合する。内側の `decision.completed` の `decision.answers` から `lesson_id` を読む。
- 不明ID、古い委任、重複結果、不正なchoiceを採用しない。利用者が手動で教材を変えたら古い候補を破棄する。
- 結果はまず提案とする。確認後、Reactで教材が実際に表示された後に、同じdelegation_idへ `session.commentary.append` で実行結果を通知する。
- `none`・提案取消・選択失敗も対応するdelegation_idに結果を返す。音声だけで勝手に成功を報告しない。
- 正常停止は `session.close` を送り、マイクをローカルで無音化し `session.closed` を待つ。3秒で応答がなければ資源を解放し、終了応答を確認できなかったことを表示する。
- 接続・通信・許可・APIエラーはUIに安全な説明を表示し、track / peer / channel / audio / timer / fetchを解放する。

## 実装入口

`src/hooks/useLiveCoach.ts` は `state: idle | connecting | listening | error`、字幕、`recommendedLessonId`、`error`、`start`、`stop`、`confirmLesson` を提供する。通信状態機械は `src/lib/live/coach.ts`、モード切り替えと4択は `src/components/LessonInput.tsx`、音声画面は `src/components/VoiceCoach.tsx`、固定セッション設定は `server/session-config.ts` に分離する。画像は `public/lesson-images/`、お手本と文章手順は `src/components/SignDemo.tsx`。

## 完了確認

- `npm ci`、`npm run check`、既存のブラウザ・途中再開テストが成功する。
- 実APIで session作成201 → `session.started` → 日本語音声 → native Decisions → 提案 → UI確認 → 同一委任への表示完了通知 → コーチ音声と字幕 → `session.closed` を確認する。
- 対象外発話、マイク拒否、API認証・権限エラー、通信切断、古い/重複の結果を確認する。
- キーを公開せず、Windowsでの起動手順、実測・模擬テスト・未確認項目を分けて残す。
