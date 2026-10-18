import type { SignId } from './types';

export const SOURCE_URL = 'https://www.city.akita.lg.jp/kurashi/shogaifukushi/1006373/1004961.html';
export type Lesson = {
  id: SignId;
  label: string;
  english: string;
  intro: string;
  steps: string[];
  shortSteps: [string, string, string];
  cheer: string;
};
// One consistent regional teaching reference; illustrations are original schematics.
export const lessons: Lesson[] = [
  {
    id: 'hello',
    label: 'こんにちは',
    english: 'Hello',
    intro: '会えたうれしさを、手から。',
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
    label: 'こんばんは',
    english: 'Good evening',
    intro: '一日の終わりに、やさしいあいさつ。',
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
    label: 'ありがとう',
    english: 'Thank you',
    intro: '小さな感謝を、ひとつ。',
    shortSteps: ['手の甲を上に', 'もう片方をのせる', '上の手を上げる'],
    steps: [
      '片手を胸の前へ。手の甲を上に。',
      'もう片方の手を、小指側から直角にのせる。',
      '上の手をすっと上げ、軽く会釈。',
    ],
    cheer: 'いい動き！ 「ありがとう」を大切に。',
  },
];
