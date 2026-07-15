/**
 * PWA icon composition + rasterization.
 *
 * A single source of truth, shared by:
 *   - the static-fallback generator (`scripts/gen-pwa-icons.ts`), and
 *   - the dynamic per-host icon route (`src/app/pwa/icon/[spec]/route.ts`).
 *
 * Given a logo-mark SVG string it composes a square icon document and
 * rasterizes it to PNG with `@resvg/resvg-js`. Two composition modes exist:
 *
 *   - `any`      – transparent background, mark sized generously (~82%).
 *   - `maskable` – opaque navy background, mark kept inside the 80% maskable
 *                  "safe circle" so Android's mask never clips it.
 *   - `apple`    – opaque navy background (iOS never renders transparency),
 *                  mark slightly more generous than maskable since iOS only
 *                  rounds the corners rather than applying an aggressive mask.
 */
import type { Resvg as ResvgType } from '@resvg/resvg-js'
import { sanitizeSvg } from '@/lib/svg'
import { DEFAULT_LOGOMARK_SVG } from './default-mark'

/**
 * Lazily load the native `@resvg/resvg-js` binding. A static top-level import
 * would throw at module-load time if the platform-specific `.node` binary can't
 * be resolved (a serverless-bundling failure), which would take down the whole
 * icon route with no fallback. Loading it inside the caller's try/catch keeps a
 * load failure contained so the route can fall back to a committed static PNG.
 */
function loadResvg(): typeof ResvgType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@resvg/resvg-js') as typeof import('@resvg/resvg-js')).Resvg
}

/** Opaque background for maskable / apple icons. */
export const ICON_BG_NAVY = '#0B1220'

export type IconVariant = 'any' | 'maskable' | 'apple'

export interface IconSpec {
  size: number
  variant: IconVariant
  /** Committed PNG under `public/` served as the ultimate fail-closed fallback
   * (e.g. if the native resvg binary can't load at all). Present on the named
   * `ICON_SPECS` entries; optional for ad-hoc specs (e.g. the generator). */
  staticFile?: string
}

/**
 * Named URL specs → concrete size/variant. Keep in sync with the manifest.
 * `null`-prototype so a crafted spec key like `constructor`/`__proto__` can't
 * pass an `in`/truthy guard (prototype pollution → cached 500).
 */
export const ICON_SPECS: Record<string, IconSpec> = Object.assign(
  Object.create(null),
  {
    '192': { size: 192, variant: 'any', staticFile: 'icon-192.png' },
    '512': { size: 512, variant: 'any', staticFile: 'icon-512.png' },
    '192-maskable': {
      size: 192,
      variant: 'maskable',
      staticFile: 'icon-192-maskable.png',
    },
    '512-maskable': {
      size: 512,
      variant: 'maskable',
      staticFile: 'icon-512-maskable.png',
    },
    'apple-touch': {
      size: 180,
      variant: 'apple',
      staticFile: 'apple-touch-icon.png',
    },
  },
)

interface VariantParams {
  /** Background fill, or `null` for a transparent canvas. */
  background: string | null
  /**
   * Fraction of the canvas side occupied by the mark's bounding box (the mark
   * is fit, preserving aspect ratio, into a centered square of this size).
   */
  markScale: number
}

/**
 * `maskable` uses 0.56 so even a square mark's bounding-box diagonal stays
 * inside the 80%-diameter safe circle (0.56 * √2 ≈ 0.79 < 0.8). `apple` can be
 * more generous because iOS only rounds the corners rather than masking to a
 * circle.
 */
export function variantParams(variant: IconVariant): VariantParams {
  switch (variant) {
    case 'any':
      return { background: null, markScale: 0.82 }
    case 'maskable':
      return { background: ICON_BG_NAVY, markScale: 0.56 }
    case 'apple':
      return { background: ICON_BG_NAVY, markScale: 0.72 }
  }
}

/** Parse the mark's `viewBox` (falling back to `width`/`height`, then 1:1). */
function readViewBox(markSvg: string): {
  minX: number
  minY: number
  width: number
  height: number
} {
  const vb = markSvg.match(/viewBox\s*=\s*["']([^"']+)["']/i)
  if (vb) {
    const parts = vb[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [minX, minY, width, height] = parts
      if (width > 0 && height > 0) return { minX, minY, width, height }
    }
  }
  const w = Number((markSvg.match(/\bwidth\s*=\s*["']([\d.]+)/i) || [])[1])
  const h = Number((markSvg.match(/\bheight\s*=\s*["']([\d.]+)/i) || [])[1])
  if (w > 0 && h > 0) return { minX: 0, minY: 0, width: w, height: h }
  return { minX: 0, minY: 0, width: 1, height: 1 }
}

/** Strip the outer `<svg …>…</svg>` wrapper, keeping inner defs/paths. */
function innerSvg(markSvg: string): string {
  return markSvg
    .replace(/^[\s\S]*?<svg\b[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim()
}

/**
 * Build the square wrapper SVG document that places the (sanitized) mark,
 * scaled to fit `markScale` of the canvas and centered, on the requested
 * background. Exported so it can be unit-tested without invoking resvg.
 */
export function composeIconSvg(markSvg: string, spec: IconSpec): string {
  const { size } = spec
  const { background, markScale } = variantParams(spec.variant)

  const clean = sanitizeSvg(markSvg)
  const { minX, minY, width, height } = readViewBox(clean)
  const inner = innerSvg(clean)

  // Fit the mark into a centered square of side `box`, preserving aspect ratio.
  const box = size * markScale
  const scale = box / Math.max(width, height)
  const drawnW = width * scale
  const drawnH = height * scale
  const tx = (size - drawnW) / 2 - minX * scale
  const ty = (size - drawnH) / 2 - minY * scale

  const bgRect = background
    ? `<rect x="0" y="0" width="${size}" height="${size}" fill="${background}"/>`
    : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}">` +
    bgRect +
    `<g transform="translate(${tx} ${ty}) scale(${scale})">${inner}</g>` +
    `</svg>`
  )
}

/** Compose + rasterize a mark to a PNG buffer at the given spec. */
export function renderIconPng(markSvg: string, spec: IconSpec): Buffer {
  const doc = composeIconSvg(markSvg, spec)
  const Resvg = loadResvg()
  const resvg = new Resvg(doc, {
    fitTo: { mode: 'width', value: spec.size },
    background: 'rgba(0,0,0,0)',
  })
  return resvg.render().asPng()
}

/**
 * Render an icon for a resolved conference, choosing its `logomarkBright` when
 * present and falling back to the built-in default mark otherwise. Any
 * rasterization failure (malformed SVG, resvg error) also falls back — an
 * install must never receive a broken icon.
 */
export function renderConferenceIconPng(
  logomarkBright: string | undefined | null,
  spec: IconSpec,
): Buffer {
  const mark = logomarkBright?.trim()
  if (mark) {
    try {
      return renderIconPng(mark, spec)
    } catch {
      // fall through to the default mark
    }
  }
  return renderIconPng(DEFAULT_LOGOMARK_SVG, spec)
}
