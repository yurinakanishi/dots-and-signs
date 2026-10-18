export type SignId = 'hello' | 'evening' | 'thanks';
export type Point = { x: number; y: number; z: number };
export type PosePoint = Point & { visibility: number };
export type Hand = {
  landmarks: Point[];
  worldLandmarks: Point[];
  handedness: 'Left' | 'Right';
};
export type Frame = {
  hands: Hand[];
  poses: PosePoint[][];
  timestamp: number;
  width: number;
  height: number;
};
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export type FingerValues = Record<Finger, number>;
export type Feedback = {
  status: 'waiting' | 'adjust' | 'move' | 'success';
  message: string;
  step: number;
};
export type WorkerResponse =
  | { type: 'ready' }
  | ({ type: 'result'; inferenceMs: number } & Frame)
  | { type: 'error'; message: string };
