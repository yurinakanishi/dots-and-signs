import { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Hand,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  VideoOff,
  X,
} from 'lucide-react';
import { Dot } from './components/Dot';
import { HandIllustration } from './components/HandIllustration';
import { Modal } from './components/Modal';
import { useHandCamera } from './hooks/useHandCamera';
import { drawHands } from './lib/drawing';
import { lessons, SOURCE_URL } from './lib/lessons';
import { clearProgress, readProgress, recordCompletion } from './lib/progress';
import { SignRecognizer, waitingFeedback } from './lib/recognition';
import type { Frame, SignId } from './lib/types';
import './styles.css';

type View = 'practice' | 'progress' | 'about';
export default function App() {
  const [view, setView] = useState<View>('practice');
  const [selected, setSelected] = useState<SignId>('1');
  const [feedback, setFeedback] = useState(waitingFeedback);
  const [progress, setProgress] = useState(readProgress);
  const [demo, setDemo] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [leftHand, setLeftHand] = useState(false);
  const [guide, setGuide] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const recognizer = useRef(new SignRecognizer('1'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const awarded = useRef(false);
  const currentSign = useRef<SignId>('1');
  const lesson = lessons.find((l) => l.id === selected)!;
  const lessonIndex = lessons.indexOf(lesson);
  const completed = Object.keys(progress.completed).length;

  const reset = useCallback(() => {
    recognizer.current.reset(currentSign.current);
    awarded.current = false;
    setFeedback(waitingFeedback());
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);
  const handleFrame = useCallback((frame: Frame) => {
    const next = recognizer.current.update(frame);
    setFeedback(next);
    if (canvasRef.current) drawHands(canvasRef.current, frame, next.status === 'success');
    if (next.status === 'success' && !awarded.current) {
      awarded.current = true;
      setProgress((previous) => recordCompletion(previous, currentSign.current));
    }
  }, []);
  const camera = useHandCamera(handleFrame, reset);
  const busy = camera.state === 'loading' || camera.state === 'requesting';
  const active = camera.state === 'active';
  const success = active && feedback.status === 'success';
  const navigate = (next: View) => {
    camera.stop();
    setDemo(false);
    setView(next);
  };
  const choose = (id: SignId) => {
    currentSign.current = id;
    setSelected(id);
    reset();
    setPlaying(true);
  };
  const openDemo = () => {
    camera.stop();
    setDemo(true);
    setPlaying(true);
  };
  const startCamera = () => {
    setDemo(false);
    void camera.start();
  };
  const nextLesson = () => {
    if (lessonIndex < lessons.length - 1) choose(lessons[lessonIndex + 1].id);
    else navigate('progress');
  };
  const encouragement = success
    ? lesson.cheer
    : active && feedback.status === 'holding'
      ? 'そう、その調子！\nゆっくりで大丈夫だよ。'
      : active && feedback.status === 'adjust'
        ? 'あせらなくて大丈夫。\nいっしょに、もう一度。'
        : '小さな「できた」を、\nいっしょに増やそう。';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        メインコンテンツへ
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate('practice')}
          aria-label="dots & signs ホーム"
        >
          <span className="brand-symbol">
            <i />
            <i />
          </span>
          <span>
            dots<span className="brand-amp">&</span>signs
            <span className="brand-caption">手から、つながろう。</span>
          </span>
        </button>
        <span className="sidebar-label">YOUR LITTLE LEARNING SPACE</span>
        <nav className="main-nav" aria-label="メインメニュー">
          <button
            aria-label="手話をれんしゅう"
            className={view === 'practice' ? 'nav-item selected' : 'nav-item'}
            onClick={() => navigate('practice')}
            aria-current={view === 'practice' ? 'page' : undefined}
          >
            <Hand size={19} />
            <span>手話をれんしゅう</span>
            <span className="nav-dot" />
          </button>
          <button
            aria-label="学習のきろく"
            className={view === 'progress' ? 'nav-item selected' : 'nav-item'}
            onClick={() => navigate('progress')}
            aria-current={view === 'progress' ? 'page' : undefined}
          >
            <Sprout size={19} />
            <span>学習のきろく</span>
            {completed > 0 && <span className="nav-count">{completed}</span>}
          </button>
          <button
            aria-label="このアプリについて"
            className={view === 'about' ? 'nav-item selected' : 'nav-item'}
            onClick={() => navigate('about')}
            aria-current={view === 'about' ? 'page' : undefined}
          >
            <BookOpen size={18} />
            <span>このアプリについて</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span className="note-star">✳</span>
            <p>
              うまくできる日も、
              <br />
              まだむずかしい日も。
            </p>
            <span>一歩ずつ、きみのペースで。</span>
            <svg viewBox="0 0 160 28" aria-hidden="true">
              <path d="M10 14Q40 2 70 14T150 10" fill="none" stroke="#b8c891" strokeWidth="2" />
            </svg>
          </div>
          <div className="sidebar-footer">
            <span className="online-dot" />
            MADE FOR SMALL BEGINNINGS<span>DevDay project · 2026</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="breadcrumb">
            <span>マイラーニング</span>
            <ChevronRight size={14} />
            <strong>
              {view === 'practice'
                ? 'はじめての手話'
                : view === 'progress'
                  ? '学習のきろく'
                  : 'このアプリについて'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="language-tag">日本の手話</span>
            <span className="top-progress">
              <Star size={16} />
              {completed}
              <span>/ 6</span>
            </span>
            <button
              className="help-button"
              onClick={() => setGuide(true)}
              aria-label="使い方を見る"
            >
              <CircleHelp size={20} />
            </button>
          </div>
        </header>

        {view === 'practice' && (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span />A LITTLE PRACTICE, A LITTLE CONNECTION
                </div>
                <h1>
                  ことばは、手からも伝わる<span className="heading-dot">。</span>
                </h1>
                <p>カメラの前で、まねしてみよう。dotsがそばで応援するよ。</p>
              </div>
              <div className="chapter-badge">
                <Leaf size={16} />
                はじめの一歩<span>01</span>
              </div>
            </section>

            <section className="lesson-strip" aria-label="数字のレッスン">
              <div className="strip-label">
                <span className="tiny-label">LESSON COLLECTION</span>
                <strong>数字を伝えよう</strong>
              </div>
              <div className="lesson-buttons">
                {lessons.map((item, index) => (
                  <button
                    key={item.id}
                    className={`lesson-button ${selected === item.id ? 'current' : ''} ${progress.completed[item.id] ? 'completed' : ''}`}
                    onClick={() => choose(item.id)}
                    aria-pressed={selected === item.id}
                    aria-label={`数字${item.id}のレッスン${progress.completed[item.id] ? '・クリア済み' : ''}`}
                  >
                    <span className="lesson-number">{item.id}</span>
                    <span className="lesson-reading">{item.reading}</span>
                    {progress.completed[item.id] ? (
                      <Check className="lesson-check" size={12} />
                    ) : index === 5 ? (
                      <span className="motion-mark">動き</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="strip-end">
                <span>
                  {lessonIndex + 1} <span>/ 6</span>
                </span>
                <small>自分のペースで</small>
              </div>
            </section>

            <div className="workspace">
              <section className="practice-panel" aria-label="カメラで手話を練習">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">LET’S TRY</span>
                    <h2>
                      数字「{selected}」<span>{lesson.subtitle}</span>
                    </h2>
                  </div>
                  <button className="text-button" onClick={() => setGuide(true)}>
                    <CircleHelp size={15} />
                    使い方
                  </button>
                </div>
                <div
                  className={`camera-stage ${active ? 'camera-active' : ''} ${demo ? 'demo-stage' : ''} ${success ? 'camera-success' : ''}`}
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
                  <div className="stage-topline">
                    <span className={`stage-status ${active ? 'is-live' : ''}`}>
                      <span />
                      {active
                        ? 'カメラ ON'
                        : busy
                          ? '準備中'
                          : demo
                            ? 'お手本モード'
                            : 'カメラ OFF'}
                    </span>
                    <span className="stage-mirror">
                      {active ? '鏡表示' : demo ? '判定・記録はしません' : 'YOUR PRACTICE SPACE'}
                    </span>
                  </div>
                  {!active && !demo && (
                    <div className="camera-empty">
                      <div className="empty-illustration">
                        <div className="empty-orbit" />
                        <HandIllustration sign="4" ghost />
                        <span className="camera-dot">
                          <Camera size={19} />
                        </span>
                        <span className="deco-plus">+</span>
                        <span className="deco-dot" />
                      </div>
                      <h3>
                        {camera.state === 'loading'
                          ? '手を見る準備をしています…'
                          : camera.state === 'requesting'
                            ? 'カメラの使用を許可してください'
                            : camera.state === 'error'
                              ? 'カメラを確認してみよう'
                              : 'きみの手が、ことばになる。'}
                      </h3>
                      {camera.state === 'error' ? (
                        <p className="camera-error" role="alert">
                          {camera.error}
                        </p>
                      ) : (
                        <p>
                          {busy
                            ? 'もうすぐ、いっしょに練習をはじめられるよ。'
                            : 'カメラをオンにして、最初の手話をやってみよう。'}
                        </p>
                      )}
                      <button className="primary-button" onClick={startCamera} disabled={busy}>
                        {busy ? <LoaderCircle className="spin" size={18} /> : <Camera size={18} />}
                        {busy
                          ? '準備しています'
                          : camera.state === 'error'
                            ? 'もう一度、カメラを開く'
                            : 'カメラをオンにする'}
                        {!busy && <ArrowRight size={17} />}
                      </button>
                      {busy ? (
                        <button className="subtle-button" onClick={camera.stop}>
                          キャンセル
                        </button>
                      ) : (
                        <button className="subtle-button" onClick={openDemo}>
                          <Play size={12} fill="currentColor" />
                          カメラなしでお手本を見る
                        </button>
                      )}
                    </div>
                  )}
                  {demo && (
                    <div className="demo-content">
                      <HandIllustration sign={selected} playing={playing} left={leftHand} />
                      <div className="demo-copy">
                        <span>NUMBER {selected}</span>
                        <h3>{lesson.description}</h3>
                        <p>
                          {selected === '10'
                            ? '「伸ばす → 曲げる」の動きをまねしてみよう。'
                            : '鏡のお手本。同じ形を作ってみよう。'}
                        </p>
                        <button className="primary-button" onClick={startCamera}>
                          <Camera size={17} />
                          カメラでやってみる
                        </button>
                      </div>
                      <button
                        className="close-demo icon-button"
                        aria-label="お手本モードを閉じる"
                        onClick={() => setDemo(false)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}
                  {active && (
                    <>
                      <div className="camera-guide">
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      {!success && <div className="live-prompt">{feedback.message}</div>}
                      {success && (
                        <div className="success-overlay">
                          <span className="success-seal">
                            <Check size={32} strokeWidth={2} />
                          </span>
                          <h3>できたね！</h3>
                          <p>数字「{selected}」が伝わったよ。</p>
                          <button className="primary-button" onClick={nextLesson}>
                            {lessonIndex === 5 ? '今日のきろくを見る' : '次のレッスンへ'}
                            <ArrowRight size={17} />
                          </button>
                          <button className="subtle-button" onClick={reset}>
                            <RotateCcw size={13} />
                            もう一度れんしゅう
                          </button>
                        </div>
                      )}
                      <button className="stop-camera" onClick={camera.stop}>
                        <VideoOff size={16} />
                        カメラを停止
                      </button>
                    </>
                  )}
                  <span className="camera-corner corner-tl" />
                  <span className="camera-corner corner-tr" />
                  <span className="camera-corner corner-bl" />
                  <span className="camera-corner corner-br" />
                </div>
                <div className="camera-privacy">
                  <LockKeyhole size={13} />
                  <span>映像はこのPCの中だけで処理。保存・送信しません。</span>
                  {active && (
                    <span className="latency">
                      {camera.latency > 0 ? `${camera.latency} ms / frame` : '検出を開始中'}
                    </span>
                  )}
                </div>
                <div className={`feedback-panel ${success ? 'feedback-success' : ''}`}>
                  <div className="feedback-icon">
                    {success ? <CheckCheck size={21} /> : <Maximize size={20} />}
                  </div>
                  <div className="feedback-text" aria-live="polite">
                    <strong>
                      {active
                        ? feedback.message
                        : demo
                          ? 'まずは、お手本をじっくり見てみよう。'
                          : '準備ができたら、片手をカメラの前へ。'}
                    </strong>
                    <span>
                      {active
                        ? feedback.detail
                        : '明るい場所で、指先から手首まで映すと練習しやすいよ。'}
                    </span>
                  </div>
                  <div
                    className="hold-ring"
                    style={{ '--progress': `${feedback.progress * 100}%` } as React.CSSProperties}
                  >
                    <span>
                      {success ? (
                        <Check size={18} />
                      ) : (
                        <span>
                          {Math.round(feedback.progress * 100)}
                          <small>%</small>
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="check-row" aria-label="判定の確認項目">
                  {(
                    [
                      ['visible', '手が見えている'],
                      ['orientation', '手の向き'],
                      ['shape', '指の形'],
                      ['steady', selected === '10' ? '動きの順序' : 'キープ'],
                    ] as const
                  ).map(([key, label]) => (
                    <span
                      className={
                        active && feedback.checks[key] ? 'check-item checked' : 'check-item'
                      }
                      key={key}
                    >
                      <span>{active && feedback.checks[key] ? <Check size={10} /> : <span />}</span>
                      {label}
                    </span>
                  ))}
                </div>
              </section>

              <aside className="learning-aside">
                <section
                  className={`companion-card ${success ? 'companion-happy' : ''}`}
                  aria-label="dotsの応援"
                >
                  <div className="companion-heading">
                    <span>
                      <span className="online-dot" />
                      YOUR LEARNING BUDDY
                    </span>
                    <Sparkles size={16} />
                  </div>
                  <Dot mood={success ? 'happy' : busy ? 'thinking' : 'idle'} />
                  <div className="companion-message" aria-live="polite">
                    {encouragement.split('\n').map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                  </div>
                  <span className="dot-signature">with a little help from dots</span>
                </section>
                <section className="reference-card">
                  <div className="reference-heading">
                    <h3>
                      <BookOpen size={15} />
                      お手本
                    </h3>
                    <button
                      className="text-button hand-switch"
                      onClick={() => setLeftHand((v) => !v)}
                      aria-label={`お手本を${leftHand ? '右手' : '左手'}に切り替える`}
                    >
                      {leftHand ? '左手' : '右手'}
                      <RotateCcw size={12} />
                    </button>
                  </div>
                  <div className="reference-visual">
                    <span className="reference-number">{selected}</span>
                    <HandIllustration sign={selected} playing={playing} left={leftHand} />
                    <span className="reference-reading">{lesson.reading}</span>
                    {selected === '10' && (
                      <button
                        className="animation-toggle icon-button"
                        onClick={() => setPlaying((v) => !v)}
                        aria-label={playing ? 'お手本の動きを止める' : 'お手本の動きを再生する'}
                      >
                        {playing ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                    )}
                  </div>
                  <span className="mirror-caption">鏡のように、まねしてね</span>
                  <ol className="instruction-list">
                    {lesson.steps.map((step, index) => (
                      <li key={step}>
                        <span>{index + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <div className="tip">
                    <span>小さなコツ</span>
                    <p>{lesson.tip}</p>
                  </div>
                  <a className="reference-link" href={SOURCE_URL} target="_blank" rel="noreferrer">
                    教材の出典を見る
                    <ExternalLink size={12} />
                  </a>
                </section>
              </aside>
            </div>
            <div className="practice-footer">
              <span>
                <ShieldCheck size={14} />
                カメラは開始ボタンを押したときだけ使います。
              </span>
              <button className="text-button" onClick={() => navigate('about')}>
                学び方と判定について
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {view === 'progress' && (
          <section className="record-page">
            <div className="eyebrow">
              <span />
              EVERY LITTLE STEP COUNTS
            </div>
            <h1>「できた」が、育っていく。</h1>
            <p className="page-description">
              小さな一歩も、ちゃんと残っているよ。このブラウザでの学習のきろく。
            </p>
            <div className="record-hero">
              <Dot mood={completed > 0 ? 'happy' : 'idle'} />
              <div>
                <span className="section-kicker">YOUR LITTLE ACHIEVEMENTS</span>
                <h2>
                  {completed === 6
                    ? '6つの数字、全部できたね！'
                    : completed === 0
                      ? '最初の一歩を、ここから。'
                      : `${completed}つの「できた」。すてきだね。`}
                </h2>
                <p>
                  {completed === 0
                    ? 'カメラでレッスンをクリアすると、ここにきろくされます。'
                    : '何度でもれんしゅうできるよ。少しずつ、手になじませよう。'}
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    choose(lessons.find((l) => !progress.completed[l.id])?.id ?? '1');
                    navigate('practice');
                  }}
                >
                  れんしゅうする
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
            <div className="stat-row">
              <div>
                <Star size={21} />
                <strong>
                  {completed}
                  <small>/ 6</small>
                </strong>
                <span>クリアしたレッスン</span>
              </div>
              <div>
                <Sprout size={22} />
                <strong>
                  {progress.practiceDays.length}
                  <small>日</small>
                </strong>
                <span>手話をれんしゅうした日</span>
              </div>
              <div>
                <Hand size={21} />
                <strong>
                  {Math.round((completed / 6) * 100)}
                  <small>%</small>
                </strong>
                <span>はじめの一歩コース</span>
              </div>
            </div>
            <div className="record-lessons">
              {lessons.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    choose(item.id);
                    navigate('practice');
                  }}
                  className={progress.completed[item.id] ? 'record-lesson done' : 'record-lesson'}
                >
                  <span className="record-number">{item.id}</span>
                  <span>
                    <strong>数字「{item.id}」</strong>
                    <small>
                      {progress.completed[item.id]
                        ? 'クリア済み · もう一度れんしゅう'
                        : 'これからの楽しみ'}
                    </small>
                  </span>
                  {progress.completed[item.id] ? <Check size={20} /> : <ArrowRight size={18} />}
                </button>
              ))}
            </div>
            <button className="text-button reset-progress" onClick={() => setResetDialog(true)}>
              <RotateCcw size={14} />
              学習のきろくをリセット
            </button>
          </section>
        )}

        {view === 'about' && (
          <section className="about-page">
            <div className="eyebrow">
              <span />A THOUGHTFUL FIRST STEP
            </div>
            <h1>手話との出会いを、やさしく。</h1>
            <p className="page-description">
              dots & signs は、日本の手話の数字を練習するDevDay向けのプロトタイプです。
            </p>
            <div className="about-grid">
              <article className="about-card">
                <Hand size={25} />
                <h2>まずは、6つの数字から。</h2>
                <p>
                  「1・2・3・4・5」と、指を曲げる「10」を練習できます。手話は手の形・位置・動き、表情などを使う言語。このアプリは、その入り口となる数字の形と動きに範囲を絞っています。
                </p>
                <p>
                  お手本は模式図です。自然な表現や地域差も学ぶには、教材の動画や、ろう者・手話講師による指導を参考にしてください。
                </p>
                <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                  梅花女子大学「3Dモデルで学ぶ手話」
                  <ExternalLink size={14} />
                </a>
                <a
                  href="https://www.pref.kanagawa.jp/docs/dc4/cnt/f533708/p1112883.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  神奈川県「指文字（数字）」
                  <ExternalLink size={14} />
                </a>
              </article>
              <article className="about-card">
                <Maximize size={25} />
                <h2>形と、続く動きを見ています。</h2>
                <p>
                  MediaPipeで手の21点を検出し、指の曲がり方・手の向き・画面内の大きさを確認します。静止する数字は約1秒キープ。「10」は「伸ばす→曲げる」の順序を確認します。
                </p>
                <p>
                  表示する％はキープの進み具合です。正解の確率や認識精度ではありません。実利用での認識率は未測定で、正式な手話能力の評価には使えません。
                </p>
                <a
                  href="https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js"
                  target="_blank"
                  rel="noreferrer"
                >
                  MediaPipeの公式資料
                  <ExternalLink size={14} />
                </a>
              </article>
              <article className="about-card">
                <LockKeyhole size={25} />
                <h2>カメラの映像は、PCの中に。</h2>
                <p>
                  映像と手の座標はブラウザ内で処理し、録画・保存・送信しません。マイクも使用しません。タブを離れるとカメラを停止します。
                </p>
                <p>
                  保存するのは、クリアしたレッスンと日付だけ。このブラウザの保存領域に残り、「学習のきろく」からリセットできます。
                </p>
              </article>
              <article className="about-card">
                <Sparkles size={25} />
                <h2>そばで応援する、小さなdots。</h2>
                <p>
                  OpenAIのdotsを着想源に、このアプリ用に描いたキャラクターが表情とメッセージで応援します。応援は判定状態に合わせた定型メッセージです。
                </p>
                <p>
                  OpenAI公式アプリではなく、dotsのアカウントやAPIへの接続はありません。APIキーなしで練習できます。
                </p>
                <a
                  href="https://openai.com/index/introducing-dots/"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenAIのdotsについて
                  <ExternalLink size={14} />
                </a>
              </article>
            </div>
            <button className="primary-button" onClick={() => navigate('practice')}>
              <ArrowLeft size={17} />
              れんしゅうにもどる
            </button>
          </section>
        )}

        <footer className="page-footer">
          <span className="footer-brand">dots & signs</span>
          <span>A little practice. A new way to connect.</span>
          <span>DevDay prototype</span>
        </footer>
      </main>

      {guide && (
        <Modal title="はじめての、手話れんしゅう。" onClose={() => setGuide(false)}>
          <p className="modal-intro">3つの準備で、dotsといっしょに始められるよ。</p>
          <div className="guide-step">
            <span>01</span>
            <div>
              <h3>明るい場所で、カメラをオン。</h3>
              <p>PCのChrome・Edgeで開き、カメラの使用を許可してください。マイクは使いません。</p>
            </div>
          </div>
          <div className="guide-step">
            <span>02</span>
            <div>
              <h3>お手本を見ながら、片手を映そう。</h3>
              <p>
                指先から手首まで映して、手のひらをカメラに向けます。右手でも左手でもOK。映像とお手本は鏡表示です。
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span>03</span>
            <div>
              <h3>形ができたら、約1秒キープ。</h3>
              <p>
                手の向きや形のヒントを見ながら調整しよう。「10」だけは、指を伸ばしてから曲げます。
              </p>
            </div>
          </div>
          <div className="modal-note">
            <ShieldCheck size={17} />
            <span>映像の保存・送信はしません。カメラなしでお手本だけを見ることもできます。</span>
          </div>
          <button className="primary-button full-width" onClick={() => setGuide(false)}>
            やってみよう
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {resetDialog && (
        <Modal title="学習のきろくをリセット" onClose={() => setResetDialog(false)}>
          <p className="modal-intro">
            このブラウザに保存されたクリア履歴と練習日を削除します。この操作は元に戻せません。
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setResetDialog(false)}>
              キャンセル
            </button>
            <button
              className="primary-button"
              onClick={() => {
                setProgress(clearProgress());
                setResetDialog(false);
              }}
            >
              リセットする
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
