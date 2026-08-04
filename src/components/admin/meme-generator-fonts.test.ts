import { describe, it, expect, vi } from 'vitest'
import {
  canvasFontShorthand,
  fontRequestsForLines,
  loadCanvasFonts,
  memeLineText,
} from './meme-generator-fonts'
import { DEFAULT_TEXT_LINES, type TextLine } from './meme-generator-config'

function line(overrides: Partial<TextLine> = {}): TextLine {
  return { ...DEFAULT_TEXT_LINES[0], ...overrides }
}

describe('canvasFontShorthand', () => {
  it('produces a font shorthand the CSS Font Loading API accepts', () => {
    expect(
      canvasFontShorthand(
        line({ isBold: true, fontSize: 48, fontFamily: 'IBM Plex Sans' }),
      ),
    ).toBe('bold 48px "IBM Plex Sans"')
  })

  it('omits the fallback family, which has no @font-face to match', () => {
    const shorthand = canvasFontShorthand(line({ fontFamily: 'Inter' }))
    expect(shorthand).not.toContain('sans-serif')
    expect(shorthand).toBe('normal 120px "Inter"')
  })

  it('quotes multi-word families so the shorthand stays parseable', () => {
    expect(
      canvasFontShorthand(
        line({ fontSize: 80, fontFamily: 'Bricolage Grotesque' }),
      ),
    ).toBe('normal 80px "Bricolage Grotesque"')
  })
})

describe('memeLineText', () => {
  it('matches what the canvas paints for an uppercase line', () => {
    expect(memeLineText(line({ text: 'Hei på deg', isUppercase: true }))).toBe(
      'HEI PÅ DEG',
    )
  })

  it('leaves the text alone otherwise', () => {
    expect(memeLineText(line({ text: 'Hei på deg', isUppercase: false }))).toBe(
      'Hei på deg',
    )
  })
})

describe('fontRequestsForLines', () => {
  it('asks for the painted characters, not a probe string', () => {
    expect(
      fontRequestsForLines([
        line({ text: 'blæ', isUppercase: true, fontFamily: 'IBM Plex Mono' }),
      ]),
    ).toEqual([{ font: 'normal 120px "IBM Plex Mono"', text: 'BLÆ' }])
  })

  it('skips empty lines', () => {
    expect(fontRequestsForLines(DEFAULT_TEXT_LINES)).toEqual([])
  })

  it('deduplicates identical faces and keeps distinct ones', () => {
    const requests = fontRequestsForLines([
      line({ text: 'a', fontFamily: 'Inter', isUppercase: false }),
      line({ text: 'a', fontFamily: 'Inter', isUppercase: false }),
      line({
        text: 'a',
        fontFamily: 'Inter',
        isBold: true,
        isUppercase: false,
      }),
      line({
        text: 'a',
        fontFamily: 'Inter',
        fontSize: 40,
        isUppercase: false,
      }),
    ])

    expect(requests).toEqual([
      { font: 'normal 120px "Inter"', text: 'a' },
      { font: 'bold 120px "Inter"', text: 'a' },
      { font: 'normal 40px "Inter"', text: 'a' },
    ])
  })
})

describe('loadCanvasFonts', () => {
  it('loads each requested face through the font set', async () => {
    const load = vi.fn().mockResolvedValue([])
    const fonts = { load } as unknown as FontFaceSet

    await loadCanvasFonts(
      [
        { font: 'bold 48px "IBM Plex Sans"', text: 'HI' },
        { font: 'normal 80px "Bricolage Grotesque"', text: 'ho' },
      ],
      fonts,
    )

    expect(load.mock.calls).toEqual([
      ['bold 48px "IBM Plex Sans"', 'HI'],
      ['normal 80px "Bricolage Grotesque"', 'ho'],
    ])
  })

  // A font the app never loads (Atkinson Hyperlegible is in the picker but has
  // no @font-face anywhere) resolves empty, and a broken download rejects.
  // Neither may stop the caller from redrawing in the fallback.
  it('resolves when a face is missing or fails to download', async () => {
    const fonts = {
      load: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('network')),
    } as unknown as FontFaceSet

    await expect(
      loadCanvasFonts(
        [
          { font: 'normal 48px "Atkinson Hyperlegible"', text: 'HI' },
          { font: 'normal 48px "IBM Plex Sans"', text: 'HI' },
        ],
        fonts,
      ),
    ).resolves.toBeUndefined()
  })

  it('contains a font set that throws synchronously', async () => {
    const fonts = {
      load: vi.fn(() => {
        throw new SyntaxError('invalid font shorthand')
      }),
    } as unknown as FontFaceSet

    await expect(
      loadCanvasFonts([{ font: 'not-a-font', text: 'HI' }], fonts),
    ).resolves.toBeUndefined()
  })

  it('is a no-op without a font set or without requests', async () => {
    const load = vi.fn()
    await expect(
      loadCanvasFonts([{ font: 'normal 48px "Inter"', text: 'HI' }], undefined),
    ).resolves.toBeUndefined()
    await expect(
      loadCanvasFonts([], { load } as unknown as FontFaceSet),
    ).resolves.toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })
})
