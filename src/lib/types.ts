export type SignId = '1' | '2' | '3' | '4' | '5' | '10';
export type Point = { x: number; y: number; z: number };
export type Hand = {
  landmarks: Point[];
  worldLandmarks: Point[];
  handedness: 'Left' | 'Right';
};
export type Frame = { hands: Hand[]; timestamp: number; width: number; height: number };
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export type FingerValues = Record<Finger, number>;
export type Feedback = {
  status: 'waiting' | 'adjust' | 'holding' | 'move' | 'success';
  message: string;
  detail: string;
  progress: number;
  checks: { visible: boolean; shape: boolean; orientation: boolean; steady: boolean };
};
export type WorkerResponse =
  | { type: 'ready' }
  | {
      type: 'result';
      hands: Hand[];
      timestamp: number;
      width: number;
      height: number;
      inferenceMs: number;
    }
  | { type: 'error'; message: string };
