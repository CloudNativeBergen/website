/**
 * Compare pass for the visual-diff harness.
 *
 * PNG decoding happens inside a headless Chromium page (canvas + ImageBitmap)
 * rather than through pixelmatch/pngjs, so the harness adds no dependencies to
 * a repo that already ships Playwright. The comparison maths itself lives in
 * `pixels.mjs` as a pure function and is injected into the page by source, so
 * the code the browser runs is the code vitest tests.
 */
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { comparePixels } from './pixels.mjs'

/**
 * @param {object} options
 * @param {string} options.baselineDir
 * @param {string} options.candidateDir
 * @param {string} options.reportDir
 * @param {number} options.channelThreshold per-channel delta to count a pixel
 * @param {number} options.diffRatio  write a diff image at/above this ratio
 * @param {(msg: string) => void} [options.log]
 * @returns {Promise<{rows: object[], baseline: object, candidate: object}>}
 */
export async function compareRuns(options) {
  const {
    baselineDir,
    candidateDir,
    reportDir,
    channelThreshold,
    diffRatio,
    log = () => {},
  } = options

  const baseline = await readManifest(baselineDir, 'baseline')
  const candidate = await readManifest(candidateDir, 'candidate')

  const baseByKey = new Map(baseline.records.map((r) => [r.key, r]))
  const candByKey = new Map(candidate.records.map((r) => [r.key, r]))
  const keys = [...new Set([...baseByKey.keys(), ...candByKey.keys()])].sort()

  const diffsDir = path.join(reportDir, 'diffs')
  await fs.rm(reportDir, { recursive: true, force: true })
  await fs.mkdir(diffsDir, { recursive: true })

  const browser = await chromium.launch()
  const rows = []
  try {
    const page = await browser.newPage()
    await page.goto('about:blank')
    // Ship the tested pure function into the page by source; no bundler, no
    // duplicate implementation that could drift from the unit tests.
    await page.evaluate((src) => {
      // `new Function` rather than `eval` so the source is compiled in global
      // scope; the string is our own module's code, never anything external.
      window.__comparePixels = new Function(`return (${src})`)()
    }, comparePixels.toString())

    let done = 0
    for (const key of keys) {
      const b = baseByKey.get(key)
      const c = candByKey.get(key)
      const row = {
        key,
        storyId: (b ?? c).storyId,
        title: (b ?? c).title,
        theme: (b ?? c).theme,
        status: 'ok',
        unstable: !!(b?.unstable || c?.unstable),
        changedPixels: 0,
        totalPixels: 0,
        changedRatio: 0,
        maxDelta: 0,
        meanDelta: 0,
        sizeChanged: false,
        diffImage: null,
      }

      if (!b || !c) {
        row.status = 'missing'
        row.note = !b ? 'absent from baseline' : 'absent from candidate'
      } else if (b.status !== 'ok' || c.status !== 'ok') {
        row.status = 'error'
        row.note =
          b.status !== 'ok' ? 'errored in baseline' : 'errored in candidate'
      } else {
        const [aB64, bB64] = await Promise.all([
          fs.readFile(path.join(baselineDir, b.file), 'base64'),
          fs.readFile(path.join(candidateDir, c.file), 'base64'),
        ])
        const result = await page.evaluate(compareInPage, {
          a: aB64,
          b: bB64,
          channelThreshold,
          diffRatio,
        })
        Object.assign(row, result.stats)
        if (result.diff) {
          const outFile = path.join(diffsDir, `${safeName(key)}.png`)
          await fs.writeFile(outFile, Buffer.from(result.diff, 'base64'))
          row.diffImage = path.relative(reportDir, outFile)
        }
      }

      rows.push(row)
      done++
      if (done % 100 === 0 || done === keys.length)
        log(`  compared ${done}/${keys.length}`)
    }
  } finally {
    await browser.close()
  }

  return { rows, baseline, candidate }
}

async function readManifest(dir, label) {
  try {
    return JSON.parse(
      await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'),
    )
  } catch {
    throw new Error(
      `No ${label} capture found in ${dir}. Run \`pnpm visual-diff ${label}\` first.`,
    )
  }
}

/** `systems-x--y@dark` -> a filename that survives every filesystem. */
function safeName(key) {
  return key.replace(/[^a-z0-9._@-]+/gi, '_')
}

/**
 * Runs in the page. Decodes both PNGs, diffs them with the injected pure
 * function, and — when the change is big enough to be worth a human's time —
 * composes a baseline | candidate | diff strip as a PNG data URL.
 */
async function compareInPage({ a, b, channelThreshold, diffRatio }) {
  const toImage = async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' }),
    )
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    bitmap.close()
    return { width: data.width, height: data.height, data: data.data, canvas }
  }

  const imgA = await toImage(a)
  const imgB = await toImage(b)
  const cmp = window.__comparePixels(imgA, imgB, { channelThreshold })
  const stats = {
    changedPixels: cmp.changedPixels,
    totalPixels: cmp.totalPixels,
    changedRatio: cmp.changedRatio,
    maxDelta: cmp.maxDelta,
    meanDelta: cmp.meanDelta,
    sizeChanged: cmp.sizeChanged,
    baselineSize: { width: imgA.width, height: imgA.height },
    candidateSize: { width: imgB.width, height: imgB.height },
  }
  if (cmp.changedRatio < diffRatio) return { stats, diff: null }

  // Diff panel: the candidate, faded out, with changed pixels burned in as
  // magenta and size-only regions as amber — so the eye lands on the change
  // while the surrounding layout stays readable as context.
  const diffCanvas = new OffscreenCanvas(cmp.width, cmp.height)
  const dctx = diffCanvas.getContext('2d')
  dctx.fillStyle = '#ffffff'
  dctx.fillRect(0, 0, cmp.width, cmp.height)
  dctx.globalAlpha = 0.25
  dctx.drawImage(imgB.canvas, 0, 0)
  dctx.globalAlpha = 1
  const overlay = dctx.createImageData(cmp.width, cmp.height)
  for (let i = 0; i < cmp.mask.length; i++) {
    const m = cmp.mask[i]
    if (!m) continue
    const o = i * 4
    overlay.data[o] = m === 2 ? 245 : 255
    overlay.data[o + 1] = m === 2 ? 158 : 0
    overlay.data[o + 2] = m === 2 ? 11 : 255
    overlay.data[o + 3] = 255
  }
  const overlayCanvas = new OffscreenCanvas(cmp.width, cmp.height)
  overlayCanvas.getContext('2d').putImageData(overlay, 0, 0)
  dctx.drawImage(overlayCanvas, 0, 0)

  const gap = 16
  const label = 22
  const panelW = cmp.width
  const stripW = panelW * 3 + gap * 4
  const stripH = cmp.height + label + gap * 2
  const strip = new OffscreenCanvas(stripW, stripH)
  const sctx = strip.getContext('2d')
  sctx.fillStyle = '#1f2937'
  sctx.fillRect(0, 0, stripW, stripH)
  sctx.font = '14px sans-serif'
  sctx.fillStyle = '#e5e7eb'
  const panels = [
    ['baseline', imgA.canvas],
    ['candidate', imgB.canvas],
    ['diff', diffCanvas],
  ]
  panels.forEach(([name, canvas], i) => {
    const x = gap + i * (panelW + gap)
    sctx.fillText(name, x, gap)
    sctx.drawImage(canvas, x, gap + label)
  })

  const blob = await strip.convertToBlob({ type: 'image/png' })
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buffer.length; i += chunk)
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk))
  return { stats, diff: btoa(binary) }
}
