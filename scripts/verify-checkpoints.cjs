async (page) => {
  const checks = [], errors = []
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label) }
  const onError = e => errors.push(e.message)
  page.on('pageerror', onError)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/')
  await page.evaluate(async () => {
    const { frame, makeHand, greeting } = await import('/tests/fixtures.ts')
    window.__checkpointPose = name => {
      const poses = {
        empty: [], fist: [makeHand('fist', 0, .25)], forehead: [makeHand('two', 0, -.4)],
        fists: [makeHand('fist', -.25, .25), makeHand('fist', .25, .25, true)],
        index: greeting(), bow: greeting(true),
      }
      window.__checkpointFrame = frame(poses[name]); window.__checkpointFrames = 0
    }
    window.__checkpointPose('fist'); window.__checkpointStreams = []
    window.__NativeWorker = window.Worker
    window.Worker = class {
      terminated = false
      postMessage(data) {
        if (data.type === 'init') { queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } })); return }
        data.bitmap.close()
        const f = structuredClone(window.__checkpointFrame)
        setTimeout(() => {
          if (this.terminated) return
          this.onmessage?.({ data: { ...f, type: 'result', timestamp: data.timestamp, inferenceMs: 5 } })
          window.__checkpointFrames++
        }, 5)
      }
      terminate() { this.terminated = true }
    }
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720
      const ctx = c.getContext('2d')
      const paint = () => { ctx.fillStyle = '#53644b'; ctx.fillRect(0, 0, c.width, c.height) }
      paint(); clearInterval(window.__checkpointPaint); window.__checkpointPaint = setInterval(paint, 30)
      const stream = c.captureStream(30); window.__checkpointStreams.push(stream); return stream
    } })
  })
  const pose = name => page.evaluate(name => window.__checkpointPose(name), name)
  const waitFrames = count => page.waitForFunction(n => window.__checkpointFrames >= n, count)
  try {
    await page.getByRole('button', { name: 'カメラで練習する', exact: true }).click()
    await pose('forehead')
    await page.getByText('ステップ 2 / 3', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'こんにちは', exact: true }).click()
    assert(await page.locator('.progress-done').count() === 1, 'selecting the same word does not reset its progress')
    await page.getByRole('button', { name: '音声入力モード', exact: true }).click()
    assert(await page.getByRole('switch', { name: '音声入力', exact: true }).getAttribute('aria-checked') === 'false', 'changing input mode does not activate the microphone')
    await page.getByRole('button', { name: '選択モード', exact: true }).click()
    assert(await page.locator('.progress-done').count() === 1, 'switching input modes keeps earned practice progress')
    assert(await page.evaluate(() => window.__checkpointStreams.at(-1).getTracks().every(t => t.readyState === 'live')), 'switching input modes leaves the camera running')
    await pose('empty'); await waitFrames(25)
    assert(await page.locator('.progress-done').count() === 1, 'two seconds without visible hands preserves step 1')
    assert(await page.getByText('ステップ 2 / 3', { exact: true }).isVisible(), 'the learner visibly stays at step 2')
    assert((await page.locator('.companion-caption').innerText()).includes('ステップ1はできたよ'), 'earned progress is explicitly reassuring')
    await pose('fists'); await waitFrames(25)
    assert(await page.locator('.progress-done').count() === 1, 'an incorrect shape does not erase the checkpoint')
    assert(await page.locator('.dot-green').getAttribute('data-reaction') === '1', 'waiting does not repeat the earned celebration')
    await page.screenshot({ path: 'output/playwright/checkpoint-step-2.png', fullPage: true })
    await page.getByRole('button', { name: 'カメラをとめる', exact: true }).click()
    assert(await page.locator('.progress-done').count() === 1, 'camera stop retains the green check')
    assert((await page.locator('.progress-current').innerText()).includes('ここから再開'), 'paused progress marks the resume point')
    assert(await page.evaluate(() => window.__checkpointStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), 'pausing still releases camera hardware')
    await page.getByRole('button', { name: 'ステップ2から再開する', exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'paused mobile layout fits')
    await page.screenshot({ path: 'output/playwright/checkpoint-resume-mobile.png', fullPage: true })
    await pose('index')
    await page.getByRole('button', { name: 'ステップ2から再開する', exact: true }).click()
    await page.getByText('ステップ 3 / 3', { exact: true }).waitFor()
    assert(await page.locator('.progress-done').count() === 2, 'resume completes step 2 without repeating the forehead gesture')
    await pose('empty'); await waitFrames(25)
    assert(await page.locator('.progress-done').count() === 2, 'another interruption preserves both earned checks')
    assert(await page.getByText('ステップ 3 / 3', { exact: true }).isVisible(), 'motion preparation still belongs to step 3')
    assert((await page.locator('.demo-follow').innerText()).includes('ステップ3の準備'), 'starting-pose recovery is named clearly')
    await pose('bow'); await waitFrames(8)
    assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).count() === 0, 'an ending pose alone cannot pass after tracking was lost')
    assert((await page.locator('.demo-setup').innerText()).includes('人差し指を立てて'), 'instructions describe the needed starting pose beside the reference image')
    await page.screenshot({ path: 'output/playwright/checkpoint-step-3-mobile.png', fullPage: true })
    await pose('index')
    await page.waitForFunction(() => document.querySelector('.demo-follow').textContent === 'あなたのステップに連動')
    await pose('bow')
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor()
    assert(await page.locator('.progress-done').count() === 3, 'fresh movement finishes the retained lesson')
    await page.getByRole('button', { name: 'カメラをとめる', exact: true }).click()
    assert(await page.getByRole('heading', { name: 'できたね！', exact: true }).isVisible(), 'completion also survives camera stop')
    await page.getByRole('button', { name: 'もう一度', exact: true }).click()
    await pose('forehead')
    await page.getByRole('button', { name: 'カメラで練習する', exact: true }).click()
    await page.getByText('ステップ 2 / 3', { exact: true }).waitFor()
    await pose('fist')
    await page.getByRole('button', { name: '最初からやり直す', exact: true }).click()
    assert(await page.locator('.progress-done').count() === 0, 'explicit restart clears checkpoints')
    assert(await page.getByText('ステップ 1 / 3', { exact: true }).isVisible(), 'explicit restart returns the guide to step 1')
    assert(errors.length === 0, 'no unhandled browser errors')
    return { passed: checks.length, checks }
  } catch (error) {
    throw new Error(error.message + '\n' + await page.locator('.practice-card').innerText())
  } finally {
    await page.evaluate(() => {
      clearInterval(window.__checkpointPaint)
      window.__checkpointStreams?.forEach(s => s.getTracks().forEach(t => t.stop()))
      if (window.__NativeWorker) window.Worker = window.__NativeWorker
    })
    page.off('pageerror', onError)
    await page.reload()
  }
}
