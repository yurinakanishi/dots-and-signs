import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame, WorkerResponse } from '../lib/types';
import { isFreshFrame, MAX_FRAME_AGE_MS } from '../lib/frameTiming';

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

export function useHandCamera(
  onFrame: (frame: Frame) => void,
  onStop: () => void,
  onTrackingPause: (now: number) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>('off');
  const [error, setError] = useState('');
  const [latency, setLatency] = useState(0);
  const onFrameRef = useRef(onFrame);
  const onStopRef = useRef(onStop);
  const onTrackingPauseRef = useRef(onTrackingPause);
  onFrameRef.current = onFrame;
  onStopRef.current = onStop;
  onTrackingPauseRef.current = onTrackingPause;
  const resources = useRef<{
    worker?: Worker;
    stream?: MediaStream;
    raf?: number;
    videoCallback?: number;
    timeout?: ReturnType<typeof setTimeout>;
    watchdog?: ReturnType<typeof setInterval>;
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
    if (r.videoCallback !== undefined) videoRef.current?.cancelVideoFrameCallback(r.videoCallback);
    clearTimeout(r.timeout);
    clearInterval(r.watchdog);
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
      // Invalidate the stable public worker URL when its detection configuration changes.
      const worker = new Worker(`${import.meta.env.BASE_URL}vision-worker.js?v=two-hands-20261018`);
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
              new Error('練習の準備ができませんでした。接続を確認して、もう一度ためしてください。'),
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
      const hasFrameQuality = typeof video.getVideoPlaybackQuality === 'function';
      const hasVideoCallback = typeof video.requestVideoFrameCallback === 'function';
      if (!hasFrameQuality && !hasVideoCallback)
        throw new Error('映像の更新を確認できません。PCのChromeまたはEdgeで開いてください。');
      let busy = false,
        lastFrame = -1,
        lastSent = -Infinity,
        lastLatency = -Infinity,
        lastAcceptedAt = performance.now(),
        lastVideoAt = performance.now(),
        observedVideoFrame = 0,
        presentedFrames = 0;
      const videoFrame = () => {
        if (!hasFrameQuality) return presentedFrames;
        const quality = video.getVideoPlaybackQuality();
        return quality.totalVideoFrames - quality.droppedVideoFrames;
      };
      const observeVideo = (now: number) => {
        const count = videoFrame();
        if (video.readyState >= 2 && count !== observedVideoFrame) {
          observedVideoFrame = count;
          lastVideoAt = now;
        }
        return count;
      };
      let pendingTimestamp: number | null = null;
      worker.onerror = () => fail('手の検出が停止しました。カメラを再起動してください。');
      worker.onmessageerror = () =>
        fail('手の検出結果を読み取れません。カメラを再起動してください。');
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (!isCurrent()) return;
        if (data.type === 'error') {
          console.error('Vision inference:', data.message);
          fail('手の検出を続けられませんでした。カメラを再起動してください。');
          return;
        }
        // Match the single in-flight capture. Duplicates and unrelated responses
        // must not unlock another capture or contribute to a gesture hold.
        if (data.type !== 'result' || data.timestamp !== pendingTimestamp) return;
        clearTimeout(resources.current.timeout);
        pendingTimestamp = null;
        busy = false;
        const now = performance.now();
        if (isFreshFrame(data.timestamp, now)) {
          lastAcceptedAt = data.timestamp;
          onFrameRef.current(data);
        } else {
          onTrackingPauseRef.current(now);
        }
        if (data.timestamp - lastLatency > 1000) {
          setLatency(Math.round(data.inferenceMs));
          lastLatency = data.timestamp;
        }
        // As in CRO-MAGNON, consume the result immediately and capture the
        // newest available frame without queuing behind a render callback.
        void capture();
      };
      const capture = async () => {
        if (!isCurrent()) return;
        const timestamp = performance.now();
        const currentFrame = observeVideo(timestamp);
        if (
          document.hidden ||
          busy ||
          video.readyState < 2 ||
          currentFrame === 0 ||
          currentFrame === lastFrame ||
          timestamp - lastSent < 65
        )
          return;
        busy = true;
        pendingTimestamp = timestamp;
        lastFrame = currentFrame;
        lastSent = timestamp;
        resources.current.timeout = setTimeout(
          () => fail('手の検出が応答しませんでした。カメラを再起動してください。'),
          8000,
        );
        try {
          const bitmap = await createImageBitmap(video);
          if (!isCurrent()) {
            bitmap.close();
            return;
          }
          worker.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]);
        } catch {
          fail('カメラ映像を読み取れませんでした。カメラを再起動してください。');
        }
      };
      const tick = () => {
        if (!isCurrent()) return;
        resources.current.raf = requestAnimationFrame(tick);
        void capture();
      };
      const videoTick: VideoFrameRequestCallback = (_now, metadata) => {
        if (!isCurrent()) return;
        presentedFrames = metadata.presentedFrames;
        resources.current.videoCallback = video.requestVideoFrameCallback(videoTick);
        void capture();
      };
      resources.current.watchdog = setInterval(() => {
        if (!isCurrent() || document.hidden) return;
        const now = performance.now();
        // Video playback and recognition can stall independently. Neither may
        // leave an old skeleton over a live preview or earn further progress.
        // A MediaStream's currentTime may advance with no new pixels. Use
        // decoded/displayed frame counts, also when video callbacks are throttled.
        observeVideo(now);
        if (now - lastVideoAt >= 8000) {
          fail('カメラ映像が更新されませんでした。カメラを再起動してください。');
          return;
        }
        if (now - lastAcceptedAt >= MAX_FRAME_AGE_MS) onTrackingPauseRef.current(now);
        void capture();
      }, 100);
      stream
        .getVideoTracks()
        .forEach((track) =>
          track.addEventListener('ended', () =>
            fail('カメラとの接続が切れました。接続を確認して、もう一度お試しください。'),
          ),
        );
      setState('active');
      if (hasVideoCallback)
        resources.current.videoCallback = video.requestVideoFrameCallback(videoTick);
      else resources.current.raf = requestAnimationFrame(tick);
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
