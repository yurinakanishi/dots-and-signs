import { useRef, useState } from 'react';
import { Check, LayoutGrid, Mic } from 'lucide-react';
import { lessons } from '../lib/lessons';
import type { LessonId } from '../lib/types';
import type { useLiveCoach } from '../hooks/useLiveCoach';
import { VoiceCoach } from './VoiceCoach';

export function LessonInput({
  selected,
  coach,
}: {
  selected: LessonId;
  coach: ReturnType<typeof useLiveCoach>;
}) {
  const [mode, setMode] = useState<'selection' | 'voice'>('selection');
  const selectionButton = useRef<HTMLButtonElement>(null);

  function selectMode(next: typeof mode) {
    if (next === mode) return;
    if (next === 'selection') coach.stop('選択モードに切り替えたため、音声入力を終了しました。');
    setMode(next);
  }

  return (
    <section className="lesson-input" aria-label="練習することばの入力">
      <div className="input-mode-heading">
        <h2>どうやって選ぶ？</h2>
        <div className="input-mode-toggle" role="group" aria-label="入力モード">
          <button
            ref={selectionButton}
            type="button"
            aria-pressed={mode === 'selection'}
            aria-controls="lesson-input-content"
            onClick={() => selectMode('selection')}
          >
            <LayoutGrid size={16} />
            選択モード
          </button>
          <button
            type="button"
            aria-pressed={mode === 'voice'}
            aria-controls="lesson-input-content"
            onClick={() => selectMode('voice')}
          >
            <Mic size={16} />
            音声入力モード
          </button>
        </div>
      </div>
      <div id="lesson-input-content">
        {mode === 'selection' ? (
          <>
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
                    <img src={lesson.image.src} alt="" width={1484} height={1060} />
                  </span>
                  <span className="lesson-choice-label">{lesson.label}</span>
                  {selected === lesson.id && (
                    <Check className="lesson-choice-check" size={16} aria-hidden="true" />
                  )}
                </button>
              ))}
            </nav>
          </>
        ) : (
          <VoiceCoach
            coach={coach}
            onSelectMode={() => {
              selectMode('selection');
              selectionButton.current?.focus();
            }}
          />
        )}
      </div>
    </section>
  );
}
