'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ExclamationTriangleIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import type { MarketingAssetRow } from '@/lib/marketing-asset'
import { api } from '@/lib/trpc/client'
import { AssetUploadForm } from './AssetUploadForm'
import { blobAssetUploader, type AssetUploader } from './upload'

/** A grid-sized rendition from the Sanity CDN. */
function thumbnail(url: string): string {
  return `${url}?w=640&fit=max&auto=format`
}

function AssetCard({
  asset,
  onDelete,
}: {
  asset: MarketingAssetRow
  onDelete: () => void
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
        {asset.imageUrl && (
          // A Sanity CDN rendition, sized by the URL.
          <img
            src={thumbnail(asset.imageUrl)}
            alt={asset.alt}
            loading="lazy"
            className="size-full object-contain"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start gap-2">
          <h3
            title={asset.title}
            className="line-clamp-2 min-w-0 flex-1 text-sm font-medium break-words text-gray-900 dark:text-white"
          >
            {asset.title}
          </h3>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${asset.title}`}
            className="-m-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
          >
            <TrashIcon className="size-4" aria-hidden />
          </button>
        </div>
        <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
          {asset.alt}
        </p>
        {(Boolean(asset.width && asset.height) || asset.softOnSocial) && (
          <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-gray-500 tabular-nums dark:text-gray-400">
            {asset.width && asset.height ? (
              <span>
                {asset.width} × {asset.height}
              </span>
            ) : null}
            {asset.softOnSocial && (
              <span className="inline-flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                <ExclamationTriangleIcon
                  className="mt-px size-3.5 shrink-0"
                  aria-hidden
                />
                May look soft on social
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * The organization's marketing asset gallery (docs/MARKETING_ASSETS_SPEC.md
 * §3, §4.1): upload an image with its title and alt text, see every asset in a
 * grid, delete one. Organizer-only; never public. `orgId` is the one the page
 * resolved server-side; it only names the upload's pathname. `uploader`
 * replaces the real Blob path in Storybook.
 */
export function AssetsPage({
  orgId,
  uploader: override,
}: {
  orgId: string
  uploader?: AssetUploader
}) {
  const uploader = useMemo(
    () => override ?? blobAssetUploader(orgId),
    [override, orgId],
  )
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const list = api.marketingAsset.list.useQuery()
  const [deleting, setDeleting] = useState<MarketingAssetRow | null>(null)
  const remove = api.marketingAsset.delete.useMutation({
    onSuccess: () => {
      showNotification({ type: 'success', title: 'Asset deleted' })
      setDeleting(null)
    },
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not delete the asset',
        message: error.message,
      }),
    onSettled: () => void utils.marketingAsset.list.invalidate(),
  })

  const assets = list.data ?? []

  return (
    <div className="space-y-6">
      <Link href="/admin/marketing" className="text-sm text-brand-cloud-blue">
        ← Marketing plan
      </Link>
      <AdminPageHeader
        icon={<Squares2X2Icon />}
        title="Marketing assets"
        description="Images for social posts, kept once with their alt text. Only organizers see this gallery."
      />

      <AssetUploadForm
        uploader={uploader}
        onSaved={({ title }) => {
          showNotification({ type: 'success', title: `Added “${title}”` })
          void utils.marketingAsset.list.invalidate()
        }}
      />

      <section aria-labelledby="assets-heading" className="space-y-3">
        <h2
          id="assets-heading"
          className="text-base font-semibold text-gray-900 dark:text-white"
        >
          In the gallery
          {list.data && (
            <span className="ml-2 text-sm font-normal text-gray-500 tabular-nums dark:text-gray-400">
              {assets.length}
            </span>
          )}
        </h2>
        {list.isPending && (
          <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        )}
        {list.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {list.error.message}
          </p>
        )}
        {list.data && assets.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Nothing here yet. Start with the logo and the brand graphics every
            post reuses.
          </p>
        )}
        {assets.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard
                key={asset._id}
                asset={asset}
                onDelete={() => setDeleting(asset)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmationModal
        isOpen={deleting !== null}
        onClose={() => (remove.isPending ? undefined : setDeleting(null))}
        onConfirm={() => deleting && remove.mutate({ id: deleting._id })}
        title={`Delete “${deleting?.title ?? ''}”?`}
        message="It leaves the gallery. Posts that already use the image keep it."
        confirmButtonText="Delete"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  )
}
