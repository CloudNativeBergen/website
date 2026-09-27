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
      // Never from cache: a re-upload asks this whether an asset still
      // exists, and a cached answer can predate its deletion.
      resolve: (id) =>
        utils.marketingAsset.background.fetch({ id }, { staleTime: 0 }),
      tracks: async () => {
        const rows = await utils.marketingAsset.list.fetch(undefined)
        return rows.flatMap((row) =>
          row.kind === 'audio'
            ? [
                {
                  _id: row._id,
                  title: row.title,
                  durationSeconds: row.durationSeconds ?? 0,
                },
              ]
            : [],
        )
      },
      loadTrack: async (source) => {
        const response = await fetch(
          `/api/admin/studio-track?${new URLSearchParams(source)}`,
        )
        if (!response.ok) throw new Error('The track could not be loaded.')
        return response.arrayBuffer()
      },
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
