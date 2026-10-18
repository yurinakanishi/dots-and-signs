import { lessons } from '../src/lib/lessons.ts';
import {
  hintChoices,
  hintIsRelevant,
  isHintId,
  parseHintContext,
  HINT_TIMEOUT_MS,
} from '../src/lib/practice-hints.ts';
import { DECISIONS_MODEL } from './session-config.ts';
import { readBoundedJson } from './bounded-json.ts';

export const HINT_BODY_LIMIT = 2048;
export type HintAllowance = 'allowed' | 'limit' | 'rate' | 'unavailable';
export const hintQuestion = {
  type: 'choice',
  name: 'practice_hint',
  instructions: [
    'Choose the most helpful next coaching action from the supplied choices. Use the practice state and recent hint history; avoid repeating unhelpful guidance. Prefer these actions when available:',
    '1. If handCount < requiredHands, choose show_hands. This includes handCount = 0 even when bodyVisible = true. Do not choose follow_step or review_demo when hands are missing.',
    '2. Otherwise if bodyVisible is false, choose show_body.',
    '3. Otherwise if holdProgress > 0, choose keep_going.',
    '4. Otherwise if previousHints includes follow_step OR stalledSeconds >= 30, choose review_demo.',
    '5. Otherwise choose follow_step.',
    'Choose wait only when another interruption would be unhelpful, such as repeating the same hint the user has just seen. A first stall should receive an actionable hint.',
    '手話練習の状態から、次に表示するヒントを一つ選ぶ。入力は計測の要約で、映像は見えていない。',
    '必要な手の数は最初のステップは1本（eveningだけ2本）、以後は2本。手が足りなければshow_hands、手が足りていてbodyVisibleがfalseならshow_bodyを優先。',
    '手と体が映っておりholdProgressが0より大きいときはkeep_going。進行が0ならfollow_stepかreview_demo。',
    '手と体が映り進行が0のとき、previousHintsにfollow_stepが含まれる、または30秒以上止まっているならreview_demoを優先する。それ以外はfollow_step。',
    'preparingは現在の段階の始点を作り直している状態。完了済みの段階へ戻したり、成功を宣言したりしない。',
    '指の形や動作の正誤、表情や気持ちを推測しない。教材の説明を生成・変更しない。',
  ].join('\n'),
  choices: hintChoices,
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function choosePracticeHint(
  body: unknown,
  options: {
    apiKey?: string;
    reserve: () => Promise<HintAllowance>;
    fetch?: typeof fetch;
    signal?: AbortSignal;
  },
) {
  const context = parseHintContext(body);
  if (!context) return { status: 400, body: { code: 'invalid_hint_context' } };
  if (!options.apiKey) return { status: 503, body: { code: 'not_configured' } };
  const signal = AbortSignal.any([
    AbortSignal.timeout(HINT_TIMEOUT_MS),
    ...(options.signal ? [options.signal] : []),
  ]);
  try {
    if (signal.aborted) return { status: 504, body: { code: 'cancelled' } };
    const allowance = await options.reserve();
    if (allowance !== 'allowed')
      return {
        status: allowance === 'unavailable' ? 503 : 429,
        body: {
          code:
            allowance === 'limit'
              ? 'daily_limit'
              : allowance === 'rate'
                ? 'rate_limit'
                : 'usage_unavailable',
        },
      };
    if (signal.aborted) return { status: 504, body: { code: 'cancelled' } };
    const lesson = lessons.find((item) => item.id === context.lessonId)!;
    const upstream = await (options.fetch ?? fetch)('https://api.openai.com/v1/decisions', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DECISIONS_MODEL,
        input: JSON.stringify({
          ...context,
          requiredHands: context.step === 0 && context.lessonId !== 'evening' ? 1 : 2,
          observation: `現在カメラに映っている手は${context.handCount}本。${context.bodyVisible ? '体は映っています。' : '体の位置は検出できません。'}`,
          lesson: lesson.label,
          stepInstruction: lesson.steps[context.step],
        }),
        questions: [
          {
            ...hintQuestion,
            choices: hintChoices.filter(({ value }) => hintIsRelevant(value, context)),
          },
        ],
      }),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return { status: upstream.status === 429 ? 429 : 502, body: { code: 'upstream_error' } };
    }
    const data = record(await readBoundedJson(upstream.body, 32 * 1024));
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const answer = record(answers.find((item) => record(item).name === 'practice_hint'));
    if (
      answer.type !== 'choice' ||
      !isHintId(answer.choice) ||
      !hintIsRelevant(answer.choice, context)
    )
      return { status: 502, body: { code: 'invalid_response' } };
    return { status: 200, body: { hint: answer.choice, source: 'decisions' } };
  } catch {
    return { status: signal.aborted ? 504 : 502, body: { code: 'hint_unavailable' } };
  }
}
