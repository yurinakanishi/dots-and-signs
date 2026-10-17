# dots & signs

**手から、つながろう。** dotsを着想源にした小さなキャラクターと、日本の手話の数字を練習するDevDay向けWebアプリです。

ソースは[GitHubの非公開リポジトリ](https://github.com/yurinakanishi/dots-sign)、配信先は[ChatGPT Sites](https://dots-sign-yurin-devday.yurinakanishi33.chatgpt.site)です。Siteは本人のみアクセスできる設定です。

## 起動

Node.js **22.12以上（24 LTS推奨）**とPC版Chrome / Edgeを使用してください。

```powershell
cd C:\Users\yurin\Desktop\projects\devday-hackathon\dots-sign
npm install
npm run dev
```

表示された **http://127.0.0.1:5173/** を開き、「カメラをオンにする」を押してカメラを許可します。APIキーやアカウント登録は不要です。カメラを使わない「お手本モード」もあります。

初回の `npm install` はGoogle公式の学習済みモデルを取得し、MediaPipeのランタイムとWASMを `public/` に配置します。モデルは固定URL・SHA-256で検証します。以降の実行では、モデル・フォントを含め**アプリと同じ配信元から読み込みます**。Sites上でもカメラの判定はブラウザ内で完結します。

### モデルの準備に失敗したとき

```powershell
npm run models:setup
```

初回セットアップ時だけインターネット接続が必要です。モデルがない状態での起動・ビルドは、案内を出して停止します。`public/vendor/` とモデル本体は生成物なのでGitに含めません。

### ビルド・テスト

```powershell
npm test
npm run build
npm run preview
```

`dist/` が配布用の静的ファイル一式です。カメラAPIには **localhost / 127.0.0.1 またはHTTPS** が必要です。`file://` や別PCからの通常のHTTP接続では動きません。サブパス配信ではなくオリジン直下への配信を想定しています。

### ChatGPT Sitesへの更新

`.openai/hosting.json` に既存のSite IDと静的配信先 `dist` を保存しています。更新時はこのSiteを再利用し、モデルを含むビルドと対応するコミットをSitesへ保存してデプロイします。GitHubへの `git push` だけではSitesへ自動デプロイされません。Sites用の短期認証情報はリポジトリに保存しません。

## 入っているもの

- 日本の手話の数字 **1 / 2 / 3 / 4 / 5 / 10** の6レッスン。
- 右手・左手を切り替えられる模式図。「10」は指を伸ばしてから曲げるアニメーション。
- カメラ映像と21点の骨格の重ね表示。左右どちらの手でも練習可能。
- 手の形・向き・フレーム内の大きさ・連続した保持時間を確認する判定。
- 「10」の開始姿勢→指を曲げる→保持、という時系列の判定。
- 状態に合わせて表情と応援文が変わるキャラクター。
- 成功した教材と練習日のローカル保存、確認付きリセット。
- カメラ拒否・未接続・使用中・モデル読み込み失敗の案内、キャンセル・再試行。
- 停止、ページ移動、タブを隠したときにカメラを解放。
- レスポンシブ表示、キーボード操作、動きを減らすOS設定への対応。

カメラ映像・手の座標は保存・送信せず、マイクも使いません。`localStorage` に保存するのはレッスンIDと日付だけです。

## 判定方法と精度

認識方法を調べた上で、**MediaPipe Hand Landmarker + 幾何学的な特徴 + 時系列判定**を採用しました。汎用の「パー」「ピース」分類器を日本手話の認識器として扱っていません。例えば、日本の手話の「5」は開いた手ではなく、親指を横に出す形です。

処理はWeb Worker内で実行し、画面操作と分離しています。3次元の関節角度・指の伸展、手の法線、画角を確認し、静止教材は約1.05秒の連続一致で成功になります。手の消失、別の手への切り替え、不正な姿勢、フレームの大きな欠落では判定をリセットします。「10」は動きの順序・手首の移動・制限時間も確認します。

**実際の利用者に対する認識率は未測定です。高精度を保証する完成済みの手話認識モデルではありません。** 現在は対象を絞り、誤って成功させにくいルールを実装したプロトタイプです。画面の％は保持時間の進み具合で、正答確率ではありません。指の隠れ、逆光、手の形の個人差によって不成立になることがあります。数字以外の語彙、表情、両手、文法、自然な手話会話の評価は対象外です。

採用理由、一次資料、既知の限界、実測評価の手順は **[docs/RECOGNITION.md](docs/RECOGNITION.md)** にまとめています。教材の自然さや地域差については、ろう者・手話講師のレビューが必要です。

## 検証

- 指定した形以外を受け入れないこと、左右、位置・スケール、画面外、手の消失、時刻の重複、動きの順序などの自動テスト。
- Google公式 `pointing_up.jpg` / `victory.jpg` とその反転画像を実モデルに通して、左右と「1」「2」の認識を確認。
- `thumb_up.jpg` を「5」と誤認しないことを確認。
- 公式画像から作った模擬カメラ映像で、**実モデル→判定→成功画面→保存→再読込→リセット**まで確認。
- 権限拒否時の案内、カメラトラック解放、PC・狭い画面のレイアウトをブラウザで確認。

これは実利用者の認識率評価とは異なります。実際のPCカメラ、複数人、複数の照明条件での評価は残っています。詳細は [docs/QA.md](docs/QA.md) を参照してください。

### ブラウザ検証の再実行

開発サーバーを起動した別ターミナルで、専用の検証ブラウザを使用します。テストはそのブラウザ内の本アプリの学習記録を初期化します。ユーザーの通常プロファイルでは実行しないでください。

```powershell
node scripts/download-test-assets.mjs
npx --yes --package @playwright/cli playwright-cli -s=dots-sign open http://127.0.0.1:5173/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=dots-sign run-code --filename=scripts/verify-model.cjs
npx --yes --package @playwright/cli playwright-cli -s=dots-sign run-code --filename=scripts/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=dots-sign close
```

検証画像とスクリーンショットはGit管理外の `output/` に入ります。

## 構成

```text
src/
  App.tsx                       学習・記録・説明の画面
  components/Dot.tsx            アプリ用のSVGキャラクター
  components/HandIllustration.tsx 手の模式図
  hooks/useHandCamera.ts        カメラとWorkerのライフサイクル
  lib/recognition.ts            形・向き・時系列の判定
  lib/lessons.ts                教材と応援メッセージ
  lib/progress.ts               ローカルの学習記録
public/vision-worker.js         MediaPipe推論
scripts/setup-vision.mjs        モデル取得・ランタイム配置
tests/                         判定の不変条件・拒否条件のテスト
docs/                          調査と検証記録
```

## キャラクターと教材

OpenAIのdotsを着想源として、本アプリ用に描いた独自のSVGキャラクターです。**OpenAI公式アセットの再現・公式連携ではなく、dotsアカウントやdots APIへの接続もありません。** 応援文は判定状態に応じた定型文です。公式素材が提供された場合に差し替えやすいよう、描画は `Dot.tsx` に分離しています。

教材の説明は[梅花女子大学「3Dモデルで学ぶ手話 — 数字」](https://mv.baika.ac.jp/imamura/www/suuji.html)、[神奈川県「指文字（数字）」](https://www.pref.kanagawa.jp/docs/dc4/cnt/f533708/p1112883.html)を参照しています。手のお手本はこのアプリで描いた模式図で、公式動画・画像の転載ではありません。

使用ライブラリ・フォント・検証素材は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
