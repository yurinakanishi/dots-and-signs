async (page) => {
  const checks = [], errors = []
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label) }
  const onError = e => errors.push(e.message)
  page.on('pageerror', onError)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('http://127.0.0.1:5173/')
  // Fault-injected camera transport; real app/recognizer, synthetic landmarks.
  await page.evaluate(async () => {
    const { frame, makeHand, greeting } = await import('/tests/fixtures.ts')
    window.__setPose = name => {
      const poses = {
        fist: [makeHand('fist', 0, 0.25)], forehead: [makeHand('two', 0, -0.4)],
        index: greeting(), fists: [makeHand('fist', -0.25, 0.25), makeHand('fist', 0.25, 0.25, true)],
      }
      window.__input = frame(poses[name])
    }
    window.__setPose('fist'); window.__mode = 'fast'
    window.__slowDelivered = 0; window.__inFlight = 0; window.__maxInFlight = 0; window.__trace = []
    window.__pauseEvidence = null
    window.__pauseObserver = new MutationObserver(() => {
      if (window.__pauseEvidence || !document.querySelector('.detection-status')?.textContent.includes('認識を待っています')) return
      const c = document.querySelector('.hand-overlay')
      window.__pauseEvidence = {
        step2: document.querySelector('.camera-panel .panel-label').textContent.includes('ステップ 2 / 3'),
        clear: !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v),
        waiting: true,
      }
    })
    window.__pauseObserver.observe(document.body, { subtree: true, childList: true, characterData: true })
    window.__NativeWorker = window.Worker
    window.Worker = class {
      terminated = false
      pending = 0
      postMessage(data) {
        if (data.type === 'init') { queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); return }
        data.bitmap.close()
        const mode = window.__mode, f = structuredClone(window.__input)
        // Exactly one slow frame; automation polling must not prolong the outage.
        if (mode === 'slow') { window.__mode = 'fast'; window.__setPose('fists') }
        window.__trace.push({ event: 'sent', mode, at: data.timestamp })
        this.pending++; window.__inFlight++
        window.__maxInFlight = Math.max(window.__maxInFlight, window.__inFlight)
        if (mode === 'silent') return
        setTimeout(() => {
          if (this.terminated) return
          this.pending--; window.__inFlight--
          if (mode === 'slow') window.__slowDelivered++
          this.onmessage?.({ data: { ...f, type: 'result', timestamp: data.timestamp + (mode === 'wrong-id' ? 1 : 0), inferenceMs: mode === 'slow' ? 650 : 5 } })
          setTimeout(() => window.__trace.push({ event: 'received', mode, age: performance.now() - data.timestamp, message: document.querySelector('.practice-card').innerText.slice(-210) }), 0)
          // Repeated delivery of the old capture must not release the next one.
          if (mode === 'duplicate') setTimeout(() => {
            if (!this.terminated) this.onmessage?.({ data: { ...f, type: 'result', timestamp: data.timestamp, inferenceMs: 5 } })
          }, 85)
        }, mode === 'slow' ? 650 : 5)
      }
      terminate() { this.terminated = true; window.__inFlight -= this.pending; this.pending = 0 }
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
      const ctx = canvas.getContext('2d')
      const paint = () => { ctx.fillStyle = '#53644b'; ctx.fillRect(0, 0, 1280, 720) }
      paint(); clearInterval(window.__recoveryPaint); window.__recoveryPaint = setInterval(paint, 30)
      window.__recoveryStream = canvas.captureStream(30)
      return window.__recoveryStream
    } })
  })
  const start = () => page.getByRole('button', { name: 'カメラで練習する', exact: true }).click()
  const stop = () => page.getByRole('button', { name: 'カメラをとめる', exact: true }).click()
  try {
    await start()
    await page.getByText('手を1本検出', { exact: false }).waitFor()
    await page.evaluate(() => window.__setPose('forehead'))
    await page.getByText('ステップ 2 / 3', { exact: true }).waitFor()
    await page.evaluate(() => { window.__setPose('index'); window.__mode = 'slow' })
    await page.waitForFunction(() => window.__pauseEvidence && window.__slowDelivered > 0)
    const paused = await page.evaluate(() => window.__pauseEvidence)
    assert(paused.step2, 'brief inference stall preserves earned step')
    assert(paused.clear, 'stale skeleton is cleared')
    assert(paused.waiting, 'delayed inference is not reported as missing hands')
    await page.waitForFunction(() => window.__slowDelivered > 0)
    await page.getByText('手を2本検出', { exact: false }).waitFor()
    assert(await page.getByText('ステップ 2 / 3', { exact: true }).isVisible(), 'late upright-finger result cannot complete step 2')
    assert(await page.getByText('認識を待っています', { exact: true }).count() === 0, 'fresh frames automatically resume recognition')
    await page.evaluate(() => { window.__mode = 'duplicate'; window.__setPose('index') })
    await page.getByText('ステップ 3 / 3', { exact: true }).waitFor()
    assert(await page.evaluate(() => window.__maxInFlight === 1), 'duplicate results never create concurrent captures')
    await stop()
    assert(await page.locator('.progress-done').count() === 2, 'camera stop preserves the two completed checkpoints')
    await page.getByRole('button', { name: '最初からやり直す', exact: true }).click()
    await page.evaluate(() => { window.__mode = 'wrong-id'; window.__setPose('forehead') })
    await start()
    await page.getByText('認識を待っています', { exact: true }).waitFor()
    assert(await page.getByText('ステップ 1 / 3', { exact: true }).isVisible(), 'unrelated timestamp cannot advance a gesture')
    await page.screenshot({ path: 'output/playwright/tracking-paused.png', fullPage: true })
    await stop()
    await page.evaluate(() => { window.__mode = 'fast'; window.__setPose('fist') })
    await start()
    await page.getByText('手を1本検出', { exact: false }).waitFor()
    await page.evaluate(() => clearInterval(window.__recoveryPaint))
    await page.getByText('認識を待っています', { exact: true }).waitFor()
    assert(true, 'frozen video clears recognition even when worker is responsive')
    await page.getByRole('alert').waitFor({ timeout: 11000 })
    assert((await page.getByRole('alert').innerText()).includes('映像が更新されません'), 'frozen video explains how to restart')
    assert(await page.evaluate(() => window.__recoveryStream.getTracks().every(t => t.readyState === 'ended')), 'frozen video releases camera')
    await page.evaluate(() => { window.__mode = 'silent' })
    await page.getByRole('button', { name: 'もう一度ためす' }).click()
    await page.getByText('認識を待っています', { exact: true }).waitFor()
    await page.getByRole('alert').waitFor({ timeout: 11000 })
    assert((await page.getByRole('alert').innerText()).includes('応答しません'), 'unresponsive worker has a bounded timeout')
    assert(await page.evaluate(() => window.__recoveryStream.getTracks().every(t => t.readyState === 'ended')), 'unresponsive worker releases camera')
    assert(errors.length === 0, 'no unhandled page errors')
    return { passed: checks.length, checks }
  } catch (error) {
    throw new Error(error.message + '\n' + await page.locator('.practice-card').innerText() + '\n' + JSON.stringify(await page.evaluate(() => window.__trace.slice(-24))))
  } finally {
    await page.evaluate(() => {
      clearInterval(window.__recoveryPaint)
      window.__pauseObserver?.disconnect()
      window.__recoveryStream?.getTracks().forEach(t => t.stop())
      if (window.__NativeWorker) window.Worker = window.__NativeWorker
    })
    page.off('pageerror', onError)
    await page.reload()
  }
}
