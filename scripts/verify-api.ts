import { mkdir, writeFile } from 'node:fs/promises';
import { lessonQuestion, DECISIONS_MODEL } from '../server/session-config.ts';

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is missing. Set it in .env.');
  process.exit(1);
}
const cases = [
  { input: 'こんにちは', expected: 'hello' },
  { input: 'こんにちはいや、あるあるよ入っちゃ', expected: 'hello' },
  { input: 'あの、こんにちは、こんにちは', expected: 'hello' },
  { input: 'こんばんは', expected: 'evening' },
  { input: 'えー、こんばんは、あの', expected: 'evening' },
  { input: 'ありがとう', expected: 'thanks' },
  { input: 'ありがとうございます', expected: 'thanks' },
  { input: 'OpenAIへようこそ', expected: 'welcome' },
  { input: 'ようこそ', expected: 'welcome' },
  { input: 'こんにちはを手話で練習したいです。', expected: 'hello' },
  { input: 'こんばんはを手話で練習したいです。', expected: 'evening' },
  { input: '助けてくれた人にありがとうと伝えたい。', expected: 'thanks' },
  { input: 'OpenAIへようこそを練習したいです。', expected: 'welcome' },
  { input: '私はOpenAIのイベントに参加したい、と手話で伝えたい。', expected: 'none' },
  { input: 'こんにちは、受付はどこですかを手話にして', expected: 'none' },
  { input: 'ありがとう、明日は来られませんという文章を手話にして', expected: 'none' },
  { input: 'おはよう', expected: 'none' },
  { input: 'こんにちはじゃなくて、こんばんは', expected: 'evening' },
  { input: 'こんにちははやめて', expected: 'unclear' },
  { input: 'やっぱり取り消し', expected: 'unclear' },
  { input: 'あの、その、ええと', expected: 'unclear' },
  { input: 'こんにちはとありがとうのどちらにしようかな', expected: 'unclear' },
];
const results: unknown[] = [];
let failed = false;
for (const test of cases) {
  const response = await fetch('https://api.openai.com/v1/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DECISIONS_MODEL,
      input: test.input,
      questions: [lessonQuestion],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json()) as {
    answers?: { name: string; type: string; choice?: string }[];
    error?: { code?: string; type?: string };
  };
  const actual = data.answers?.find((a) => a.name === 'lesson_id' && a.type === 'choice')?.choice;
  const passed = response.ok && actual === test.expected;
  const result = {
    input: test.input,
    expected: test.expected,
    actual: actual ?? null,
    status: response.status,
    passed,
    ...(data.error ? { errorCode: data.error.code, errorType: data.error.type } : {}),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  failed ||= !passed;
  if (!response.ok) break;
}
await mkdir('output', { recursive: true });
await writeFile(
  'output/api-verification.json',
  JSON.stringify(
    { checkedAt: new Date().toISOString(), kind: 'real Decisions API', results },
    null,
    2,
  ),
);
process.exitCode = failed ? 1 : 0;
