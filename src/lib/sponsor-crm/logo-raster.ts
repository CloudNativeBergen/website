import type { Resvg as ResvgType } from '@resvg/resvg-js'

/**
 * Lazily load the native `@resvg/resvg-js` binding. A static top-level import
 * would throw at module-load time if the platform-specific `.node` binary
 * can't be resolved (e.g. a serverless bundling issue) — and because this
 * module is imported by the contract-PDF pipeline, that would take down ALL
 * contract generation, not just the logo. Loading it inside the try/catch
 * below keeps any load failure contained to "generate the PDF without a logo".
 */
function loadResvg(): typeof ResvgType {
  // Deliberate lazy CommonJS require so a native-binary load failure surfaces
  // here (inside the caller's try/catch) rather than at module import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@resvg/resvg-js') as typeof import('@resvg/resvg-js')).Resvg
}

/**
 * Default rasterization width in pixels. The contract PDF header displays the
 * logo at ~28pt tall, so a 600px-wide raster is comfortably crisp for print
 * (well above 2x the on-page size) while keeping the embedded PNG small.
 */
const DEFAULT_RASTER_WIDTH = 600

/** Raster data URLs that `@react-pdf/renderer`'s <Image> already supports. */
const RASTER_DATA_URL_RE = /^data:image\/(png|jpe?g|jpg)/i

/**
 * Heuristic for detecting inline SVG markup. Allows any combination of a
 * leading XML declaration, DOCTYPE, and/or comments before the `<svg` tag —
 * SVGs exported by common tools frequently begin with `<?xml …?>`,
 * `<!DOCTYPE svg …>`, or a `<!-- … -->` comment, all of which resvg renders
 * fine and which must not be misclassified as "not an SVG".
 */
const SVG_MARKUP_RE =
  /^\s*(<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->|\s)*<svg[\s>]/i

/**
 * Convert a conference/organizer logo into a PNG data URL that
 * `@react-pdf/renderer` can embed.
 *
 * The `logoBright` field stores raw SVG markup, which react-pdf v4 cannot embed
 * (only PNG/JPG). This rasterizes the SVG to PNG via resvg (native, server-side)
 * and returns a `data:image/png;base64,...` URL.
 *
 * Behaviour:
 * - Empty / missing input -> `undefined`.
 * - Already a PNG/JPEG data URL -> returned unchanged (raster passthrough).
 * - SVG markup -> rasterized to PNG, aspect ratio preserved (fit to width).
 * - Any failure (invalid markup, resvg error) -> logs a warning and returns
 *   `undefined` so contract generation never fails because of the logo.
 */
export function rasterizeLogoToPngDataUrl(
  logo: string | null | undefined,
  options?: { width?: number },
): string | undefined {
  if (!logo) return undefined

  const trimmed = logo.trim()
  if (!trimmed) return undefined

  // Already a raster data URL react-pdf supports — pass it through untouched.
  if (RASTER_DATA_URL_RE.test(trimmed)) {
    return trimmed
  }

  // Only attempt to rasterize things that look like SVG markup.
  if (!SVG_MARKUP_RE.test(trimmed)) {
    console.warn(
      '[contract-pdf] Logo is neither a supported raster data URL nor SVG markup; generating PDF without logo.',
    )
    return undefined
  }

  try {
    const Resvg = loadResvg()
    const resvg = new Resvg(trimmed, {
      fitTo: { mode: 'width', value: options?.width ?? DEFAULT_RASTER_WIDTH },
    })
    const pngBuffer = resvg.render().asPng()
    return `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`
  } catch (error) {
    console.warn(
      '[contract-pdf] Failed to rasterize logo SVG to PNG; generating PDF without logo.',
      error,
    )
    return undefined
  }
}
