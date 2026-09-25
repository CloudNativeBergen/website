'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData } from '@tanstack/react-query'
import {
  ExclamationTriangleIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import type {
  MarketingAssetFilter,
  MarketingAssetRow,
} from '@/lib/marketing-asset'
import { api } from '@/lib/trpc/client'
import { AssetEditDialog } from './AssetEditDialog'
import { AssetFilters } from './AssetFilters'
import { AssetUploadForm } from './AssetUploadForm'
import { SUBJECT_LABEL } from './SubjectCombobox'
import { blobAssetUploader, type AssetUploader } from './upload'

/** A grid-sized rendition from the Sanity CDN. */
function thumbnail(url: string): string {
  return `${url}?w=640&fit=max&auto=format`
}

const NO_FACETS = { tags: [], subjects: [] }

function AssetCard({
  asset,
  onEdit,
  onDelete,
}: {
  asset: MarketingAssetRow
  onEdit: () => void
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
            onClick={onEdit}
            aria-label={`Edit ${asset.title}`}
            className="-m-1 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-cloud-blue dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <PencilSquareIcon className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${asset.title}`}
            className="-m-1 rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
          >
            <TrashIcon className="size-4" aria-hidden />
          </button>
        </div>
        {/* The image's alt text, shown for checking. Hidden from screen
            readers, which already read it as the image's alt. */}
        <p
          aria-hidden
          className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400"
        >
          {asset.alt}
        </p>
        <p className="flex flex-wrap items-center gap-1 pt-1 text-xs">
          <span
            className={
              asset.scope === 'edition'
                ? 'rounded-md bg-blue-50 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-200'
                : 'rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }
          >
            {asset.scope === 'edition'
              ? (asset.edition ?? 'An edition')
              : 'Whole organization'}
          </span>
          {asset.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-gray-200 px-1.5 py-0.5 text-gray-600 dark:border-gray-700 dark:text-gray-300"
            >
              #{tag}
            </span>
          ))}
        </p>
        {(asset.subject || asset.credit) && (
          <dl className="space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
            {asset.subject && (
              <div className="flex gap-1">
                <dt className="text-gray-500 dark:text-gray-400">About</dt>
                <dd className="min-w-0 truncate" title={asset.subject.name}>
                  {asset.subject.name}{' '}
                  <span className="text-gray-500 dark:text-gray-400">
                    · {SUBJECT_LABEL[asset.subject._type]}
                  </span>
                </dd>
              </div>
            )}
            {asset.credit && (
              <div className="flex gap-1">
                <dt className="text-gray-500 dark:text-gray-400">Credit</dt>
                <dd className="min-w-0 truncate" title={asset.credit}>
                  {asset.credit}
                </dd>
              </div>
            )}
          </dl>
        )}
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
  const [filter, setFilter] = useState<MarketingAssetFilter>({})
  const [search, setSearch] = useState('')
  // The search box asks the server once typing pauses, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilter((current) =>
          (current.search ?? '') === search.trim()
            ? current
            : { ...current, search: search.trim() || undefined },
        ),
      300,
    )
    return () => clearTimeout(timer)
  }, [search])
  const list = api.marketingAsset.list.useQuery(filter, {
    placeholderData: keepPreviousData,
  })
  const filters = api.marketingAsset.filters.useQuery()
  const edition = filters.data?.edition ?? null
  const filtered = Boolean(
    filter.subjectId ||
    filter.tag ||
    filter.search ||
    filter.editions === 'all',
  )
  const [editing, setEditing] = useState<MarketingAssetRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  // `confirming` closes the dialog; `deleting` keeps its title while it fades.
  const [deleting, setDeleting] = useState<MarketingAssetRow | null>(null)
  const [confirming, setConfirming] = useState(false)
  const galleryHeading = useRef<HTMLHeadingElement>(null)
  // Set when a delete succeeds; read once the dialog has finished closing.
  const deleted = useRef(false)
  const remove = api.marketingAsset.delete.useMutation({
    onSuccess: () => {
      showNotification({ type: 'success', title: 'Asset deleted' })
      deleted.current = true
      setConfirming(false)
    },
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not delete the asset',
        message: error.message,
      }),
    onSettled: () => {
      void utils.marketingAsset.list.invalidate()
      void utils.marketingAsset.filters.invalidate()
    },
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
        edition={edition}
        onSaved={({ title }) => {
          showNotification({ type: 'success', title: `Added “${title}”` })
          void utils.marketingAsset.list.invalidate()
          void utils.marketingAsset.filters.invalidate()
        }}
      />

      <section aria-labelledby="assets-heading" className="space-y-3">
        <h2
          ref={galleryHeading}
          tabIndex={-1}
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
        <AssetFilters
          filter={filter}
          search={search}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          facets={filters.data ?? NO_FACETS}
        />
        {list.isPending && (
          <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        )}
        {list.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {list.error.message}
          </p>
        )}
        {list.data && assets.length === 0 && filtered && (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No assets match.{' '}
            <button
              type="button"
              onClick={() => {
                setFilter({})
                setSearch('')
              }}
              className="font-medium text-brand-cloud-blue underline-offset-2 hover:underline dark:text-blue-300"
            >
              Clear the filters
            </button>
          </p>
        )}
        {list.data && assets.length === 0 && !filtered && (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Nothing here yet. Start with the logo and the brand graphics every
            post reuses.
          </p>
        )}
        {assets.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard
                key={asset._id}
                asset={asset}
                onEdit={() => {
                  setEditing(asset)
                  setEditOpen(true)
                }}
                onDelete={() => {
                  setDeleting(asset)
                  setConfirming(true)
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <AssetEditDialog
        asset={editing}
        isOpen={editOpen}
        edition={edition}
        onClose={() => setEditOpen(false)}
        onSaved={(title) => {
          showNotification({ type: 'success', title: `Saved “${title}”` })
          setEditOpen(false)
        }}
      />

      <ConfirmationModal
        isOpen={confirming}
        afterLeave={() => {
          // The button that opened the dialog is gone with its card, so the
          // dialog cannot hand focus back to it. Only now, after it has let
          // go of focus, can focus move elsewhere.
          if (deleted.current) galleryHeading.current?.focus()
          deleted.current = false
        }}
        onClose={() => (remove.isPending ? undefined : setConfirming(false))}
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
