/**
 * Global `next/image` loader (`images.loaderFile` in next.config.ts).
 *
 * Sanity CDN images are resized by cdn.sanity.io itself (w, q, fit, auto=format)
 * instead of Vercel Image Optimization (`/_next/image`), which is metered.
 * Every other source is returned unchanged: local files, static imports and
 * other remotes are served as-is. Photo Wall photos never use next/image.
 */
const SANITY_CDN = 'https://cdn.sanity.io/'

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}): string {
  if (!src.startsWith(SANITY_CDN)) return src
  const url = new URL(src)
  const p = url.searchParams
  // Keep a builder-set aspect ratio (w+h, e.g. fit=crop) when resizing.
  const w0 = Number(p.get('w'))
  const h0 = Number(p.get('h'))
  if (w0 > 0 && h0 > 0) p.set('h', String(Math.round((h0 * width) / w0)))
  p.set('w', String(width))
  if (!p.has('q')) p.set('q', String(quality ?? 75))
  if (!p.has('fit')) p.set('fit', 'max')
  if (!p.has('auto') && !url.pathname.endsWith('.svg')) p.set('auto', 'format')
  return url.toString()
}
