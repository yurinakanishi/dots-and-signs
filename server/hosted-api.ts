import {
  createSessionConfig,
  LIVE_MODEL,
  DECISIONS_MODEL,
  MAX_SESSION_SECONDS,
  DAILY_SESSION_LIMIT,
} from './session-config';
import { reserveHostedSession, type UsageEnv } from './hosted-usage';

export type HostedEnv = UsageEnv & { OPENAI_API_KEY?: string };
const SITE_ORIGIN = 'https://practice-signs-with-dots.yurinakanishi33.chatgpt.site';
const BODY_LIMIT = 64 * 1024;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

async function readJson(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if (!stream) throw new Error('invalid_json');
  const reader = stream.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Sites owns private-site access. No separate sign-in or OAuth stack is added.
// This global endpoint is not user-owned data and remains behind owner-only access.
export async function handleHostedApi(
  req: Request,
  env: HostedEnv,
  dependencies: {
    fetch?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<Response> {
  const url = new URL(req.url);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.origin !== SITE_ORIGIN && !local) return json(403, { code: 'invalid_host' });
  if (url.pathname === '/api/live/status' && req.method === 'GET') {
    return json(200, {
      configured: Boolean(env.OPENAI_API_KEY && env.DB),
      liveModel: LIVE_MODEL,
      decisionsModel: DECISIONS_MODEL,
      maxSessionSeconds: MAX_SESSION_SECONDS,
      dailySessionLimit: DAILY_SESSION_LIMIT,
    });
  }
  if (url.pathname !== '/api/live/session') return json(404, { error: 'APIが見つかりません。' });
  if (req.method !== 'POST')
    return json(405, { error: 'POSTを使用してください。' }, { Allow: 'POST' });
  if (req.headers.get('origin') !== url.origin) {
    return json(403, { error: 'このページからの接続だけ利用できます。', code: 'invalid_origin' });
  }
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return json(415, { error: 'JSONが必要です。' });
  }
  if (Number(req.headers.get('content-length')) > BODY_LIMIT) {
    return json(413, { error: '接続データが大きすぎます。' });
  }
  let body;
  try {
    body = await readJson(req.body, BODY_LIMIT);
  } catch (error) {
    return json(error instanceof Error && error.message === 'too_large' ? 413 : 400, {
      error: '接続データを読み取れません。',
    });
  }
  const sdp = body?.sdp;
  if (
    typeof sdp !== 'string' ||
    !sdp.startsWith('v=0') ||
    !/^m=audio /m.test(sdp) ||
    /^m=video /m.test(sdp)
  ) {
    return json(400, { error: '音声接続のSDP offerが必要です。', code: 'invalid_sdp' });
  }
  if (!env.OPENAI_API_KEY || !env.DB) {
    return json(503, {
      error: '音声の接続設定がまだありません。選択モードで練習できます。',
      code: 'not_configured',
    });
  }
  const allowance = await reserveHostedSession(env, (dependencies.now ?? Date.now)());
  if (allowance !== 'allowed') {
    if (allowance === 'limit')
      return json(429, {
        error: `本日の音声接続は${DAILY_SESSION_LIMIT}回までです。毎日9時（日本時間）に更新されます。選択モードで練習できます。`,
        code: 'daily_limit',
      });
    if (allowance === 'rate')
      return json(
        429,
        {
          error: '音声接続が続いています。90秒待ってからお試しください。',
          code: 'rate_limit',
        },
        { 'Retry-After': '90' },
      );
    return json(503, {
      error:
        '利用回数を確認できないため、課金を防ぐために音声接続を止めています。選択モードで練習できます。',
      code: 'usage_unavailable',
    });
  }
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]);
  try {
    const upstream = await (dependencies.fetch ?? fetch)(
      'https://api.openai.com/v1/live/sessions',
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: createSessionConfig(),
          transport: { type: 'webrtc', sdp },
        }),
      },
    );
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return json(upstream.status === 429 ? 429 : 502, {
        error:
          upstream.status === 429
            ? 'APIの利用上限に達したか、一時的に混み合っています。選択モードで練習できます。'
            : '音声サービスに接続できませんでした。選択モードで練習できます。',
        code: 'upstream_error',
        upstreamStatus: upstream.status,
      });
    }
    const data = await readJson(upstream.body, 128 * 1024);
    if (
      typeof data?.session?.id !== 'string' ||
      data?.transport?.type !== 'webrtc' ||
      typeof data.transport.sdp !== 'string'
    ) {
      return json(502, {
        error: '音声の接続情報を受け取れませんでした。',
        code: 'invalid_response',
      });
    }
    return json(201, {
      session: { id: data.session.id },
      transport: { type: 'webrtc', sdp: data.transport.sdp },
    });
  } catch {
    return json(signal.aborted ? 504 : 502, {
      error: '音声に接続できませんでした。選択モードで練習できます。',
      code: 'connection_failed',
    });
  }
}
