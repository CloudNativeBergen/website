/**
 * Dev tool: screenshot a Storybook story at iPhone-portrait size for visual QA.
 *
 * Usage:
 *   node scripts/shoot-story.mjs [storyId] [width] [height]
 *   npm run shoot -- <storyId> [width] [height]
 *
 * Defaults: the MobileScheduleView story at 393×852 (iPhone 15/16 Pro portrait),
 * DPR 3. Starts Storybook on :6006 if it isn't already running, renders the
 * story's iframe at the viewport, resets the track carousel to its first panel,
 * writes a PNG (SHOOT_OUT dir, default cwd), and prints panel/card widths plus a
 * hard overflow check (cards wider than the viewport = layout bug).
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'

const [
  storyId = 'systems-program-admin-mobilescheduleview--default',
  wArg,
  hArg,
] = process.argv.slice(2)
const width = Number(wArg) || 393 // iPhone 15/16 Pro portrait (CSS px)
const height = Number(hArg) || 852
const PORT = 6006
const BASE = `http://localhost:${PORT}`

async function storybookUp() {
  try {
    const r = await fetch(`${BASE}/index.json`)
    return r.ok
  } catch {
    return false
  }
}

// Use the package manager that invoked us, defaulting to pnpm (this repo's
// declared packageManager). `.cmd` on Windows so spawn can find it.
const ua = process.env.npm_config_user_agent || ''
const pm = ua.startsWith('npm')
  ? 'npm'
  : ua.startsWith('yarn')
    ? 'yarn'
    : 'pnpm'
const pmBin = process.platform === 'win32' ? `${pm}.cmd` : pm

let started
if (!(await storybookUp())) {
  console.log(`[shoot] starting Storybook on :6006 (via ${pm}) …`)
  // npm needs `--` to forward flags to the script; pnpm/yarn forward them as-is
  // and pass a literal `--` through to the storybook CLI, which Storybook 10
  // rejects ("too many arguments for 'dev'"). Only insert it for npm.
  const runArgs = ['run', 'storybook']
  if (pm === 'npm') runArgs.push('--')
  runArgs.push('--ci', '--quiet')
  started = spawn(pmBin, runArgs, {
    stdio: 'ignore',
    detached: true,
  })
  for (let i = 0; i < 45; i++) {
    if (await storybookUp()) break
    await sleep(2000)
  }
  if (!(await storybookUp())) {
    console.error('[shoot] Storybook did not come up on :6006')
    process.exit(1)
  }
}

const out = path.resolve(process.env.SHOOT_OUT || '.', `${storyId}.png`)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 3,
  })
  await page.goto(`${BASE}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'networkidle',
  })
  await page.waitForTimeout(1000)
  // Zero any Storybook wrapper/decorator insets between <body> and the app root
  // so the viewport maps 1:1 to the app (a decorator's padding otherwise shrinks
  // the scroll container and makes viewport-relative panels look cut off).
  await page.addStyleTag({
    content:
      'html,body,#storybook-root,#root{margin:0!important;padding:0!important}',
  })
  await page.evaluate(() => {
    // Walk up from the component's full-height root and flatten every ancestor.
    const root =
      document.querySelector('.snap-x')?.closest('[class*="100dvh"]') ||
      document.querySelector('[class*="100dvh"]')
    let el = root?.parentElement
    while (el && el !== document.body) {
      el.style.padding = '0'
      el.style.margin = '0'
      el = el.parentElement
    }
  })
  // Reset the track carousel to the first panel for a deterministic shot.
  await page.evaluate(() => {
    const s = document.querySelector('.snap-x')
    if (s) s.scrollLeft = 0
  })
  await page.waitForTimeout(300)

  const info = await page.evaluate((vw) => {
    const panel = document.querySelector('[role=tabpanel]')
    const pr = panel && panel.getBoundingClientRect()
    const cards = [...document.querySelectorAll('button[aria-label]')]
      .filter((e) =>
        /^Move |^Assign to open/.test(e.getAttribute('aria-label') || ''),
      )
      .map((e) => {
        const r = e.getBoundingClientRect()
        return {
          w: Math.round(r.width),
          right: Math.round(r.right),
          // Only a card that STARTS on-screen but runs past the edge is a real
          // overflow; cards belonging to the next (off-screen) track panel start
          // beyond the viewport and are not counted.
          cut: r.left < vw && r.right > vw + 1,
        }
      })
    return {
      panel: pr && { w: Math.round(pr.width), right: Math.round(pr.right) },
      cards,
    }
  }, width)

  await page.screenshot({ path: out })
  console.log(`[shoot] ${width}×${height} (DPR 3) → ${out}`)
  console.log('[shoot] panel', JSON.stringify(info.panel))
  info.cards.forEach((c) =>
    console.log(
      `  card w=${c.w} right=${c.right}${c.cut ? '  <-- CUT off viewport' : ''}`,
    ),
  )
  const cut = info.cards.filter((c) => c.cut).length
  // Note the count so a zero (e.g. the aria-label selector drifted and matched
  // nothing) reads as "0 cards checked", not a false all-clear.
  console.log(
    cut
      ? `[shoot] WARNING: ${cut} card(s) exceed the ${width}px viewport`
      : `[shoot] OK: ${info.cards.length} card(s) checked, none exceed the ${width}px viewport`,
  )
} finally {
  await browser.close()
  // Only stop Storybook if this script started it. Kill the whole process group
  // (detached) on POSIX; fall back to the single pid (e.g. Windows).
  if (started?.pid) {
    try {
      process.kill(process.platform === 'win32' ? started.pid : -started.pid)
    } catch {
      try {
        started.kill()
      } catch {}
    }
  }
}
