// The canvas-made JPEG fixtures for the Photo Wall checks (spec §6.4, §14),
// from a real Chromium through Playwright: `canvas.toBlob('image/jpeg')`,
// the encoder the composer uses on Android/Chrome.
//
// Chromium writes an APP2 ICC profile with every JPEG. The composer strips
// every APPn segment except APP0, and any COM, before sending (§6.5), so the
// fixtures that must PASS are the canvas output after that strip, done here
// with the same kind of marker walk. `canvas-chromium-raw.jpg` keeps the
// APP2, as the refused "did not come from the composer" sample.
//
// Run from the repo root (needs the installed `playwright` and its Chromium):
//   node __tests__/fixtures/photo-wall/make-canvas-fixtures.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const out = dirname(fileURLToPath(import.meta.url))

/** Drop every APPn but APP0, and every COM, up to the first SOS (§6.5). */
function stripMetadata(bytes) {
  const parts = [bytes.subarray(0, 2)]
  let i = 2
  while (i < bytes.length) {
    const marker = bytes[i + 1]
    if (marker === 0xda) {
      parts.push(bytes.subarray(i))
      break
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    const segment = bytes.subarray(i, i + 2 + length)
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe
    if (!metadata) parts.push(segment)
    i += 2 + length
  }
  return Buffer.concat(parts)
}

const browser = await chromium.launch()
const page = await browser.newPage()

async function canvasJpeg(width, height, quality) {
  const base64 = await page.evaluate(
    async ([w, h, q]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      const gradient = ctx.createLinearGradient(0, 0, w, h)
      gradient.addColorStop(0, '#1d4ed8')
      gradient.addColorStop(1, '#f59e0b')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(12, Math.floor(h / 8))}px sans-serif`
      ctx.fillText(`${w}x${h}`, 8, Math.floor(h / 2))
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', q),
      )
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b)
      return btoa(s)
    },
    [width, height, quality],
  )
  return Buffer.from(base64, 'base64')
}

const raw = await canvasJpeg(640, 480, 0.6)
writeFileSync(join(out, 'canvas-chromium-raw.jpg'), raw)
const canvas = stripMetadata(raw)
writeFileSync(join(out, 'canvas-chromium.jpg'), canvas)
// Cut before the EOI marker: the scan data ends mid-way.
writeFileSync(
  join(out, 'truncated.jpg'),
  canvas.subarray(0, canvas.length - 64),
)
writeFileSync(
  join(out, 'wide-4096.jpg'),
  stripMetadata(await canvasJpeg(4096, 320, 0.3)),
)
writeFileSync(
  join(out, 'small-200.jpg'),
  stripMetadata(await canvasJpeg(200, 200, 0.6)),
)
console.log('wrote canvas fixtures to', out, 'with Chromium', browser.version())
await browser.close()
