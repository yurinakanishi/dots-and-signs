import { useEffect, useState } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import type { Lesson } from '../lib/lessons';
import type { Feedback } from '../lib/types';

export function SignDemo({ lesson, feedback }: { lesson: Lesson; feedback?: Feedback }) {
  const [previewStep, setPreviewStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const controlled = !!feedback;
  const currentStep = feedback?.step ?? previewStep;
  const imageStep = Math.min(feedback?.demoFrame ?? previewStep, lesson.steps.length - 1);
  const stepImage = lesson.stepImages?.[imageStep] ?? lesson.image;
  const preparationInstruction =
    feedback?.demoFrame === 0
      ? lesson.steps[0]
      : lesson.id === 'evening'
        ? '両手の人差し指を立てて、近づける。'
        : lesson.steps[1];
  useEffect(() => {
    if (!playing || controlled || lesson.steps.length < 2) return;
    const timer = window.setInterval(
      () => setPreviewStep((step) => (step + 1) % lesson.steps.length),
      2400,
    );
    return () => window.clearInterval(timer);
  }, [playing, controlled, lesson.steps.length]);
  useEffect(() => {
    // Warm the following poses before a camera checkpoint changes the image.
    lesson.stepImages?.forEach(({ src }) => {
      const image = new Image();
      image.src = src;
    });
  }, [lesson]);

  return (
    <section
      className="demo-panel"
      id="lesson-demo"
      tabIndex={-1}
      aria-label={lesson.label + 'のお手本'}
    >
      <div className="panel-label">
        <span>画像のお手本</span>
        {controlled ? (
          <span className="demo-follow">
            {feedback.preparing ? `ステップ${feedback.step + 1}の準備` : 'あなたのステップに連動'}
          </span>
        ) : lesson.steps.length > 1 ? (
          <button
            className="play-toggle"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? '手順を一時停止' : '手順を再生'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            <span>{playing ? 'とめる' : '手順を再生'}</span>
          </button>
        ) : null}
      </div>
      <div className="demo-scene">
        {failedImageSrc === stepImage.src ? (
          <p className="image-unavailable" role="alert">
            画像を読み込めませんでした。ページを再読み込みしてください。
          </p>
        ) : (
          <img
            key={stepImage.src}
            className="sign-demo lesson-guide-image"
            src={stepImage.src}
            alt={stepImage.alt}
            width={1536}
            height={1024}
            onError={() => setFailedImageSrc(stepImage.src)}
          />
        )}
      </div>
      <p className="image-guide-caption">
        ステップ{imageStep + 1}：{lesson.steps[imageStep]}
      </p>
      {lesson.practiceNote && <p className="lesson-practice-note">{lesson.practiceNote}</p>}
      <ol className="demo-steps">
        {lesson.steps.map((step, i) => (
          <li key={step}>
            {controlled ? (
              <div
                className={`step ${i < feedback.completedSteps ? 'completed-step' : i === feedback.step ? 'active-step' : ''}`}
                aria-current={
                  i === feedback.step && feedback.completedSteps < lesson.steps.length
                    ? 'step'
                    : undefined
                }
              >
                <span className="step-number">
                  {i < feedback.completedSteps ? <Check size={13} aria-label="完了" /> : i + 1}
                </span>
                <span>{step}</span>
                {i === feedback.step && feedback.completedSteps < lesson.steps.length && (
                  <small>いまここ</small>
                )}
              </div>
            ) : (
              <button
                className={currentStep === i ? 'step active-step' : 'step'}
                aria-pressed={currentStep === i}
                onClick={() => {
                  setPlaying(false);
                  setPreviewStep(i);
                }}
              >
                <span className="step-number">{i + 1}</span>
                <span>{step}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
      {lesson.recognitionId && (
        <p className={`demo-note${feedback?.preparing ? ' demo-setup' : ''}`}>
          {controlled
            ? feedback.preparing
              ? `できたところはそのまま。準備：${preparationInstruction}`
              : '形ができたら、自動で次の手順へ。'
            : 'カメラを始めると、手順があなたの進み具合に合わせて進むよ。'}
        </p>
      )}
    </section>
  );
}
