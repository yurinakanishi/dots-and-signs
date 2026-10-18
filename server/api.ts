import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createSessionConfig,
  LIVE_MODEL,
  DECISIONS_MODEL,
  MAX_SESSION_SECONDS,
  DAILY_SESSION_LIMIT,
} from './session-config.ts';

type Options = {
  apiKey?: string;
  port: number;
  fetch?: typeof fetch;
  now?: () => number;
  reserveSession: () => Promise<'allowed' | 'limit' | 'unavailable'>;
};
const BODY_LIMIT = 64 * 1024;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

export function createApiHandler(options: Options) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const origins = new Set([`http://127.0.0.1:${options.port}`, `http://localhost:${options.port}`]);
  let attempts: number[] = [];
  let inFlight = false;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (!req.url?.startsWith('/api/')) return false;
    if (!origins.has(`http://${req.headers.host}`)) {
      json(res, 403, { error: 'ローカルのURLから開いてください。', code: 'invalid_host' });
      return true;
    }
    if (req.url === '/api/live/status' && req.method === 'GET') {
      json(res, 200, {
        configured: Boolean(options.apiKey),
        liveModel: LIVE_MODEL,
        decisionsModel: DECISIONS_MODEL,
        maxSessionSeconds: MAX_SESSION_SECONDS,
        dailySessionLimit: DAILY_SESSION_LIMIT,
      });
      return true;
    }
    if (req.url !== '/api/live/session') {
      json(res, 404, { error: 'APIが見つかりません。' });
      return true;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      json(res, 405, { error: 'POSTを使用してください。' });
      return true;
    }
    if (
      !origins.has(req.headers.origin ?? '') ||
      req.headers.origin !== `http://${req.headers.host}`
    ) {
      json(res, 403, { error: 'このページからの接続だけ利用できます。', code: 'invalid_origin' });
      return true;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      json(res, 415, { error: 'JSONが必要です。' });
      return true;
    }
    if (Number(req.headers['content-length']) > BODY_LIMIT) {
      json(res, 413, { error: '接続データが大きすぎます。' });
      return true;
    }
    let body: unknown;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
          json(res, 413, { error: '接続データが大きすぎます。' });
          return true;
        }
        chunks.push(Buffer.from(chunk));
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      if (!res.destroyed) json(res, 400, { error: '接続データを読み取れません。' });
      return true;
    }
    const sdp = body && typeof body === 'object' && 'sdp' in body ? body.sdp : null;
    if (
      typeof sdp !== 'string' ||
      !sdp.startsWith('v=0') ||
      !/^m=audio /m.test(sdp) ||
      /^m=video /m.test(sdp)
    ) {
      json(res, 400, { error: '音声接続のSDP offerが必要です。', code: 'invalid_sdp' });
      return true;
    }
    if (!options.apiKey) {
      json(res, 503, {
        error: '音声アシストの接続設定がまだありません。手動で教材を選んで練習できます。',
        code: 'not_configured',
      });
      return true;
    }
    attempts = attempts.filter((time) => now() - time < 60_000);
    if (inFlight || attempts.length >= 5) {
      res.setHeader('Retry-After', '60');
      json(res, 429, {
        error: '接続が続いています。1分待ってからお試しください。',
        code: 'rate_limit',
      });
      return true;
    }
    attempts.push(now());
    inFlight = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20_000);
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', onClose);
    try {
      const allowance = await options.reserveSession();
      if (allowance !== 'allowed') {
        json(res, allowance === 'limit' ? 429 : 503, {
          error:
            allowance === 'limit'
              ? `本日の音声接続は${DAILY_SESSION_LIMIT}回までです。次の日まで手動で練習できます（毎日9時・日本時間に更新）。`
              : '利用回数を確認できないため、課金を防ぐために音声接続を止めています。手動で練習できます。',
          code: allowance === 'limit' ? 'daily_limit' : 'usage_unavailable',
        });
        return true;
      }
      const upstream = await request('https://api.openai.com/v1/live/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: createSessionConfig(),
          transport: { type: 'webrtc', sdp },
        }),
        signal: abort.signal,
      });
      if (!upstream.ok) {
        // Do not forward provider error text: it may contain request details.
        await upstream.body?.cancel();
        const status = upstream.status;
        const error =
          status === 401
            ? 'APIキーの認証に失敗しました。サーバーの設定を確認してください。'
            : status === 403
              ? 'GPT-LiveまたはDecisionsの利用権限がありません。プロジェクトの権限を確認してください。'
              : status === 429
                ? 'APIの利用上限または残高を確認してください。少し待ってから再接続できます。'
                : '音声サービスに接続できませんでした。少し待ってからお試しください。';
        json(res, status === 429 ? 429 : 502, {
          error,
          code: 'upstream_error',
          upstreamStatus: status,
        });
        return true;
      }
      const data = (await upstream.json()) as {
        session?: { id?: unknown };
        transport?: { type?: unknown; sdp?: unknown };
      };
      if (
        typeof data.session?.id !== 'string' ||
        data.transport?.type !== 'webrtc' ||
        typeof data.transport.sdp !== 'string'
      ) {
        json(res, 502, {
          error: '音声サービスから正しい接続情報を受け取れませんでした。',
          code: 'invalid_response',
        });
        return true;
      }
      json(res, 201, {
        session: { id: data.session.id },
        transport: { type: 'webrtc', sdp: data.transport.sdp },
      });
    } catch {
      if (!res.destroyed)
        json(res, abort.signal.aborted ? 504 : 502, {
          error: '音声サービスに接続できませんでした。ネットワークを確認して再度お試しください。',
          code: 'connection_failed',
        });
    } finally {
      clearTimeout(timer);
      res.off('close', onClose);
      inFlight = false;
    }
    return true;
  };
}
