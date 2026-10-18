async (page) => {
  await page.goto('http://127.0.0.1:5173/')
  const result = await page.evaluate(async () => {
    const { HandTracker } = await import('/src/lib/handTracking.ts')
    const worker = new Worker('/vision-worker.js?v=two-hands-20261018')
    const tracker = new HandTracker()
    const send = (data, transfer = []) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker timeout')), 30000)
      worker.onmessage = e => { clearTimeout(timer); e.data.type === 'error' ? reject(new Error(e.data.message)) : resolve(e.data) }
      worker.onerror = e => { clearTimeout(timer); reject(new Error(e.message)) }
      worker.postMessage(data, transfer)
    })
    const pointing = await createImageBitmap(await (await fetch('/output/fixtures/pointing_up.jpg')).blob())
    const two = await createImageBitmap(await (await fetch('/output/fixtures/right_hands.jpg')).blob())
    const canvas = new OffscreenCanvas(1280, 720), ctx = canvas.getContext('2d')
    const cases = [
      { name: 'single', expected: 1 },
      { name: 'official-two-right-hands', expected: 2 },
      { name: 'official-mirrored', expected: 2 },
      { name: 'separated-pair-large', height: 480, expected: 2 },
      { name: 'separated-pair-medium', height: 330, expected: 2 },
      { name: 'separated-pair-small', height: 220, expected: 2 },
      { name: 'single', expected: 1 },
      { name: 'separated-pair-medium', height: 330, expected: 2 },
      { name: 'blank', expected: 0 },
    ]
    let timestamp = 0
    const probes = []
    try {
      await send({ type: 'init' })
      for (const c of cases) {
        ctx.resetTransform(); ctx.fillStyle = '#e7e9e3'; ctx.fillRect(0, 0, 1280, 720)
        if (c.height || c.name === 'single') {
          const h = c.height ?? 480, w = pointing.width / pointing.height * h
          ctx.drawImage(pointing, 370 - w / 2, (720 - h) / 2, w, h)
          if (c.expected === 2) {
            ctx.save(); ctx.translate(910 + w / 2, (720 - h) / 2); ctx.scale(-1, 1)
            ctx.drawImage(pointing, 0, 0, w, h); ctx.restore()
          }
        } else if (c.name.startsWith('official')) {
          if (c.name === 'official-mirrored') { ctx.translate(1280, 0); ctx.scale(-1, 1) }
          const s = Math.min(1200 / two.width, 650 / two.height)
          ctx.drawImage(two, (1280 - two.width * s) / 2, (720 - two.height * s) / 2, two.width * s, two.height * s)
          ctx.resetTransform()
        }
        const counts = []
        for (let i = 0; i < 7; i++) {
          const bitmap = await createImageBitmap(canvas)
          const f = await send({ type: 'frame', bitmap, timestamp: timestamp += 80 }, [bitmap])
          const tracked = tracker.update(f)
          counts.push({ raw: f.hands.length, visible: tracked.length })
          if (i >= 4 && (f.hands.length !== c.expected || tracked.length !== c.expected))
            throw new Error(c.name + ': ' + JSON.stringify(counts))
          if (new Set(tracked.map(h => h.trackId)).size !== tracked.length) throw new Error('non-unique hand tracks')
        }
        probes.push({ name: c.name, counts })
      }
      return { passed: probes.length, probes }
    } finally { worker.terminate(); pointing.close(); two.close() }
  })
  // Real models, synthetic camera transport, real official test photograph.
  await page.evaluate(async () => {
    const img = new Image(); img.src = '/output/fixtures/right_hands.jpg'; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
    const ctx = canvas.getContext('2d')
    const paint = () => { ctx.fillStyle = '#e7e9e3'; ctx.fillRect(0, 0, 1280, 720); ctx.drawImage(img, 40, 42, 1200, 636) }
    paint(); window.__pairTimer = setInterval(paint, 33)
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => canvas.captureStream(30) })
  })
  try {
    await page.getByRole('button', { name: 'カメラで練習する', exact: true }).click()
    await page.getByText('手を2本検出', { exact: false }).waitFor({ timeout: 40000 })
    if (await page.getByRole('heading', { name: 'できたね！', exact: true }).count()) throw new Error('photo falsely passed a greeting')
    await page.screenshot({ path: 'output/playwright/two-hands-real-model.png', fullPage: true })
    return { ...result, cameraHookShowsTwoRealDetections: true }
  } finally {
    const stop = page.getByRole('button', { name: 'カメラをとめる' })
    if (await stop.count()) await stop.click()
    await page.evaluate(() => clearInterval(window.__pairTimer))
    await page.reload()
  }
}
