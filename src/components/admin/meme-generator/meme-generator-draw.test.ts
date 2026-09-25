// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DESIGN,
  DRIFT_RASTER_SIZE,
  drawDesign,
  prescaleForDrift,
  textAnchor,
  wrapWords,
  type Animation,
  type MemeAssets,
  type MemeDesign,
} from './meme-generator-draw'
import {
  DRIFT_ZOOM,
  PRESET_DURATION,
  type ElementMotion,
} from './meme-generator-motion'
import { CANVAS_SIZE, type TextLine } from './meme-generator-config'
import type { CanvasLogo } from './meme-generator-logo'

type Call = [string, ...unknown[]]

/**
 * A 2D context that records every call and property write, in order. Text is
 * measured as half the font size per character, so wrapping is predictable.
 */
function recordingContext() {
  const calls: Call[] = []
  let font = ''
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(_target, key) {
      if (key === 'font') return font
      if (key === 'measureText') {
        return (text: string) => {
          const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10)
          return { width: text.length * size * 0.5 }
        }
      }
      if (key === 'createLinearGradient') {
        return (...args: unknown[]) => {
          calls.push(['createLinearGradient', ...args])
          return {
            addColorStop: (...stop: unknown[]) =>
              calls.push(['addColorStop', ...stop]),
          }
        }
      }
      return (...args: unknown[]) => calls.push([String(key), ...args])
    },
    set(_target, key, value) {
      if (key === 'font') font = value
      calls.push([`${String(key)}=`, value])
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const image = (width: number, height: number) =>
  ({ width, height, tag: `${width}x${height}` }) as unknown as HTMLImageElement

const NO_ASSETS: MemeAssets = {
  background: null,
  qr: null,
  logo: null,
  brand: { fontFamily: '"Space Grotesk"', gradient: ['#111111', '#222222'] },
}

function design(overrides: Partial<MemeDesign> = {}): MemeDesign {
  return { ...DEFAULT_DESIGN, ...overrides }
}

function withLine(line: Partial<TextLine>): MemeDesign {
  return design({
    textLines: [{ ...DEFAULT_DESIGN.textLines[0], ...line }],
  })
}

function draw(d: MemeDesign, assets: Partial<MemeAssets> = {}) {
  const { ctx, calls } = recordingContext()
  drawDesign(ctx, d, { ...NO_ASSETS, ...assets }, 0)
  return calls
}

const named = (calls: Call[], name: string) =>
  calls.filter(([call]) => call === name)

describe('drawDesign', () => {
  it('paints the untouched design as a cleared canvas filled with the colour', () => {
    expect(draw(DEFAULT_DESIGN)).toEqual([
      ['clearRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
      ['fillStyle=', '#10B981'],
      ['fillRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
    ])
  })

  it('covers the canvas with the background image, centred, instead of the colour', () => {
    const calls = draw(
      design({
        background: { color: '#10B981', image: { url: 'u', name: 'a.png' } },
      }),
      { background: image(2160, 1080) },
    )
    expect(calls).toEqual([
      ['clearRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
      ['drawImage', image(2160, 1080), 0, 0, 2160, 1080, -540, 0, 2160, 1080],
    ])
  })

  it('draws a text line: font, colour, then stroke and fill per wrapped row', () => {
    const calls = draw(
      withLine({ text: 'hello big world', fontSize: 140, isUppercase: true }),
    )
    expect(calls.slice(3)).toEqual([
      ['font=', 'normal 140px "Space Grotesk", sans-serif'],
      ['fillStyle=', '#FFFFFF'],
      ['textAlign=', 'center'],
      ['textBaseline=', 'middle'],
      // 972 px wide at 70 px a character: "HELLO BIG" (9) fits, the rest wraps.
      ['strokeStyle=', 'rgba(0, 0, 0, 0.15)'],
      ['lineWidth=', 2],
      ['strokeText', 'HELLO BIG', 540, 240],
      ['fillText', 'HELLO BIG', 540, 240],
      ['strokeStyle=', 'rgba(0, 0, 0, 0.15)'],
      ['lineWidth=', 2],
      ['strokeText', 'WORLD', 540, 408],
      ['fillText', 'WORLD', 540, 408],
    ])
  })

  it('skips empty text lines', () => {
    expect(named(draw(DEFAULT_DESIGN), 'fillText')).toEqual([])
  })

  it('moves a left-aligned line with its horizontal position', () => {
    const at = (horizontalPosition: number) =>
      named(
        draw(withLine({ text: 'hi', textAlign: 'left', horizontalPosition })),
        'fillText',
      )[0][2]
    expect(at(10)).toBe(108)
    expect(at(40)).toBe(432)
  })

  it('measures a right-aligned line from the right edge', () => {
    const [, , x] = named(
      draw(
        withLine({ text: 'hi', textAlign: 'right', horizontalPosition: 10 }),
      ),
      'fillText',
    )[0]
    expect(x).toBe(972)
  })

  it('draws the QR image centred on its position, at its size', () => {
    const qr = image(500, 500)
    const calls = draw(
      design({
        qr: {
          ...DEFAULT_DESIGN.qr,
          url: 'https://example.com',
          size: 200,
          horizontalPosition: 25,
          verticalPosition: 50,
        },
      }),
      { qr },
    )
    expect(named(calls, 'drawImage')).toEqual([
      ['drawImage', qr, 170, 440, 200, 200],
    ])
  })

  it('draws no QR once its URL is cleared, even with a stale image', () => {
    expect(
      named(draw(DEFAULT_DESIGN, { qr: image(10, 10) }), 'drawImage'),
    ).toEqual([])
  })

  it('draws the logo last, over the text and the QR', () => {
    const logo: CanvasLogo = {
      kind: 'image',
      image: image(970, 234),
      aspect: 234 / 970,
    }
    const calls = draw(
      design({
        textLines: [{ ...DEFAULT_DESIGN.textLines[0], text: 'hi' }],
        qr: { ...DEFAULT_DESIGN.qr, url: 'https://example.com' },
      }),
      { qr: image(500, 500), logo },
    )
    const last = calls.at(-1)!
    expect(last[0]).toBe('drawImage')
    expect(last[1]).toBe(logo.image)
  })

  it('inks the wordmark from the background: black on light, white over an image', () => {
    const logo: CanvasLogo = { kind: 'wordmark', name: 'Konf' }
    const ink = (d: MemeDesign, assets: Partial<MemeAssets>) =>
      named(draw(d, { logo, ...assets }), 'fillStyle=').at(-1)?.[1]

    expect(ink(DEFAULT_DESIGN, {})).toBe('#000000')
    expect(
      ink(
        design({
          background: { color: '#FFFFFF', image: { url: 'u', name: 'a.png' } },
        }),
        { background: image(1080, 1080) },
      ),
    ).toBe('#FFFFFF')
  })

  it('paints the gradient wordmark in the brand colours it is given', () => {
    const calls = draw(
      design({ logo: { ...DEFAULT_DESIGN.logo, variant: 'gradient' } }),
      { logo: { kind: 'wordmark', name: 'Konf' } },
    )
    expect(named(calls, 'addColorStop')).toEqual([
      ['addColorStop', 0, '#111111'],
      ['addColorStop', 1, '#222222'],
    ])
  })

  it('ignores time for now: every instant is the same frame', () => {
    const d = withLine({ text: 'hello' })
    const at = (t: number) => {
      const { ctx, calls } = recordingContext()
      drawDesign(ctx, d, NO_ASSETS, t)
      return calls
    }
    expect(at(2.5)).toEqual(at(0))
  })
})

describe('textAnchor', () => {
  const line = (overrides: Partial<TextLine>) => ({
    ...DEFAULT_DESIGN.textLines[0],
    textPadding: 5,
    horizontalPosition: 20,
    ...overrides,
  })

  it('centres a centred line and pads both sides', () => {
    expect(textAnchor(line({ textAlign: 'center' }))).toEqual({
      x: 540,
      maxWidth: 972,
    })
  })

  it('anchors a left line at its position and pads the far side', () => {
    expect(textAnchor(line({ textAlign: 'left' }))).toEqual({
      x: 216,
      maxWidth: 810,
    })
  })

  it('mirrors that for a right line', () => {
    expect(textAnchor(line({ textAlign: 'right' }))).toEqual({
      x: 864,
      maxWidth: 810,
    })
  })
})

describe('wrapWords', () => {
  const measure = (text: string) => text.length

  it('breaks between words at the width', () => {
    expect(wrapWords('aa bb cc', 5, measure)).toEqual(['aa bb', 'cc'])
  })

  it('keeps a word longer than the width on its own row', () => {
    expect(wrapWords('aaaaaaaa b', 3, measure)).toEqual(['aaaaaaaa', 'b'])
  })
})

describe('drawDesign at a time', () => {
  const HEADLINE = withLine({
    text: 'Three words wrapping across rows here',
    fontSize: 100,
  })
  const animated = (
    elements: Animation['motion']['elements'],
    drift = false,
  ): Animation => ({ motion: { drift, elements }, duration: 3 })
  const bar = (patch: Partial<ElementMotion>): ElementMotion => ({
    entrance: 'none',
    exit: 'none',
    enter: 0,
    leave: 3,
    ...patch,
  })
  const drawAt = (
    d: MemeDesign,
    time: number,
    animation?: Animation,
    assets: Partial<MemeAssets> = {},
  ) => {
    const { ctx, calls } = recordingContext()
    drawDesign(ctx, d, { ...NO_ASSETS, ...assets }, time, animation)
    return calls
  }
  const rows = (calls: Call[]) =>
    named(calls, 'fillText').map(([, text, x, y]) => [text, x, y])

  it('draws an unanimated scene exactly as the still', () => {
    expect(drawAt(HEADLINE, 1.5, animated({}))).toEqual(draw(HEADLINE))
  })

  it('wraps the text identically at every frame of a pop, and never changes the font', () => {
    const pop = animated({ text0: bar({ entrance: 'pop', enter: 1 }) })
    const still = draw(HEADLINE)
    expect(rows(still).length).toBeGreaterThan(1)
    const frames = Math.ceil(PRESET_DURATION.pop * 30) + 1
    const scales = new Set<unknown>()
    for (let frame = 0; frame <= frames; frame++) {
      const calls = drawAt(HEADLINE, 1 + frame / 30, pop)
      expect(rows(calls)).toEqual(rows(still))
      expect(named(calls, 'font=')).toEqual(named(still, 'font='))
      for (const [, x] of named(calls, 'scale')) scales.add(x)
    }
    // It really did scale, through more than one size.
    expect(scales.size).toBeGreaterThan(3)
  })

  it("scales a pop about the text block's centre", () => {
    const calls = drawAt(
      HEADLINE,
      1,
      animated({ text0: bar({ entrance: 'pop', enter: 1 }) }),
    )
    const y = (HEADLINE.textLines[0].verticalPosition / 100) * CANVAS_SIZE
    expect(named(calls, 'translate')).toEqual([
      ['translate', 540, y],
      ['translate', -540, -y],
    ])
    expect(named(calls, 'scale')).toEqual([['scale', 0.8, 0.8]])
    expect(calls.at(-1)).toEqual(['restore'])
  })

  it('scales a left or right line about its block, not its anchor', () => {
    const pop = animated({ text0: bar({ entrance: 'pop' }) })
    const line = { text: 'abcd', fontSize: 100, horizontalPosition: 20 }
    // Four characters at half the font size each: a 200 px wide block.
    const left = drawAt(withLine({ ...line, textAlign: 'left' }), 0, pop)
    expect(named(left, 'translate')[0][1]).toBe(216 + 100)
    const right = drawAt(withLine({ ...line, textAlign: 'right' }), 0, pop)
    expect(named(right, 'translate')[0][1]).toBe(864 - 100)
  })

  it('draws nothing of a line after its exit, or before its entrance', () => {
    const gone = animated({ text0: bar({ enter: 1, leave: 2 }) })
    expect(named(drawAt(HEADLINE, 2.5, gone), 'fillText')).toEqual([])
    expect(named(drawAt(HEADLINE, 0.5, gone), 'fillText')).toEqual([])
    expect(rows(drawAt(HEADLINE, 1.5, gone))).toEqual(rows(draw(HEADLINE)))
  })

  it('fades a line by its opacity and slides it 40 px up into place', () => {
    const slide = animated({ text0: bar({ entrance: 'slide-up' }) })
    const calls = drawAt(HEADLINE, PRESET_DURATION['slide-up'] / 2, slide)
    expect(named(calls, 'globalAlpha=')[0][1]).toBeCloseTo(0.875, 10)
    const [[, , offset]] = named(calls, 'translate')
    const y = (HEADLINE.textLines[0].verticalPosition / 100) * CANVAS_SIZE
    expect(offset as number).toBeCloseTo(y + 5, 10)
  })

  it('animates the logo and the QR code about their own centres', () => {
    const logo: CanvasLogo = {
      kind: 'image',
      image: image(970, 234),
      aspect: 234 / 970,
    }
    const withQr = design({
      qr: { ...DEFAULT_DESIGN.qr, url: 'https://example.com' },
    })
    const calls = drawAt(
      withQr,
      0,
      animated({
        qr: bar({ entrance: 'pop' }),
        logo: bar({ entrance: 'pop' }),
      }),
      { logo, qr: image(500, 500) },
    )
    expect(named(calls, 'scale')).toEqual([
      ['scale', 0.8, 0.8],
      ['scale', 0.8, 0.8],
    ])
    const qrCentre = [
      (withQr.qr.horizontalPosition / 100) * CANVAS_SIZE,
      (withQr.qr.verticalPosition / 100) * CANVAS_SIZE,
    ]
    expect(named(calls, 'translate')[0]).toEqual(['translate', ...qrCentre])
  })

  it('zooms a drifting background image about the centre, and not a colour', () => {
    const photo = image(DRIFT_RASTER_SIZE, DRIFT_RASTER_SIZE)
    const drift = animated({}, true)
    const at = (time: number) =>
      named(
        drawAt(DEFAULT_DESIGN, time, drift, { background: photo }),
        'drawImage',
      )[0]
    // At the start it fills the canvas; at the end it is DRIFT_ZOOM larger.
    expect(at(0)).toEqual([
      'drawImage',
      photo,
      0,
      0,
      DRIFT_RASTER_SIZE,
      DRIFT_RASTER_SIZE,
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE,
    ])
    const end = at(3) as number[]
    expect(end[8]).toBeCloseTo(CANVAS_SIZE * (1 + DRIFT_ZOOM), 6)
    expect(end[6]).toBeCloseTo((-CANVAS_SIZE * DRIFT_ZOOM) / 2, 6)
    expect(drawAt(DEFAULT_DESIGN, 3, drift)).toEqual(draw(DEFAULT_DESIGN))
  })
})

describe('prescaleForDrift', () => {
  it('makes no copy when the canvas has no 2D context', () => {
    const canvas = { width: 0, height: 0, getContext: () => null }
    expect(
      prescaleForDrift(
        image(6000, 4000),
        canvas as unknown as HTMLCanvasElement,
      ),
    ).toBeNull()
  })

  it('covers a square at the largest zoom with the photo, once', () => {
    const { ctx, calls } = recordingContext()
    const canvas = { width: 0, height: 0, getContext: () => ctx }
    const photo = image(6000, 4000)
    const out = prescaleForDrift(photo, canvas as unknown as HTMLCanvasElement)
    expect(out).toMatchObject({
      width: DRIFT_RASTER_SIZE,
      height: DRIFT_RASTER_SIZE,
    })
    const side = DRIFT_RASTER_SIZE
    expect(calls).toEqual([
      [
        'drawImage',
        photo,
        0,
        0,
        6000,
        4000,
        (side - side * 1.5) / 2,
        0,
        side * 1.5,
        side,
      ],
    ])
  })
})
