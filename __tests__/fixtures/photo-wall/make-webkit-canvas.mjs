// The Safari-made JPEG sample of Photo Wall spec §6.5: a canvas drawn and
// encoded by Playwright's WebKit (ImageIO on macOS, the closest encoder to
// iOS Safari that runs here), written as the RAW encoder output. Playwright
// WebKit 26.6 wrote an APP1 (Exif) and an APP13 (Photoshop/IPTC) segment into
// it, which is exactly what `stripJpegMetadata` removes.
//
// Regenerate from the repo root (needs the Playwright WebKit download):
//   node __tests__/fixtures/photo-wall/make-webkit-canvas.mjs __tests__/fixtures/photo-wall/webkit-canvas.jpg
import { webkit } from 'playwright'
import { writeFileSync } from 'node:fs'

const out = process.argv[2]
const browser = await webkit.launch()
const page = await browser.newPage()
const b64 = await page.evaluate(async () => {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 480
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 640, 480)
  g.addColorStop(0, '#1d4ed8')
  g.addColorStop(0.5, '#10b981')
  g.addColorStop(1, '#f59e0b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 640, 480)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(320, 240, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 48px sans-serif'
  ctx.fillText('wall', 270, 258)
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return { ua: navigator.userAgent, b64: btoa(s), type: blob.type }
})
await browser.close()
writeFileSync(out, Buffer.from(b64.b64, 'base64'))
console.log(b64.ua, b64.type, Buffer.from(b64.b64, 'base64').length, 'bytes')
