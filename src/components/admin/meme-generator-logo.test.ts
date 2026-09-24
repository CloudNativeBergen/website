// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
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

  // Gradient's tint is a rule in a cascade LAYER, so any colour the logo
  // sets itself — inline, as an attribute or in its own stylesheet — wins.
  const layerRule = (markup: string) =>
    /@layer logo-tint\{:root\{color:([^}]+)\}\}/.exec(markup)?.[1]

  it('fills in a lowest-priority colour when the logo sets none', () => {
    const { markup, root } = asImage(
      '<svg viewBox="0 0 1 1"/>',
      '#334155',
      false,
    )
    expect(layerRule(markup)).toBe('#334155')
    expect(color(root)).toBeUndefined()
  })

  it("adds its own <style> LAST, leaving the logo's sheets and first-child selectors alone", () => {
    const { markup, root } = asImage(
      '<svg viewBox="0 0 1 1"><rect/><style>/* unclosed</style></svg>',
      '#334155',
      false,
    )
    // In a separate element: a broken or media-scoped sheet of the logo's
    // cannot swallow it, and nothing is inserted before the logo's content.
    expect([...root.children].map((child) => child.localName)).toEqual([
      'rect',
      'style',
      'style',
    ])
    expect(root.querySelector('style')!.textContent).toBe('/* unclosed')
    expect(root.lastElementChild!.textContent).toBe(
      '@layer logo-tint{:root{color:#334155}}',
    )
    expect(layerRule(markup)).toBe('#334155')
  })

  it('adds no fallback when the root has a colour attribute of its own', () => {
    // A presentation attribute ranks below every stylesheet rule, layered or
    // not — so the fallback would beat it.
    const { markup, root } = asImage(
      '<svg viewBox="0 0 1 1" color="#e11d48"/>',
      '#334155',
      false,
    )
    expect(layerRule(markup)).toBeUndefined()
    expect(root.getAttribute('color')).toBe('#e11d48')
  })

  it('removes a root colour that names no colour, which would otherwise win', () => {
    for (const svg of [
      '<svg viewBox="0 0 1 1" style="color: inherit"/>',
      '<svg viewBox="0 0 1 1" style="color: currentColor; opacity: 1"/>',
      '<svg viewBox="0 0 1 1" color="currentColor"/>',
    ]) {
      const { markup, root } = asImage(svg, '#FFFFFF', false)
      expect(color(root)).toBeUndefined()
      expect(root.getAttribute('color')).toBeNull()
      expect(layerRule(markup)).toBe('#FFFFFF')
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
  const tint = { color: '#000000', override: true }

  /**
   * jsdom has neither `HTMLImageElement#decode` nor a 2D canvas. Stand both
   * in, so the WHOLE measuring path runs: every decoded image's markup is
   * recorded, and each probe "paints" a block in its middle.
   */
  function fakeBrowser() {
    const decoded: string[] = []
    const decode = vi.fn(function (this: HTMLImageElement) {
      decoded.push(decodeURIComponent(this.src.split(',')[1]))
      return Promise.resolve()
    })
    const context = {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4)
        for (let y = Math.floor(h * 0.4); y < Math.ceil(h * 0.6); y++) {
          for (let x = Math.floor(w * 0.4); x < Math.ceil(w * 0.6); x++) {
            data[(y * w + x) * 4 + 3] = 255
          }
        }
        return { data }
      },
    }
    const getContext = vi.fn(() => context)
    const originals = [
      ['decode', HTMLImageElement.prototype],
      ['getContext', HTMLCanvasElement.prototype],
    ] as const
    const saved = originals.map(
      ([name, proto]) =>
        [name, proto, Object.getOwnPropertyDescriptor(proto, name)] as const,
    )
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: getContext,
    })
    const restore = () => {
      for (const [name, proto, descriptor] of saved) {
        if (descriptor) Object.defineProperty(proto, name, descriptor)
        else Reflect.deleteProperty(proto, name)
      }
    }
    return { decoded, getContext, restore }
  }

  it('never puts anything into the page — the logo is only drawn as an image', async () => {
    const browser = fakeBrowser()
    const added: Node[] = []
    const observer = new MutationObserver((records) =>
      records.forEach((record) => added.push(...record.addedNodes)),
    )
    observer.observe(document, { childList: true, subtree: true })
    try {
      const sized = await loadLogoImage(
        '<svg viewBox="0 0 10 10"><rect/></svg>',
        tint,
      )
      const measured = await loadLogoImage(
        '<svg><rect width="10" height="10"/></svg>',
        tint,
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      // Both went all the way — the size-less one through every measuring
      // pass (coarse, fine, final) — without touching the document.
      expect(sized?.kind).toBe('image')
      expect(measured?.kind).toBe('image')
      expect(browser.decoded.length).toBeGreaterThanOrEqual(4)
      expect(added).toEqual([])
    } finally {
      observer.disconnect()
      browser.restore()
    }
  })

  it('draws a size-less logo inside a fixed 300×150 viewport, so its % never moves', async () => {
    const browser = fakeBrowser()
    try {
      await loadLogoImage(
        '<svg color="#e11d48"><defs><rect id="a" width="100%" height="100%"/></defs><use href="#a"/></svg>',
        { color: '#FFFFFF', override: true },
      )
      // Every probe and the final raster frame the logo the same way.
      const parsed = browser.decoded.map(
        (markup) =>
          new DOMParser().parseFromString(markup, 'image/svg+xml')
            .documentElement,
      )
      expect(parsed.length).toBeGreaterThanOrEqual(3)
      for (const frame of parsed) {
        const logo = frame.querySelector(':scope > svg')!
        expect(frame.getAttribute('viewBox')).toMatch(
          /^-?[\d.e-]+ -?[\d.e-]+ [\d.e]+ [\d.e]+$/,
        )
        expect(logo.getAttribute('width')).toBe('300')
        expect(logo.getAttribute('height')).toBe('150')
        expect(logo.getAttribute('overflow')).toBe('visible')
        // % stays %: the browser resolves it against the logo's own viewport.
        expect(logo.querySelector('rect')!.getAttribute('width')).toBe('100%')
      }
      // The final raster's tint lands on the LOGO's root, beating its own colour.
      const final = parsed.at(-1)!.querySelector(':scope > svg')!
      expect(final.getAttribute('style')).toMatch(
        /color:\s*(#FFFFFF|rgb\(255, 255, 255\))/i,
      )
    } finally {
      browser.restore()
    }
  })

  it('never rejects when preparing or measuring throws', async () => {
    // jsdom has no HTMLImageElement#decode, so measuring a size-less logo
    // (which decodes probe images) throws here.
    await expect(loadLogoImage('<svg><g/></svg>', tint)).resolves.toBeNull()
  })

  it('never rejects when the browser refuses to decode the image', async () => {
    const decode = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new DOMException('bad', 'EncodingError'))
    const original = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'decode',
    )
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: decode,
    })
    try {
      await expect(
        loadLogoImage('<svg viewBox="0 0 10 10"><rect/></svg>', tint),
      ).resolves.toBeNull()
      expect(decode).toHaveBeenCalledTimes(1)
    } finally {
      if (original) {
        Object.defineProperty(HTMLImageElement.prototype, 'decode', original)
      } else {
        Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
      }
    }
  })
})
