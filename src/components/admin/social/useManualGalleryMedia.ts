'use client'

import { api } from '@/lib/trpc/client'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'
import { assetContext } from './asset-context'
import type { GalleryMediaItem } from './ManualPostView'

/**
 * The gallery's GIFs and videos for one post, as the manual view offers them
 * (assets spec §5): the post picker's own read — the post's subject first,
 * then this edition's, then the organization's — narrowed to the kinds that
 * cannot be attached yet and are posted by hand instead.
 */
export function useManualGalleryMedia(
  postId: string | null,
): readonly GalleryMediaItem[] | 'error' | undefined {
  const query = api.marketingAsset.forPost.useQuery(
    { postId: postId ?? '' },
    { enabled: postId !== null },
  )
  if (query.error) return 'error'
  if (!query.data) return undefined
  return query.data.flatMap((asset): GalleryMediaItem[] => {
    if ((asset.kind !== 'gif' && asset.kind !== 'video') || !asset.downloadUrl)
      return []
    // A video's poster stands in for it; a GIF's own (still) rendition.
    const thumbnailId =
      asset.kind === 'video' ? asset.posterAssetId : asset.assetId
    return [
      {
        id: asset._id,
        title: asset.title,
        kind: asset.kind,
        alt: asset.alt ?? '',
        context: assetContext(asset),
        thumbnailSrc: thumbnailId ? richTextImageUrl(thumbnailId, 200) : null,
        downloadUrl: asset.downloadUrl,
      },
    ]
  })
}
