import { Check, LayoutGrid, Mic } from 'lucide-react';
import { lessons } from '../lib/lessons';
import type { LessonId } from '../lib/types';
import type { useLiveCoach } from '../hooks/useLiveCoach';

export function LessonInput({
  selected,
  coach,
}: {
  selected: LessonId;
  coach: ReturnType<typeof useLiveCoach>;
}) {
  return (
    <section
      className={`lesson-input${lessons.length === 1 ? ' single-lesson' : ''}`}
      aria-label="練習することばの入力"
    >
      <div className="input-mode-heading">
        <h2>どうやって選ぶ？</h2>
        <div className="input-mode-toggle" role="group" aria-label="入力モード">
          <button
            type="button"
            aria-pressed="true"
            aria-controls={lessons.length > 1 ? 'lesson-input-content' : undefined}
          >
            <LayoutGrid size={16} />
            選択モード
          </button>
          <button
            type="button"
            className="voice-mode-coming-soon"
            aria-label="音声入力モード Coming Soon"
            disabled
          >
            <Mic size={16} />
            <span>
              音声入力モード<small>Coming Soon</small>
            </span>
          </button>
        </div>
      </div>
      <div id="lesson-input-content">
        <p className="input-mode-hint">練習したいことばを選んでね。マイクは使いません。</p>
        <nav className="lesson-choices" aria-label="練習することば">
          {lessons.map((lesson) => (
            <button
              key={lesson.id}
              className={`lesson-choice${selected === lesson.id ? ' selected' : ''}`}
              aria-label={lesson.label}
              aria-pressed={selected === lesson.id}
              onClick={() => coach.selectLessonManually(lesson.id)}
            >
              <span className="lesson-thumbnail">
                <img src={lesson.image.src} alt="" width={1536} height={1024} />
              </span>
              <span className="lesson-choice-label">{lesson.label}</span>
              {selected === lesson.id && (
                <Check className="lesson-choice-check" size={16} aria-hidden="true" />
              )}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
