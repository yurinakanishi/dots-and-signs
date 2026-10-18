import { useEffect, useState, useSyncExternalStore } from 'react';
import { PracticeHintController } from '../lib/practice-hint-controller';
import { hintIsRelevant, hintText } from '../lib/practice-hints';
import type { Feedback, LessonId } from '../lib/types';

export function usePracticeHints(
  lessonId: LessonId,
  feedback: Feedback,
  active: boolean,
  run: number,
) {
  const [controller] = useState(() => new PracticeHintController());
  const selection = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.observe({ lessonId, feedback, active, run });
  }, [controller, lessonId, feedback, active, run]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void controller.tick();
    }, 1000);
    const hidden = () => {
      if (document.hidden) controller.dispose();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      controller.dispose();
    };
  }, [controller]);
  if (
    !selection ||
    !active ||
    feedback.trackingPaused ||
    feedback.status === 'success' ||
    selection.lessonId !== lessonId ||
    selection.step !== feedback.step ||
    selection.run !== run ||
    selection.preparing !== feedback.preparing ||
    !hintIsRelevant(selection.id, { lessonId, ...feedback })
  )
    return null;
  return { id: selection.id, message: hintText(selection.id, lessonId, feedback) };
}
