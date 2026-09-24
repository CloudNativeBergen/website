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

export interface CanvasSvg {
  markup: string
  /** Intrinsic size, when the markup states one. */
  width?: number
  height?: number
}

const SVG_OPEN_TAG = /<svg\b[^>]*>/i

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,
    'i',
  ).exec(tag)
  return match ? (match[2] ?? match[3]) : undefined
}

/** A plain number or a `px` length; percentages and other units are no size. */
function pixels(value: string | undefined): number | undefined {
  const match = value && /^\s*([\d.]+)\s*(px)?\s*$/i.exec(value)
  const n = match ? Number(match[1]) : NaN
  return n > 0 ? n : undefined
}

/**
 * Make an uploaded logo drawable as a standalone image.
 *
 * Inline in the page an SVG may omit its namespace and its size; as an image
 * it may not — Firefox refuses to draw one without `xmlns`, and one with no
 * `viewBox` or pixel size has no intrinsic dimensions to fit. The stored
 * markup guarantees neither, so the namespace is added and a `viewBox` is
 * derived from `width`/`height` where possible. When there is no size at all,
 * the caller has to measure one (see {@link loadLogoImage}).
 */
export function svgForCanvas(svg: string): CanvasSvg | null {
  const sanitized = sanitizeSvg(svg ?? '')
  const open = SVG_OPEN_TAG.exec(sanitized)
  if (!open) return null

  let tag = open[0]
  let width: number | undefined
  let height: number | undefined
  const box = attribute(tag, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (box?.length === 4 && box[2] > 0 && box[3] > 0) {
    width = box[2]
    height = box[3]
  } else {
    width = pixels(attribute(tag, 'width'))
    height = pixels(attribute(tag, 'height'))
    if (width && height) {
      tag = tag.replace(/^<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`)
    } else {
      width = height = undefined
    }
  }

  if (!/\sxmlns\s*=/i.test(tag)) {
    tag = tag.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  return {
    markup:
      sanitized.slice(0, open.index) +
      tag +
      sanitized.slice(open.index + open[0].length),
    width,
    height,
  }
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
 * canvas corner; the SVG in it took the box's WIDTH and its own aspect ratio,
 * hanging from the box's top edge. `aspect` is the logo's height / width.
 */
export function logoFrame({
  size,
  bottom,
  right,
  aspect,
}: {
  size: number
  bottom: number
  right: number
  aspect: number
}): Frame {
  return {
    x: CANVAS_SIZE - right - size,
    y: CANVAS_SIZE - bottom - size / LOGO_BOX_ASPECT,
    width: size,
    height: size * aspect,
  }
}

// ── Browser-only below ────────────────────────────────────────────────────

export type CanvasLogo =
  | { kind: 'image'; image: CanvasImageSource; aspect: number }
  | { kind: 'wordmark'; name: string }

/** Give a size-less SVG the viewBox of what it actually draws. */
function measuredViewBox(markup: string): CanvasSvg | null {
  const host = document.createElement('div')
  host.style.cssText =
    'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none'
  host.innerHTML = markup
  document.body.appendChild(host)
  try {
    const svg = host.querySelector('svg')
    const box = svg?.getBBox()
    if (!svg || !box || box.width <= 0 || box.height <= 0) return null
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    return { markup: svg.outerHTML, width: box.width, height: box.height }
  } finally {
    host.remove()
  }
}

/**
 * Rasterise an uploaded logo into a decoded image. `color` becomes the SVG's
 * `currentColor`, which is how the overlay tinted a logo in monochrome.
 * Resolves null for markup that cannot be drawn.
 */
export async function loadLogoImage(
  svg: string,
  color?: string,
): Promise<CanvasLogo | null> {
  let prepared = svgForCanvas(svg)
  if (prepared && !prepared.width) prepared = measuredViewBox(prepared.markup)
  if (!prepared?.width || !prepared.height) return null

  const markup = color
    ? prepared.markup.replace(SVG_OPEN_TAG, (tag) =>
        /\sstyle\s*=/i.test(tag)
          ? tag.replace(/\sstyle\s*=\s*"/i, ` style="color:${color};`)
          : tag.replace(/^<svg\b/i, `<svg style="color:${color}"`),
      )
    : prepared.markup

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

export function logoAspect(logo: CanvasLogo): number {
  if (logo.kind === 'image') return logo.aspect
  const layout = wordmarkLayout(logo.name)
  return layout.viewBoxHeight / layout.viewBoxWidth
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
  ctx.beginPath()
  ctx.rect(frame.x, frame.y, frame.width, frame.height)
  ctx.clip()
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
