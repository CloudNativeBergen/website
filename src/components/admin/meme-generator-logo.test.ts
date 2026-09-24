// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  isLightBackground,
  logoTint,
  logoRasterRequests,
  logoFrame,
  logoSvgFor,
  monochromeInk,
  svgForCanvas,
  logoMarkup,
  loadLogoImage,
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

describe('logoTint', () => {
  // An uploaded logo's `currentColor` is what this resolves to. Stored logos
  // colour their text with `text-brand-slate-gray dark:text-white` classes,
  // which an SVG loaded as an image cannot see.
  it("is the monochrome ink in monochrome, overriding the logo's own colour", () => {
    expect(logoTint('monochrome', true)).toEqual({
      color: '#000000',
      override: true,
    })
    expect(logoTint('monochrome', false)).toEqual({
      color: '#FFFFFF',
      override: true,
    })
  })

  it("is what the logo's own classes meant in gradient — only where it sets no colour", () => {
    expect(logoTint('gradient', true)).toEqual({
      color: '#334155',
      override: false,
    })
    expect(logoTint('gradient', false)).toEqual({
      color: '#FFFFFF',
      override: false,
    })
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

/**
 * Prepare `svg` and parse the result the way an image is parsed — as XML —
 * failing on anything the XML parser rejects.
 */
function asImage(svg: string, color = '#000000', override = true) {
  const prepared = svgForCanvas(svg)
  if (!prepared) throw new Error('not prepared')
  const markup = logoMarkup(prepared.element, { color, override })
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  return { prepared, markup, root: doc.documentElement }
}

describe('svgForCanvas + logoMarkup', () => {
  it('adds the SVG namespace a standalone image needs', () => {
    const { prepared, root } = asImage(
      '<svg viewBox="0 0 970 234"><rect/></svg>',
    )
    expect(root.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(prepared).toMatchObject({ width: 970, height: 234 })
  })

  it('binds xlink: for a legacy logo that never declared it', () => {
    const raw =
      '<svg viewBox="0 0 10 10"><defs><circle id="m" r="4"/></defs><use xlink:href="#m"/></svg>'
    // Control: as XML the raw markup does not even parse.
    const rawDoc = new DOMParser().parseFromString(raw, 'image/svg+xml')
    expect(rawDoc.querySelector('parsererror')).not.toBeNull()

    const use = asImage(raw).root.querySelector('use')!
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(
      '#m',
    )
  })

  it('repairs attribute casing the HTML parser used to repair', () => {
    const { prepared, root } = asImage(
      '<svg VIEWBOX="0 0 100 50"><rect/></svg>',
    )
    expect(root.getAttribute('viewBox')).toBe('0 0 100 50')
    expect(prepared).toMatchObject({ width: 100, height: 50 })
  })

  it('derives a viewBox from width and height when there is none', () => {
    const { prepared, root } = asImage('<svg width="200px" height="50"></svg>')
    expect(prepared).toMatchObject({ width: 200, height: 50 })
    expect(root.getAttribute('viewBox')).toBe('0 0 200 50')
  })

  it('takes its size from width and height when they disagree with the viewBox', () => {
    // As an image the SVG is width×height, its viewBox letterboxed inside;
    // fitting it by the viewBox's aspect would stretch it.
    expect(
      svgForCanvas('<svg width="200" height="100" viewBox="0 0 100 100"/>'),
    ).toMatchObject({ width: 200, height: 100 })
  })

  it('converts absolute units to px', () => {
    expect(
      svgForCanvas('<svg width="150pt" height="1in" viewBox="0 0 1 1"/>'),
    ).toMatchObject({ width: 200, height: 96 })
  })

  it('accepts comma-separated viewBox values', () => {
    expect(svgForCanvas('<svg viewBox="0,0,40,10"></svg>')).toMatchObject({
      width: 40,
      height: 10,
    })
  })

  it('reports no size when neither a viewBox nor an absolute size is present', () => {
    const result = svgForCanvas('<svg width="100%"><rect/></svg>')
    expect(result?.element).toBeDefined()
    expect(result?.width).toBeUndefined()
    expect(result?.height).toBeUndefined()
  })

  it('sanitises before rasterising', () => {
    const { markup } = asImage(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><script>x()</script></svg>',
    )
    expect(markup).not.toMatch(/onload|script/)
  })

  it('strips event handlers the regex sanitiser misses', () => {
    // `/` separates attributes for the HTML parser, so `/onerror=` survives
    // sanitizeSvg's whitespace-anchored regex yet parses as a real handler.
    const { root } = asImage(
      '<svg viewBox="0 0 1 1"><image href="x"/onerror="alert(1)"/><g/onclick="x()"/></svg>',
    )
    const handlers = [root, ...root.querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].map((a) => a.name).filter((n) => /^on/i.test(n)),
    )
    expect(handlers).toEqual([])
  })

  it('drops HTML smuggled in through <desc>/<title> — meta refresh, img, link', () => {
    const { root } = asImage(
      '<svg viewBox="0 0 10 10"><desc><meta http-equiv="refresh" content="0;url=http://evil.test/"><img src="http://evil.test/p"><link rel="stylesheet" href="http://evil.test/s"></desc><title>T<video src="http://evil.test/v"></video></title><rect width="10" height="10"/></svg>',
    )
    expect(root.querySelector('meta, img, link, video')).toBeNull()
    expect(root.querySelector('rect')).not.toBeNull()
  })

  it('drops external references an image would never load, keeping local ones', () => {
    const { markup, root } = asImage(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs>' +
        '<style>@import url(http://evil.test/a.css);.a{fill:url(http://evil.test/p#g)}.b{fill:url(#g)}</style>' +
        '<image href="http://evil.test/i.png"/><use href="#g"/>' +
        '<rect style="fill:url( \'http://evil.test/q\' )"/></svg>',
    )
    expect(markup).not.toMatch(/evil\.test|@import/)
    expect(markup).toContain('url(#g)')
    expect(root.querySelector('use')!.getAttribute('href')).toBe('#g')
  })

  it('drops editor metadata under an undeclared prefix, which XML rejects', () => {
    const { root } = asImage(
      '<svg viewBox="0 0 10 10"><sodipodi:namedview pagecolor="#fff"/><g inkscape:label="Layer 1"><rect width="10" height="10"/></g></svg>',
    )
    expect(root.querySelector('rect')).not.toBeNull()
  })

  it('keeps xml: and xlink: attributes, which are always bound', () => {
    const { root } = asImage(
      '<svg viewBox="0 0 10 10" xml:space="preserve"><use xlink:href="#a"/></svg>',
    )
    expect(
      root.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space'),
    ).toBe('preserve')
    expect(
      root
        .querySelector('use')!
        .getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
    ).toBe('#a')
  })

  it('rejects markup that is not an SVG', () => {
    expect(svgForCanvas('<div></div>')).toBeNull()
    expect(svgForCanvas('')).toBeNull()
  })
})

describe('logoMarkup colour', () => {
  const color = (root: Element) =>
    /(?:^|;)\s*color:\s*([^;]+)/.exec(root.getAttribute('style') ?? '')?.[1]

  it('sets the root colour', () => {
    expect(color(asImage('<svg viewBox="0 0 1 1"/>', '#FFFFFF').root)).toMatch(
      /^(#FFFFFF|rgb\(255, 255, 255\))$/i,
    )
  })

  it("overrides the logo's own colour and keeps the rest of its style", () => {
    const { root } = asImage(
      `<svg viewBox="0 0 1 1" style="font-family:'Arial';color:red"/>`,
    )
    expect(color(root)).toMatch(/^(#000000|rgb\(0, 0, 0\))$/i)
    expect(root.getAttribute('style')).toMatch(/font-family/)
  })

  it("leaves the logo's own root colour alone when not overriding (gradient)", () => {
    const styled = asImage(
      '<svg viewBox="0 0 1 1" style="color:#e11d48"/>',
      '#334155',
      false,
    )
    expect(color(styled.root)).toMatch(/^(#e11d48|rgb\(225, 29, 72\))$/i)

    const attributed = asImage(
      '<svg viewBox="0 0 1 1" color="#e11d48"/>',
      '#334155',
      false,
    )
    expect(color(attributed.root)).toBeUndefined()
    expect(attributed.root.getAttribute('color')).toBe('#e11d48')
  })

  // Gradient's tint is a zero-specificity rule, so any colour the logo sets
  // itself — inline, as an attribute or in its own stylesheet — wins.
  const fallbackRule = (markup: string) =>
    /<style>:where\(:root\)\{color:([^}]+)\}<\/style>/.exec(markup)?.[1]

  it('fills in a lowest-priority colour when the logo sets none', () => {
    const { markup, root } = asImage(
      '<svg viewBox="0 0 1 1"/>',
      '#334155',
      false,
    )
    expect(fallbackRule(markup)).toBe('#334155')
    expect(color(root)).toBeUndefined()
  })

  it("lets the logo's own stylesheet colour win in gradient", () => {
    const { markup, root } = asImage(
      '<svg viewBox="0 0 1 1"><style>svg{color:#e11d48}</style><rect fill="currentColor"/></svg>',
      '#334155',
      false,
    )
    // A rule, not an inline style — inline would beat the logo's stylesheet.
    expect(color(root)).toBeUndefined()
    expect(fallbackRule(markup)).toBe('#334155')
  })

  it('treats an inherited root colour as no colour: there is nothing to inherit', () => {
    for (const svg of [
      '<svg viewBox="0 0 1 1" style="color: inherit"/>',
      '<svg viewBox="0 0 1 1" color="currentColor"/>',
    ]) {
      expect(fallbackRule(asImage(svg, '#FFFFFF', false).markup)).toBe(
        '#FFFFFF',
      )
    }
  })

  it('only touches the root element', () => {
    const { root } = asImage(
      '<svg viewBox="0 0 1 1"><g style="opacity: 1"/></svg>',
    )
    expect(root.querySelector('g')!.getAttribute('style')).toBe('opacity: 1')
  })
})

describe('logoFrame', () => {
  // The DOM overlay sized its SVG to the box width and let the height follow
  // the logo's own aspect ratio, anchored to the top of a 970:234 box whose
  // bottom-right corner sits at the two slider distances.
  it('places a 970×234 logo exactly in its box', () => {
    expect(
      logoFrame({
        size: 360,
        bottom: 40,
        right: 40,
        aspect: 234 / 970,
        fit: 'width',
      }),
    ).toEqual({
      x: 1080 - 40 - 360,
      y: 1080 - 40 - 360 / (970 / 234),
      width: 360,
      height: 360 * (234 / 970),
    })
  })

  it('keeps the width and top edge for a taller uploaded logo, letting it hang lower', () => {
    const frame = logoFrame({
      size: 400,
      bottom: 0,
      right: 0,
      aspect: 1,
      fit: 'width',
    })
    expect(frame.width).toBe(400)
    expect(frame.height).toBe(400)
    expect(frame.y).toBeCloseTo(1080 - 400 / (970 / 234))
  })
})

describe('logoFrame for the wordmark', () => {
  // The generated wordmark was the box's own `size-full` child, so the SVG's
  // default preserveAspectRatio (xMidYMid meet) contained and centred it.
  const box = {
    x: 680,
    y: 1040 - 360 / (970 / 234),
    width: 360,
    height: 360 / (970 / 234),
  }

  it('contains a tall (short-name) mark in the box, centred horizontally', () => {
    const frame = logoFrame({
      size: 360,
      bottom: 40,
      right: 40,
      aspect: 0.629,
      fit: 'contain',
    })
    expect(frame.height).toBeCloseTo(box.height)
    expect(frame.y).toBeCloseTo(box.y)
    expect(frame.width).toBeCloseTo(box.height / 0.629)
    expect(frame.x + frame.width / 2).toBeCloseTo(box.x + box.width / 2)
  })

  it('contains a wide mark in the box, centred vertically', () => {
    const frame = logoFrame({
      size: 360,
      bottom: 40,
      right: 40,
      aspect: 0.1,
      fit: 'contain',
    })
    expect(frame.width).toBe(360)
    expect(frame.x).toBe(box.x)
    expect(frame.y + frame.height / 2).toBeCloseTo(box.y + box.height / 2)
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

describe('logoRasterRequests', () => {
  const describeRequests = (requests: ReturnType<typeof logoRasterRequests>) =>
    requests
      .map(({ svg, tint }) => `${svg} ${tint.color}${tint.override ? '!' : ''}`)
      .sort()

  it('asks for every tint of every variant a design can switch to, once each', () => {
    const requests = logoRasterRequests({
      logoBright: '<svg id="b"/>',
      logoDark: '<svg id="d"/>',
    })
    expect(describeRequests(requests)).toEqual([
      '<svg id="b"/> #000000!',
      '<svg id="b"/> #334155',
      '<svg id="d"/> #FFFFFF',
      '<svg id="d"/> #FFFFFF!',
    ])
    expect(new Set(requests.map((r) => r.key)).size).toBe(4)
  })

  it('tints the light-mode logo for dark backgrounds when there is no dark one', () => {
    expect(
      describeRequests(logoRasterRequests({ logoBright: '<svg id="b"/>' })),
    ).toEqual([
      '<svg id="b"/> #000000!',
      '<svg id="b"/> #334155',
      '<svg id="b"/> #FFFFFF',
      '<svg id="b"/> #FFFFFF!',
    ])
  })

  it('asks for nothing without an uploaded logo', () => {
    expect(logoRasterRequests({ title: 'Konf' })).toEqual([])
  })
})

describe('loadLogoImage', () => {
  it('never rejects: preparation that throws resolves null, and the wordmark is drawn', async () => {
    // jsdom has no getBBox, so measuring a size-less logo throws here.
    await expect(
      loadLogoImage('<svg><g/></svg>', { color: '#000000', override: true }),
    ).resolves.toBeNull()
  })
})
