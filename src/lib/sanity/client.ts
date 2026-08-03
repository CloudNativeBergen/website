import { createClient } from 'next-sanity'
import { createImageUrlBuilder } from '@sanity/image-url'
import type { SanityImageSource } from '@sanity/image-url'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2023-05-03'

export const clientReadCached = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  token: process.env.SANITY_API_TOKEN_READ || 'invalid',
})

export const clientReadUncached = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_TOKEN_READ || 'invalid',
})

export const clientWrite = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_TOKEN_WRITE || 'invalid',
})

const builder = createImageUrlBuilder(clientReadCached)

export function sanityImage(source: SanityImageSource) {
  return builder.image(source)
}

const SANITY_CDN_PREFIX = 'https://cdn.sanity.io/'

/**
 * Resolves a speaker image URL for display. Handles both Sanity CDN URLs
 * (from uploaded images) and external URLs (from OAuth providers like GitHub/LinkedIn).
 * Only Sanity URLs are passed through the image builder for transforms.
 */
export function speakerImageUrl(
  image: string,
  opts: { width: number; height: number; fit?: 'crop' | 'max' } = {
    width: 400,
    height: 400,
    fit: 'crop',
  },
): string {
  if (typeof image !== 'string') {
    return ''
  }
  if (image.startsWith(SANITY_CDN_PREFIX)) {
    return sanityImage(image)
      .width(opts.width)
      .height(opts.height)
      .fit(opts.fit ?? 'crop')
      .url()
  }
  return image
}

const DATA_URI_PREFIX = 'data:'

/**
 * Inline image bytes we will hand to the browser as an `<img src>`.
 *
 * CLOSED ALLOWLIST, RASTER ONLY. `imageUrl` is dataset content — in a
 * multi-tenant install it is organizer-authored, and Sanity Studio and
 * dataset-level tooling both bypass our write path — so an unconstrained
 * `data:` prefix test would let ANY media type reach an `<img src>` on a page
 * served to every visitor. The media types here are exactly the ones
 * `SANITY_IMAGE_REF_PATTERN` and `RICH_TEXT_IMAGE_MIME_TYPES` (both in
 * `@/lib/homepage/richText`) already admit for stored images. Same shape as
 * `RASTER_DATA_URL_RE` in `@/lib/sponsor-crm/logo-raster`.
 *
 * DELIBERATELY A SEPARATE LIST, not an import of `RICH_TEXT_IMAGE_MIME_TYPES`.
 * That constant is an UPLOAD-side allowlist — "what an organizer may push into
 * the Sanity asset pipeline", mirrored to the asset-id extensions. This one is
 * a RENDER-side allowlist — "what bytes we will inline into a visitor's page
 * from a stored string that never passed an upload gate". Widening one must not
 * silently widen the other, and `lib/sanity/client` is the lowest-level shared
 * client: it must not depend on a homepage feature module.
 *
 * NO SVG, matching the position the rest of the repo already takes: an SVG is
 * an active document, so the asset-id pattern excludes `-svg` asset ids,
 * and the SVG the app DOES accept (sponsor/branding logos) is only ever stored
 * after `sanitizeSvgUpload` and re-checked by `sanitizeSvg` at render. A `data:`
 * URI handed to `<img src>` passes through neither sanitizer and cannot pass
 * through either — the browser gets opaque bytes. `<img>` renders SVG in secure
 * static mode, so this is not a script-execution hole today; it is a refusal to
 * open a second, unsanitized SVG intake behind the sanitizer's back.
 */
const INLINE_IMAGE_DATA_URI_RE = /^data:image\/(jpe?g|png|webp|gif|avif)[;,]/i

/**
 * True when a resolved image URL carries its bytes inline as an allowed raster
 * image type. Such images have no CDN asset behind them and no responsive
 * variants, so callers must neither transform them nor build a `srcSet`.
 *
 * A `data:` URI that is NOT an allowed image type is not "inline artwork" —
 * it is something we refuse to render, and {@link galleryImageSrc} falls back
 * to the builder for it.
 *
 * Deliberately NOT a `url is string` type predicate: a rejected `data:` URI is
 * still a string, so the false branch must not narrow the caller's value away.
 */
export function isInlineImageDataUri(url: string | null | undefined): boolean {
  return typeof url === 'string' && INLINE_IMAGE_DATA_URI_RE.test(url)
}

/**
 * Resolves a gallery image URL for display. Gallery images are normally Sanity
 * assets rendered through the image builder, but `imageUrl` can hold a `data:`
 * URI (generated artwork with no uploaded asset behind it). The builder has no
 * pass-through source shape — it always composes a CDN URL from the asset ref,
 * which 404s for such images — so an allowed inline image type is returned
 * verbatim. Everything else keeps the existing builder transform, unchanged.
 *
 * A `data:` URI outside {@link INLINE_IMAGE_DATA_URI_RE} is never passed
 * through: it falls back to the builder, i.e. to exactly the behaviour this
 * function replaced, and the carousel's existing load-error state handles the
 * 404 as it did before.
 */
export function galleryImageSrc(
  source: { image?: SanityImageSource; imageUrl?: string },
  opts: {
    width: number
    height?: number
    quality?: number
    fit?: 'crop' | 'max'
  },
): string {
  const { imageUrl } = source
  if (imageUrl !== undefined && isInlineImageDataUri(imageUrl)) {
    return imageUrl
  }
  if (!source.image) {
    // With no asset to build from there is nothing to fall back TO, so a
    // rejected `data:` URI resolves to no src at all rather than leaking out
    // through this branch.
    if (imageUrl?.startsWith(DATA_URI_PREFIX)) {
      return ''
    }
    return imageUrl ?? ''
  }
  let builder = sanityImage(source.image).width(opts.width)
  if (opts.height !== undefined) {
    builder = builder.height(opts.height)
  }
  if (opts.quality !== undefined) {
    builder = builder.quality(opts.quality)
  }
  if (opts.fit !== undefined) {
    builder = builder.fit(opts.fit)
  }
  return builder.url()
}
