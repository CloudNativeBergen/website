/**
 * Capture pass for the visual-diff harness: screenshot every selected story in
 * every requested theme against ONE running Storybook, into one output dir.
 *
 * Determinism measures, in order of how much noise they remove:
 *  1. A fixed browser clock (`page.clock.setFixedTime`) so every story renders
 *     at the same instant whether or not its own `beforeEach` pins
 *     `globalThis.Date`. Stories that DO pin it still win — they override ours.
 *  2. Reduced motion + a stylesheet that kills animations, transitions and the
 *     text caret.
 *  3. `document.fonts.ready` plus a settle delay before the shutter.
 *  4. A stability probe: a second shot of the same page a beat later. If the
 *     two differ, the story is non-deterministic and is REPORTED as unstable
 *     rather than silently contributing a false diff.
 */
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { baseUrl } from './storybook.mjs'

/** Fixed instant every capture renders at. Arbitrary, but must never change. */
export const FIXED_CLOCK = new Date('2026-06-15T09:30:00.000Z')

const DETERMINISM_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  * { caret-color: transparent !important; }
`

/**
 * @param {object} options
 * @param {number} options.port  Storybook port to shoot against.
 * @param {{id: string, title: string}[]} options.stories
 * @param {string} options.outDir
 * @param {string[]} options.themes
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.dpr
 * @param {number} options.maxHeight  Cap on full-page height, in CSS px.
 * @param {number} options.concurrency
 * @param {number} options.settleMs   Pause after load before the first shot.
 * @param {number} options.probeMs    Pause before the stability re-shot; 0 = off.
 * @param {boolean} options.blockExternal  Refuse non-local requests.
 * @param {object} options.meta       Extra fields recorded in the manifest.
 * @param {(msg: string) => void} [options.log]
 */
export async function captureAll(options) {
  const {
    port,
    stories,
    outDir,
    themes,
    width,
    height,
    dpr,
    maxHeight,
    concurrency,
    settleMs,
    probeMs,
    blockExternal,
    meta = {},
    log = () => {},
  } = options

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  const browser = await chromium.launch()
  const records = []
  const startedAt = Date.now()
  let done = 0
  const totalShots = stories.length * themes.length

  try {
    for (const theme of themes) {
      await fs.mkdir(path.join(outDir, theme), { recursive: true })
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: dpr,
        reducedMotion: 'reduce',
        // Keep the media query aligned with the class the preview decorator
        // puts on the wrapper, so a component that reads either agrees with
        // the other.
        colorScheme: theme === 'dark' ? 'dark' : 'light',
        // Storybook renders in the browser's locale/timezone; pin both.
        locale: 'en-US',
        timezoneId: 'UTC',
      })
      if (blockExternal) await blockNonLocalRequests(context)

      const queue = stories.slice()
      const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, queue.length || 1)) },
        async () => {
          const page = await context.newPage()
          await page.clock.setFixedTime(FIXED_CLOCK)
          page.setDefaultTimeout(30_000)
          try {
            for (;;) {
              const story = queue.shift()
              if (!story) break
              const record = await captureStory({
                page,
                port,
                story,
                theme,
                outDir,
                width,
                maxHeight,
                settleMs,
                probeMs,
              })
              records.push(record)
              done++
              if (done % 25 === 0 || done === totalShots) {
                const elapsed = (Date.now() - startedAt) / 1000
                const rate = done / Math.max(elapsed, 0.001)
                const eta = (totalShots - done) / Math.max(rate, 0.001)
                log(
                  `  ${done}/${totalShots} shots  ${elapsed.toFixed(0)}s elapsed  ~${eta.toFixed(0)}s left`,
                )
              }
            }
          } finally {
            await page.close().catch(() => {})
          }
        },
      )
      await Promise.all(workers)
      await context.close()
    }
  } finally {
    await browser.close()
  }

  records.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const manifest = {
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    viewport: { width, height, dpr, maxHeight },
    themes,
    fixedClock: FIXED_CLOCK.toISOString(),
    storyCount: stories.length,
    ...meta,
    records,
  }
  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Refuse every request that leaves the machine.
 *
 * A story that embeds live third-party content (a YouTube iframe, a remote
 * avatar) renders whatever that third party served at that moment — so two
 * captures ten minutes apart legitimately differ, and no amount of clock
 * pinning fixes it. The stability probe cannot catch it either: both shots
 * within one run agree; it is the two RUNS that disagree. Blocking non-local
 * requests makes the remote content fail identically on both sides, which is
 * the only comparable state, and makes the harness usable offline.
 */
async function blockNonLocalRequests(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (/^(data|blob|about|file):/i.test(url)) return route.continue()
    let hostname
    try {
      hostname = new URL(url).hostname
    } catch {
      return route.continue()
    }
    return LOCAL_HOSTS.has(hostname) ? route.continue() : route.abort()
  })
}

async function captureStory({
  page,
  port,
  story,
  theme,
  outDir,
  width,
  maxHeight,
  settleMs,
  probeMs,
}) {
  const key = `${story.id}@${theme}`
  const rel = path.join(theme, `${story.id}.png`)
  const file = path.join(outDir, rel)
  const url =
    `${baseUrl(port)}/iframe.html?id=${encodeURIComponent(story.id)}` +
    `&viewMode=story&globals=theme:${theme}`

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    // `load` only means the preview shell is up — Storybook may still be
    // mounting the story behind its spinner, and shooting then captures the
    // spinner instead of the component (and reads as unstable, because the
    // story finishes mounting between the two probe shots). Wait for the
    // preview to declare which state it settled in.
    await page
      .waitForFunction(
        () => {
          const { classList } = document.body
          if (
            classList.contains('sb-show-errordisplay') ||
            classList.contains('sb-show-nopreview')
          )
            return true
          // `sb-show-main` alone is not enough: Storybook flips it before a
          // lazily-imported story module has mounted, leaving its spinner on
          // screen. Require actual content in the story root too.
          const root = document.querySelector('#storybook-root, #root')
          return classList.contains('sb-show-main') && !!root?.firstElementChild
        },
        undefined,
        { timeout: 20_000 },
      )
      .catch(() => {})
    // networkidle is best-effort: a story with a polling mock never reaches it,
    // and that must not fail the capture.
    await page
      .waitForLoadState('networkidle', { timeout: 8_000 })
      .catch(() => {})
    await page.addStyleTag({ content: DETERMINISM_CSS })
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await page.waitForTimeout(settleMs)

    const state = await page.evaluate(() => ({
      // Storybook always keeps an (empty, hidden) `.sb-errordisplay` node in the
      // DOM, so its presence proves nothing. The actual signal is which
      // `sb-show-*` class the preview puts on <body>.
      errored:
        document.body.classList.contains('sb-show-errordisplay') ||
        document.body.classList.contains('sb-show-nopreview') ||
        !document.body.classList.contains('sb-show-main'),
      docHeight: Math.ceil(
        Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        ),
      ),
    }))

    // Full-page shots catch colour changes below the fold, but a runaway
    // showcase story would otherwise produce a 30k-pixel-tall PNG; clip to
    // maxHeight instead of resizing the viewport, which would relayout the
    // component and make the capture non-comparable to a shorter run.
    const clipHeight = Math.min(state.docHeight, maxHeight)
    const shotOptions =
      state.docHeight > maxHeight
        ? { clip: { x: 0, y: 0, width, height: clipHeight }, fullPage: true }
        : { fullPage: true }

    const first = await page.screenshot(shotOptions)
    let unstable = false
    if (probeMs > 0) {
      await page.waitForTimeout(probeMs)
      const second = await page.screenshot(shotOptions)
      unstable = !first.equals(second)
    }
    await fs.writeFile(file, first)

    return {
      key,
      storyId: story.id,
      title: story.title,
      theme,
      file: rel,
      status: state.errored ? 'error' : 'ok',
      unstable,
      bytes: first.length,
      clipped: state.docHeight > maxHeight,
    }
  } catch (error) {
    return {
      key,
      storyId: story.id,
      title: story.title,
      theme,
      file: null,
      status: 'error',
      unstable: false,
      error: String(error?.message ?? error).split('\n')[0],
    }
  }
}
