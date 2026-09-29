'use client'

import { useEffect, useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import {
  MarketingAssetPicker,
  type MarketingAssetPick,
} from '@/components/admin/marketing/assets/MarketingAssetPicker'
import { assetContext } from '@/components/admin/social/asset-context'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'
import { api } from '@/lib/trpc/client'

export interface TaskGalleryAttachResult {
  handoffFailures: string[]
  handoffIssues?: string[]
}

/**
 * "Use an asset from the gallery" on a render Task (assets spec §4.3,
 * #1166): this organization's images, this edition's and the
 * organization-wide ones by default. Only the asset's id travels; the server
 * reads the image and the alt from it and hands them to the waiting posts as
 * it does a render. A GIF or video is shown but cannot be picked.
 */
export function TaskGalleryPicker({
  taskId,
  taskRev,
  onAttached,
}: {
  taskId: string
  /** The revision the organizer is looking at. */
  taskRev: string
  onAttached: (
    asset: MarketingAssetPick,
    result: TaskGalleryAttachResult,
  ) => void
}) {
  const utils = api.useUtils()
  // The search asks the server once typing pauses, not per keystroke.
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [allEditions, setAllEditions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const list = api.marketingAsset.list.useQuery(
    {
      kind: 'image',
      editions: allEditions ? 'all' : 'current',
      ...(query ? { search: query } : {}),
    },
    { placeholderData: keepPreviousData },
  )
  const attach = api.marketing.task.attachAsset.useMutation()

  const assets: MarketingAssetPick[] = (list.data ?? []).map((asset) => ({
    id: asset._id,
    title: asset.title,
    alt: asset.alt ?? '',
    thumbnailSrc: asset.assetId ? richTextImageUrl(asset.assetId, 300) : null,
    attachable: asset.attachable,
    context: assetContext(asset),
  }))

  const pick = async (asset: MarketingAssetPick) => {
    setError(null)
    try {
      const result = await attach.mutateAsync({
        taskId,
        taskRev,
        marketingAssetId: asset.id,
      })
      // The gallery's "used in N posts" moved with it.
      void utils.marketingAsset.invalidate()
      onAttached(asset, result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use this asset.')
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <MarketingAssetPicker
        source={{
          assets,
          isLoading: list.isLoading,
          error: list.error?.message ?? null,
          onRetry: () => void list.refetch(),
          search,
          onSearchChange: setSearch,
          allEditions,
          onAllEditionsChange: setAllEditions,
        }}
        disabled={attach.isPending}
        onPick={(asset) => void pick(asset)}
        pickLabel={(asset) =>
          `Finish this Task with ${asset.title} (${asset.context})`
        }
        notPickable={{
          reason: "GIFs and videos can't finish a render Task yet.",
          badge: "Can't be used yet",
        }}
        empty="The asset gallery has no images for this edition yet."
      />
      {attach.isPending && (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Attaching the image and handing it to the publishing Tasks…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
