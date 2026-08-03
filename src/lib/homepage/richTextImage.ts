import { createImageUrlBuilder } from '@sanity/image-url'
import { SANITY_IMAGE_REF_PATTERN } from './richText'

/**
 * URL + intrinsic-size resolution for a rich-text image.
 *
 * Deliberately built from the PUBLIC project/dataset env rather than from
 * `@/lib/sanity/client`: that module instantiates token-bearing clients, and
 * this one is imported by a component that also renders in Storybook and in the
 * browser bundle. Same reason `sanity/lib/image.ts` keeps its own builder.
 *
 * The only input is an asset id that already matched
 * {@link SANITY_IMAGE_REF_PATTERN}, so the output host is always `cdn.sanity.io`
 * — there is no code path here that can be steered at another origin.
 */
const builder = createImageUrlBuilder({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || '',
})

/**
 * A Sanity image asset id encodes its own pixel dimensions
 * (`image-<sha1>-<w>x<h>-<ext>`), so the renderer can set `width`/`height` and
 * reserve layout space without a round trip. Null when the id is not one of ours.
 */
export function parseImageRefDimensions(
  ref: string,
): { width: number; height: number } | null {
  if (!SANITY_IMAGE_REF_PATTERN.test(ref)) return null
  const match = /-(\d{1,5})x(\d{1,5})-/.exec(ref)
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** A CDN URL for the asset, capped at `width` CSS pixels of source. */
export function richTextImageUrl(ref: string, width = 1200): string {
  if (!SANITY_IMAGE_REF_PATTERN.test(ref)) return ''
  return builder
    .image({ _type: 'reference', _ref: ref })
    .width(width)
    .fit('max')
    .auto('format')
    .quality(85)
    .url()
}
