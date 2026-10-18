# dots キャラクター素材

- 使用ファイル: [src/assets/dots-quartet.png](../src/assets/dots-quartet.png)
- 加工日: 2026-10-18（日本時間）
- 入力: ユーザー提供の4体のdots参考画像。黒背景にChatGPT / dotsの文字があり、下部に青・緑・黄色・ピンクのキャラクターが並ぶ画像。
- 方法: 内蔵 `image_gen`（imagegenスキル、背景透過）。CLI / APIキーは使用していません。
- 出力: 2172 × 724、RGBA PNG。返却されたPNGをそのまま保存しています。
- 使用箇所: 練習画面のカメラの下。静かな上下動、判定成功時の短いジャンプ。reduced-motion対応。
- 性質: 提供画像を参考に加工した素材であり、公式配布素材の取得や公式連携を示すものではありません。

## 使用プロンプト

```text
Use case: background-extraction.
Asset type: transparent PNG companion group for a Japanese sign-language learning web app.
Input image 1 is the EDIT TARGET. Extract ONLY the four plush ChatGPT dots characters across the bottom of the provided image into one clean, high-resolution transparent cutout. Preserve their exact identity, colors, tactile fuzzy plush texture, expressions, accessories, proportions, left-to-right order and close standing arrangement. The four characters are: (1) blue low rounded two-lobed blob with two black oval eyes and a black beret with a tiny pom on top; (2) bright lime green rounded blob with two raised bulging white eyes and black pupils; (3) warm yellow rounded triangular blob with black round clear eyeglasses and tiny eyes behind; (4) vivid pink two-lobed rounded blob wearing black round sunglasses. No arms or legs, no added mouths, no changes to the four designs. Preserve the complete blue hat.
Remove the ChatGPT logo, all lettering, space background, camera/search icon, floor, shadows and reflections. Do not create new text or objects. Genuinely transparent background (alpha), NOT a checkerboard picture and NOT white.
Composition: a wide single row, all four fully visible, feet/bases aligned, roughly 3.4:1 group aspect ratio. Crop the canvas close around the quartet with only 3 percent transparent margin on each side and top/bottom, so the characters are large and readable at a small UI size. High-quality fluffy edge detail and clean non-halo alpha. Keep the original character appearances unchanged.
```
