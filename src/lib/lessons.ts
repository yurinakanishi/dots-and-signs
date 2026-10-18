import type { LessonId, SignId } from './types';

export const SOURCE_URL = 'https://www.city.akita.lg.jp/kurashi/shogaifukushi/1006373/1004961.html';
export type Lesson = {
  id: LessonId;
  recognitionId: SignId | null;
  label: string;
  english: string;
  intro: string;
  steps: string[];
  shortSteps: string[];
  cheer: string;
  image: { src: string; alt: string };
  stepImages?: { src: string; alt: string }[];
  voiceIntent: string;
  practiceNote?: string;
};
// Shared by manual selection, voice choices, and the image guide.
export const lessons: Lesson[] = [
  {
    id: 'hello',
    recognitionId: 'hello',
    label: 'こんにちは',
    english: 'Hello',
    intro: '会えたうれしさを、手から。',
    image: {
      src: '/lesson-images/hello-step-1.png',
      alt: '人差し指と中指をそろえ、額の中央に当てる青いdots',
    },
    stepImages: [
      {
        src: '/lesson-images/hello-step-1.png',
        alt: 'ステップ1：人差し指と中指の2本をそろえ、額の中央に当てる',
      },
      {
        src: '/lesson-images/hello-step-2.png',
        alt: 'ステップ2：胸の前で両手の人差し指を1本ずつ立て、近づける',
      },
      {
        src: '/lesson-images/hello-step-3.png',
        alt: 'ステップ3：両手の人差し指を互いに向けて曲げ、おじぎさせる',
      },
    ],
    voiceIntent: '「こんにちは」を練習・表現したい明確な依頼',
    shortSteps: ['額に2本の指', '両手の指を立てる', '指でおじぎ'],
    steps: [
      '人差し指と中指を、額の真ん中に。',
      '両手の人差し指を立てて、近づける。',
      '人差し指を曲げて、軽く会釈。',
    ],
    cheer: 'いいね！ あいさつの動きができたよ。',
  },
];

export const lessonLabels = Object.fromEntries(
  lessons.map(({ id, label }) => [id, label]),
) as Record<LessonId, string>;
export const lessonNames = lessons.map(({ label }) => `「${label}」`).join('・');
export const isLessonId = (value: unknown): value is LessonId =>
  typeof value === 'string' && lessons.some(({ id }) => id === value);
