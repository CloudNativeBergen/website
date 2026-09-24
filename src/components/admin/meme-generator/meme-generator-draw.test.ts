// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DESIGN,
  drawDesign,
  textAnchor,
  wrapWords,
  type MemeAssets,
  type MemeDesign,
} from './meme-generator-draw'
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
