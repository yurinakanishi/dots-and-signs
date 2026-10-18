# Third-party notices

- **MediaPipe Tasks Vision**: Google / MediaPipe Authors, Apache-2.0. Runtime copied from the exact npm dependency; the model is downloaded from Google's versioned MediaPipe model bucket. Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- **React / React DOM**: Meta Platforms and contributors, MIT.
- **Lucide React**: Lucide contributors, ISC.
- **Vite**: Vite contributors, MIT. **Vitest**: Vitest contributors, MIT.
- **DM Sans** and **Noto Sans JP**: SIL Open Font License 1.1, self-hosted via Fontsource Variable. License files remain in their npm packages. Fontsource: https://fontsource.org/
- **MediaPipe test photographs**: `pointing_up.jpg`, `victory.jpg`, `thumb_up.jpg` from https://storage.googleapis.com/mediapipe-assets/, used only for local development verification. They are referenced by the [MediaPipe official tests](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/hand_landmarker_test.py). Downloaded into ignored `output/fixtures/`, not shipped in the app or committed to the repository. Do not infer an independent redistribution license for the photographs from the test source's code license.
- **Curriculum references**: [秋田市「手話を覚えよう！」](https://www.city.akita.lg.jp/kurashi/shogaifukushi/1006373/1004961.html), with materials provided by 秋田県聴力障害者協会. [奈良市「あいさつ編」](https://www.city.nara.lg.jp/soshiki/34/77111.html) is an additional research reference. The app links to the original materials and uses original schematic SVGs; it does not redistribute their images or videos.
- **Pose model and test photograph**: Google MediaPipe Pose Landmarker Lite, fixed model version 1; `pose.jpg` from the same official test asset bucket, referenced by the [official pose tests](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/pose_landmarker_test.py). The photograph is used only in ignored local test fixtures and is not distributed. Both model hashes are pinned in `scripts/vision-models.mjs`.
- **dots inspiration**: OpenAI's [Introducing dots](https://openai.com/index/introducing-dots/). OpenAI and dots names belong to their respective owner. The companion illustration in this repository is original SVG artwork for this independent hackathon prototype. No affiliation, endorsement, or connection to a dots account is represented.

When distributing builds, preserve the licenses required by included dependencies and fonts. Large generated model/runtime/font assets are distinct from the application source.
