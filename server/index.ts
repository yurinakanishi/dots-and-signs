import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { createApiHandler } from './api.ts';
import { createDailyLimit } from './usage-limit.ts';

const port = Number(process.env.PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be 1024–65535');
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const api = createApiHandler({
  port,
  apiKey: process.env.OPENAI_API_KEY,
  reserveSession: createDailyLimit(resolve(root, '.local/live-usage.json')),
});
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};
let vite: import('vite').ViteDevServer | undefined;
const server = createServer(async (req, res) => {
  try {
    if (await api(req, res)) return;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) {
      res.writeHead(403).end();
      return;
    }
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const path = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(dist + sep)) {
      res.writeHead(404).end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else
      createReadStream(path)
        .on('error', () => res.destroy())
        .pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(404).end('Not found. Run npm run build first.');
    else res.destroy();
  }
});

if (process.argv.includes('--dev')) {
  const { createServer: createVite } = await import('vite');
  vite = await createVite({
    root,
    server: {
      middlewareMode: true,
      hmr: { server },
      watch: { ignored: ['**/output/**', '**/.playwright-cli/**', '**/.local/**'] },
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] },
    },
    appType: 'spa',
  });
}
server.requestTimeout = 30_000;
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} is in use. Stop the existing server or set PORT in .env.`
      : 'Could not start local server.',
  );
  void vite?.close();
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}/`);
  console.log(
    `Voice assistant: ${process.env.OPENAI_API_KEY ? 'configured (API access not yet verified)' : 'not configured; camera practice is available'}`,
  );
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
    void vite?.close().then(() => process.exit());
  });
}
