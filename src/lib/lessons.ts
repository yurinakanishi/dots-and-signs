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
    image: { src: '/lesson-images/hello.png', alt: '2本の指を額に近づける青いdots' },
    voiceIntent: '「こんにちは」を練習・表現したい明確な依頼',
    shortSteps: ['額に2本の指', '両手の指を立てる', '指でおじぎ'],
    steps: [
      '人差し指と中指を、額の真ん中に。',
      '両手の人差し指を立てて、近づける。',
      '人差し指を曲げて、軽く会釈。',
    ],
    cheer: 'いいね！ あいさつの動きができたよ。',
  },
  {
    id: 'evening',
    recognitionId: 'evening',
    label: 'こんばんは',
    english: 'Good evening',
    intro: '一日の終わりに、やさしいあいさつ。',
    image: { src: '/lesson-images/evening.png', alt: '開いた両手を顔の前で交差させる青いdots' },
    voiceIntent: '「こんばんは」を練習・表現したい明確な依頼',
    shortSteps: ['顔の横に両手', '目の前で交差', '指でおじぎ'],
    steps: [
      '両手のひらを前に向け、顔の左右へ。',
      '目の前で両手を交差させる。',
      '両手の人差し指を近づけて曲げ、会釈。',
    ],
    cheer: 'その調子！ 夜のあいさつができたね。',
  },
  {
    id: 'thanks',
    recognitionId: 'thanks',
    label: 'ありがとう',
    english: 'Thank you',
    intro: '小さな感謝を、ひとつ。',
    image: {
      src: '/lesson-images/thanks.png',
      alt: '水平にした手の上にもう片方の手を立てる青いdots',
    },
    voiceIntent: '感謝・お礼・「ありがとう」を練習・表現したい明確な依頼',
    shortSteps: ['手の甲を上に', 'もう片方をのせる', '上の手を上げる'],
    steps: [
      '片手を胸の前へ。手の甲を上に。',
      'もう片方の手を、小指側から直角にのせる。',
      '上の手をすっと上げ、軽く会釈。',
    ],
    cheer: 'いい動き！ 「ありがとう」を大切に。',
  },
  {
    id: 'welcome',
    recognitionId: null,
    label: 'OpenAIへようこそ',
    english: 'Welcome to OpenAI',
    intro: '歓迎の気持ちを、ひらいた手で。',
    image: {
      src: '/lesson-images/welcome.png',
      alt: '両手のひらを上に向けて開いた青いdotsの歓迎ポーズ',
    },
    voiceIntent: '「OpenAIへようこそ」「ようこそ」や歓迎のポーズを練習したい明確な依頼',
    shortSteps: ['歓迎のポーズ'],
    steps: ['画像を見ながら、両手を開いて手のひらを上に向けてみよう。'],
    cheer: '画像と見比べながら、ゆっくり練習しよう。',
    practiceNote:
      '今は「ようこそ」の歓迎ポーズを練習します。「OpenAI」の指文字は確認中です。動きの自動判定はありません。',
  },
];

export const lessonLabels = Object.fromEntries(
  lessons.map(({ id, label }) => [id, label]),
) as Record<LessonId, string>;
export const lessonNames = lessons.map(({ label }) => `「${label}」`).join('・');
export const isLessonId = (value: unknown): value is LessonId =>
  typeof value === 'string' && lessons.some(({ id }) => id === value);
