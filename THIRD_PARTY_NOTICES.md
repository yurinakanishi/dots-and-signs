# Third-party notices

- **MediaPipe Tasks Vision**: Google / MediaPipe Authors, Apache-2.0. Runtime copied from the exact npm dependency; the model is downloaded from Google's versioned MediaPipe model bucket. Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- **React / React DOM**: Meta Platforms and contributors, MIT.
- **Lucide React**: Lucide contributors, ISC.
- **Vite**: Vite contributors, MIT. **Vitest**: Vitest contributors, MIT.
- **DM Sans** and **Noto Sans JP**: SIL Open Font License 1.1, self-hosted via Fontsource Variable. License files remain in their npm packages. Fontsource: https://fontsource.org/
- **MediaPipe test photographs**: `pointing_up.jpg`, `victory.jpg`, `thumb_up.jpg` from https://storage.googleapis.com/mediapipe-assets/, used only for local development verification. They are referenced by the [MediaPipe official tests](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/hand_landmarker_test.py). Downloaded into ignored `output/fixtures/`, not shipped in the app or committed to the repository. Do not infer an independent redistribution license for the photographs from the test source's code license.
- **Curriculum references**: [3Dモデルで学ぶ手話 — 数字](https://mv.baika.ac.jp/imamura/www/suuji.html), © Ayumi Kishimoto, and [神奈川県 指文字（数字）](https://www.pref.kanagawa.jp/docs/dc4/cnt/f533708/p1112883.html). The app links to the original materials and uses original schematic SVGs; it does not redistribute their images or videos.
- **dots inspiration**: OpenAI's [Introducing dots](https://openai.com/index/introducing-dots/). OpenAI and dots names belong to their respective owner. The companion illustration in this repository is original SVG artwork for this independent hackathon prototype. No affiliation, endorsement, or connection to a dots account is represented.

When distributing builds, preserve the licenses required by included dependencies and fonts. Large generated model/runtime/font assets are distinct from the application source.
