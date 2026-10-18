import { useEffect, useState } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import type { Lesson } from '../lib/lessons';
import type { Feedback, SignId } from '../lib/types';
import { Dot } from './Dot';

type Shape = 'two' | 'index' | 'bow' | 'open' | 'flat' | 'edge' | 'rest';
type Position = { x: number; y: number; angle?: number; flip?: boolean; shape: Shape };
const timeline: Record<SignId, number[]> = {
  hello: [0, 1, 2],
  evening: [0, 1, 2, 2],
  thanks: [0, 1, 2],
};

function Hand({ shape }: { shape: Shape }) {
  if (shape === 'edge')
    return (
      <g fill="#edc4aa" stroke="#a9806d" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M-8 0 L-12-58 Q-12-78-8-80 Q-3-82 0-72 L5-34 Q20-47 21-38 L9-16 8 0Z" />
        <path d="M-5-69 L-4-33" fill="none" />
      </g>
    );
  const extended =
    shape === 'open' || shape === 'flat'
      ? [0, 1, 2, 3]
      : shape === 'two'
        ? [0, 1]
        : shape === 'index'
          ? [0]
          : [];
  return (
    <g fill="#edc4aa" stroke="#a9806d" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M-18-40 Q-23-20-14 1 L13 1 Q22-18 16-40Z" />
      {[0, 1, 2, 3].map((i) => {
        const x = -19 + i * 9,
          top = [-79, -86, -79, -65][i];
        if (shape === 'bow' && i === 0)
          return (
            <path key={i} d="M-19-35 L-19-51 Q-19-63-9-58 L9-46 Q15-39 8-36 L-10-43 -10-34Z" />
          );
        return extended.includes(i) ? (
          <path
            key={i}
            d={`M${x}-36 L${x}${top + 5} Q${x}${top - 2} ${x + 4.5}${top - 2} Q${x + 9}${top - 2} ${x + 9}${top + 5} L${x + 9}-34`}
          />
        ) : (
          <rect key={i} x={x} y={-39 + i * 2} width="10" height="19" rx="5" />
        );
      })}
      <path
        d={
          extended.length === 4
            ? 'M11-8 Q28-21 30-38 Q29-45 24-42 L13-25'
            : 'M12-8 Q22-18 15-24 L-2-29 Q-10-27-4-21 L9-14'
        }
      />
    </g>
  );
}

function pose(sign: SignId, frame: number): [Position, Position | null] {
  if (sign === 'hello' && frame === 0) return [{ x: 210, y: 146, shape: 'two' }, null];
  if ((sign === 'hello' && frame > 0) || (sign === 'evening' && frame >= 2)) {
    const bowed = sign === 'hello' ? frame === 2 : frame === 3;
    return [
      { x: 182, y: 254, shape: bowed ? 'bow' : 'index' },
      { x: 238, y: 254, shape: bowed ? 'bow' : 'index', flip: true },
    ];
  }
  if (sign === 'evening')
    return frame === 0
      ? [
          { x: 125, y: 160, shape: 'open', angle: -10 },
          { x: 295, y: 160, shape: 'open', angle: 10, flip: true },
        ]
      : [
          { x: 250, y: 170, shape: 'open', angle: -55 },
          { x: 170, y: 170, shape: 'open', angle: 55, flip: true },
        ];
  return [
    { x: 210, y: frame === 2 ? 194 : 258, shape: frame === 0 ? 'rest' : 'edge' },
    { x: 268, y: 254, shape: 'flat', angle: -90 },
  ];
}

export function SignDemo({ lesson, feedback }: { lesson: Lesson; feedback?: Feedback }) {
  const [previewFrame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const steps = timeline[lesson.id];
  const controlled = !!feedback;
  const frame = feedback?.demoFrame ?? previewFrame;
  useEffect(() => {
    if (!playing || controlled) return;
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % steps.length), 1650);
    return () => window.clearInterval(timer);
  }, [playing, controlled, steps.length]);
  const currentStep = steps[frame];
  const hands = pose(lesson.id, frame);
  const bow =
    (lesson.id === 'hello' && frame === 2) ||
    (lesson.id === 'evening' && frame === 3) ||
    (lesson.id === 'thanks' && frame === 2);

  return (
    <section className="demo-panel" aria-label={lesson.label + 'のお手本'}>
      <div className="panel-label">
        <span>お手本</span>
        {controlled ? (
          <span className="demo-follow">
            {feedback.preparing ? `ステップ${feedback.step + 1}の準備` : 'あなたのステップに連動'}
          </span>
        ) : (
          <button
            className="play-toggle"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'お手本を一時停止' : 'お手本を再生'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            <span>{playing ? 'とめる' : '再生'}</span>
          </button>
        )}
      </div>
      <div className="demo-scene">
        <svg
          className="sign-demo"
          viewBox="0 0 420 325"
          role="img"
          aria-label={lesson.label + '：' + lesson.steps[currentStep]}
        >
          <ellipse cx="210" cy="166" rx="141" ry="135" fill="#e9eddf" />
          <ellipse cx="210" cy="310" rx="92" ry="8" fill="#cbd4bd" opacity=".35" />
          <path
            d="M133 310 L139 211 Q144 175 185 174 L235 174 Q275 176 281 211 L288 310Z"
            fill="#a9ba91"
            stroke="#7f946c"
            strokeWidth="2"
          />
          <path
            d="M192 156 L192 182 Q210 198 228 182 L228 155"
            fill="#edc4aa"
            stroke="#a9806d"
            strokeWidth="1.6"
          />
          <g
            transform={bow ? 'translate(0 7) rotate(5 210 145)' : undefined}
            className="person-head"
          >
            <ellipse
              cx="210"
              cy="107"
              rx="43"
              ry="51"
              fill="#edc4aa"
              stroke="#a9806d"
              strokeWidth="1.6"
            />
            <path
              d="M167 105 Q150 53 188 48 Q223 32 246 64 Q256 81 251 108 L242 87 Q214 92 200 68 Q187 88 174 87Z"
              fill="#38473c"
            />
            <path
              d="M188 104 Q192 100 196 104 M224 104 Q228 100 232 104"
              fill="none"
              stroke="#38473c"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M204 126 Q211 132 219 125"
              fill="none"
              stroke="#8e6457"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <ellipse cx="183" cy="119" rx="7" ry="3.5" fill="#deaa93" />
            <ellipse cx="236" cy="119" rx="7" ry="3.5" fill="#deaa93" />
          </g>
          {hands.map((h, i) =>
            h && h.shape !== 'rest' ? (
              <g key={i}>
                <path
                  d={`M${i === 0 ? 151 : 269} 203 Q${i === 0 ? 108 : 312} 277 ${h.x} ${h.y}`}
                  fill="none"
                  stroke="#7f946c"
                  strokeWidth="25"
                  strokeLinecap="round"
                />
                <path
                  d={`M${i === 0 ? 151 : 269} 203 Q${i === 0 ? 108 : 312} 277 ${h.x} ${h.y}`}
                  fill="none"
                  stroke="#a9ba91"
                  strokeWidth="21"
                  strokeLinecap="round"
                />
                <g
                  transform={`translate(${h.x} ${h.y}) rotate(${h.angle ?? 0}) scale(${h.flip ? -0.74 : h.shape === 'flat' ? 0.32 : 0.74} .74)`}
                >
                  <Hand shape={h.shape} />
                </g>
              </g>
            ) : null,
          )}
          {lesson.id === 'thanks' && frame === 2 && (
            <path
              d="M256 226 L256 178 M250 185 L256 177 262 185"
              fill="none"
              stroke="#647c53"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
          {lesson.id === 'evening' && frame === 1 && (
            <g fill="none" stroke="#647c53" strokeWidth="2" strokeLinecap="round">
              <path d="M114 100 Q133 89 154 100 M146 93 L155 100 146 106" />
              <path d="M306 100 Q287 89 266 100 M274 93 L265 100 274 106" />
            </g>
          )}
        </svg>
        <div className="demo-dot">
          <Dot color="blue" achievement={feedback?.completedSteps ?? 0} />
        </div>
      </div>
      <ol className="demo-steps">
        {lesson.steps.map((step, i) => (
          <li key={step}>
            {controlled ? (
              <div
                className={`step ${i < feedback.completedSteps ? 'completed-step' : i === feedback.step ? 'active-step' : ''}`}
                aria-current={
                  i === feedback.step && feedback.completedSteps < 3 ? 'step' : undefined
                }
              >
                <span className="step-number">
                  {i < feedback.completedSteps ? <Check size={13} aria-label="完了" /> : i + 1}
                </span>
                <span>{step}</span>
                {i === feedback.step && feedback.completedSteps < 3 && <small>いまここ</small>}
              </div>
            ) : (
              <button
                className={currentStep === i ? 'step active-step' : 'step'}
                aria-pressed={currentStep === i}
                onClick={() => {
                  setPlaying(false);
                  setFrame(steps.lastIndexOf(i));
                }}
              >
                <span className="step-number">{i + 1}</span>
                <span>{step}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className={`demo-note${feedback?.preparing ? ' demo-setup' : ''}`}>
        {controlled
          ? feedback.preparing
            ? 'できたところはそのまま。この形から今の動きを再開しよう。'
            : '形ができたら、自動で次のお手本へ。'
          : 'カメラを始めると、あなたの進み具合に合わせるよ。'}
      </p>
    </section>
  );
}
