'use client'

import { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import { blobAssetUploader } from '@/components/admin/marketing/assets/upload'
import type { BackgroundGallery } from './meme-generator-gallery'

/** A picker thumbnail: small, square, straight from the CDN (never drawn). */
const thumbnail = (imageUrl: string) => `${imageUrl}?w=320&h=320&fit=crop`

/**
 * The organization's marketing asset gallery as the meme generator uses it
 * (docs/MARKETING_STUDIO_VIDEO_SPEC.md §5, §7). Every read and write resolves
 * the organization on the server from the request host; `orgId` only names
 * the upload's pathname, as on the Assets page.
 */
export function useStudioGallery(orgId: string): BackgroundGallery {
  const utils = api.useUtils()
  return useMemo(() => {
    const uploader = blobAssetUploader(orgId)
    return {
      images: async () => {
        const rows = await utils.marketingAsset.list.fetch(undefined)
        return rows.flatMap((row) =>
          row.kind === 'image' && row.imageUrl
            ? [
                {
                  _id: row._id,
                  title: row.title,
                  // Only a track has no alt text (#1178); an image always does.
                  alt: row.alt ?? '',
                  thumbnailUrl: thumbnail(row.imageUrl),
                },
              ]
            : [],
        )
      },
      resolve: (id) => utils.marketingAsset.background.fetch({ id }),
      keep: async (file, { title, alt }) => {
        // Organization-wide, with nothing else said about it: the Assets
        // page is where it gets a subject, tags or an edition.
        const kept = await uploader(file, {
          title,
          alt,
          edition: 'none',
          subject: null,
          tags: [],
        })
        void utils.marketingAsset.list.invalidate()
        void utils.marketingAsset.filters.invalidate()
        return { _id: kept._id }
      },
    }
  }, [orgId, utils])
}
