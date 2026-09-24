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

/**
 * The `currentColor` an uploaded logo is drawn with. Inline, a logo inherits
 * colour from the page, and stored logos lean on that: their text is
 * `currentColor` under `text-brand-slate-gray dark:text-white` classes. An SVG
 * loaded as an image sees no page CSS, so the colour is resolved here — the
 * monochrome ink, or in gradient what those classes meant, keyed to the
 * design's background rather than the admin's theme.
 */
export function logoColor(variant: LogoVariant, light: boolean): string {
  if (variant === 'monochrome') return monochromeInk(light)
  return light ? '#334155' : '#FFFFFF'
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
  color: string
}

export function logoRasterKey(svg: string, color: string): string {
  return `${color}|${svg}`
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
      const color = logoColor(variant, light)
      const key = logoRasterKey(svg, color)
      requests.set(key, { key, svg, color })
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

/**
 * Serialise a prepared logo for an image, with `color` as the root's
 * `currentColor`. Set as a style property it overrides any colour the logo
 * sets itself, as the overlay's appended inline style did. XMLSerializer
 * declares every namespace the markup uses (SVG, xlink).
 */
export function logoMarkup(element: SVGSVGElement, color: string): string {
  const clone = element.cloneNode(true)
  if (!(clone instanceof SVGElement)) throw new Error('not an SVG element')
  clone.style.setProperty('color', color)
  return new XMLSerializer().serializeToString(clone)
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
 * Rasterise an uploaded logo into a decoded image, with `color` as its
 * `currentColor` (see {@link logoColor}). Resolves null for markup that cannot
 * be drawn.
 */
export async function loadLogoImage(
  svg: string,
  color: string,
): Promise<CanvasLogo | null> {
  let prepared = svgForCanvas(svg)
  if (prepared && !prepared.width) prepared = measuredViewBox(prepared.element)
  if (!prepared?.width || !prepared.height) return null

  const markup = logoMarkup(prepared.element, color)
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  try {
    await image.decode()
  } catch {
    return null
  }
  return { kind: 'image', image, aspect: prepared.height / prepared.width }
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
