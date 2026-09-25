/**
 * A gallery image as a studio scene background (docs/MARKETING_STUDIO_VIDEO_SPEC.md
 * §5). Drawing a Sanity CDN image taints the canvas, and `crossOrigin` cannot
 * help: the CDN sends a CORS header only to the Studio's origin. So the image
 * comes through our own same-origin proxy, as a rendition no larger than the
 * canvas needs — which also keeps it under the platform's response-size limit.
 */

/**
 * The short side a background is fetched at: the 1080 canvas plus the 10% a
 * drifting scene zooms (`DRIFT_RASTER_SIZE` in the meme generator).
 */
export const BACKGROUND_SHORT_SIDE = 1188

/** The same-origin route that relays Sanity CDN images. */
const IMAGE_PROXY_PATH = '/api/proxy-image'

/**
 * The CDN rendition of an image whose short side is at most
 * `BACKGROUND_SHORT_SIDE`, never upscaled (`fit=max`), as WebP: it keeps an
 * alpha channel, and a photo stays far under the proxy's limits.
 */
export function backgroundRenditionUrl(
  cdnUrl: string,
  width: number | null,
  height: number | null,
): string {
  const url = new URL(cdnUrl)
  // Unknown dimensions (never for a Sanity image) size the width.
  const landscape = !!width && !!height && width > height
  const short = landscape ? height : width
  url.search = ''
  url.searchParams.set(
    landscape ? 'h' : 'w',
    String(Math.min(BACKGROUND_SHORT_SIDE, short ?? BACKGROUND_SHORT_SIDE)),
  )
  url.searchParams.set('fit', 'max')
  url.searchParams.set('fm', 'webp')
  url.searchParams.set('q', '90')
  return url.toString()
}

/** A CDN URL as the same-origin proxy URL the canvas can read. */
export function proxiedImageUrl(cdnUrl: string): string {
  return `${IMAGE_PROXY_PATH}?${new URLSearchParams({ url: cdnUrl })}`
}
