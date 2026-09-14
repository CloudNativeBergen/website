import type { PlatformConstraints, PublishMedia } from './provider/types'
import { renditionRect, renditionUrl } from './rendition'
import type { SocialPostAttachment, SocialVariantAttachment } from './types'

/**
 * Resolve a variant's attachment list against its post's attachments into
 * the `PublishMedia` an adapter (and `validate`) consumes: the rendition
 * URL for the platform's crop, the MIME type the CDN will serve, and the
 * effective alt text. Pure and browser-safe, so the editor validates the
 * same media the engine publishes.
 *
 * Returns `null` when a variant references a key the post no longer has —
 * the caller decides whether that is a refusal (save) or a skip (render).
 */
export function resolvePublishMedia(
  attachments: SocialVariantAttachment[],
  postAttachments: SocialPostAttachment[],
  constraints: Pick<PlatformConstraints, 'imageAspectRatio'> | null,
): PublishMedia[] | null {
  const byKey = new Map(postAttachments.map((a) => [a._key, a]))
  const media: PublishMedia[] = []
  for (const attachment of attachments) {
    const source = byKey.get(attachment.source)
    if (!source) return null
    const rect = renditionRect(
      source,
      constraints?.imageAspectRatio ?? null,
      attachment.crop,
    )
    media.push({
      url: renditionUrl(source, rect),
      mimeType: mimeTypeOf(source.assetId),
      alt: attachment.altOverride ?? source.alt,
    })
  }
  return media
}

/**
 * The type the CDN serves for the rendition. Renditions request
 * `auto=format`, which never upgrades to a type the platform rejects (it only
 * swaps to webp/avif for browsers that ask), so the source type is the one
 * to validate against.
 */
export function mimeTypeOf(assetId: string): string {
  const ext = assetId.slice(assetId.lastIndexOf('-') + 1)
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'avif':
      return 'image/avif'
    default:
      return 'application/octet-stream'
  }
}
