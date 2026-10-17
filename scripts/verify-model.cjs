async (page) => {
  const result = await page.evaluate(async () => {
    const { inspectHand, SignRecognizer } = await import('/src/lib/recognition.ts')
    const worker = new Worker('/vision-worker.js')
    const message = () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('worker timeout')), 20000)
        worker.onmessage = (event) => {
          clearTimeout(timeout)
          resolve(event.data)
        }
        worker.onerror = (event) => {
          clearTimeout(timeout)
          reject(new Error(event.message))
        }
      })
    const ready = message()
    worker.postMessage({ type: 'init' })
    const initialization = await ready
    if (initialization.type !== 'ready') {
      worker.terminate()
      return initialization
    }
    const probes = []
    let timestamp = 0
    for (const file of ['pointing_up', 'victory', 'thumb_up']) {
      const blob = await (await fetch(`/output/fixtures/${file}.jpg`)).blob()
      const source = await createImageBitmap(blob)
      for (const mirror of [false, true]) {
        const canvas = new OffscreenCanvas(1280, 720)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ddddcc'
        ctx.fillRect(0, 0, 1280, 720)
        if (mirror) {
          ctx.translate(1280, 0)
          ctx.scale(-1, 1)
        }
        const height = 650,
          width = (height / source.height) * source.width
        ctx.drawImage(source, (1280 - width) / 2, 35, width, height)
        const bitmap = canvas.transferToImageBitmap()
        const pending = message()
        worker.postMessage({ type: 'frame', bitmap, timestamp: (timestamp += 500) }, [bitmap])
        const frame = await pending
        if (frame.type === 'error') {
          probes.push(frame)
          continue
        }
        const hand = frame.hands[0]
        const recognition = new SignRecognizer(
          file === 'victory' ? '2' : file === 'pointing_up' ? '1' : '5',
        )
        let feedback
        for (let t = 0; t < 1400; t += 65) feedback = recognition.update({ ...frame, timestamp: t })
        probes.push({
          file,
          mirror,
          hands: frame.hands.length,
          handedness: hand?.handedness,
          metrics: hand ? inspectHand(hand, frame) : null,
          feedback,
          inferenceMs: frame.inferenceMs,
        })
      }
      source.close()
    }
    worker.terminate()
    return probes
  })
  return result
}
