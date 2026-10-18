import { useCallback, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  Heart,
  LoaderCircle,
  Moon,
  RotateCcw,
  Sun,
  VideoOff,
} from 'lucide-react';
import { Dot } from './components/Dot';
import { SignDemo } from './components/SignDemo';
import { useHandCamera } from './hooks/useHandCamera';
import { drawHands } from './lib/drawing';
import { lessons, SOURCE_URL } from './lib/lessons';
import { SignRecognizer, waitingFeedback } from './lib/recognition';
import type { Frame, SignId } from './lib/types';
import './styles.css';

const lessonIcons = { hello: Sun, evening: Moon, thanks: Heart };
export default function App() {
  const [selected, setSelected] = useState<SignId>('hello');
  const [feedback, setFeedback] = useState(waitingFeedback);
  const current = useRef<SignId>('hello');
  const recognizer = useRef(new SignRecognizer('hello'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lesson = lessons.find((l) => l.id === selected)!;
  const reset = useCallback(() => {
    recognizer.current.reset(current.current);
    setFeedback(waitingFeedback());
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);
  const handleFrame = useCallback((frame: Frame) => {
    const next = recognizer.current.update(frame);
    setFeedback((old) =>
      old.status === next.status && old.message === next.message && old.step === next.step
        ? old
        : next,
    );
    if (canvasRef.current) drawHands(canvasRef.current, frame, next.status === 'success');
  }, []);
  const camera = useHandCamera(handleFrame, reset);
  const active = camera.state === 'active';
  const busy = camera.state === 'loading' || camera.state === 'requesting';
  const success = active && feedback.status === 'success';
  function choose(id: SignId) {
    current.current = id;
    setSelected(id);
    reset();
  }
  const cheer = success
    ? lesson.cheer
    : active
      ? feedback.message
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
          </span>
          dots <span className="brand-amp">&</span> signs
        </a>
        <span className="header-caption">手から、つながろう。</span>
      </header>
      <main id="practice" tabIndex={-1}>
        <div className="page-title">
          <p className="eyebrow">dotsと、はじめての手話</p>
          <h1>ひとことを、手話で。</h1>
          <p>お手本を見て、まねしてみよう。</p>
        </div>
        <nav className="lesson-tabs" aria-label="練習することば">
          {lessons.map((item) => {
            const Icon = lessonIcons[item.id];
            return (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                className={selected === item.id ? 'lesson-tab selected' : 'lesson-tab'}
                onClick={() => choose(item.id)}
              >
                <Icon size={18} strokeWidth={1.7} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <section className="practice-card" aria-labelledby="lesson-title">
          <div className="lesson-heading">
            <h2 id="lesson-title">{lesson.label}</h2>
            <p>{lesson.intro}</p>
          </div>
          <div className="practice-grid">
            <SignDemo key={selected} lesson={lesson} />
            <section className="camera-panel" aria-label="カメラで練習">
              <div className="panel-label">
                <span>やってみよう</span>
                <span className={active ? 'camera-status live' : 'camera-status'}>
                  <i />
                  {active ? 'カメラ ON' : 'カメラ OFF'}
                </span>
              </div>
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
                {!active && (
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
                {active && !success && (
                  <div className="live-step">
                    <span>{feedback.step + 1}</span>
                    {lesson.steps[feedback.step]}
                  </div>
                )}
                {success && (
                  <div className="success-overlay">
                    <span className="success-check">
                      <Check size={28} />
                    </span>
                    <h3>できたね！</h3>
                    <p>手の動きを確認できたよ。</p>
                    <button
                      className="primary-button"
                      onClick={() =>
                        choose(lessons[(lessons.indexOf(lesson) + 1) % lessons.length].id)
                      }
                    >
                      次のことばへ
                      <ArrowRight size={17} />
                    </button>
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
              <div className="companion" aria-live="polite" aria-atomic="true">
                <Dot mood={success ? 'happy' : active ? 'thinking' : 'idle'} />
                <div className="companion-message">
                  <span>dots</span>
                  <p>{cheer}</p>
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
