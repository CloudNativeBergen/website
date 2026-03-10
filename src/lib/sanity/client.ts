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
  if (image.startsWith(SANITY_CDN_PREFIX)) {
    return sanityImage(image)
      .width(opts.width)
      .height(opts.height)
      .fit(opts.fit ?? 'crop')
      .url()
  }
  return image
}
