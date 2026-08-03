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
 * True when a resolved image URL carries its bytes inline rather than pointing
 * at a host. Such images have no CDN asset behind them and no responsive
 * variants, so callers must neither transform them nor build a `srcSet`.
 */
export function isDataUri(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith(DATA_URI_PREFIX)
}

/**
 * Resolves a gallery image URL for display. Gallery images are normally Sanity
 * assets rendered through the image builder, but `imageUrl` can hold a `data:`
 * URI (generated artwork with no uploaded asset behind it). The builder has no
 * pass-through source shape — it always composes a CDN URL from the asset ref,
 * which 404s for such images — so those are returned verbatim. Everything else
 * keeps the existing builder transform, unchanged.
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
  if (isDataUri(source.imageUrl)) {
    return source.imageUrl
  }
  if (!source.image) {
    return source.imageUrl ?? ''
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
