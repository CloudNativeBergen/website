import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  QR_QUIET_ZONE,
  SLIDE_PNG_WIDTH,
  feedbackCodeDisplayUrl,
  feedbackCodeFileName,
  renderFeedbackQrPng,
  renderFeedbackQrSvg,
} from './code-assets'

const URL = 'https://2026.cloudnativedays.no/f/k7m2qx'

describe('feedbackCodeDisplayUrl — the short URL without scheme (§9.2)', () => {
  it('drops the scheme and nothing else', () => {
    expect(feedbackCodeDisplayUrl(URL)).toBe('2026.cloudnativedays.no/f/k7m2qx')
    expect(feedbackCodeDisplayUrl('http://localhost:3000/f/k7m2qx')).toBe(
      'localhost:3000/f/k7m2qx',
    )
  })
})

describe('feedbackCodeFileName — says which talk and code a download is', () => {
  it('is the code and a slug of the title, nothing the speaker has not seen', () => {
    expect(
      feedbackCodeFileName(URL, 'Kubernetes: the hard parts!', 'png'),
    ).toBe('feedback-code-k7m2qx-kubernetes-the-hard-parts.png')
  })

  it('keeps Norwegian and accented letters readable instead of dropping them', () => {
    expect(feedbackCodeFileName(URL, 'Sikkerhet på toppen', 'png')).toBe(
      'feedback-code-k7m2qx-sikkerhet-paa-toppen.png',
    )
    expect(feedbackCodeFileName(URL, 'Ærlig talt om Øl', 'svg')).toBe(
      'feedback-code-k7m2qx-aerlig-talt-om-ol.svg',
    )
    expect(feedbackCodeFileName(URL, 'Déjà vu: naïve façades', 'png')).toBe(
      'feedback-code-k7m2qx-deja-vu-naive-facades.png',
    )
  })

  it('spells the other Latin letters NFKD cannot decompose', () => {
    expect(feedbackCodeFileName(URL, 'Łódź i Đorđe', 'png')).toBe(
      'feedback-code-k7m2qx-lodz-i-dorde.png',
    )
    expect(feedbackCodeFileName(URL, 'Þórður og Guðrún', 'png')).toBe(
      'feedback-code-k7m2qx-thordur-og-gudrun.png',
    )
    expect(feedbackCodeFileName(URL, 'Œuvre complète', 'png')).toBe(
      'feedback-code-k7m2qx-oeuvre-complete.png',
    )
  })

  it('falls back to the code alone when nothing of the title survives', () => {
    expect(feedbackCodeFileName(URL, 'クラウドの話', 'png')).toBe(
      'feedback-code-k7m2qx.png',
    )
  })

  it('keeps a long title short and copes with no usable title', () => {
    const long = 'A '.repeat(60)
    const name = feedbackCodeFileName(URL, long, 'svg')
    expect(name.length).toBeLessThanOrEqual(64)
    expect(name.endsWith('.svg')).toBe(true)
    expect(feedbackCodeFileName(URL, '!!!', 'svg')).toBe(
      'feedback-code-k7m2qx.svg',
    )
    expect(
      feedbackCodeFileName(URL, 'Talk', 'png', { transparent: true }),
    ).toBe('feedback-code-k7m2qx-talk-transparent.png')
    expect(feedbackCodeFileName('https://a.dev/', 'Talk', 'svg')).toBe(
      'feedback-code-talk.svg',
    )
  })
})

/**
 * Expected values come from the QR standard, not from the library: a 40-byte
 * URL at error correction M is a version 3 symbol, 29 modules a side (table
 * 7 of ISO/IEC 18004: 3-M holds 42 bytes, 2-M only 26).
 */
const MODULES = 29

describe('renderFeedbackQrSvg — dark on light with a quiet zone', () => {
  it('draws the symbol inside a four-module quiet zone on a white ground', async () => {
    const svg = await renderFeedbackQrSvg(URL)
    const side = MODULES + 2 * QR_QUIET_ZONE
    expect(QR_QUIET_ZONE).toBe(4)
    expect(svg).toContain(`viewBox="0 0 ${side} ${side}"`)
    // The white ground is painted first and covers the whole symbol, quiet
    // zone included; a transparent ground prints dark on a dark slide.
    expect(svg).toMatch(
      new RegExp(`<path fill="#ffffff" d="M0 0h${side}v${side}H0z"/><path`),
    )
    expect(svg).toContain('stroke="#000000"')
    // Keynote and PowerPoint import an SVG without width/height at ~37 pt;
    // with them it lands at a usable size, and the viewBox keeps it scalable.
    expect(svg).toContain('width="1024" height="1024"')
    // No module is drawn in the quiet zone: every row starts at x >= margin.
    const dark = svg.match(/stroke="#000000" d="([^"]+)"/)?.[1] ?? ''
    const starts = [...dark.matchAll(/M(\d+) /g)].map((m) => Number(m[1]))
    expect(starts.length).toBeGreaterThan(0)
    expect(Math.min(...starts)).toBe(QR_QUIET_ZONE)
  })
})

describe('renderFeedbackQrPng — a slide-sized PNG', () => {
  it('is a PNG data URL as wide as a slide needs, square', async () => {
    const dataUrl = await renderFeedbackQrPng(URL)
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    const bytes = Buffer.from(
      dataUrl.slice('data:image/png;base64,'.length),
      'base64',
    )
    // PNG signature, then IHDR: width at bytes 16..19, height at 20..23.
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(SLIDE_PNG_WIDTH).toBeGreaterThanOrEqual(1024)
    expect(bytes.readUInt32BE(16)).toBe(SLIDE_PNG_WIDTH)
    expect(bytes.readUInt32BE(20)).toBe(SLIDE_PNG_WIDTH)
  })
})

/**
 * The RGBA pixel at (x, y) of an 8-bit RGBA PNG data URL, decoded for real:
 * IDAT inflated and each row's filter undone (PNG spec §9).
 */
function pngPixel(dataUrl: string, x: number, y: number): number[] {
  const png = Buffer.from(dataUrl.split(',')[1], 'base64')
  const width = png.readUInt32BE(16)
  expect([png[24], png[25]]).toEqual([8, 6]) // bit depth 8, RGBA
  const idat: Buffer[] = []
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o)
    if (png.toString('ascii', o + 4, o + 8) === 'IDAT')
      idat.push(png.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  let prev = new Uint8Array(stride)
  for (let row = 0; row <= y; row++) {
    const filter = raw[row * (stride + 1)]
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1))
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0
      const b = prev[i]
      const c = i >= 4 ? prev[i - 4] : 0
      const p = a + b - c
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]
      cur[i] = (line[i] + predictor) & 0xff
    }
    prev = cur
  }
  return [...prev.subarray(x * 4, x * 4 + 4)]
}

describe('renderFeedbackQrPng — transparent, for a light slide', () => {
  // 37 modules a side at 370 px: 10 px a module. The quiet zone ends at
  // 40 px; the finder pattern's dark ring starts there.
  const side = MODULES + 2 * QR_QUIET_ZONE
  const width = side * 10

  it('leaves the ground, quiet zone included, fully transparent, and draws the modules opaque black', async () => {
    const png = await renderFeedbackQrPng(URL, width, { transparent: true })
    expect(pngPixel(png, 0, 0)).toEqual([255, 255, 255, 0])
    expect(pngPixel(png, 39, 39)[3]).toBe(0)
    // Inside the finder pattern's light ring (module 5, 5).
    expect(pngPixel(png, 55, 55)[3]).toBe(0)
    // Its dark ring (module 4, 4) and centre (module 7, 7).
    expect(pngPixel(png, 45, 45)).toEqual([0, 0, 0, 255])
    expect(pngPixel(png, 75, 75)).toEqual([0, 0, 0, 255])
  })

  it('is the same symbol as the white PNG, only the ground differs', async () => {
    const white = await renderFeedbackQrPng(URL, width)
    const clear = await renderFeedbackQrPng(URL, width, { transparent: true })
    expect(pngPixel(white, 0, 0)).toEqual([255, 255, 255, 255])
    for (let m = 0; m < side; m++) {
      const at = m * 10 + 5
      const w = pngPixel(white, at, at)
      const c = pngPixel(clear, at, at)
      expect(c[3]).toBe(w[0] === 0 ? 255 : 0)
    }
  })
})
