# Practice Signs with Dots

**ひとことを、手話で。** 青・緑・黄色・ピンクの4体のdotsと、「こんにちは・こんばんは・ありがとう」を練習するDevDayアプリです。

[ChatGPT Site](https://dots-sign-yurin-devday.yurinakanishi33.chatgpt.site) · [GitHub](https://github.com/yurinakanishi/practice-signs-with-dots)（どちらも本人限定）

## 使い方

ことばを選び、お手本を見て、「カメラで練習する」を押します。顔・肩・両手を映して、dotsの一言に沿ってまねしてください。左右どちらの手でも練習できます。

画面はこの練習だけです。カメラを始めると、3段階の「できた・いまここ・つぎ」と「ステップ 1 / 3」を表示し、お手本が判定に連動します。検出した手の数と、その段階に必要な手の数を別々に表示します。2つの手の骨格は青・黄色で描き分けます。形を少し保つと次へ進み、一瞬の検出漏れでは今の段階で待ちます。

**できたステップは、次の動きでつまずいても消えません。** 時間制限はなく、手を下ろしたり、カメラを止めたりしても同じステップから続けられます。「ステップ1はできたよ」と今やる動きを分けて表示し、停止中は「ここから再開」「ステップ2から再開する」のように再開位置を示します。同じことばを押し直しても進行は変わりません。

映像や認識が遅れた場合は「認識を待っています」と表示し、古い骨格を消して待機します。長く途切れた場合は、今の動きの始点だけを「ステップ3の準備」などとして案内します。完了済みのチェックは残ります。8秒間の映像停止・無応答ではカメラを解放し、続きから再開できます。進行を消すのは「最初から」「もう一度」、別のことばへの変更、ページの再読み込みです。ページを閉じた後まで記録を保存する機能はありません。

学習記録、達成率、サイドメニュー、別画面の設定はありません。練習を始める前は、お手本を一時停止したり手順を押して確認できます。途中でカメラを止めた場合は、再開するステップのお手本を表示します。OSの「動きを減らす」設定では自動再生しません。

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

手の21点と体の33点から、形・向き・顔や肩との相対位置・動く順番を確認します。確認済みの段階と、現在の動作を測るための履歴を分けて管理します。長い検出切れでは古い動作の履歴を破棄し、交差・おじぎ・上げる動きは始点の形から確認し直します。終わりの形だけで通したり、見えない手を補って成功にしたりはしません。

**判定は手の動きの練習補助です。3つのあいさつの実利用者に対する認識率は未測定です。** 表情、会釈、接触の有無、手話全体の自然さは採点していません。特に両手が重なる瞬間や横向きの手は検出が途切れやすく、正しい動きでもやり直しになることがあります。一人での練習を想定しています。判定結果を通訳・語学評価として利用する設計ではありません。

教材は[秋田市「手話を覚えよう！」](https://www.city.akita.lg.jp/kurashi/shogaifukushi/1006373/1004961.html)の表現を基準にしています。手話には地域・世代による違いがあります。表示する図は独自に作成した模式図で、自然な表現にはろう者・手話講師の確認が必要です。[調査と設計](docs/RECOGNITION.md)に根拠と限界を記載しています。

## 検証・ビルド

```powershell
npm run check
npm run preview
```

認識・追跡・進行表示の75件と、途中再開のブラウザ21項目を確認しました。今回の変更は完了した段階の保持と復帰時の案内で、モデルや検出しきい値は変えていません。実モデル10ケース・両手検出9ケース・キャラクター操作22項目は前版での検証結果です。CRO-MAGNONの手操作を参考にした変更は[調査と設計](docs/RECOGNITION.md)、今回再実行したブラウザ検査の結果と制約は[検証記録](docs/QA.md)を参照してください。

ブラウザ確認の再実行は、開発サーバーと専用の検証ブラウザを使います。

```powershell
node scripts/download-test-assets.mjs
npx --yes --package @playwright/cli playwright-cli -s=greetings open http://127.0.0.1:5173/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-model.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-two-hands.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-progress.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-tracking-recovery.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-characters.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings run-code --filename=scripts/verify-checkpoints.cjs
npx --yes --package @playwright/cli playwright-cli -s=greetings close
```

## 配信

静的出力は `dist/`。カメラにはlocalhostまたはHTTPSが必要です。`.openai/hosting.json` の既存Site IDを再利用し、ビルドと同じコミットをSitesへpush・保存・デプロイします。GitHubへのpushだけではSitesへ自動反映されません。Sitesの短期認証情報は保存しません。

## キャラクター

ユーザー提供の参考画像をもとに、内蔵imagegenで4体の体を個別の透過PNGにしました。目・帽子・眼鏡は独立したSVGのパーツです。青はお手本の隣、緑はカメラの下、黄色はことばの見出し、ピンクはヘッダーにいます。

それぞれ違う間隔でまばたきし、マウスを目で追います。押すとクッションのようにつぶれ、離すとしゃがんでジャンプ。着地でも柔らかくつぶれ、帽子や眼鏡が少し遅れて揺れます。ピンクは触るとサングラスを持ち上げます。タッチ・Space・Enterでも操作できます。練習の1段階目で緑、2段階目で青と黄色、3段階すべてができたら4体が星と吹き出しで応援します。dotsを押しても手話の進行は変わりません。OSの「動きを減らす」設定では動かず、吹き出しで応えます。

独立したハッカソン用プロトタイプで、dotsアカウントやAPIには接続していません。応援は練習状態に応じた定型文です。[素材と加工プロンプト](docs/CHARACTER_ASSET.md)・[第三者の素材・ライセンス](THIRD_PARTY_NOTICES.md)も参照してください。
