/* Pinned MediaPipe runtime, hosted on this origin. No camera data leaves the browser. */
let landmarker;
let poseLandmarker;
let ready = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      self.exports = {};
      importScripts('./vendor/mediapipe/vision_bundle.js');
      const { FilesetResolver, HandLandmarker, PoseLandmarker } = self.exports;
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
      poseLandmarker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL('./models/pose_landmarker_lite.task', self.location.href).href,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        // The exercise is for one signer; a second tracking slot can retain a
        // duplicate body track during occlusion and make a single user unusable.
        numPoses: 1,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
        outputSegmentationMasks: false,
      });
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
      // Same image and timestamp; never reuse stale body anchors across frames.
      const poseResult = poseLandmarker.detectForVideo(bitmap, timestamp);
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
        poses: poseResult.landmarks,
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
