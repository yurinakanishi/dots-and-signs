import { useCallback, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, RotateCcw, VideoOff } from 'lucide-react';
import { Dot } from './components/Dot';
import { SignDemo } from './components/SignDemo';
import { PracticeProgress } from './components/PracticeProgress';
import { LessonInput } from './components/LessonInput';
import { useHandCamera } from './hooks/useHandCamera';
import { useLiveCoach } from './hooks/useLiveCoach';
import { drawHands } from './lib/drawing';
import { lessons, SOURCE_URL } from './lib/lessons';
import { SignRecognizer, waitingFeedback } from './lib/recognition';
import type { Feedback, Frame, LessonId } from './lib/types';
import './styles.css';

export default function App() {
  const [selected, setSelected] = useState<LessonId>('hello');
  const [feedback, setFeedback] = useState(waitingFeedback);
  const current = useRef<LessonId>('hello');
  const recognizer = useRef<SignRecognizer | null>(new SignRecognizer('hello'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lesson = lessons.find((l) => l.id === selected)!;
  const reset = useCallback(() => {
    const recognitionId = lessons.find((item) => item.id === current.current)!.recognitionId;
    recognizer.current = recognitionId ? new SignRecognizer(recognitionId) : null;
    setFeedback(recognitionId ? waitingFeedback(recognitionId) : waitingFeedback());
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);
  const showFeedback = useCallback((next: Feedback) => {
    setFeedback((old) =>
      old.status === next.status &&
      old.message === next.message &&
      old.step === next.step &&
      old.completedSteps === next.completedSteps &&
      old.holdProgress === next.holdProgress &&
      old.handCount === next.handCount &&
      old.bodyVisible === next.bodyVisible &&
      old.trackingPaused === next.trackingPaused &&
      old.preparing === next.preparing &&
      old.demoFrame === next.demoFrame
        ? old
        : next,
    );
  }, []);
  const handleFrame = useCallback(
    (frame: Frame) => {
      if (!recognizer.current) {
        if (canvasRef.current) drawHands(canvasRef.current, frame, false);
        return;
      }
      const next = recognizer.current.update(frame, performance.now());
      showFeedback(next);
      if (canvasRef.current)
        drawHands(
          canvasRef.current,
          { ...frame, hands: recognizer.current.visibleHands },
          next.status === 'success',
        );
    },
    [showFeedback],
  );
  const handleTrackingPause = useCallback(
    (now: number) => {
      if (recognizer.current) showFeedback(recognizer.current.pauseTracking(now));
      const canvas = canvasRef.current;
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    },
    [showFeedback],
  );
  const pausePractice = useCallback(() => {
    if (recognizer.current) setFeedback(recognizer.current.pauseSession());
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);
  const camera = useHandCamera(handleFrame, pausePractice, handleTrackingPause);
  const active = camera.state === 'active';
  const busy = camera.state === 'loading' || camera.state === 'requesting';
  const guided = lesson.recognitionId !== null;
  const success = guided && feedback.status === 'success';
  const achievement = feedback.completedSteps;
  const canResume = achievement > 0 && !success;
  const hasPractice = active || achievement > 0;
  const earnedMessage =
    achievement === 1
      ? 'ステップ1はできたよ'
      : achievement === 2
        ? 'ステップ1・2はできたよ'
        : 'dots';
  function choose(id: LessonId) {
    if (id === current.current) return;
    current.current = id;
    setSelected(id);
    reset();
  }
  const coach = useLiveCoach(selected, choose);
  const cheer = !guided
    ? lesson.cheer
    : success
      ? lesson.cheer
      : active
        ? feedback.message
        : canResume
          ? `ステップ${feedback.step + 1}から続けられるよ。カメラをつけて、今のお手本をまねしてね。`
          : 'ゆっくりで大丈夫。いっしょにやってみよう。';

  return (
    <div className="app">
      <a className="skip-link" href="#practice">
        練習へ進む
      </a>
      <header className="site-header">
        <a className="brand" href="./" aria-label="dots & signs ホーム">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          dots <span className="brand-amp">&</span> signs
        </a>
        <div className="header-companion">
          <span className="header-caption">手から、つながろう。</span>
          <Dot color="pink" achievement={achievement} />
        </div>
      </header>
      <main id="practice" tabIndex={-1}>
        <div className="page-title">
          <p className="eyebrow">dotsと、はじめての手話</p>
          <h1>ひとことを、手話で。</h1>
          <p>お手本を見て、まねしてみよう。</p>
        </div>
        <LessonInput selected={selected} coach={coach} />
        <section
          className={`practice-card${hasPractice ? ' is-practicing' : ''}`}
          aria-labelledby="lesson-title"
        >
          <div className="lesson-heading">
            <div className="lesson-title-group">
              <h2 id="lesson-title">{lesson.label}</h2>
              <Dot color="yellow" achievement={achievement} />
            </div>
            {guided ? (
              <PracticeProgress lesson={lesson} feedback={feedback} active={active} />
            ) : (
              <span className="image-practice-label">画像を見て練習</span>
            )}
          </div>
          <div className="practice-grid">
            <SignDemo
              key={selected}
              lesson={lesson}
              feedback={guided && hasPractice ? feedback : undefined}
            />
            <section className="camera-panel" aria-label="カメラで練習">
              <div className="panel-label">
                <span>
                  {!guided
                    ? '画像と見比べよう'
                    : success
                      ? '3ステップ完了！'
                      : active
                        ? `ステップ ${feedback.step + 1} / 3`
                        : canResume
                          ? `ステップ${feedback.step + 1}から再開`
                          : 'やってみよう'}
                </span>
                <span className={active ? 'camera-status live' : 'camera-status'}>
                  <i />
                  {active ? 'カメラ ON' : 'カメラ OFF'}
                </span>
              </div>
              {guided && active && !success && (
                <div className="detection-status" aria-label="カメラの検出状態">
                  {feedback.trackingPaused ? (
                    <span className="detection-missing">
                      <i aria-hidden="true" />
                      認識を待っています
                    </span>
                  ) : (
                    <>
                      <span
                        className={
                          feedback.handCount >= feedback.requiredHands
                            ? 'detected'
                            : 'detection-missing'
                        }
                      >
                        <i aria-hidden="true" />
                        手を{feedback.handCount}本検出
                        <small>この段階は{feedback.requiredHands}本</small>
                      </span>
                      <span className={feedback.bodyVisible ? 'detected' : 'detection-missing'}>
                        {feedback.bodyVisible
                          ? '体の位置 OK'
                          : selected === 'hello' && feedback.completedSteps > 0
                            ? '肩も映してね'
                            : '顔と肩も映してね'}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div
                className={
                  'camera-stage' +
                  (active ? ' active-camera' : '') +
                  (success ? ' success-camera' : '')
                }
              >
                <video
                  ref={camera.videoRef}
                  className="camera-video mirrored"
                  autoPlay
                  playsInline
                  muted
                  aria-label="あなたのカメラ映像（鏡表示）"
                />
                <canvas ref={canvasRef} className="hand-overlay mirrored" aria-hidden="true" />
                {!active && !success && (
                  <div className="camera-empty">
                    <svg className="framing-guide" viewBox="0 0 200 150" aria-hidden="true">
                      <path
                        d="M20 38V20h22 M158 20h22v18 M180 112v18h-22 M42 130H20v-18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <circle
                        cx="100"
                        cy="58"
                        r="22"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M57 118q2-34 43-34t43 34"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    <h3>
                      {camera.state === 'loading'
                        ? '準備しています…'
                        : camera.state === 'requesting'
                          ? 'カメラを許可してね'
                          : camera.state === 'error'
                            ? 'カメラを確認しよう'
                            : canResume
                              ? '続きから練習しよう'
                              : '顔と両手を映してね'}
                    </h3>
                    {camera.state === 'error' ? (
                      <p className="camera-error" role="alert">
                        {camera.error}
                      </p>
                    ) : (
                      <p>
                        {busy
                          ? 'はじめての準備には少し時間がかかります。'
                          : canResume
                            ? `${earnedMessage}。あせらず、続けよう。`
                            : '少し離れて、胸のあたりまで。'}
                      </p>
                    )}
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void camera.start()}
                    >
                      {busy ? <LoaderCircle className="spin" size={18} /> : <Camera size={18} />}
                      {busy
                        ? '準備中'
                        : canResume
                          ? `ステップ${feedback.step + 1}から再開する`
                          : camera.state === 'error'
                            ? 'もう一度ためす'
                            : 'カメラで練習する'}
                    </button>
                    {busy && (
                      <button className="text-button" onClick={camera.stop}>
                        キャンセル
                      </button>
                    )}
                  </div>
                )}
                {success && (
                  <div className="success-overlay">
                    <span className="success-check">
                      <Check size={28} />
                    </span>
                    <h3>できたね！</h3>
                    <p>3つの動きを、順番に確認できたよ。</p>
                    <button className="text-button" onClick={reset}>
                      <RotateCcw size={14} />
                      もう一度
                    </button>
                  </div>
                )}
                {active && (
                  <button className="stop-camera" onClick={camera.stop}>
                    <VideoOff size={15} />
                    カメラをとめる
                  </button>
                )}
              </div>
              <div className="companion">
                <Dot color="green" achievement={achievement} />
                <div className="companion-message">
                  <div className="companion-caption">
                    <span>{earnedMessage}</span>
                    {canResume && (
                      <button
                        className="restart-practice"
                        onClick={reset}
                        aria-label="最初からやり直す"
                      >
                        <RotateCcw size={12} />
                        最初から
                      </button>
                    )}
                  </div>
                  <p role="status" aria-live="polite" aria-atomic="true">
                    {cheer}
                  </p>
                  {guided && active && !success && (
                    <div
                      className="hold-progress"
                      aria-label="今の形を保つ時間"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={1}
                      aria-valuenow={feedback.holdProgress}
                      aria-valuetext={
                        feedback.holdProgress > 0
                          ? 'その形で少し止めてね'
                          : 'お手本の形を待っています'
                      }
                    >
                      <i style={{ width: `${feedback.holdProgress * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </section>
        <footer className="page-footer">
          <p>映像はブラウザの中だけで処理。保存・送信しません。</p>
          <p>
            判定は手の動きの目安です。表情や会釈はお手本で確認してね。
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              教材・出典 ↗
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
