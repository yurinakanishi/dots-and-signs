// Playwright CLI run-code. Synthetic camera/landmarks, real HTTP + Decisions API.
// Start the local server on port 5176 with the existing OPENAI_API_KEY.
// prettier-ignore
async (page) => {
  const checks = [],
    requests = [],
    responses = [],
    errors = [];
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const onRequest = (request) => {
    if (request.url().endsWith('/api/practice/hint')) requests.push(request.postDataJSON());
  };
  const onResponse = async (response) => {
    if (response.url().endsWith('/api/practice/hint'))
      responses.push({ status: response.status(), body: await response.json().catch(() => null) });
  };
  const onError = (error) => errors.push(error.message);
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('pageerror', onError);
  try {
    await page.goto('http://127.0.0.1:5176/');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('heading', { name: 'ひとことを、手話で。' }).waitFor();
    assert(requests.length === 0, 'no API request before camera practice');
    await page.evaluate(async () => {
      const { frame, makeHand } = await import('/tests/fixtures.ts');
      window.__hintFrame = frame([makeHand('fist', 0, 0.25)]);
      window.__NativeWorker = window.Worker;
      window.Worker = class {
        terminated = false;
        postMessage(data) {
          if (data.type === 'init')
            queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
          else {
            data.bitmap.close();
            setTimeout(() => {
              if (!this.terminated)
                this.onmessage?.({
                  data: {
                    ...structuredClone(window.__hintFrame),
                    type: 'result',
                    timestamp: data.timestamp,
                    inferenceMs: 5,
                  },
                });
            }, 5);
          }
        }
        terminate() {
          this.terminated = true;
        }
      };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async (options) => {
          window.__hintCameraOptions = options;
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext('2d');
          const paint = () => {
            ctx.fillStyle = '#53644b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          };
          paint();
          window.__hintPaintTimer = setInterval(paint, 30);
          window.__hintStream = canvas.captureStream(30);
          return window.__hintStream;
        },
      });
    });
    await page.getByRole('button', { name: 'カメラで練習する', exact: true }).click();
    await page.locator('[data-practice-hint="follow_step"]').waitFor({ timeout: 25000 });
    assert(
      responses[0]?.status === 200 && responses[0]?.body.source === 'decisions',
      'real Decisions response reaches the coaching bubble',
    );
    assert(
      requests[0].handCount === 1 && requests[0].stalledSeconds >= 12,
      'request uses the observed stalled practice state',
    );
    assert(
      !JSON.stringify(requests).match(/landmarks|base64|input_image|audio/),
      'request contains summaries only',
    );
    assert(
      await page.evaluate(() => window.__hintCameraOptions.audio === false),
      'microphone is never requested',
    );
    await page.locator('[data-practice-hint="review_demo"]').waitFor({ timeout: 25000 });
    assert(
      requests[1].previousHints.includes('follow_step'),
      'the next decision receives earlier hint history',
    );
    await page.getByRole('link', { name: '今のお手本を見る ↑' }).click();
    assert(
      await page.locator('#lesson-demo').evaluate((element) => document.activeElement === element),
      'review hint focuses the current reference',
    );
    await page.screenshot({ path: 'output/playwright/practice-hints-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'mobile layout has no horizontal overflow',
    );
    await page.screenshot({ path: 'output/playwright/practice-hints-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'カメラをとめる' }).click();
    assert(
      (await page.locator('[data-practice-hint]').count()) === 0,
      'camera stop removes the API hint',
    );
    assert(
      await page.evaluate(() =>
        window.__hintStream.getTracks().every((track) => track.readyState === 'ended'),
      ),
      'camera stop releases tracks',
    );
    assert(errors.length === 0, 'no unhandled browser errors');
    return { passed: checks.length, checks, requests, responses };
  } catch (error) {
    const state = await page.locator('.practice-card').innerText();
    throw new Error(error.message + '\n' + JSON.stringify({ requests, responses, errors, state }));
  } finally {
    await page.evaluate(() => {
      clearInterval(window.__hintPaintTimer);
      window.__hintStream?.getTracks().forEach((track) => track.stop());
      if (window.__NativeWorker) window.Worker = window.__NativeWorker;
    });
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('pageerror', onError);
    await page.reload();
  }
}
