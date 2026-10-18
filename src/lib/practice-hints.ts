import { isLessonId, lessons } from './lessons.ts';
import type { Feedback, LessonId } from './types.ts';

export const HINT_STALL_MS = 12_000;
export const HINT_INTERVAL_MS = 20_000;
export const HINT_DAILY_LIMIT = 60;
export const HINT_SESSION_LIMIT = 6;
export const HINT_TIMEOUT_MS = 8_000;

export const hintChoices = [
  {
    value: 'show_hands',
    description: '必要な数の手が映っていないので、手をカメラに映すよう案内する。',
  },
  { value: 'show_body', description: '顔や肩の位置を検出できないので、上半身を映すよう案内する。' },
  {
    value: 'follow_step',
    description:
      '手と体が映り、進行は0。初めての短い停滞（30秒未満・previousHintsにfollow_stepなし）では今のステップの説明を案内する。',
  },
  {
    value: 'review_demo',
    description:
      '手と体が映り、進行は0。follow_stepをすでに出した、または30秒以上の停滞ならお手本の画像を見直すよう案内する。',
  },
  {
    value: 'keep_going',
    description: '形を保つ進行があるので、焦らずその形で少し待つよう励ます。',
  },
  {
    value: 'wait',
    description: '同じヒントを繰り返すより少し見守る方がよいとき、今の案内を保つ。',
  },
] as const;
export type HintId = (typeof hintChoices)[number]['value'];
export type HintContext = {
  lessonId: LessonId;
  step: number;
  handCount: number;
  bodyVisible: boolean;
  holdProgress: number;
  preparing: boolean;
  stalledSeconds: number;
  previousHints: HintId[];
};
export const isHintId = (value: unknown): value is HintId =>
  hintChoices.some((hint) => hint.value === value);

export function parseHintContext(value: unknown): HintContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = [
    'lessonId',
    'step',
    'handCount',
    'bodyVisible',
    'holdProgress',
    'preparing',
    'stalledSeconds',
    'previousHints',
  ];
  if (Object.keys(v).some((key) => !keys.includes(key)) || !isLessonId(v.lessonId)) return null;
  const lesson = lessons.find((lesson) => lesson.id === v.lessonId)!;
  if (
    !lesson.recognitionId ||
    typeof v.step !== 'number' ||
    !Number.isInteger(v.step) ||
    v.step < 0 ||
    v.step >= lesson.steps.length ||
    typeof v.handCount !== 'number' ||
    !Number.isInteger(v.handCount) ||
    v.handCount < 0 ||
    v.handCount > 2 ||
    typeof v.bodyVisible !== 'boolean' ||
    typeof v.preparing !== 'boolean' ||
    typeof v.holdProgress !== 'number' ||
    ![0, 0.25, 0.5, 0.75].includes(v.holdProgress) ||
    typeof v.stalledSeconds !== 'number' ||
    !Number.isInteger(v.stalledSeconds) ||
    v.stalledSeconds < 12 ||
    v.stalledSeconds > 3600 ||
    !Array.isArray(v.previousHints) ||
    v.previousHints.length > 3 ||
    !v.previousHints.every(isHintId)
  )
    return null;
  return {
    lessonId: v.lessonId,
    step: v.step,
    handCount: v.handCount,
    bodyVisible: v.bodyVisible,
    holdProgress: v.holdProgress,
    preparing: v.preparing,
    stalledSeconds: v.stalledSeconds,
    previousHints: [...v.previousHints],
  };
}

export function hintIsRelevant(
  id: HintId,
  context: Pick<HintContext, 'lessonId' | 'step' | 'handCount' | 'bodyVisible' | 'holdProgress'>,
) {
  if (id === 'wait') return true;
  const requiredHands = context.step === 0 && context.lessonId !== 'evening' ? 1 : 2;
  if (id === 'show_hands') return context.handCount < requiredHands;
  if (id === 'show_body') return !context.bodyVisible;
  if (context.handCount < requiredHands || !context.bodyVisible) return false;
  if (id === 'keep_going') return context.holdProgress > 0;
  return context.holdProgress === 0;
}

export function hintText(id: HintId, lessonId: LessonId, feedback: Feedback) {
  const lesson = lessons.find((item) => item.id === lessonId)!;
  switch (id) {
    case 'show_hands':
      return feedback.requiredHands === 2
        ? '両手がカメラに入るように、少し離れてみよう。'
        : '動かす手がカメラに入るようにしてみよう。';
    case 'show_body':
      return lessonId === 'hello' && feedback.step > 0
        ? '肩と両手が一緒に映るように、少し離れてね。'
        : '顔と肩が一緒に映るように、少し離れてね。';
    case 'follow_step':
      return `ゆっくり、一つずつ。${lesson.steps[feedback.demoFrame] ?? lesson.steps[feedback.step]}`;
    case 'review_demo':
      return 'お手本の今のステップをもう一度見て、ゆっくりまねしてみよう。';
    case 'keep_going':
      return 'いい調子。その形で、もう少しだけ止めてみよう。';
    case 'wait':
      return feedback.message;
  }
}
