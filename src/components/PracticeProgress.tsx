import { Check } from 'lucide-react';
import type { Lesson } from '../lib/lessons';
import type { Feedback } from '../lib/types';

export function PracticeProgress({
  lesson,
  feedback,
  active,
}: {
  lesson: Lesson;
  feedback: Feedback;
  active: boolean;
}) {
  return (
    <ol className="practice-progress" aria-label="あなたの3ステップの進み具合">
      {lesson.shortSteps.map((title, i) => {
        const done = active && i < feedback.completedSteps;
        const current = active && !done && i === feedback.step;
        return (
          <li
            key={title}
            className={done ? 'progress-done' : current ? 'progress-current' : ''}
            aria-current={current ? 'step' : undefined}
          >
            <span className="progress-number" aria-hidden="true">
              {done ? <Check size={15} /> : i + 1}
            </span>
            <span>
              <strong>{title}</strong>
              <small>
                {done ? 'できた' : current ? 'いまここ' : active ? 'つぎ' : `ステップ ${i + 1}`}
              </small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
