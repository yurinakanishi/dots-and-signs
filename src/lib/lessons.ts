import type { Finger, SignId } from './types';

export const SOURCE_URL = 'https://mv.baika.ac.jp/imamura/www/suuji.html';
export type Lesson = {
  id: SignId;
  reading: string;
  subtitle: string;
  description: string;
  fingers: Finger[];
  steps: string[];
  tip: string;
  cheer: string;
};
export const lessons: Lesson[] = [
  {
    id: '1',
    reading: 'いち',
    subtitle: '一本の指から、はじめよう。',
    description: '人差し指を、すっと上に。',
    fingers: ['index'],
    steps: ['手のひらをカメラに向ける', '人差し指だけを上に伸ばす', 'その形で、1秒ほどキープ'],
    tip: '親指・中指・薬指・小指は軽く握ろう。力を入れすぎなくて大丈夫。',
    cheer: 'はじめの「1」、できたね！\n手で伝えるって、ちょっと楽しい。',
  },
  {
    id: '2',
    reading: 'に',
    subtitle: 'もう一本、気持ちを広げて。',
    description: '人差し指と中指を伸ばそう。',
    fingers: ['index', 'middle'],
    steps: ['手のひらをカメラに向ける', '人差し指と中指を伸ばす', '残りの指を握って、キープ'],
    tip: '指を大きく開く必要はないよ。2本の指先が見えるようにしてみて。',
    cheer: '「2」も伝わったよ！\n一つずつ、できることが増えていくね。',
  },
  {
    id: '3',
    reading: 'さん',
    subtitle: 'ゆっくり、三本そろえて。',
    description: '人差し指・中指・薬指を伸ばそう。',
    fingers: ['index', 'middle', 'ring'],
    steps: [
      '手のひらをカメラに向ける',
      '人差し指・中指・薬指を伸ばす',
      '親指と小指をたたんで、キープ',
    ],
    tip: '薬指が少しむずかしいね。小指を親指でそっと押さえると作りやすいよ。',
    cheer: '「3」、いい形だね！\nむずかしい指の動きも、ちゃんとできた。',
  },
  {
    id: '4',
    reading: 'よん',
    subtitle: '四本の指で、もう一歩。',
    description: '親指をたたんで、4本を伸ばそう。',
    fingers: ['index', 'middle', 'ring', 'pinky'],
    steps: ['手のひらをカメラに向ける', '親指以外の4本を伸ばす', '親指は手のひらに添えて、キープ'],
    tip: '親指まで開かないように、そっと内側に添えておこう。',
    cheer: '「4」もばっちり！\nきみのペースで、ちゃんと進んでいるよ。',
  },
  {
    id: '5',
    reading: 'ご',
    subtitle: 'いつもの数え方と、ちょっと違う。',
    description: '親指だけを、横に伸ばそう。',
    fingers: ['thumb'],
    steps: ['4本の指を軽く握る', '親指だけを横に伸ばす', '手のひら側をカメラに向けて、キープ'],
    tip: '日本の手話の「5」は、パーではなく親指を横に出す形。ここを覚えよう。',
    cheer: '「5」、覚えたね！\n手話ならではの表し方、すてきだね。',
  },
  {
    id: '10',
    reading: 'じゅう',
    subtitle: '指に、小さな動きをつけよう。',
    description: '「1」を作って、人差し指を曲げよう。',
    fingers: ['index'],
    steps: ['「1」の形を少しキープ', '手首を動かさず、人差し指を曲げる', '曲げた形で少し止める'],
    tip: '最初から握った形では「10」にならないよ。「伸ばす → 曲げる」の順番で。',
    cheer: '動きのある「10」もできた！\n今日の一歩を、いっしょに喜ぼう。',
  },
];

export const fingerNames: Record<Finger, string> = {
  thumb: '親指',
  index: '人差し指',
  middle: '中指',
  ring: '薬指',
  pinky: '小指',
};
