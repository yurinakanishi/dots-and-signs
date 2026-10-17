// Playwright CLI run-code function. Run in an isolated test browser, never a user's profile.
// Requires scripts/download-test-assets.mjs and a running Vite dev server.
async (page) => {
  const checks = []
  const assert = (value, message) => {
    if (!value) throw new Error(message)
    checks.push(message)
  }
  const pageErrors = []
  const onError = (error) => pageErrors.push(error.message)
  page.on('pageerror', onError)
  try {
    await page.goto('http://127.0.0.1:5173/')
    await page.evaluate(() => localStorage.removeItem('dots-sign.progress.v1'))
    await page.reload()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('heading', { name: 'ことばは、手からも伝わる。' }).waitFor()
    await page.screenshot({ path: 'output/playwright/desktop.png', scale: 'css' })
    await page.getByRole('button', { name: '使い方を見る' }).click()
    assert(await page.getByRole('dialog').isVisible(), 'help dialog opens')
    await page.keyboard.press('Escape')
    assert((await page.getByRole('dialog').count()) === 0, 'help dialog closes with Escape')
    for (const id of ['2', '3', '4', '5', '10']) {
      await page.getByRole('button', { name: `数字${id}のレッスン`, exact: true }).click()
      assert(
        await page
          .getByRole('heading', { level: 2, name: new RegExp(`数字「${id}」`) })
          .isVisible(),
        `lesson ${id} opens`,
      )
    }
    await page.getByRole('button', { name: 'お手本を左手に切り替える' }).click()
    assert(
      await page.getByRole('button', { name: 'お手本を右手に切り替える' }).isVisible(),
      'reference hand switches',
    )
    await page.getByRole('button', { name: 'カメラなしでお手本を見る' }).click()
    assert(
      await page.getByText('判定・記録はしません').isVisible(),
      'demo is clearly distinguished from assessment',
    )
    await page.screenshot({ path: 'output/playwright/demo-ten.png', scale: 'css' })
    await page.getByRole('button', { name: 'お手本の動きを止める' }).click()
    assert(
      await page.getByRole('button', { name: 'お手本の動きを再生する' }).isVisible(),
      'motion example pauses',
    )
    assert(
      (await page.evaluate(() => localStorage.getItem('dots-sign.progress.v1'))) === null,
      'demo does not award progress',
    )
    await page.getByRole('button', { name: 'お手本モードを閉じる' }).click()
    await page.getByRole('button', { name: '数字1のレッスン', exact: true }).click()
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          throw new DOMException('Test permission denial', 'NotAllowedError')
        },
      })
    })
    await page.getByRole('button', { name: 'カメラをオンにする', exact: true }).click()
    await page.getByRole('alert').waitFor({ timeout: 30000 })
    assert(
      (await page.getByRole('alert').innerText()).includes('カメラが許可されていません'),
      'camera permission denial has an actionable message',
    )
    await page.screenshot({ path: 'output/playwright/permission-denied.png', scale: 'css' })
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 720
      const ctx = canvas.getContext('2d')
      let image
      window.__dotsFixtureSet = async (file) => {
        image?.close()
        image = await createImageBitmap(await (await fetch(`/output/fixtures/${file}.jpg`)).blob())
      }
      await window.__dotsFixtureSet('pointing_up')
      const draw = () => {
        ctx.fillStyle = '#ddddcc'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const height = 650,
          width = (height / image.height) * image.width
        ctx.drawImage(image, (1280 - width) / 2, 35, width, height)
      }
      draw()
      window.__dotsDrawTimer = setInterval(draw, 33)
      window.__dotsStream = canvas.captureStream(30)
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => window.__dotsStream,
      })
    })
    await page.getByRole('button', { name: 'もう一度、カメラを開く' }).click()
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor({ timeout: 30000 })
    assert(
      await page.evaluate(
        () => !!JSON.parse(localStorage.getItem('dots-sign.progress.v1')).completed['1'],
      ),
      'real model / video / recognition / completion pipeline succeeds for one',
    )
    await page.screenshot({ path: 'output/playwright/success.png', scale: 'css' })
    await page.getByRole('button', { name: '次のレッスンへ', exact: true }).click()
    await page.evaluate(() => window.__dotsFixtureSet('victory'))
    await page.getByRole('heading', { name: 'できたね！', exact: true }).waitFor({ timeout: 30000 })
    assert(
      await page.evaluate(
        () => !!JSON.parse(localStorage.getItem('dots-sign.progress.v1')).completed['2'],
      ),
      'second lesson succeeds with the real model',
    )
    await page.getByRole('button', { name: '学習のきろく', exact: true }).click()
    assert(
      await page.evaluate(() =>
        window.__dotsStream.getVideoTracks().every((track) => track.readyState === 'ended'),
      ),
      'navigation releases camera tracks',
    )
    await page.evaluate(() => clearInterval(window.__dotsDrawTimer))
    assert(
      await page.getByRole('heading', { name: '2つの「できた」。すてきだね。' }).isVisible(),
      'progress page shows earned lessons',
    )
    await page.screenshot({ path: 'output/playwright/progress.png', scale: 'css' })
    await page.reload()
    await page.getByRole('button', { name: '学習のきろく', exact: true }).click()
    assert(
      await page.getByRole('heading', { name: '2つの「できた」。すてきだね。' }).isVisible(),
      'progress survives reload',
    )
    await page.getByRole('button', { name: '学習のきろくをリセット' }).click()
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
    assert(
      await page.getByRole('heading', { name: '2つの「できた」。すてきだね。' }).isVisible(),
      'reset cancellation preserves progress',
    )
    await page.getByRole('button', { name: '学習のきろくをリセット' }).click()
    await page.getByRole('button', { name: 'リセットする', exact: true }).click()
    assert(
      await page.getByRole('heading', { name: '最初の一歩を、ここから。' }).isVisible(),
      'confirmed reset clears only learning progress',
    )
    await page.getByRole('button', { name: 'このアプリについて', exact: true }).click()
    assert(
      await page.getByRole('link', { name: 'MediaPipeの公式資料' }).isVisible(),
      'research sources and limitations are accessible',
    )
    await page.screenshot({ path: 'output/playwright/about.png', scale: 'css' })
    await page.getByRole('button', { name: '手話をれんしゅう', exact: true }).click()
    await page.setViewportSize({ width: 375, height: 812 })
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'mobile has no horizontal overflow',
    )
    await page.screenshot({ path: 'output/playwright/mobile.png', scale: 'css' })
    await page
      .getByRole('button', { name: /お手本を(右手|左手)に切り替える/ })
      .scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'output/playwright/mobile-reference.png', scale: 'css' })
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.evaluate(() => scrollTo(0, 0))
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'laptop has no horizontal overflow',
    )
    await page.screenshot({ path: 'output/playwright/laptop.png', scale: 'css' })
    assert(pageErrors.length === 0, 'no uncaught browser exceptions')
    return {
      passed: checks.length,
      checks,
      pageErrors,
      note: 'Synthetic video input from two official static photos tests integration, not live-user recognition accuracy.',
    }
  } finally {
    page.off('pageerror', onError)
  }
}
