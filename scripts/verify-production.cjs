// Build Sites, initialize the local D1 schema once, then npm run preview -- --port 5174.
async (page) => {
  const checks = [],
    errors = [];
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const onError = (error) => errors.push(error.message);
  let voiceRequests = 0;
  const onRequest = (request) => { if (request.url().includes('/api/live/')) voiceRequests++; };
  page.on('pageerror', onError);
  page.on('request', onRequest);
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://127.0.0.1:5174/');
    await page.getByRole('heading', { name: 'ひとことを、手話で。' }).waitFor();
    assert(
      (await page.getByRole('navigation').getByRole('button').count()) === 4,
      'production bundle renders four lessons',
    );
    await page.waitForFunction(() => [...document.querySelectorAll('.lesson-thumbnail img')].every(image => image.complete && image.naturalWidth > 0));
    assert(true, 'four supplied images are served by the production build');
    const artwork = await page.evaluate(async () => {
      const urls = [...document.querySelectorAll('.dot-artwork image')].map(image => image.getAttribute('href'));
      return urls.length > 0 && (await Promise.all(urls.map(async url => {
        if (!url || url.includes('[object')) return false;
        const response = await fetch(url);
        return response.ok && response.headers.get('content-type')?.startsWith('image/');
      }))).every(Boolean);
    });
    assert(artwork, 'character bodies are real image URLs in both bundlers');
    assert(await page.getByRole('button', { name: '音声入力モード Coming Soon', exact: true }).isDisabled(), 'voice mode is Coming Soon and cannot be activated');
    assert(await page.getByRole('switch', { name: '音声入力', exact: true }).count() === 0, 'voice controls are not rendered');
    for (const name of ['こんばんは', 'ありがとう', 'OpenAIへようこそ', 'こんにちは']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
    }
    assert(voiceRequests === 0, 'all four choices work without contacting the voice API');
    const probe = await page.evaluate(async () => {
      const status = await (await fetch('/api/live/status')).json();
      const env = await fetch('/.env'),
        accounting = await fetch('/.local/live-usage.json');
      const forbidden = await fetch('/api/live/session', { method: 'GET' });
      const worker = new Worker('/vision-worker.js');
      const wait = () =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('worker timeout')), 30000);
          worker.onmessage = ({ data }) => {
            clearTimeout(timer);
            data.type === 'error' ? reject(new Error(data.message)) : resolve(data);
          };
          worker.onerror = (error) => {
            clearTimeout(timer);
            reject(new Error(error.message));
          };
        });
      try {
        let pending = wait();
        worker.postMessage({ type: 'init' });
        const ready = await pending;
        const canvas = new OffscreenCanvas(640, 480),
          ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ddd';
        ctx.fillRect(0, 0, 640, 480);
        const bitmap = canvas.transferToImageBitmap();
        pending = wait();
        worker.postMessage({ type: 'frame', bitmap, timestamp: 500 }, [bitmap]);
        const result = await pending;
        return {
          status,
          envStatus: env.status,
          accountingStatus: accounting.status,
          methodStatus: forbidden.status,
          ready: ready.type,
          hands: result.hands.length,
          poses: result.poses.length,
        };
      } finally {
        worker.terminate();
      }
    });
    assert(
      probe.status.maxSessionSeconds === 60 && probe.status.dailySessionLimit === 10,
      'same-origin production API advertises cost controls',
    );
    assert(
      probe.envStatus === 404 && probe.accountingStatus === 404,
      'server-only files are not served',
    );
    assert(probe.methodStatus === 405, 'session creation rejects GET without a paid request');
    assert(
      probe.ready === 'ready' && probe.hands === 0 && probe.poses === 0,
      'both production models load and process an empty image',
    );
    assert(errors.length === 0, 'no unhandled production page errors');
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('img')].map(image => image.decode()));
      await Promise.all([...document.querySelectorAll('.dot-artwork image')].map(el => {
        const image = new Image(); image.src = el.href.baseVal; return image.decode();
      }));
    });
    await page.screenshot({ path: 'output/playwright/local-ready.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Coming Soon and the four choices fit a 320px screen');
    await page.screenshot({ path: 'output/playwright/sites-coming-soon-mobile.png', fullPage: true });
    return { passed: checks.length, checks };
  } finally {
    page.off('pageerror', onError);
    page.off('request', onRequest);
    await page.goto('http://127.0.0.1:5173/');
  }
}
