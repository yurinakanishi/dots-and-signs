// Build Sites, initialize the local D1 schema once, then npm run preview -- --port 5174.
async (page) => {
  const checks = [],
    errors = [];
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
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
    await page.getByRole('button', { name: '音声入力モード', exact: true }).click();
    assert(await page.getByRole('switch', { name: '音声入力', exact: true }).getAttribute('aria-checked') === 'false', 'production voice mode starts OFF');
    await page.getByRole('button', { name: '選択モード', exact: true }).click();
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
    await page.screenshot({ path: 'output/playwright/local-ready.png', fullPage: true });
    return { passed: checks.length, checks };
  } finally {
    page.off('pageerror', onError);
    await page.goto('http://127.0.0.1:5173/');
  }
}
