import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame, WorkerResponse } from '../lib/types';

export type CameraState = 'off' | 'loading' | 'requesting' | 'active' | 'error';

export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return 'カメラが許可されていません。ブラウザのアドレスバーからカメラを許可して、もう一度お試しください。';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'カメラが見つかりません。PCにカメラを接続して、もう一度お試しください。';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'カメラを開けませんでした。ほかのアプリでカメラを使っていないか確認してください。';
  if (name === 'OverconstrainedError')
    return 'このカメラの設定を利用できません。別のカメラでお試しください。';
  return error instanceof Error
    ? error.message
    : 'カメラの準備に失敗しました。ページを再読み込みしてお試しください。';
}

export function useHandCamera(onFrame: (frame: Frame) => void, onStop: () => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>('off');
  const [error, setError] = useState('');
  const [latency, setLatency] = useState(0);
  const onFrameRef = useRef(onFrame);
  const onStopRef = useRef(onStop);
  onFrameRef.current = onFrame;
  onStopRef.current = onStop;
  const resources = useRef<{
    worker?: Worker;
    stream?: MediaStream;
    raf?: number;
    timeout?: ReturnType<typeof setTimeout>;
    cancelInit?: () => void;
  }>({});
  const generation = useRef(0);

  const dispose = useCallback(() => {
    generation.current++;
    const r = resources.current;
    r.cancelInit?.();
    r.worker?.terminate();
    r.stream?.getTracks().forEach((track) => track.stop());
    if (r.raf !== undefined) cancelAnimationFrame(r.raf);
    clearTimeout(r.timeout);
    resources.current = {};
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    dispose();
    setState('off');
    setLatency(0);
    onStopRef.current();
  }, [dispose]);

  const start = useCallback(async () => {
    dispose();
    onStopRef.current();
    const session = generation.current;
    const isCurrent = () => generation.current === session;
    setError('');
    setLatency(0);
    setState('loading');
    const fail = (message: string) => {
      if (!isCurrent()) return;
      dispose();
      setError(message);
      setState('error');
      onStopRef.current();
    };
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'カメラには localhost または HTTPS でアクセスしてください。Chrome・Edgeの最新版をおすすめします。',
        );
      if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap)
        throw new Error(
          'このブラウザは手の検出に対応していません。PCのChromeまたはEdgeで開いてください。',
        );
      const worker = new Worker(`${import.meta.env.BASE_URL}vision-worker.js`);
      resources.current.worker = worker;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                '手の検出モデルの準備がタイムアウトしました。ページを再読み込みしてお試しください。',
              ),
            ),
          30_000,
        );
        resources.current.cancelInit = () => {
          clearTimeout(timeout);
          reject(new Error('cancelled'));
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          reject(
            new Error(
              '手の検出を起動できませんでした。モデルのセットアップとブラウザの対応状況を確認してください。',
            ),
          );
        };
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (data.type === 'ready') {
            clearTimeout(timeout);
            resources.current.cancelInit = undefined;
            resolve();
          }
          if (data.type === 'error') {
            clearTimeout(timeout);
            console.error('Vision initialization:', data.message);
            reject(
              new Error(
                '手の検出モデルを読み込めませんでした。READMEの「モデルの準備」を確認してください。',
              ),
            );
          }
        };
        worker.postMessage({ type: 'init' });
      });
      if (!isCurrent()) return;
      setState('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 30, max: 30 },
        },
      });
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.current.stream = stream;
      const video = videoRef.current;
      if (!video) throw new Error('カメラの表示領域が見つかりません。再読み込みしてください。');
      video.srcObject = stream;
      await video.play();
      if (!isCurrent()) return;
      let busy = false,
        lastFrame = -1,
        lastSent = -Infinity,
        lastLatency = -Infinity;
      worker.onerror = () => fail('手の検出が停止しました。カメラを再起動してください。');
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (!isCurrent()) return;
        clearTimeout(resources.current.timeout);
        busy = false;
        if (data.type === 'error') {
          console.error('Vision inference:', data.message);
          fail('手の検出を続けられませんでした。カメラを再起動してください。');
          return;
        }
        if (data.type !== 'result') return;
        onFrameRef.current(data);
        if (data.timestamp - lastLatency > 1000) {
          setLatency(Math.round(data.inferenceMs));
          lastLatency = data.timestamp;
        }
      };
      const tick = async (timestamp: number) => {
        if (!isCurrent()) return;
        resources.current.raf = requestAnimationFrame(tick);
        if (
          busy ||
          video.readyState < 2 ||
          video.currentTime === lastFrame ||
          timestamp - lastSent < 65
        )
          return;
        busy = true;
        lastFrame = video.currentTime;
        lastSent = timestamp;
        try {
          const bitmap = await createImageBitmap(video);
          if (!isCurrent()) {
            bitmap.close();
            return;
          }
          resources.current.timeout = setTimeout(
            () => fail('手の検出が応答しませんでした。カメラを再起動してください。'),
            8000,
          );
          worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]);
        } catch {
          fail('カメラ映像を読み取れませんでした。カメラを再起動してください。');
        }
      };
      stream
        .getVideoTracks()
        .forEach((track) =>
          track.addEventListener('ended', () =>
            fail('カメラとの接続が切れました。接続を確認して、もう一度お試しください。'),
          ),
        );
      setState('active');
      resources.current.raf = requestAnimationFrame(tick);
    } catch (err) {
      if (isCurrent()) fail(cameraError(err));
    }
  }, [dispose]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      dispose();
    };
  }, [dispose, stop]);

  return { state, error, latency, videoRef, start, stop };
}
