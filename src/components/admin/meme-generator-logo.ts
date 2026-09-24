import { sanitizeSvg } from '@/lib/svg'
import {
  BRAND_GRADIENT_STOPS,
  WORDMARK_FONT,
  wordmarkLayout,
} from '../BrandWordmark'
import type { ConferenceLogos } from '../common/DashboardLayout'
import { CANVAS_SIZE } from './meme-generator-config'

/**
 * The meme generator's logo, drawn ON the canvas.
 *
 * It used to be a DOM element laid over the canvas, which worked for the PNG
 * download only because that rasterises the whole DOM composite. A video frame
 * is taken from the canvas alone, so the logo has to be part of the drawing.
 * Everything here keeps the result looking the way the overlay did.
 */

/** Width : height of the logo box, the shape real uploaded logos are drawn in. */
export const LOGO_BOX_ASPECT = 970 / 234

export type LogoVariant = 'gradient' | 'monochrome'

interface Background {
  color: string
  hasImage: boolean
}

/**
 * Whether the design's background counts as light. Deliberately the old
 * monochrome rule, unchanged: luminance on the raw (not linearised) channels,
 * and any image is assumed dark.
 */
export function isLightBackground({ color, hasImage }: Background): boolean {
  if (hasImage) return false
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
}

export function monochromeInk(light: boolean): '#000000' | '#FFFFFF' {
  return light ? '#000000' : '#FFFFFF'
}

export interface LogoTint {
  /** The colour an uploaded logo's `currentColor` resolves to. */
  color: string
  /**
   * Whether it replaces a colour the logo sets on its own root (monochrome,
   * as the overlay's inline style did) or only fills in where it sets none
   * (gradient, where the overlay left the logo's markup alone).
   */
  override: boolean
}

/**
 * How an uploaded logo is tinted. Inline, a logo inherited colour from the
 * page, and stored logos lean on that: their text is `currentColor` under
 * `text-brand-slate-gray dark:text-white` classes. An SVG loaded as an image
 * sees no page CSS, so the colour is resolved here — the monochrome ink, or in
 * gradient what those classes meant — keyed to the design's background rather
 * than the admin's theme.
 */
export function logoTint(variant: LogoVariant, light: boolean): LogoTint {
  if (variant === 'monochrome') {
    return { color: monochromeInk(light), override: true }
  }
  return { color: light ? '#334155' : '#FFFFFF', override: false }
}

/**
 * The uploaded logo for this background: the light-mode logo on a light
 * background, the dark-mode one on a dark background (falling back to the
 * light-mode one, as the site does). The admin's own theme plays no part — it
 * says nothing about the design.
 */
export function logoSvgFor(
  logos: ConferenceLogos | undefined,
  light: boolean,
): string | undefined {
  if (!logos?.logoBright) return undefined
  return light ? logos.logoBright : logos.logoDark || logos.logoBright
}

export interface LogoRasterRequest {
  key: string
  svg: string
  tint: LogoTint
}

export function logoRasterKey(svg: string, tint: LogoTint): string {
  return `${tint.color}${tint.override ? '!' : ''}|${svg}`
}

/**
 * Every raster the design can switch to — each variant on a light and a dark
 * background — so all are decoded up front and a background or style change
 * never draws (or exports) a frame without the logo while one decodes.
 */
export function logoRasterRequests(
  logos: ConferenceLogos | undefined,
): LogoRasterRequest[] {
  const requests = new Map<string, LogoRasterRequest>()
  for (const light of [true, false]) {
    const svg = logoSvgFor(logos, light)
    if (!svg) continue
    for (const variant of ['gradient', 'monochrome'] as const) {
      const tint = logoTint(variant, light)
      const key = logoRasterKey(svg, tint)
      requests.set(key, { key, svg, tint })
    }
  }
  return [...requests.values()]
}

export interface CanvasSvg {
  /** The parsed root, ready to serialise with {@link logoMarkup}. */
  element: SVGSVGElement
  /** Intrinsic size in px, when the markup states one. */
  width?: number
  height?: number
}

/** CSS px per absolute unit. Any other unit (%, em…) gives no intrinsic size. */
const PX_PER_UNIT: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
}

/** An absolute SVG length in px, e.g. `"200"`, `"50px"`, `"72pt"`. */
export function absoluteLength(value: string | null): number | undefined {
  const match =
    value && /^\s*([\d.]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value)
  const factor = match ? PX_PER_UNIT[match[2].toLowerCase()] : undefined
  const px = match && factor ? Number(match[1]) * factor : NaN
  return px > 0 ? px : undefined
}

/**
 * Make an uploaded logo drawable as a standalone image.
 *
 * Inline, the page parsed a stored logo with the forgiving HTML parser, which
 * repairs attribute casing (`VIEWBOX`), binds `xlink:` and needs no `xmlns`.
 * An image is parsed as strict XML and does none of that — Firefox will not
 * even draw one without `xmlns`. So the markup is parsed exactly as it was
 * before, as HTML, and re-serialised as XML by {@link logoMarkup}.
 *
 * Its size is `width` × `height` when both are absolute lengths (the viewBox
 * is letterboxed inside, as the browser sizes the image), else the viewBox.
 * With neither, the caller has to measure one (see {@link loadLogoImage}).
 */
export function svgForCanvas(svg: string): CanvasSvg | null {
  const doc = new DOMParser().parseFromString(sanitizeSvg(svg), 'text/html')
  const element = doc.body.querySelector('svg')
  if (!element) return null
  makeInert(element)

  const box = element
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const hasBox = box?.length === 4 && box[2] > 0 && box[3] > 0
  const width = absoluteLength(element.getAttribute('width'))
  const height = absoluteLength(element.getAttribute('height'))

  if (width && height) {
    if (!hasBox) element.setAttribute('viewBox', `0 0 ${width} ${height}`)
    return { element, width, height }
  }
  return hasBox ? { element, width: box[2], height: box[3] } : { element }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** An external `url(…)` — anything but a local `#fragment` or inline `data:`. */
const EXTERNAL_URL = /url\(\s*(['"]?)(?!\s*(?:#|data:))[^)]*\1\s*\)/gi

/** CSS with every external reference and `@import` neutralised. */
function inertCss(css: string): string {
  return css.replace(/@import[^;]*;?/gi, '').replace(EXTERNAL_URL, 'none')
}

/**
 * Reduce the parsed tree to what an SVG drawn as an image can use, so the
 * result is inert wherever it goes — a size-less logo is measured in the LIVE
 * document, and sanitizeSvg is only a regex pass (it misses `<image/onerror>`:
 * `/` separates attributes for the HTML parser). Everything removed is
 * something an image ignores anyway, so the picture does not change:
 *
 * - elements outside the SVG namespace — HTML smuggled in through `<desc>` or
 *   `<title>` (`<meta http-equiv=refresh>` would navigate the admin's tab),
 *   script-like SVG elements, and editor metadata under an undeclared prefix
 *   (`<sodipodi:namedview>`), which XML refuses to parse;
 * - `on*` handlers, and attributes under an undeclared prefix (`inkscape:*`);
 * - external references: `href`s that are not `#local`, `@import`, and
 *   `url()` pointing off the document.
 */
function makeInert(root: Element) {
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (
      element.namespaceURI !== SVG_NS ||
      element.localName.includes(':') ||
      /^(script|foreignobject)$/i.test(element.localName)
    ) {
      element.remove()
      continue
    }
    for (const attribute of [...element.attributes]) {
      const { name, namespaceURI, value } = attribute
      const unboundPrefix =
        name.includes(':') &&
        namespaceURI === null &&
        !name.startsWith('xmlns:')
      if (/^on/i.test(name) || unboundPrefix) {
        element.removeAttributeNode(attribute)
      } else if (/(^|:)href$/i.test(name) && !value.trim().startsWith('#')) {
        element.removeAttributeNode(attribute)
      } else if (name === 'style') {
        attribute.value = inertCss(value)
      }
    }
    if (element.localName === 'style') {
      element.textContent = inertCss(element.textContent ?? '')
    }
  }
}

/**
 * Serialise a prepared logo for an image, tinted per {@link LogoTint}: the
 * tint becomes the root's `currentColor`. Overriding (monochrome) it is an
 * inline style, beating any colour the logo sets; otherwise (gradient) it is
 * a lowest-priority rule that only fills in where the logo sets none.
 * XMLSerializer declares every namespace the markup uses (SVG, xlink).
 */
export function logoMarkup(element: SVGSVGElement, tint: LogoTint): string {
  const clone = element.cloneNode(true)
  if (!(clone instanceof SVGElement)) throw new Error('not an SVG element')

  if (tint.override) {
    clone.style.setProperty('color', tint.color)
  } else if (!ownRootColor(clone)) {
    // Zero specificity and first in the document: a colour the logo sets in
    // its own stylesheet still wins, as it did over the page's colour inline.
    const rule = clone.ownerDocument.createElementNS(SVG_NS, 'style')
    rule.textContent = `:where(:root){color:${tint.color}}`
    clone.insertBefore(rule, clone.firstChild)
  }
  return new XMLSerializer().serializeToString(clone)
}

/**
 * A colour the logo gives its own root, inline or as an attribute. `inherit`
 * and friends are not one: an image has nothing to inherit from.
 */
function ownRootColor(root: SVGElement): string | undefined {
  const color = (
    root.style.getPropertyValue('color') ||
    root.getAttribute('color') ||
    ''
  ).trim()
  return /^(|inherit|initial|unset|revert|currentcolor)$/i.test(color)
    ? undefined
    : color
}

export interface Frame {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where the logo is drawn. The overlay was a box `size` wide and
 * `size / LOGO_BOX_ASPECT` tall, `bottom` and `right` pixels in from the
 * canvas corner, and the two kinds of logo sat in it differently:
 *
 * - `width` — an UPLOADED logo was wrapped in auto-height elements, so it took
 *   the box's width and its own aspect ratio, hanging from the box's top edge.
 * - `contain` — the generated WORDMARK was the box's own child at full size,
 *   so the SVG's default `xMidYMid meet` fitted it inside the box, centred.
 *
 * `aspect` is the logo's height / width.
 */
export function logoFrame({
  size,
  bottom,
  right,
  aspect,
  fit,
}: {
  size: number
  bottom: number
  right: number
  aspect: number
  fit: 'width' | 'contain'
}): Frame {
  const box = {
    x: CANVAS_SIZE - right - size,
    y: CANVAS_SIZE - bottom - size / LOGO_BOX_ASPECT,
    width: size,
    height: size / LOGO_BOX_ASPECT,
  }
  if (fit === 'width') return { ...box, height: size * aspect }

  const scale = Math.min(box.width, box.height / aspect)
  const width = scale
  const height = scale * aspect
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  }
}

// ── Browser-only below ────────────────────────────────────────────────────

export type CanvasLogo =
  | { kind: 'image'; image: CanvasImageSource; aspect: number }
  | { kind: 'wordmark'; name: string }

/**
 * Half the widest stroke the logo draws. `getBBox()` measures geometry only, so
 * a viewBox built from it would cut off the outer half of every stroke — and
 * all of a straight line, whose geometry has no width. Markers and filters
 * are not accounted for.
 */
function strokeExtent(svg: SVGSVGElement): number {
  let widest = 0
  for (const element of svg.querySelectorAll('*')) {
    const style = getComputedStyle(element)
    if (style.stroke && style.stroke !== 'none') {
      widest = Math.max(widest, parseFloat(style.strokeWidth) || 0)
    }
  }
  return widest / 2
}

/** Give a size-less SVG the viewBox of what it actually paints. */
function measuredViewBox(element: SVGSVGElement): CanvasSvg | null {
  const host = document.createElement('div')
  host.style.cssText =
    'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none'
  const svg = document.importNode(element, true)
  host.appendChild(svg)
  document.body.appendChild(host)
  try {
    const box = svg.getBBox()
    const pad = strokeExtent(svg)
    const width = box.width + pad * 2
    const height = box.height + pad * 2
    if (width <= 0 || height <= 0) return null
    svg.setAttribute(
      'viewBox',
      `${box.x - pad} ${box.y - pad} ${width} ${height}`,
    )
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    return { element: svg, width, height }
  } finally {
    host.remove()
  }
}

/**
 * Rasterise an uploaded logo into a decoded image, tinted per `tint`.
 * Never rejects: markup that cannot be prepared, measured or decoded resolves
 * null, and the caller draws the wordmark instead.
 */
export async function loadLogoImage(
  svg: string,
  tint: LogoTint,
): Promise<CanvasLogo | null> {
  try {
    let prepared = svgForCanvas(svg)
    if (prepared && !prepared.width) {
      prepared = measuredViewBox(prepared.element)
    }
    if (!prepared?.width || !prepared.height) return null

    const markup = logoMarkup(prepared.element, tint)
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
    await image.decode()
    return { kind: 'image', image, aspect: prepared.height / prepared.width }
  } catch {
    return null
  }
}

/**
 * The wordmark's font family list, resolved, without a generic fallback. A
 * canvas cannot read `var()`, so the families behind the custom properties are
 * looked up on the document. Empty when none is defined.
 */
export function wordmarkFontFamily(root: Element): string {
  const style = getComputedStyle(root)
  return WORDMARK_FONT.properties
    .map((property) => style.getPropertyValue(property).trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * CSS font shorthand for the wordmark at `size` px. With `generic` it ends in
 * `sans-serif` so the canvas always paints; without, it suits
 * `document.fonts.load`, which matches only `@font-face` families.
 */
export function wordmarkFont(family: string, size: number, generic = true) {
  const families = [family, generic && 'sans-serif'].filter(Boolean).join(', ')
  return `${WORDMARK_FONT.weight} ${size}px ${families}`
}

/** The tenant's brand gradient colours, as the SVG wordmark resolves them. */
export function brandGradientColors(root: Element): [string, string] {
  const style = getComputedStyle(root)
  const [start, end] = BRAND_GRADIENT_STOPS.map(
    (stop) => style.getPropertyValue(stop.property).trim() || stop.fallback,
  )
  return [start, end]
}

export interface LogoPaint {
  variant: LogoVariant
  /** Monochrome colour for the current background. */
  ink: string
  fontFamily: string
  gradient: [string, string]
}

export interface LogoPlacement {
  size: number
  bottom: number
  right: number
}

/** The frame a logo is drawn in, fitted the way its kind was in the DOM. */
export function placeLogo(logo: CanvasLogo, placement: LogoPlacement): Frame {
  if (logo.kind === 'image') {
    return logoFrame({ ...placement, aspect: logo.aspect, fit: 'width' })
  }
  const layout = wordmarkLayout(logo.name)
  return logoFrame({
    ...placement,
    aspect: layout.viewBoxHeight / layout.viewBoxWidth,
    fit: 'contain',
  })
}

/**
 * Draw the logo into `frame`. The wordmark is TEXT, not a rasterised SVG: an
 * SVG loaded as an image inherits neither the page's brand custom properties
 * nor its webfont, while the canvas has both. `textLength` has no canvas
 * equivalent, so each line is stretched horizontally to its pinned width —
 * the same "spacingAndGlyphs" the SVG uses.
 */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  logo: CanvasLogo,
  frame: Frame,
  paint: LogoPaint,
) {
  if (logo.kind === 'image') {
    ctx.drawImage(logo.image, frame.x, frame.y, frame.width, frame.height)
    return
  }

  const layout = wordmarkLayout(logo.name)
  const scale = frame.width / layout.viewBoxWidth

  ctx.save()
  ctx.font = wordmarkFont(paint.fontFamily, layout.fontSize * scale)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  for (const line of layout.lines) {
    const natural = ctx.measureText(line.text).width
    if (natural <= 0) continue
    ctx.save()
    ctx.translate(frame.x + line.x * scale, frame.y + line.y * scale)
    ctx.scale((line.width * scale) / natural, 1)
    if (paint.variant === 'gradient') {
      // The SVG gradient spans each <text>'s own bounding box.
      const gradient = ctx.createLinearGradient(0, 0, natural, 0)
      gradient.addColorStop(0, paint.gradient[0])
      gradient.addColorStop(1, paint.gradient[1])
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = paint.ink
    }
    ctx.fillText(line.text, 0, 0)
    ctx.restore()
  }
  ctx.restore()
}
