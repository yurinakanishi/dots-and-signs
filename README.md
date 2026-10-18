# dots & signs

**ひとことを、手話で。** 青・緑・黄色・ピンクの4体のdotsと、「こんにちは・こんばんは・ありがとう」を練習するDevDayアプリです。

[ChatGPT Site](https://dots-sign-yurin-devday.yurinakanishi33.chatgpt.site) · [GitHub](https://github.com/yurinakanishi/dots-sign)（どちらも本人限定）

## 使い方

ことばを選び、お手本を見て、「カメラで練習する」を押します。顔・肩・両手を映して、dotsの一言に沿ってまねしてください。左右どちらの手でも練習できます。

画面はこの練習だけです。カメラを始めると、3段階の「できた・いまここ・つぎ」と「ステップ 1 / 3」を表示し、お手本が判定に連動します。検出した手の数と、その段階に必要な手の数を別々に表示します。2つの手の骨格は青・黄色で描き分けます。形を少し保つと次へ進み、一瞬の検出漏れでは今の段階で待ちます。

映像や認識が遅れた場合は「認識を待っています」と表示し、古い骨格を消して待機します。新しい映像が届けば自動で判定へ戻ります。長く途切れた場合は手順を最初から確認し、8秒間の映像停止・無応答ではカメラを解放して再起動を案内します。

学習記録、達成率、サイドメニュー、別画面の設定はありません。カメラを止めている間は、お手本を一時停止したり手順を押して確認できます。OSの「動きを減らす」設定では自動再生しません。

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

手の21点と体の33点から、形・向き・顔や肩との相対位置・動く順番を確認します。手や顔の短い検出漏れでは判定を一時停止し、1秒以上の消失、大きなフレーム欠落などでは理由を表示して最初からやり直します。見えない手を補って成功にすることはありません。

**判定は手の動きの練習補助です。3つのあいさつの実利用者に対する認識率は未測定です。** 表情、会釈、接触の有無、手話全体の自然さは採点していません。特に両手が重なる瞬間や横向きの手は検出が途切れやすく、正しい動きでもやり直しになることがあります。一人での練習を想定しています。判定結果を通訳・語学評価として利用する設計ではありません。

教材は[秋田市「手話を覚えよう！」](https://www.city.akita.lg.jp/kurashi/shogaifukushi/1006373/1004961.html)の表現を基準にしています。手話には地域・世代による違いがあります。表示する図は独自に作成した模式図で、自然な表現にはろう者・手話講師の確認が必要です。[調査と設計](docs/RECOGNITION.md)に根拠と限界を記載しています。

## 検証・ビルド

```powershell
npm run check
npm run preview
```

52件の認識・追跡・進行表示のテスト、実モデル10ケースと両手検出9ケース、既存ブラウザ23項目・進行表示19項目・遅延と復帰13項目を確認しました。CRO-MAGNONの手操作を参考にした変更は[調査と設計](docs/RECOGNITION.md)、検証内容と残る制約は[検証記録](docs/QA.md)を参照してください。

ブラウザ確認の再実行は、開発サーバーと専用の検証ブラウザを使います。

```powershell
node scripts/download-test-assets.mjs
npx --yes --package @playwright/cli playwright-cli -s=greetings open http://127.0.0.1:5173/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-model.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-two-hands.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-progress.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-tracking-recovery.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings close
```

## 配信

静的出力は `dist/`。カメラにはlocalhostまたはHTTPSが必要です。`.openai/hosting.json` の既存Site IDを再利用し、ビルドと同じコミットをSitesへpush・保存・デプロイします。GitHubへのpushだけではSitesへ自動反映されません。Sitesの短期認証情報は保存しません。

## キャラクター

ユーザー提供の参考画像をもとに、ベレー帽の青・目の大きな緑・丸眼鏡の黄色・サングラスのピンクの4体を、内蔵imagegenで背景透過PNGに加工しています。素材は同じ配信元から読み込み、4体がカメラの下で応援します。成功時には小さく跳ね、OSの「動きを減らす」設定では静止します。

独立したハッカソン用プロトタイプで、dotsアカウントやAPIには接続していません。応援は練習状態に応じた定型文です。[素材と加工プロンプト](docs/CHARACTER_ASSET.md)・[第三者の素材・ライセンス](THIRD_PARTY_NOTICES.md)も参照してください。
