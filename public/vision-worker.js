/* Pinned MediaPipe runtime, hosted on this origin. No camera data leaves the browser. */
let landmarker;
let ready = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      self.exports = {};
      importScripts('./vendor/mediapipe/vision_bundle.js');
      const { FilesetResolver, HandLandmarker } = self.exports;
      const files = await FilesetResolver.forVisionTasks(
        new URL('./vendor/mediapipe/wasm', self.location.href).href,
      );
      const options = {
        baseOptions: {
          modelAssetPath: new URL('./models/hand_landmarker.task', self.location.href).href,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7,
      };
      landmarker = await HandLandmarker.createFromOptions(files, options);
      ready = true;
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (data.type === 'frame') {
    const { bitmap, timestamp } = data;
    try {
      if (!ready) throw new Error('Hand tracker is not ready');
      const start = performance.now();
      const result = landmarker.detectForVideo(bitmap, timestamp);
      const hands = result.landmarks.map((landmarks, i) => ({
        landmarks,
        worldLandmarks: result.worldLandmarks[i],
        // Verified against pointing_up/victory and their horizontal flips using
        // this exact Tasks model. Do not apply legacy mp.solutions.hands swaps.
        // Only the displayed video is mirrored; inference pixels stay unmirrored.
        handedness: result.handedness[i]?.[0]?.categoryName === 'Right' ? 'Right' : 'Left',
      }));
      self.postMessage({
        type: 'result',
        hands,
        timestamp,
        width: bitmap.width,
        height: bitmap.height,
        inferenceMs: performance.now() - start,
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      bitmap.close();
    }
  }
};
