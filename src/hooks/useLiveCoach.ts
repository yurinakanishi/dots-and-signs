import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LiveCoach } from '../lib/live/coach';
import type { LessonId } from '../lib/types';

export function useLiveCoach(selected: LessonId, onChoose: (id: LessonId) => void) {
  const chooseRef = useRef(onChoose);
  chooseRef.current = onChoose;
  const [controller] = useState(() => new LiveCoach((id) => chooseRef.current(id)));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.reportDisplayedLesson(selected);
  }, [controller, selected, snapshot.awaitingDisplay]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) controller.stop('画面を離れたため音声アシストを終了しました。');
    };
    const leave = () => controller.dispose();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
      controller.dispose();
    };
  }, [controller]);
  return {
    ...snapshot,
    start: controller.start,
    stop: controller.stop,
    confirmLesson: controller.confirmLesson,
    dismissRecommendation: controller.dismissRecommendation,
    selectLessonManually: controller.selectLessonManually,
    resumeAudio: controller.resumeAudio,
  };
}
