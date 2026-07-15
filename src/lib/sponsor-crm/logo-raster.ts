import { Resvg } from '@resvg/resvg-js'

/**
 * Default rasterization width in pixels. The contract PDF header displays the
 * logo at ~28pt tall, so a 600px-wide raster is comfortably crisp for print
 * (well above 2x the on-page size) while keeping the embedded PNG small.
 */
const DEFAULT_RASTER_WIDTH = 600

/** Raster data URLs that `@react-pdf/renderer`'s <Image> already supports. */
const RASTER_DATA_URL_RE = /^data:image\/(png|jpe?g|jpg)/i

/** Heuristic for detecting inline SVG markup. */
const SVG_MARKUP_RE = /^(<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i

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
