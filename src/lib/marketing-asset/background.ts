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
 * The CDN rendition a background is drawn from: the centred square of side
 * `min(BACKGROUND_SHORT_SIDE, short side)`. The canvas covers its square
 * centred and crops the overflow, so this is exactly the part it shows — and
 * both sides are capped, so no panorama can ask for a response larger than
 * the platform sends. Never upscaled; WebP, which keeps an alpha channel.
 */
export function backgroundRenditionUrl(
  cdnUrl: string,
  width: number | null,
  height: number | null,
): string {
  const url = new URL(cdnUrl)
  // Unknown dimensions (never for a Sanity image) ask for the full square.
  const shortSide =
    width && height ? Math.min(width, height) : BACKGROUND_SHORT_SIDE
  const side = String(Math.min(BACKGROUND_SHORT_SIDE, shortSide))
  url.search = new URLSearchParams({
    w: side,
    h: side,
    fit: 'crop',
    crop: 'center',
    fm: 'webp',
    q: '90',
  }).toString()
  return url.toString()
}

/** A CDN URL as the same-origin proxy URL the canvas can read. */
export function proxiedImageUrl(cdnUrl: string): string {
  return `${IMAGE_PROXY_PATH}?${new URLSearchParams({ url: cdnUrl })}`
}
