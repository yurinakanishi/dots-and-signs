async (page) => {
  // Synthetic landmarks verify camera -> recognizer -> UI wiring, not real-user accuracy.
  const checks = [],
    errors = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const onError = (e) => errors.push(e.message);
  const previewUrl = page.url();
  page.on('pageerror', onError);
  await page.goto('http://127.0.0.1:5173/');
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixtures = await page.evaluate(async () => {
    const { frame, makeHand, greeting } = await import('/tests/fixtures.ts');
    const resting = makeHand('fist', 0.8, 0.7, true);
    resting.landmarks[20].y = 1.02;
    const hideFace = (f) => {
      for (const i of [0, 2, 5]) f.poses[0][i].visibility = 0.1;
      return f;
    };
    return {
      wrong: frame([makeHand('index', 0, -0.4)]),
      low: frame([makeHand('two', 0, 0.3)]),
      forehead: frame([makeHand('two', 0, -0.4), resting]),
      one: hideFace(frame([greeting()[0]])),
      index: hideFace(frame(greeting())),
      bow: hideFace(frame(greeting(true))),
    };
  });
  // Also runs against the production build; only fixture creation needs Vite.
  if (previewUrl.startsWith('http://127.0.0.1:5174/')) await page.goto(previewUrl);
  await page.evaluate((fixtures) => {
    window.__helloInput = fixtures.wrong;
    window.__helloFixtures = fixtures;
    window.__helloNativeWorker = window.Worker;
    window.Worker = class {
      stopped = false;
      postMessage(data) {
        if (data.type === 'init')
          queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
        else {
          data.bitmap.close();
          const input = structuredClone(window.__helloInput);
          setTimeout(() => {
            if (!this.stopped)
              this.onmessage?.({
                data: { ...input, type: 'result', timestamp: data.timestamp, inferenceMs: 5 },
              });
          }, 5);
        }
      }
      terminate() {
        this.stopped = true;
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        const paint = () => {
          ctx.fillStyle = '#53644b';
          ctx.fillRect(0, 0, 1280, 720);
        };
        paint();
        window.__helloTimer = setInterval(paint, 30);
        window.__helloStream = canvas.captureStream(30);
        return window.__helloStream;
      },
    });
  }, fixtures);
  const set = (name) =>
    page.evaluate((name) => {
      window.__helloInput = window.__helloFixtures[name];
    }, name);
  const imageIs = (step) =>
    page
      .locator('.sign-demo')
      .getAttribute('src')
      .then((src) => src.endsWith(`hello-step-${step}.png`));
  try {
    for (const step of [1, 2, 3]) {
      await page
        .locator('.demo-steps button')
        .nth(step - 1)
        .click();
      await page.waitForFunction(() => {
        const img = document.querySelector('.sign-demo');
        return img.complete && img.naturalWidth > 0;
      });
      check(await imageIs(step), `manual step ${step} shows its own image`);
    }
    await page.locator('.demo-steps button').nth(0).click();
    await page.getByRole('button', { name: '手順を再生', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.sign-demo').getAttribute('src').endsWith('hello-step-2.png'),
    );
    check(true, 'automatic preview changes the image with the step');
    await page.locator('.demo-steps button').nth(0).click();
    check(
      !(await page.getByRole('button', { name: '音声入力モード Coming Soon' }).isEnabled()),
      'voice stays Coming Soon',
    );
    await page.getByRole('button', { name: 'カメラで練習する', exact: true }).click();
    await page
      .getByText('人差し指と中指の2本を伸ばして、薬指と小指をたたんでね。', { exact: true })
      .waitFor();
    check(true, 'wrong finger shape has specific feedback');
    await set('low');
    await page
      .getByText('指の形はOK。2本の指先を、額の真ん中に近づけてね。', { exact: true })
      .waitFor();
    check(
      (await page.locator('.progress-done').count()) === 0,
      'two fingers at chest do not advance',
    );
    await page.screenshot({
      path: 'output/playwright/hello-position-feedback.png',
      fullPage: true,
    });
    await set('forehead');
    await page.getByText('ステップ 2 / 3', { exact: true }).waitFor();
    check(
      (await page.locator('.progress-done').count()) === 1,
      'clipped unused resting hand does not block forehead',
    );
    check(await imageIs(2), 'camera step 2 shows upright index fingers');
    await set('one');
    await page
      .getByText('もう片方の手も映して、両手の人差し指を立てよう。', { exact: true })
      .waitFor();
    check(
      (await page.locator('.progress-done').count()) === 1,
      'second step still needs both hands',
    );
    await set('index');
    await page.getByText('ステップ 3 / 3', { exact: true }).waitFor();
    check(
      (await page.locator('.progress-done').count()) === 2,
      'greeting works when head is lowered and shoulders remain visible',
    );
    check(await imageIs(3), 'camera step 3 shows the bent fingers');
    await set('one');
    await page.getByText('ステップ3の準備', { exact: true }).waitFor();
    check(await imageIs(2), 'tracking recovery shows the upright preparation image');
    await set('index');
    await page.getByText('あなたのステップに連動', { exact: true }).waitFor();
    check(await imageIs(3), 're-established starting pose restores the bow image');
    await set('bow');
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor();
    check((await page.locator('.progress-done').count()) === 3, 'both finger bows complete hello');
    await page.screenshot({ path: 'output/playwright/hello-complete.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'mobile has no horizontal overflow',
    );
    await page.getByRole('button', { name: 'もう一度', exact: true }).click();
    check((await page.locator('.progress-done').count()) === 0, 'retry resets earned steps');
    await page.getByRole('button', { name: 'カメラをとめる', exact: true }).click();
    check(
      await page.evaluate(() =>
        window.__helloStream.getTracks().every((t) => t.readyState === 'ended'),
      ),
      'camera stop releases stream',
    );
    check(errors.length === 0, 'no uncaught errors');
    return { passed: checks.length, checks };
  } finally {
    await page.evaluate(() => {
      clearInterval(window.__helloTimer);
      window.__helloStream?.getTracks().forEach((t) => t.stop());
      window.Worker = window.__helloNativeWorker;
    });
    page.off('pageerror', onError);
    await page.reload();
  }
}
