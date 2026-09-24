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
    value && /^\s*\+?([\d.]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value)
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
 * The parsed tree is NEVER inserted into the page: it is only ever drawn as
 * an image, which runs no script, loads nothing external and keeps the
 * logo's CSS to itself — whatever the markup says. That is the security
 * boundary; it does not rest on filtering the markup.
 *
 * Its size is `width` × `height` when both are absolute lengths (the viewBox
 * is letterboxed inside, as the browser sizes the image), else the viewBox.
 * With neither, the caller has to measure one (see {@link loadLogoImage}).
 */
export function svgForCanvas(svg: string): CanvasSvg | null {
  const doc = new DOMParser().parseFromString(sanitizeSvg(svg), 'text/html')
  const element = doc.body.querySelector('svg')
  if (!element) return null
  dropUnboundPrefixes(element)

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

/**
 * Drop editor metadata under a prefix the markup never declares
 * (`<sodipodi:namedview>`, `inkscape:label`). The HTML parser accepted it and
 * nothing renders it, but XML refuses the whole document over it. `xml:` and
 * `xlink:` are bound by the parser and survive.
 */
function dropUnboundPrefixes(root: Element) {
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.localName.includes(':')) {
      element.remove()
      continue
    }
    for (const attribute of [...element.attributes]) {
      const { name, namespaceURI } = attribute
      if (
        name.includes(':') &&
        namespaceURI === null &&
        !name.startsWith('xmlns:')
      ) {
        element.removeAttributeNode(attribute)
      }
    }
  }
}

/** A root colour that names no colour: an image has nothing to inherit. */
const NO_COLOR = /^(|inherit|initial|unset|revert|revert-layer|currentcolor)$/i

/** Custom properties the page defines, by name, as a logo may use them. */
export type PageVariables = Record<string, string>

/**
 * The page's values of the custom properties `svg` refers to. Inline, a logo
 * resolved `var(--brand-primary)` against the tenant theme; an image has no
 * page to resolve against, so the values are carried in (see
 * {@link tintLogo}). Anything that is not a plain value is skipped.
 */
export function pageVariables(svg: string, root: Element): PageVariables {
  const style = getComputedStyle(root)
  const variables: PageVariables = {}
  for (const [, name] of svg.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const value = style.getPropertyValue(name).trim()
    if (value && !/[{};<>]/.test(value)) variables[name] = value
  }
  return variables
}

/**
 * A copy of the logo tinted per {@link LogoTint} — its `currentColor` — and
 * carrying the page's custom properties. It is what is measured and drawn.
 *
 * - Overriding (monochrome): an inline style on the root, beating any colour
 *   the logo sets — as the overlay's inline style did.
 * - Otherwise (gradient): a rule in a cascade LAYER, which every one of the
 *   logo's own rules beats. The layer is declared FIRST in each of the logo's
 *   sheets, so the logo's own layers win too; the rule itself is its own
 *   `<style>`, appended last, so a broken sheet of the logo's cannot swallow
 *   it and `:first-child` selectors keep matching. A root colour that cannot
 *   name a colour in the image — `inherit`, or a `var()` the image cannot
 *   resolve — is removed, or it would win and resolve to black; a real
 *   colour attribute on the root means no fallback at all.
 */
export function tintLogo(
  element: SVGSVGElement,
  tint: LogoTint,
  variables: PageVariables = {},
): SVGSVGElement {
  const logo = element.cloneNode(true)
  if (!(logo instanceof SVGSVGElement)) throw new Error('not an SVG element')
  const sheets = [...logo.querySelectorAll('style')]
  // Where the logo defines custom properties itself: its sheets, and the
  // root's own inline style (the root has no ancestors to inherit from).
  const css = [
    logo.getAttribute('style') ?? '',
    ...sheets.map((sheet) => sheet.textContent ?? ''),
  ].join('\n')
  const defined = (name: string) =>
    name in variables || css.includes(`${name}:`) || css.includes(`${name} :`)
  const namesNoColor = (value: string) =>
    NO_COLOR.test(value.trim()) ||
    [...value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)].some(
      ([, name, fallback]) => !fallback && !defined(name),
    )

  let fallbackColor = false
  if (tint.override) {
    logo.style.setProperty('color', tint.color)
  } else {
    if (namesNoColor(logo.style.getPropertyValue('color'))) {
      logo.style.removeProperty('color')
    }
    const attribute = logo.getAttribute('color') ?? ''
    if (namesNoColor(attribute)) logo.removeAttribute('color')
    // A presentation attribute ranks below every stylesheet rule, layered or
    // not, so a real colour attribute would lose to the fallback: skip it.
    fallbackColor = !logo.hasAttribute('color')
  }

  const declarations = [
    ...Object.entries(variables).map(([name, value]) => `${name}:${value}`),
    ...(fallbackColor ? [`color:${tint.color}`] : []),
  ]
  if (declarations.length) {
    for (const sheet of sheets) {
      sheet.textContent = `@layer logo-tint;\n${sheet.textContent ?? ''}`
    }
    const style = logo.ownerDocument.createElementNS(SVG_NS, 'style')
    style.textContent = `@layer logo-tint{:root{${declarations.join(';')}}}`
    logo.appendChild(style)
  }
  if (!logo.style.length) logo.removeAttribute('style')
  return logo
}

/** A tinted logo, serialised for an image (see {@link tintLogo}). */
export function logoMarkup(
  element: SVGSVGElement,
  tint: LogoTint,
  variables: PageVariables = {},
): string {
  return new XMLSerializer().serializeToString(
    tintLogo(element, tint, variables),
  )
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
 * A size-less logo, framed for drawing through `viewBox`. The logo keeps a
 * viewport of its own — the 300×150 a browser gives an SVG image with no size
 * — nested inside an outer SVG that does the zooming. So every `%` in it, in
 * any element or notation, resolves against that one viewport however the
 * view moves. `overflow: visible` keeps content outside it drawn, unless the
 * logo sets its own `overflow` (which then clips, as the overlay did).
 */
function inViewport(element: SVGSVGElement, viewBox: Frame): SVGSVGElement {
  const logo = element.cloneNode(true)
  if (!(logo instanceof SVGSVGElement)) throw new Error('not an SVG element')
  // The viewport a browser gives the image: a dimension the logo does state,
  // else the 300×150 default. Its own clip is kept; otherwise what lies
  // outside is drawn, so measuring can find it.
  logo.setAttribute(
    'width',
    String(absoluteLength(element.getAttribute('width')) ?? 300),
  )
  logo.setAttribute(
    'height',
    String(absoluteLength(element.getAttribute('height')) ?? 150),
  )
  if (
    !element.hasAttribute('overflow') &&
    !element.style.getPropertyValue('overflow')
  ) {
    logo.setAttribute('overflow', 'visible')
  }
  logo.removeAttribute('x')
  logo.removeAttribute('y')

  const frame = element.ownerDocument.createElementNS(SVG_NS, 'svg')
  frame.setAttribute(
    'viewBox',
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
  )
  frame.appendChild(logo)
  return frame
}

/** Decode SVG markup as an image. Rejects on anything it cannot draw. */
async function decodeSvg(markup: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  await image.decode()
  return image
}

/**
 * Throw unless a canvas with `image` drawn on it can still be read. An engine
 * that taints for an SVG image (older WebKit did for `foreignObject`) would
 * otherwise break every export later, and the wordmark is the better outcome.
 */
function assertReadable(image: CanvasImageSource) {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return
  ctx.drawImage(image, 0, 0, 1, 1)
  ctx.getImageData(0, 0, 1, 1)
}

/** Side of the square the painted bounds are searched in, in pixels. */
const PROBE_SIZE = 1000

/**
 * The bounds of what `element` paints inside `viewBox`, found by drawing it
 * as an image and scanning for non-transparent pixels — so strokes, markers
 * and filters count, and the logo never touches the live page. Null when it
 * paints nothing there.
 */
async function paintedBounds(
  element: SVGSVGElement,
  viewBox: Frame,
): Promise<Frame | null> {
  const probe = inViewport(element, viewBox)
  const scale = PROBE_SIZE / Math.max(viewBox.width, viewBox.height)
  probe.setAttribute('width', String(viewBox.width * scale))
  probe.setAttribute('height', String(viewBox.height * scale))
  probe.setAttribute('preserveAspectRatio', 'xMinYMin meet')

  const image = await decodeSvg(new XMLSerializer().serializeToString(probe))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewBox.width * scale)
  canvas.height = Math.ceil(viewBox.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -1, -1]
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  // One pixel of slack each side: a pixel only says the edge is within it.
  return {
    x: viewBox.x + (minX - 1) / scale,
    y: viewBox.y + (minY - 1) / scale,
    width: (maxX - minX + 3) / scale,
    height: (maxY - minY + 3) / scale,
  }
}

/** The first search area, in user units; widened while the logo reaches its edge. */
const SEARCH_START = { x: -2000, y: -2000, width: 6000, height: 6000 }
const SEARCH_LIMIT = 6_000_000

/** Whether `bounds` reaches the edge of `area` — the logo may carry on past it. */
function reachesEdge(bounds: Frame, area: Frame): boolean {
  const slack = (2 * area.width) / PROBE_SIZE
  return (
    bounds.x <= area.x + slack ||
    bounds.y <= area.y + slack ||
    bounds.x + bounds.width >= area.x + area.width - slack ||
    bounds.y + bounds.height >= area.y + area.height - slack
  )
}

/**
 * Give a size-less SVG the viewBox of what it actually paints: a coarse pass
 * over a wide area of user space — widened tenfold while it finds nothing or
 * the logo reaches its edge — then a fine pass over what it found.
 */
async function measuredViewBox(
  element: SVGSVGElement,
): Promise<CanvasSvg | null> {
  let area: Frame = SEARCH_START
  let coarse = await paintedBounds(element, area)
  while ((!coarse || reachesEdge(coarse, area)) && area.width < SEARCH_LIMIT) {
    const width = area.width * 10
    area = {
      x: area.x + area.width / 2 - width / 2,
      y: area.y + area.height / 2 - width / 2,
      width,
      height: width,
    }
    coarse = await paintedBounds(element, area)
  }
  const box = coarse && (await paintedBounds(element, coarse))
  if (!box) return null
  return {
    element: inViewport(element, box),
    width: box.width,
    height: box.height,
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
    const prepared = svgForCanvas(svg)
    if (!prepared) return null
    // Tinted first, so a size-less logo is measured as it will be drawn.
    const logo = tintLogo(
      prepared.element,
      tint,
      pageVariables(svg, document.documentElement),
    )
    const drawn = prepared.width
      ? { ...prepared, element: logo }
      : await measuredViewBox(logo)
    if (!drawn?.width || !drawn.height) return null

    const image = await decodeSvg(
      new XMLSerializer().serializeToString(drawn.element),
    )
    assertReadable(image)
    return { kind: 'image', image, aspect: drawn.height / drawn.width }
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
