import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { choosePracticeHint } from '../server/practice-hints.ts';
import { createDailyLimit } from '../server/usage-limit.ts';
import {
  HINT_DAILY_LIMIT,
  isHintId,
  type HintContext,
  type HintId,
} from '../src/lib/practice-hints.ts';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
const reserve = createDailyLimit(resolve('.local/hint-usage.json'), Date.now, HINT_DAILY_LIMIT);
const base: HintContext = {
  lessonId: 'hello',
  step: 0,
  handCount: 1,
  bodyVisible: true,
  holdProgress: 0,
  preparing: false,
  stalledSeconds: 12,
  previousHints: [],
};
const cases: { name: string; input: HintContext; expected: HintId }[] = [
  { name: 'missing hands', input: { ...base, handCount: 0 }, expected: 'show_hands' },
  { name: 'missing body', input: { ...base, bodyVisible: false }, expected: 'show_body' },
  { name: 'first stall', input: base, expected: 'follow_step' },
  {
    name: 'repeated stall',
    input: { ...base, step: 1, handCount: 2, stalledSeconds: 35, previousHints: ['follow_step'] },
    expected: 'review_demo',
  },
  { name: 'holding the pose', input: { ...base, holdProgress: 0.5 }, expected: 'keep_going' },
];
const results = [];
for (const test of cases) {
  const result = await choosePracticeHint(test.input, {
    apiKey: process.env.OPENAI_API_KEY,
    reserve,
    fetch: async (url, options) => {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          const data = await response.clone().json();
          console.log(
            JSON.stringify({
              answers: Array.isArray(data.answers)
                ? data.answers.map(
                    (answer: { type?: string; name?: string; choice?: unknown }) => ({
                      type: ['choice', 'refusal', 'predicate', 'score'].includes(answer.type ?? '')
                        ? answer.type
                        : 'unknown',
                      namedHint: answer.name === 'practice_hint',
                      choice: isHintId(answer.choice) ? answer.choice : 'unknown',
                    }),
                  )
                : 'missing',
            }),
          );
        }
        if (!response.ok) {
          const error = await response
            .clone()
            .json()
            .catch(() => ({}));
          const codes = [
            'invalid_api_key',
            'missing_scope',
            'insufficient_quota',
            'rate_limit_exceeded',
            'model_not_found',
            'invalid_request_error',
            'permission_denied',
          ];
          console.log(
            JSON.stringify({
              upstreamStatus: response.status,
              errorCode: codes.includes(error?.error?.code) ? error.error.code : 'unclassified',
            }),
          );
        }
        return response;
      } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code;
        console.log(
          JSON.stringify({
            transportError: [
              'ENOTFOUND',
              'ECONNRESET',
              'ECONNREFUSED',
              'UND_ERR_CONNECT_TIMEOUT',
            ].includes(code ?? '')
              ? code
              : 'connection_failed',
          }),
        );
        throw error;
      }
    },
  });
  const actual = 'hint' in result.body ? result.body.hint : null;
  const passed = result.status === 200 && actual === test.expected;
  const summary = {
    name: test.name,
    status: result.status,
    expected: test.expected,
    actual,
    passed,
    ...('code' in result.body ? { code: result.body.code } : {}),
  };
  results.push(summary);
  console.log(JSON.stringify(summary));
  if (result.status !== 200) break;
}
await mkdir('output', { recursive: true });
await writeFile(
  'output/hint-api-verification.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      kind: 'real Decisions API practice hints',
      results,
    },
    null,
    2,
  ),
);
if (results.length !== cases.length || results.some((result) => !result.passed))
  process.exitCode = 1;
