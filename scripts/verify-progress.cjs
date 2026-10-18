async (page) => {
  const checks = [], errors = []
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label) }
  const onError = e => errors.push(e.message)
  page.on('pageerror', onError)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/')
  // This is a UI regression test with synthetic landmarks, not a camera accuracy test.
  await page.evaluate(async () => {
    const { frame, makeHand, greeting } = await import('/tests/fixtures.ts')
    window.__setHands = name => {
      const poses = {
        fist: [makeHand('fist', 0, 0.25)],
        forehead: [makeHand('two', 0, -0.4)],
        fists: [makeHand('fist', -0.25, 0.25), makeHand('fist', 0.25, 0.25, true)],
        index: greeting(), bow: greeting(true), one: [greeting()[0]],
      }
      window.__inputFrame = frame(poses[name])
    }
    window.__setHands('fist')
    window.__NativeWorker = window.Worker
    window.Worker = class {
      terminated = false
      postMessage(data) {
        if (data.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }))
        else {
          data.bitmap.close()
          const f = structuredClone(window.__inputFrame)
          setTimeout(() => { if (!this.terminated) this.onmessage?.({ data: { ...f, type: 'result', timestamp: data.timestamp, inferenceMs: 5 } }) }, 5)
        }
      }
      terminate() { this.terminated = true }
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720
      const ctx = c.getContext('2d')
      const paint = () => { ctx.fillStyle = '#53644b'; ctx.fillRect(0, 0, c.width, c.height) }
      paint(); window.__progressTimer = setInterval(paint, 30)
      window.__progressStream = c.captureStream(30)
      return window.__progressStream
    } })
  })
  try {
    await page.getByRole('button', { name: 'カメラで練習する', exact: true }).click()
    await page.getByText('ステップ 1 / 3', { exact: true }).waitFor()
    assert(await page.locator('.dot-character').evaluateAll(els => els.every(el => el.dataset.reaction === '0')), 'camera start does not trigger an unearned celebration')
    assert(await page.locator('.progress-current').innerText().then(t => t.includes('額に2本の指')), 'step 1 is visibly current')
    await page.evaluate(() => window.__setHands('forehead'))
    await page.getByText('ステップ 2 / 3', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.dot-green').dataset.reaction === '1')
    assert(await page.locator('.dot-green .dot-bubble').isVisible(), 'first recognized step brings out the green dot response')
    assert(await page.locator('.dot-character:not(.dot-green)').evaluateAll(els => els.every(el => el.dataset.reaction === '0')), 'other dots wait for their own milestone')
    assert(await page.locator('.progress-done').count() === 1, 'first step gets a check')
    assert((await page.locator('.sign-demo').getAttribute('aria-label')).includes('両手の人差し指を立てて'), 'demo follows actual second step')
    assert((await page.locator('.detection-status').innerText()).includes('手を1本検出'), 'one visible hand is reported')
    assert((await page.locator('.detection-status').innerText()).includes('この段階は2本'), 'second hand requirement is explicit')
    assert(await page.getByRole('button', { name: 'お手本を再生' }).count() === 0, 'preview cannot advance the practice step')
    await page.screenshot({ path: 'output/playwright/step-2-laptop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'active mobile screen has no overflow')
    const demo = await page.locator('.demo-panel').boundingBox()
    assert(demo.height < 220, 'active mobile demonstration stays compact')
    await page.screenshot({ path: 'output/playwright/step-2-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.evaluate(() => window.__setHands('fists'))
    await page.getByText('手を2本検出', { exact: false }).waitFor()
    assert(await page.getByText('ステップ 2 / 3', { exact: true }).isVisible(), 'two detections alone do not complete the shape')
    await page.evaluate(() => window.__setHands('index'))
    await page.getByText('ステップ 3 / 3', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.dot-blue').dataset.reaction === '1' && document.querySelector('.dot-yellow').dataset.reaction === '1')
    assert(true, 'second recognized step activates blue and yellow dots')
    assert(await page.locator('.progress-done').count() === 2, 'upright fingers immediately mark step 2 complete')
    assert((await page.locator('.sign-demo').getAttribute('aria-label')).includes('人差し指を曲げて'), 'third-step demonstration is synchronized')
    await page.evaluate(() => window.__setHands('one'))
    await page.getByText('手を1本検出', { exact: false }).waitFor()
    assert(await page.locator('.progress-done').count() === 2, 'brief missing hand preserves earned steps')
    assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).count() === 0, 'missing hand never awards completion')
    await page.evaluate(() => window.__setHands('bow'))
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.dot-reward').length === 4)
    assert(true, 'completed sign brings out all four celebrations')
    assert(await page.locator('.progress-done').count() === 3, 'all three steps get checkmarks on completion')
    assert(await page.locator('.dot-body').evaluateAll(els => els.length === 4 && els.every(el => getComputedStyle(el).animationName === 'none')), 'all four dots honor reduced motion')
    await page.screenshot({ path: 'output/playwright/step-complete.png', fullPage: true })
    const reactions = await page.locator('.dot-character').evaluateAll(els => els.map(el => el.dataset.reaction).join(','))
    await page.waitForFunction(() => document.querySelectorAll('.dot-surprise').length === 0)
    assert(await page.locator('.dot-character').evaluateAll(els => els.map(el => el.dataset.reaction).join(',')) === reactions, 'continued successful frames do not repeat the celebration')
    await page.getByRole('button', { name: 'もう一度', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.dot-character')].every(el => el.dataset.achievement === '0'))
    assert(await page.locator('.dot-reward').count() === 0, 'retry clears character rewards alongside progress')
    assert(await page.locator('.progress-done').count() === 0, 'retry clears progress')
    await page.getByRole('button', { name: 'こんばんは', exact: true }).click()
    assert(await page.getByText('ステップ 1 / 3', { exact: true }).isVisible(), 'lesson switch resets current stage')
    await page.getByRole('button', { name: 'カメラをとめる' }).click()
    assert(await page.locator('.progress-current').count() === 0, 'stopped camera clears live stage')
    assert(errors.length === 0, 'no unhandled browser errors')
    return { passed: checks.length, checks }
  } catch (error) {
    throw new Error(error.message + '\n' + await page.locator('.practice-card').innerText())
  } finally {
    await page.evaluate(() => {
      clearInterval(window.__progressTimer)
      window.__progressStream?.getTracks().forEach(t => t.stop())
      if (window.__NativeWorker) window.Worker = window.__NativeWorker
    })
    page.off('pageerror', onError)
    await page.reload()
  }
}
