async (page) => {
  const checks = [], errors = []
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label) }
  const onError = e => errors.push(e.message)
  page.on('pageerror', onError)
  try {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('http://127.0.0.1:5173/')
    await page.getByRole('heading', { name: 'ひとことを、手話で。' }).waitFor()
    assert(await page.getByRole('navigation').getByRole('button').count() === 4, 'four supplied greeting choices')
    assert(await page.getByRole('button', { name: '学習のきろく' }).count() === 0, 'record screen removed')
    assert(await page.getByRole('button', { name: '手順を再生' }).isVisible(), 'step preview starts paused')
    const cameraButton = page.getByRole('button', { name: 'カメラで練習する', exact: true })
    await cameraButton.scrollIntoViewIfNeeded()
    const box = await cameraButton.boundingBox()
    assert(box.y >= 0 && box.y + box.height <= 720, 'primary camera action is reachable on a laptop')
    await page.screenshot({ path: 'output/playwright/greetings-laptop.png', fullPage: true })
    for (const label of ['こんばんは', 'ありがとう', 'こんにちは']) {
      await page.getByRole('button', { name: label, exact: true }).click()
      assert(await page.getByRole('heading', { name: label, exact: true }).isVisible(), label + ' lesson opens')
      await page.getByRole('button', { name: /^3 / }).click()
      assert(await page.getByRole('button', { name: /^3 / }).getAttribute('aria-pressed') === 'true', label + ' final example selectable')
    }
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile has no horizontal overflow')
    await page.screenshot({ path: 'output/playwright/greetings-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true,
        value: async () => { throw new DOMException('test refusal', 'NotAllowedError') } })
    })
    await cameraButton.click()
    await page.getByRole('alert').waitFor({ timeout: 40000 })
    assert((await page.getByRole('alert').innerText()).includes('カメラが許可されていません'), 'real models initialize and permission error is actionable')

    // Isolated UI test: deterministic landmark streams exercise real recognition.
    // This is not an end-to-end accuracy test of signed video.
    await page.evaluate(async () => {
      const { motionFrames } = await import('/tests/fixtures.ts')
      window.__setSequence = (id, mirrored = false) => {
        window.__frames = motionFrames(id, mirrored).flatMap(f => [f, f]); window.__cursor = 0
      }
      window.__setSequence('hello')
      window.__NativeWorker = window.Worker
      window.Worker = class {
        terminated = false
        postMessage(data) {
          if (data.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }))
          else {
            data.bitmap.close()
            const source = window.__frames[Math.min(window.__cursor++, window.__frames.length - 1)]
            setTimeout(() => { if (!this.terminated) this.onmessage?.({ data: { ...structuredClone(source),
              type: 'result', timestamp: data.timestamp, inferenceMs: 5 } }) }, 5)
          }
        }
        terminate() { this.terminated = true }
      }
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async options => {
        window.__cameraOptions = options
        const c = document.createElement('canvas'); c.width = 1280; c.height = 720
        const ctx = c.getContext('2d')
        const paint = () => { ctx.fillStyle = '#53644b'; ctx.fillRect(0, 0, c.width, c.height) }
        paint(); clearInterval(window.__paintTimer); window.__paintTimer = setInterval(paint, 30)
        window.__stream = c.captureStream(30)
        return window.__stream
      } })
    })
    await page.getByRole('button', { name: 'もう一度ためす' }).click()
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor({ timeout: 15000 })
    assert(true, 'hello landmarks reach completion through camera hook')
    assert(await page.evaluate(() => window.__cameraOptions.audio === false), 'microphone is never requested')
    await page.screenshot({ path: 'output/playwright/greetings-success.png', fullPage: true })
    for (const [label, id] of [['こんばんは', 'evening'], ['ありがとう', 'thanks']]) {
      await page.evaluate(id => window.__setSequence(id, true), id)
      await page.getByRole('button', { name: label, exact: true }).click()
      assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).count() === 0, label + ' clears previous result')
      await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor({ timeout: 15000 })
      assert(true, id + ' mirrored sequence reaches completion')
    }
    await page.evaluate(() => window.__setSequence('thanks'))
    await page.getByRole('button', { name: 'OpenAIへようこそ', exact: true }).click()
    await page.waitForFunction(() => window.__cursor >= window.__frames.length)
    assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).count() === 0, 'thanks movement never passes the image-only welcome lesson')
    assert(await page.locator('.practice-progress, .hold-progress, .detection-status').count() === 0, 'welcome camera is a mirror without automatic grading')
    await page.evaluate(() => window.__setSequence('thanks'))
    await page.getByRole('button', { name: 'ありがとう', exact: true }).click()
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor({ timeout: 15000 })
    await page.evaluate(() => window.__setSequence('thanks'))
    await page.getByRole('button', { name: 'もう一度', exact: true }).click()
    assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).count() === 0, 'retry resets completion')
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'カメラをとめる' }).click()
    assert(await page.evaluate(() => window.__stream.getTracks().every(t => t.readyState === 'ended')), 'stop releases camera')
    assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).isVisible(), 'stopping the camera preserves a completed lesson')
    await page.getByRole('button', { name: 'もう一度', exact: true }).click()
    await page.evaluate(async () => {
      const { frame, makeHand } = await import('/tests/fixtures.ts')
      window.__frames = [frame([makeHand('fist', 0, .25)])]; window.__cursor = 0
    })
    await cameraButton.click()
    await page.getByRole('button', { name: 'カメラをとめる' }).waitFor()
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      delete document.hidden
    })
    await cameraButton.waitFor()
    assert(await page.evaluate(() => window.__stream.getTracks().every(t => t.readyState === 'ended')), 'hidden page releases camera')

    // Stop while getUserMedia is pending; later permission resolution must not leak tracks.
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true,
        value: () => new Promise(resolve => { window.__resolveCamera = resolve }) })
    })
    await cameraButton.click()
    await page.getByRole('heading', { name: 'カメラを許可してね' }).waitFor()
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
    await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 10; c.height = 10
      window.__lateStream = c.captureStream()
      window.__resolveCamera(window.__lateStream)
    })
    await page.waitForFunction(() => window.__lateStream.getTracks().every(t => t.readyState === 'ended'))
    assert(true, 'late camera permission after cancellation releases tracks')
    assert(errors.length === 0, 'no unhandled page errors')
    return { passed: checks.length, checks }
  } catch (error) {
    const state = await page.locator('.practice-card').innerText()
    await page.screenshot({ path: 'output/playwright/browser-failure.png', fullPage: true })
    throw new Error(error.message + '\nCurrent practice state:\n' + state)
  } finally {
    await page.evaluate(() => {
      clearInterval(window.__paintTimer)
      window.__stream?.getTracks().forEach(t => t.stop())
      if (window.__NativeWorker) window.Worker = window.__NativeWorker
    })
    page.off('pageerror', onError)
    await page.reload()
  }
}
