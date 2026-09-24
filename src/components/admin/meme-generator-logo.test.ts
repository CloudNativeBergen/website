import { describe, it, expect } from 'vitest'
import {
  isLightBackground,
  logoFrame,
  logoSvgFor,
  monochromeInk,
  svgForCanvas,
} from './meme-generator-logo'
import { wordmarkLayout } from '../BrandWordmark'

describe('isLightBackground', () => {
  it('reads a light colour as light and a dark one as dark', () => {
    expect(isLightBackground({ color: '#E0F2FE', hasImage: false })).toBe(true)
    expect(isLightBackground({ color: '#334155', hasImage: false })).toBe(false)
  })

  it('keeps the uncorrected-luminance rule: the default green counts as light', () => {
    expect(isLightBackground({ color: '#10B981', hasImage: false })).toBe(true)
  })

  it('assumes any image is dark, whatever the colour underneath', () => {
    expect(isLightBackground({ color: '#FFFFFF', hasImage: true })).toBe(false)
  })
})

describe('monochromeInk', () => {
  it('is black on light and white on dark', () => {
    expect(monochromeInk(true)).toBe('#000000')
    expect(monochromeInk(false)).toBe('#FFFFFF')
  })
})

describe('logoSvgFor', () => {
  const logos = { logoBright: '<svg id="b"/>', logoDark: '<svg id="d"/>' }

  it('uses the light-mode logo on a light background', () => {
    expect(logoSvgFor(logos, true)).toBe(logos.logoBright)
  })

  it('uses the dark-mode logo on a dark background', () => {
    expect(logoSvgFor(logos, false)).toBe(logos.logoDark)
  })

  it('falls back to the light-mode logo when there is no dark one', () => {
    expect(logoSvgFor({ logoBright: '<svg id="b"/>' }, false)).toBe(
      '<svg id="b"/>',
    )
  })

  it('returns nothing when no logo is uploaded', () => {
    expect(logoSvgFor({ title: 'X' }, true)).toBeUndefined()
    expect(logoSvgFor(undefined, true)).toBeUndefined()
  })
})

describe('svgForCanvas', () => {
  it('adds the SVG namespace a standalone image needs', () => {
    const result = svgForCanvas('<svg viewBox="0 0 970 234"><rect/></svg>')
    expect(result?.markup).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 970 234">/,
    )
    expect(result).toMatchObject({ width: 970, height: 234 })
  })

  it('leaves an existing namespace alone', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"></svg>'
    expect(svgForCanvas(svg)?.markup).toBe(svg)
  })

  it('derives a viewBox from width and height when there is none', () => {
    const result = svgForCanvas(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200px" height="50"></svg>',
    )
    expect(result).toMatchObject({ width: 200, height: 50 })
    expect(result?.markup).toContain('viewBox="0 0 200 50"')
  })

  it('accepts comma-separated viewBox values', () => {
    expect(svgForCanvas('<svg viewBox="0,0,40,10"></svg>')).toMatchObject({
      width: 40,
      height: 10,
    })
  })

  it('reports no size when neither a viewBox nor a pixel size is present', () => {
    expect(svgForCanvas('<svg width="100%"><rect/></svg>')).toMatchObject({
      width: undefined,
      height: undefined,
    })
  })

  it('sanitises before rasterising', () => {
    const result = svgForCanvas(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><script>x()</script></svg>',
    )
    expect(result?.markup).not.toMatch(/onload|script/)
  })

  it('rejects markup that is not an SVG', () => {
    expect(svgForCanvas('<div></div>')).toBeNull()
    expect(svgForCanvas('')).toBeNull()
  })
})

describe('logoFrame', () => {
  // The DOM overlay sized its SVG to the box width and let the height follow
  // the logo's own aspect ratio, anchored to the top of a 970:234 box whose
  // bottom-right corner sits at the two slider distances.
  it('places a 970×234 logo exactly in its box', () => {
    expect(
      logoFrame({ size: 360, bottom: 40, right: 40, aspect: 234 / 970 }),
    ).toEqual({
      x: 1080 - 40 - 360,
      y: 1080 - 40 - 360 / (970 / 234),
      width: 360,
      height: 360 * (234 / 970),
    })
  })

  it('keeps the width and top edge for a taller logo, letting it hang lower', () => {
    const frame = logoFrame({ size: 400, bottom: 0, right: 0, aspect: 1 })
    expect(frame.width).toBe(400)
    expect(frame.height).toBe(400)
    expect(frame.y).toBeCloseTo(1080 - 400 / (970 / 234))
  })
})

describe('wordmarkLayout', () => {
  it('sets a short name on one line', () => {
    const layout = wordmarkLayout('Konf')
    expect(layout.lines.map((line) => line.text)).toEqual(['Konf'])
    expect(layout.viewBoxHeight).toBe(100)
  })

  it('balances a long name over two lines', () => {
    const layout = wordmarkLayout('Cloud Native Days Norway 2026')
    expect(layout.lines.map((line) => line.text)).toEqual([
      'Cloud Native Days',
      'Norway 2026',
    ])
    expect(layout.lines[0].y).toBeLessThan(layout.lines[1].y)
  })

  it('pins the longest line to the viewBox minus its padding', () => {
    const layout = wordmarkLayout('Cloud Native Days Norway 2026')
    const widest = Math.max(...layout.lines.map((line) => line.width))
    const x = layout.lines[0].x
    expect(x * 2 + widest).toBeCloseTo(layout.viewBoxWidth, 0)
  })
})
