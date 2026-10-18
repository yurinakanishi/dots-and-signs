// No API billing: mocked transport, real React UI and controller.
async (page) => {
  const checks = [], errors = [];
  let paidAttempts = 0, apiFailure = false;
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  await page.route('**/api/live/**', route => {
    const status = route.request().url().endsWith('/status');
    if (!status) paidAttempts++;
    return route.fulfill({
      status: status ? 200 : apiFailure ? 429 : 201,
      contentType: 'application/json',
      body: JSON.stringify(status ? { configured: true } : apiFailure
        ? { error: 'APIの利用上限または残高を確認してください。' }
        : { session: { id: 'live_ui_test' }, transport: { type: 'webrtc', sdp: 'test' } }),
    });
  });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://127.0.0.1:5173/');
    await page.evaluate(() => {
      window.__micCalls = 0; window.__sent = []; window.__denyMic = false;
      window.__holdClose = false; window.__deferMic = false; window.__audioPauses = 0;
      window.__emit = event => window.__channel.onmessage?.({ data: JSON.stringify(event) });
      window.__decision = (id, choice) => {
        window.__emit({ type: 'session.delegation.created', delegation: { id } });
        window.__emit({ type: 'decision.event', delegation_id: id, event: {
          type: 'decision.completed', decision: { answers: [{ name: 'lesson_id', type: 'choice', choice }] },
        } });
      };
      window.Audio = class {
        async play() {}
        pause() { window.__audioPauses++; }
      };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true, value: async options => {
          window.__micCalls++; window.__micOptions = options;
          if (window.__denyMic) throw new DOMException('test', 'NotAllowedError');
          const track = Object.assign(new EventTarget(), {
            enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; },
          });
          window.__track = track;
          const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
          if (window.__deferMic) return new Promise(resolve => { window.__grantMic = () => resolve(stream); });
          return stream;
        },
      });
      window.RTCPeerConnection = class {
        localDescription = { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' };
        iceGatheringState = 'complete';
        addTrack() {}
        createDataChannel() {
          window.__channel = {
            readyState: 'open', close() {}, send(data) {
              const event = JSON.parse(data); window.__sent.push(event);
              if (event.type === 'session.close' && !window.__holdClose)
                queueMicrotask(() => window.__emit({ type: 'session.closed', usage: { seconds: 1 } }));
            },
          };
          return window.__channel;
        }
        async createOffer() { return this.localDescription; }
        async setLocalDescription() {}
        async setRemoteDescription() {
          queueMicrotask(() => window.__emit({ type: 'session.started', session: { id: 'live_ui_test' } }));
        }
        close() {}
      };
    });
    const voiceMode = page.getByRole('button', { name: '音声入力モード', exact: true });
    const selectionMode = page.getByRole('button', { name: '選択モード', exact: true });
    const mic = page.getByRole('switch', { name: '音声入力', exact: true });
    const fallback = page.getByRole('button', { name: '選択モードに切り替える', exact: true });
    assert(await selectionMode.getAttribute('aria-pressed') === 'true', 'selection mode is the default');
    assert(await page.getByRole('navigation').getByRole('button').count() === 4, 'four shared lesson choices');
    await page.waitForFunction(() => [...document.querySelectorAll('.lesson-thumbnail img')].every(i => i.complete && i.naturalWidth > 0));
    assert(true, 'all four supplied images load');
    assert(await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.lesson-thumbnail')].map(e => e.getBoundingClientRect());
      return boxes.every(b => Math.abs(b.width - b.height) < 1) && boxes[0].y === boxes[1].y && boxes[2].y > boxes[0].y;
    }), 'square thumbnails form a two by two grid');
    assert(await page.evaluate(() => window.__micCalls === 0) && paidAttempts === 0, 'selection mode requests no microphone or paid session');
    await page.screenshot({ path: 'output/playwright/input-selection.png', fullPage: true });
    await voiceMode.click();
    assert(await mic.getAttribute('aria-checked') === 'false', 'entering voice mode starts OFF');
    assert(await page.evaluate(() => window.__micCalls === 0) && paidAttempts === 0, 'choosing voice mode alone makes no paid request');
    await page.screenshot({ path: 'output/playwright/input-voice-off.png', fullPage: true });
    await mic.click();
    await page.getByText('お話しください', { exact: true }).waitFor();
    assert(await mic.getAttribute('aria-checked') === 'true', 'explicit switch turns voice ON');
    assert(await page.evaluate(() => window.__micOptions.video === false), 'voice requests audio only');
    await page.evaluate(() => window.__decision('one', 'thanks'));
    await page.getByRole('button', { name: 'このことばを練習する' }).waitFor();
    assert(await page.getByRole('heading', { name: 'こんにちは', exact: true }).isVisible(), 'proposal waits for user confirmation');
    await page.getByRole('button', { name: 'このことばを練習する' }).click();
    await page.getByRole('heading', { name: 'ありがとう', exact: true }).waitFor();
    assert(await page.evaluate(() => window.__sent.some(e => e.delegation_id === 'one' && e.content?.includes('実際に表示'))), 'React commit acknowledges the displayed lesson');
    assert(await page.getByText('カメラ OFF', { exact: true }).isVisible(), 'voice never starts the camera');
    await page.evaluate(() => window.__decision('fourth', 'welcome'));
    await page.locator('.voice-proposal-note').waitFor();
    assert((await page.locator('.voice-proposal-note').innerText()).includes('指文字は確認中'), 'fourth proposal describes its limited scope before confirmation');
    await page.getByRole('button', { name: 'このことばを練習する' }).click();
    await page.getByRole('heading', { name: 'OpenAIへようこそ', exact: true }).waitFor();
    assert(await page.locator('.practice-progress').count() === 0, 'fourth lesson does not borrow another sign classifier');
    assert(await page.evaluate(() => window.__sent.some(e => e.delegation_id === 'fourth' && e.content?.includes('自動判定はありません'))), 'fourth lesson limitation reaches voice commentary');
    await page.evaluate(() => window.__decision('uncertain', 'unclear'));
    await page.getByText('練習したいことばを、もう一度1つだけ話してね。「こんにちは」だけでも選べるよ。', { exact: true }).waitFor();
    assert(await page.locator('.voice-unsupported').count() === 0, 'uncertain speech asks again without claiming the lesson is unavailable');
    assert(await page.getByRole('heading', { name: 'OpenAIへようこそ', exact: true }).isVisible(), 'uncertain speech keeps the displayed lesson');
    assert(await page.evaluate(() => window.__sent.some(e => e.delegation_id === 'uncertain' && e.content?.includes('もう一度1つだけ'))), 'clarification reaches the same voice delegation');
    await page.evaluate(() => {
      window.__emit({ type: 'session.input_transcript.delta', event_id: 'hello-input', delta: 'こんにちはいや、あるあるよ入っちゃ', start_ms: 0, end_ms: 1000 });
      window.__decision('hello-retry', 'hello');
    });
    await page.getByRole('button', { name: 'このことばを練習する' }).waitFor();
    assert((await page.locator('.voice-recommendation strong').innerText()) === 'こんにちは', 'hello can be proposed after unclear speech');
    assert(await page.getByRole('heading', { name: 'OpenAIへようこそ', exact: true }).isVisible(), 'hello still waits for confirmation');
    await page.getByRole('button', { name: 'このことばを練習する' }).click();
    await page.getByRole('heading', { name: 'こんにちは', exact: true }).waitFor();
    assert(await page.evaluate(() => window.__sent.some(e => e.delegation_id === 'hello-retry' && e.content?.includes('実際に表示'))), 'confirmed hello is acknowledged to its delegation');
    await page.evaluate(() => {
      window.__emit({ type: 'session.input_transcript.delta', event_id: 'u1', delta: '受付を案内したい', start_ms: 0, end_ms: 1000 });
      window.__emit({ type: 'session.output_transcript.delta', event_id: 'a1', delta: 'この文章の手話はまだ教材化していません。', start_ms: 1000, end_ms: 2000 });
      window.__decision('unsupported', 'none');
    });
    await page.locator('.voice-unsupported').waitFor();
    assert(await page.getByRole('heading', { name: 'こんにちは', exact: true }).isVisible(), 'unsupported request preserves the current lesson');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'voice mode fits mobile width');
    await page.screenshot({ path: 'output/playwright/input-voice-mobile.png', fullPage: true });
    await mic.click();
    await page.waitForFunction(() => !document.querySelector('[role=switch]').disabled);
    assert(await mic.getAttribute('aria-checked') === 'false' && await page.evaluate(() => window.__track.readyState === 'ended'), 'OFF releases the microphone');
    await mic.click();
    await page.getByText('お話しください', { exact: true }).waitFor();
    await page.evaluate(() => { window.__holdClose = true; window.__decision('late', 'thanks'); window.__beforePause = window.__audioPauses; });
    await fallback.click();
    assert(await page.evaluate(() => !window.__track.enabled && window.__audioPauses > window.__beforePause), 'selection fallback immediately silences input and output');
    await page.getByRole('button', { name: 'こんばんは', exact: true }).click();
    await page.evaluate(() => { window.__decision('late', 'thanks'); window.__emit({ type: 'session.closed' }); window.__holdClose = false; });
    assert(await page.getByRole('heading', { name: 'こんばんは', exact: true }).isVisible(), 'late voice result cannot replace a manual lesson');
    const attemptsBeforeFailure = paidAttempts;
    await page.evaluate(() => { window.__denyMic = true; });
    await voiceMode.click(); await mic.click();
    await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').innerText()).includes('マイクが許可されていません') && paidAttempts === attemptsBeforeFailure, 'microphone refusal makes no paid request');
    await fallback.click();
    assert(await page.getByRole('navigation').getByRole('button').count() === 4, 'all four choices remain after voice failure');
    await page.getByRole('button', { name: 'OpenAIへようこそ', exact: true }).click();
    await page.screenshot({ path: 'output/playwright/welcome-practice.png', fullPage: true });
    await page.evaluate(() => { window.__denyMic = false; window.__deferMic = true; });
    await voiceMode.click(); await mic.click();
    await page.waitForFunction(() => typeof window.__grantMic === 'function');
    await fallback.click();
    await page.evaluate(() => window.__grantMic());
    await page.waitForFunction(() => window.__track.readyState === 'ended');
    assert(paidAttempts === attemptsBeforeFailure, 'mode switch cancels pending microphone permission without a paid session');
    await page.evaluate(() => { window.__deferMic = false; });
    apiFailure = true;
    await voiceMode.click(); await mic.click();
    await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').innerText()).includes('利用上限') && await mic.getAttribute('aria-checked') === 'false', 'API limit errors leave voice OFF');
    await fallback.click();
    await page.getByRole('button', { name: 'ありがとう', exact: true }).click();
    assert(await page.getByRole('heading', { name: 'ありがとう', exact: true }).isVisible(), 'selection works after an API limit error');
    assert(paidAttempts === attemptsBeforeFailure + 1, 'API failure never automatically retries');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'selection mode fits mobile width');
    await page.screenshot({ path: 'output/playwright/input-selection-mobile.png', fullPage: true });
    assert(errors.length === 0, 'no unhandled browser errors');
    return { passed: checks.length, checks };
  } finally {
    page.off('pageerror', onError);
    await page.unroute('**/api/live/**');
    await page.reload();
  }
}
