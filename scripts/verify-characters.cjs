async (page) => {
  const checks = [], errors = []
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label) }
  const onError = e => errors.push(e.message)
  page.on('pageerror', onError)
  try {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('http://127.0.0.1:5173/')
    await page.locator('.dot-character').first().waitFor()
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('.dot-artwork image')].map(el => new Promise((resolve, reject) => {
        const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = el.href.baseVal
      })))
      await document.fonts.ready
    })
    assert(await page.locator('.dot-character').count() === 4, 'four individually interactive characters')
    assert(await page.locator('.dot-artwork image').evaluateAll(els => new Set(els.map(el => el.href.baseVal)).size === 4), 'four separate textured body assets')
    assert(await page.locator('.dot-character').evaluateAll(els => els.every(el => el.getBoundingClientRect().width >= 44 && el.getBoundingClientRect().height >= 44)), 'all characters have usable touch targets')
    assert(await page.locator('.dot-blink').evaluateAll(els => new Set(els.map(el => getComputedStyle(el).animationDuration)).size === 4), 'each character blinks at its own rhythm')
    const blinks = await page.locator('.dot-blink').evaluateAll(els => els.map(el => {
      const a = el.getAnimations()[0], t = a.effect.getTiming()
      a.pause(); a.currentTime = t.duration * 1.42 + t.delay
      const closed = new DOMMatrix(getComputedStyle(el).transform).d
      a.currentTime = t.duration * 1.5 + t.delay
      const open = new DOMMatrix(getComputedStyle(el).transform).d
      a.play(); return { closed, open }
    }))
    assert(blinks.every(b => b.closed < .1 && b.open > .95), 'eyes actually close and reopen independently of the body')
    await page.screenshot({ path: 'output/playwright/living-dots-laptop.png', fullPage: true })
    const green = page.locator('.dot-green')
    const target = await green.boundingBox()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * .6)
    await page.mouse.down()
    await page.waitForFunction(() => {
      const t = new DOMMatrix(getComputedStyle(document.querySelector('.dot-green .dot-body')).transform)
      return t.a > 1.1 && t.d < .76
    })
    assert(true, 'holding compresses the cushion against its base')
    await page.screenshot({ path: 'output/playwright/living-dots-squash.png', fullPage: true })
    await page.mouse.move(target.x - 80, target.y - 20)
    await page.mouse.up()
    await page.waitForFunction(() => document.querySelector('.dot-green').classList.contains('dot-jump'))
    assert(await green.getAttribute('data-reaction') === '1', 'releasing outside the character still bounces exactly once')
    assert(await page.locator('.dot-character:not(.dot-green)').evaluateAll(els => els.every(el => el.dataset.reaction === '0')), 'touching one dot leaves the others independent')
    const motion = await green.locator('.dot-body').evaluate(el => {
      const a = el.getAnimations().find(a => a.animationName === 'dot-jump'); a.pause()
      const sample = fraction => { a.currentTime = 1050 * fraction; const m = new DOMMatrix(getComputedStyle(el).transform); return { x: m.a, y: m.d, lift: m.f } }
      return { crouch: sample(.16), air: sample(.48), landing: sample(.73) }
    })
    assert(motion.crouch.y < .75 && motion.crouch.x > 1.1, 'jump anticipates by crouching')
    assert(motion.air.lift < -20, 'jump lifts clear of the ground')
    assert(motion.landing.y < .75 && motion.landing.x > 1.1, 'landing visibly squashes before recovering')
    await green.locator('.dot-body').evaluate(el => { const a = el.getAnimations().find(a => a.animationName === 'dot-jump'); a.currentTime = 500 })
    await page.screenshot({ path: 'output/playwright/living-dots-jump.png', fullPage: true })
    assert(await page.locator('.progress-done').count() === 0, 'playful touch does not award a sign-language step')
    const yellow = page.locator('.dot-yellow')
    await yellow.focus()
    await page.keyboard.press('Space')
    assert(await yellow.getAttribute('data-reaction') === '1', 'Space activates the character once')
    await page.keyboard.press('Enter')
    assert(await yellow.getAttribute('data-reaction') === '2', 'Enter activates the character once')
    const blue = await page.locator('.dot-blue').boundingBox()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: blue.x + blue.width / 2, y: blue.y + blue.height / 2 }] })
    assert((await page.locator('.dot-blue').getAttribute('class')).includes('dot-pressed'), 'touchscreen press compresses its character')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await cdp.detach()
    assert(!(await page.locator('.dot-blue').getAttribute('class')).includes('dot-pressed'), 'cancelled touch cannot leave a character compressed')
    await page.waitForFunction(() => !document.querySelector('.dot-jump'))
    assert(await page.locator('.dot-surprise').count() === 0, 'temporary bubbles and stars clean themselves up')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.dot-pink').click()
    assert(await page.locator('.dot-character').evaluateAll(els => els.every(el => el.getAnimations({ subtree: true }).length === 0)), 'reduced motion disables body, eyes, accessories and confetti animations')
    assert(await page.locator('.dot-pink .dot-bubble').isVisible(), 'reduced motion still provides a readable response')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'output/playwright/living-dots-mobile.png', fullPage: true })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile screen has no sideways overflow')
    await page.setViewportSize({ width: 320, height: 740 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow 320px screen fits')
    assert(errors.length === 0, 'no unhandled character errors')
    return { passed: checks.length, checks }
  } finally {
    page.off('pageerror', onError)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
  }
}
