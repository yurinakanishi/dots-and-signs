// Opt-in paid API check. Uses generated Japanese WAV fixtures, never a real microphone.
// Run generate-test-speech.ps1 first, then this file with playwright-cli run-code.
async (page) => {
  const checks = [],
    errors = [],
    statuses = [];
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const onError = (error) => errors.push(error.message);
  const onResponse = (response) => {
    if (response.url().endsWith('/api/live/session')) statuses.push(response.status());
  };
  page.on('pageerror', onError);
  page.on('response', onResponse);
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('http://127.0.0.1:5173/');
    await page.evaluate(() => {
      window.__liveEvents = [];
      window.__sentLiveEvents = [];
      window.__microphoneRequests = [];
      const NativePeer = window.RTCPeerConnection;
      window.__NativePeer = NativePeer;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(...args) {
          super(...args);
          window.__testPeer = this;
        }
        createDataChannel(...args) {
          const channel = super.createDataChannel(...args);
          channel.addEventListener('message', ({ data }) => {
            const event = JSON.parse(data);
            // Keep protocol evidence only; do not record audio, SDP or any credentials.
            window.__liveEvents.push({
              type: event.type,
              nestedType: event.event?.type,
              delegation: event.delegation_id ?? event.delegation?.id,
              choice: event.event?.decision?.answers?.find((a) => a.name === 'lesson_id')?.choice,
              delta: event.delta,
              errorCode: event.error?.code,
              missingScopes:
                event.error?.code === 'missing_scope'
                  ? String(event.error.message).match(/(?:api|model)\.[a-z_.]+/g)
                  : undefined,
              seconds: event.usage?.seconds,
              at: Date.now(),
            });
          });
          const send = channel.send.bind(channel);
          channel.send = (data) => {
            window.__sentLiveEvents.push(JSON.parse(data));
            return send(data);
          };
          return channel;
        }
      };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async (options) => {
          window.__microphoneRequests.push(options);
          if (options.video !== false || !options.audio)
            throw new Error('Unexpected camera request in voice test');
          const context = new AudioContext();
          window.__speechContext = context;
          const destination = context.createMediaStreamDestination();
          window.__speechDestination = destination;
          // Silence keeps the audio transport alive before and after each fixed phrase.
          const source = context.createConstantSource(),
            gain = context.createGain();
          gain.gain.value = 0;
          source.connect(gain).connect(destination);
          source.start();
          await context.resume();
          window.__testMicrophone = destination.stream;
          return destination.stream;
        },
      });
      window.__speakFixture = async (id) => {
        const context = window.__speechContext;
        const response = await fetch('/output/fixtures/' + id + '.wav');
        if (!response.ok) throw new Error('Generate Japanese WAV fixtures first');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(window.__speechDestination);
        await context.resume();
        source.start();
      };
    });
    await page.getByRole('button', { name: '音声入力モード', exact: true }).click();
    await page.getByRole('switch', { name: '音声入力', checked: false }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.voice-error') ||
        document.querySelector('.voice-session-status')?.textContent.includes('お話しください'),
      null,
      { timeout: 35000 },
    );
    assert(
      await page.getByText('お話しください', { exact: true }).isVisible(),
      'voice connection becomes ready',
    );
    assert(statuses[0] === 201, 'real Live session creation returns HTTP 201');
    assert(
      await page.evaluate(() => window.__liveEvents.some((e) => e.type === 'session.started')),
      'real session.started establishes readiness',
    );
    assert(
      await page.evaluate(() => window.__sentLiveEvents.every((e) => e.type !== 'session.start')),
      'WebRTC never sends session.start',
    );
    await page.evaluate(() => window.__speakFixture('thanks'));
    await page.getByRole('button', { name: 'このことばを練習する' }).waitFor({ timeout: 40000 });
    assert(
      (await page.locator('.voice-recommendation strong').innerText()) === 'ありがとう',
      'Japanese audio chooses thanks through native Decisions',
    );
    assert(
      await page.getByRole('heading', { name: 'こんにちは', exact: true }).isVisible(),
      'recommendation does not change the lesson before confirmation',
    );
    assert(
      await page
        .locator('.voice-transcripts')
        .innerText()
        .then((t) => t.includes('ありがとう')),
      'real input transcript is visible',
    );
    const choice = await page.evaluate(() =>
      window.__liveEvents.find((e) => e.choice === 'thanks'),
    );
    const outputBeforeConfirm = await page.evaluate(
      () => window.__liveEvents.filter((e) => e.type === 'session.output_transcript.delta').length,
    );
    await page.getByRole('button', { name: 'このことばを練習する' }).click();
    await page.getByRole('heading', { name: 'ありがとう', exact: true }).waitFor();
    assert(
      await page.evaluate(
        (id) =>
          window.__sentLiveEvents.some(
            (e) => e.delegation_id === id && e.content?.includes('実際に表示'),
          ),
        choice.delegation,
      ),
      'displayed lesson acknowledged to the same delegation',
    );
    assert(
      await page.getByText('カメラ OFF', { exact: true }).isVisible(),
      'confirmation leaves the camera off',
    );
    await page.waitForFunction(
      (count) =>
        window.__liveEvents.filter((e) => e.type === 'session.output_transcript.delta').length >
        count,
      outputBeforeConfirm,
      { timeout: 15000 },
    );
    assert(true, 'coach produces output transcript after confirmation');
    const audio = await page.evaluate(async () => {
      const stats = await window.__testPeer.getStats();
      return Array.from(stats.values())
        .filter((s) => s.type === 'inbound-rtp' && s.kind === 'audio')
        .map((s) => ({ bytes: s.bytesReceived, energy: s.totalAudioEnergy }));
    });
    assert(
      audio.some((s) => s.bytes > 0 && s.energy > 0),
      'remote speech audio arrives over real WebRTC',
    );
    await page.screenshot({ path: 'output/playwright/live-confirmed.png', fullPage: true });
    await page.waitForFunction(
      () =>
        Date.now() -
          window.__liveEvents.filter((e) => e.type === 'session.output_transcript.delta').at(-1)
            .at >
        2000,
      null,
      { timeout: 20000 },
    );
    await page.evaluate(() => window.__speakFixture('unsupported'));
    await page.locator('.voice-unsupported').waitFor({ timeout: 40000 });
    assert(
      await page.getByRole('heading', { name: 'ありがとう', exact: true }).isVisible(),
      'unsupported sentence keeps the displayed lesson',
    );
    assert(
      await page.evaluate(() => {
        const decision = window.__liveEvents.find((e) => e.choice === 'none');
        return (
          decision &&
          window.__sentLiveEvents.some(
            (e) =>
              e.delegation_id === decision.delegation &&
              e.content?.includes('対応する教材がありません'),
          )
        );
      }),
      'none is acknowledged to its own native delegation',
    );
    await page.waitForFunction(() => {
      const sent = window.__sentLiveEvents.filter(e => e.type === 'session.commentary.append').length;
      const accepted = window.__liveEvents.filter(e => e.type === 'session.commentary.appended').length;
      return accepted >= sent;
    }, null, { timeout: 10000 });
    assert(true, 'service accepts every commentary before normal close');
    await page.getByRole('switch', { name: '音声入力', checked: true }).click();
    await page
      .getByRole('switch', { name: '音声入力', checked: false, disabled: false })
      .waitFor({ timeout: 6000 });
    assert(
      await page.evaluate(() => window.__liveEvents.some((e) => e.type === 'session.closed')),
      'service confirms session.closed',
    );
    assert(
      await page.evaluate(
        () =>
          window.__testMicrophone.getTracks().every((t) => t.readyState === 'ended') &&
          window.__testPeer.connectionState === 'closed',
      ),
      'shutdown releases the audio track and peer connection',
    );
    assert(errors.length === 0, 'no unhandled browser errors');
    return {
      passed: checks.length,
      checks,
      statuses,
      audio,
      events: await page.evaluate(() => window.__liveEvents.filter((e) => !e.delta)),
    };
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/live-failure.png', fullPage: true });
    const state = await page.locator('.voice-coach').innerText();
    const events = await page.evaluate(() => window.__liveEvents);
    throw new Error(
      error.message + '\nVoice state: ' + state + '\nEvents: ' + JSON.stringify(events),
    );
  } finally {
    const stop = page.getByRole('switch', { name: '音声入力', checked: true });
    if (await stop.isVisible()) {
      await stop.click();
      await page
        .getByRole('switch', { name: '音声入力', checked: false, disabled: false })
        .waitFor({ timeout: 6000 })
        .catch(() => {});
    }
    await page.evaluate(async () => {
      window.__testMicrophone?.getTracks().forEach((t) => t.stop());
      window.__testPeer?.close();
      await window.__speechContext?.close();
      if (window.__NativePeer) window.RTCPeerConnection = window.__NativePeer;
    });
    page.off('pageerror', onError);
    page.off('response', onResponse);
    await page.reload();
  }
}
