# dots & signs

**ひとことを、手話で。** dotsを着想源にしたキャラクターと、「こんにちは・こんばんは・ありがとう」を練習するDevDayアプリです。

[ChatGPT Site](https://dots-sign-yurin-devday.yurinakanishi33.chatgpt.site) · [GitHub](https://github.com/yurinakanishi/dots-sign)（どちらも本人限定）

## 使い方

ことばを選び、お手本を見て、「カメラで練習する」を押します。顔・肩・両手を映して、dotsの一言に沿ってまねしてください。左右どちらの手でも練習できます。

画面はこの練習だけです。学習記録、達成率、サイドメニュー、別画面の設定はありません。お手本は一時停止でき、手順を押すとその形を見られます。OSの「動きを減らす」設定では自動再生しません。

## ローカル起動

Node.js 22.12以上（24 LTS推奨）、PC版Chrome / Edgeを使用してください。

```powershell
cd C:\Users\yurin\Desktop\projects\devday-hackathon\dots-sign
npm install
npm run dev
```

表示された http://127.0.0.1:5173/ を開きます。APIキーは不要です。初回インストールでGoogle公式のHand LandmarkerとPose Landmarker Liteを取得します。URLのバージョンとSHA-256を固定しています。取得に失敗した場合は `npm run models:setup` を実行してください。

モデル、WASM、フォントはアプリと同じ配信元から読み込みます。カメラ映像や手・体の座標はブラウザ内で処理し、保存・送信しません。マイクも使用しません。新しい版では学習記録を読み書きしません。旧版の記録がブラウザに残っていても利用しません。

## カメラで確認すること

| ことば     | 確認する順番                                                            |
| ---------- | ----------------------------------------------------------------------- |
| こんにちは | 額に2本の指 → 両手の人差し指を立てる → 両方を曲げる                     |
| こんばんは | 顔の左右に手のひら → 目の前で交差 → 両手の人差し指を立てて曲げる        |
| ありがとう | 甲を上に向けた手に、小指側を直角にのせる → 下の手を保ち、上の手を上げる |

手の21点と体の33点から、形・向き・顔や肩との相対位置・動く順番を確認します。手の消失、不確かな顔位置、大きなフレーム欠落などでは最初からやり直します。

**判定は手の動きの練習補助です。3つのあいさつの実利用者に対する認識率は未測定です。** 表情、会釈、接触の有無、手話全体の自然さは採点していません。特に両手が重なる瞬間や横向きの手は検出が途切れやすく、正しい動きでもやり直しになることがあります。一人での練習を想定しています。判定結果を通訳・語学評価として利用する設計ではありません。

教材は[秋田市「手話を覚えよう！」](https://www.city.akita.lg.jp/kurashi/shogaifukushi/1006373/1004961.html)の表現を基準にしています。手話には地域・世代による違いがあります。表示する図は独自に作成した模式図で、自然な表現にはろう者・手話講師の確認が必要です。[調査と設計](docs/RECOGNITION.md)に根拠と限界を記載しています。

## 検証・ビルド

```powershell
npm run check
npm run preview
```

32件の認識ルールテスト、実モデル10ケース、ブラウザ23項目を確認しました。検証内容と残る制約は[docs/QA.md](docs/QA.md)を参照してください。

ブラウザ確認の再実行は、開発サーバーと専用の検証ブラウザを使います。

```powershell
node scripts/download-test-assets.mjs
npx --yes --package @playwright/cli playwright-cli -s=greetings open http://127.0.0.1:5173/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-model.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings close
```

## 配信

静的出力は `dist/`。カメラにはlocalhostまたはHTTPSが必要です。`.openai/hosting.json` の既存Site IDを再利用し、ビルドと同じコミットをSitesへpush・保存・デプロイします。GitHubへのpushだけではSitesへ自動反映されません。Sitesの短期認証情報は保存しません。

## キャラクター

OpenAIのdotsを着想源にした独自のSVGです。公式素材・公式連携ではなく、dotsアカウントやAPIには接続していません。応援は練習状態に応じた定型文です。[第三者の素材・ライセンス](THIRD_PARTY_NOTICES.md)も参照してください。
