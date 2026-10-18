async (page) => {
  return page.evaluate(async () => {
    const { SignRecognizer, inspectHand } = await import('/src/lib/recognition.ts')
    const worker = new Worker('/vision-worker.js')
    const wait = () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker timeout')), 30000)
      worker.onmessage = ({ data }) => { clearTimeout(timer); data.type === 'error' ? reject(new Error(data.message)) : resolve(data) }
      worker.onerror = e => { clearTimeout(timer); reject(new Error(e.message)) }
    })
    const probes = []
    try {
      let pending = wait()
      worker.postMessage({ type: 'init' })
      if ((await pending).type !== 'ready') throw new Error('both models must initialize')
      let time = 0
      for (const file of ['blank', 'pointing_up', 'victory', 'thumb_up', 'pose']) {
        const source = file === 'blank' ? null : await createImageBitmap(await (await fetch('/output/fixtures/' + file + '.jpg')).blob())
        for (const mirrored of [false, true]) {
          const canvas = new OffscreenCanvas(1280, 720), ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 1280, 720)
          if (mirrored) { ctx.translate(1280, 0); ctx.scale(-1, 1) }
          if (source) {
            const scale = Math.min(1200 / source.width, 650 / source.height)
            const w = source.width * scale, h = source.height * scale
            ctx.drawImage(source, (1280 - w) / 2, (720 - h) / 2, w, h)
          }
          const bitmap = canvas.transferToImageBitmap()
          pending = wait()
          worker.postMessage({ type: 'frame', bitmap, timestamp: (time += 500) }, [bitmap])
          const result = await pending
          if (file === 'blank' && (result.hands.length || result.poses.length)) throw new Error('blank false detection')
          if (['pointing_up', 'victory'].includes(file) && result.hands.length !== 1) throw new Error(file + ': missing hand')
          if (file === 'pose' && result.poses.length !== 1) throw new Error('pose model failed positive control: ' + JSON.stringify({ mirrored, poses: result.poses.length, hands: result.hands.length, probes }))
          if (result.poses.some(p => p.length !== 33)) throw new Error('invalid pose output')
          for (const sign of ['hello', 'evening', 'thanks']) {
            const recognizer = new SignRecognizer(sign)
            for (let i = 0; i < 35; i++) if (recognizer.update({ ...result, timestamp: i * 80 }).status === 'success')
              throw new Error('static image falsely passed greeting ' + sign)
          }
          probes.push({ file, mirrored, hands: result.hands.length, poses: result.poses.length,
            palmNormal: result.hands[0] ? inspectHand(result.hands[0], result)?.normal : null,
            inferenceMs: Math.round(result.inferenceMs) })
        }
        source?.close()
      }
      return { passed: probes.length, probes }
    } finally { worker.terminate() }
  })
}
