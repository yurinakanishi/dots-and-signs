// One-use loopback form: transfers a newly issued key without printing it.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const token = randomBytes(24).toString('hex');
const port = 5189;
const origin = `http://127.0.0.1:${port}`;
const target = new URL('../.env', import.meta.url);
const replacing = process.argv.includes('--replace');
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'unsafe-inline'",
  );
  if (req.headers.host !== `127.0.0.1:${port}` || req.url !== `/${token}`) {
    res.writeHead(404).end();
    return;
  }
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      '<!doctype html><html lang="ja"><meta charset="utf-8"><title>Dots ローカルAPI設定</title><body style="font:18px system-ui;max-width:680px;margin:80px auto;padding:20px"><h1>Dots ローカルAPI設定</h1><p>APIキーをこのPCの dots-sign/.env に保存します。</p><form method="post"><label>OpenAI APIキー <input type="password" name="key" autocomplete="off" required style="display:block;width:100%;padding:12px;margin:16px 0"></label><button>ローカルに保存</button></form></body></html>',
    );
    return;
  }
  if (req.method !== 'POST' || req.headers.origin !== origin) {
    res.writeHead(403).end();
    return;
  }
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 4096) {
        res.writeHead(413).end();
        return;
      }
    }
    const key = new URLSearchParams(body).get('key')?.trim();
    if (!key || !/^sk-[A-Za-z0-9_-]{20,500}$/.test(key)) {
      res.writeHead(400).end('Invalid key format');
      return;
    }
    let previous = '';
    try {
      previous = await readFile(target, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (/^OPENAI_API_KEY=.+$/m.test(previous) && !replacing) {
      res.writeHead(409).end('A key is already configured');
      return;
    }
    if (replacing && previous) {
      await writeFile(new URL('../.env.previous', import.meta.url), previous, { mode: 0o600, flag: 'wx' });
    }
    const updated = previous.replace(/^OPENAI_API_KEY=.*\r?\n?/m, '');
    await writeFile(target, `OPENAI_API_KEY=${key}\n${updated}`, { mode: 0o600 });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      '<!doctype html><html lang="ja"><meta charset="utf-8"><title>設定完了</title><h1>ローカル設定を保存しました</h1><p>キーは画面やログに表示していません。このページは閉じられます。</p></html>',
    );
    console.log('API key saved to ignored .env; setup server closed.');
    server.close();
  } catch {
    res.writeHead(500).end('Could not save local configuration');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`${origin}/${token}`));
setTimeout(() => server.close(), 15 * 60 * 1000).unref();
