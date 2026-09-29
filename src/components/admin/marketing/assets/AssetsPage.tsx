'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { keepPreviousData } from '@tanstack/react-query'
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  MusicalNoteIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  isPostedByHand,
  kindHasAlt,
  openInStudioHref,
  opensTheCard,
  type MarketingAssetFilter,
  type MarketingAssetRow,
} from '@/lib/marketing-asset'
import { api } from '@/lib/trpc/client'
import { formatDateSafe } from '@/lib/time'
import { AssetEditDialog } from './AssetEditDialog'
import { KIND_NOUN } from './AssetDetailsFields'
import { AssetFilters } from './AssetFilters'
import { AssetUploadForm } from './AssetUploadForm'
import { SUBJECT_LABEL } from './SubjectCombobox'
import { TrackPlayer } from './TrackPlayer'
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
        {asset.kind === 'audio' ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-3">
            <MusicalNoteIcon
              className="size-10 text-gray-400 sm:size-12 dark:text-gray-500"
              aria-hidden
            />
            {asset.audioUrl && (
              <TrackPlayer
                src={asset.audioUrl}
                title={asset.title}
                durationSeconds={asset.durationSeconds}
              />
            )}
          </div>
        ) : asset.kind === 'video' ? (
          asset.videoUrl && (
            // Nothing is fetched until it is played: the poster stands in.
            <video
              src={asset.videoUrl}
              poster={asset.posterUrl ? thumbnail(asset.posterUrl) : undefined}
              controls
              playsInline
              preload="none"
              aria-label={`${asset.title}: ${asset.alt ?? ''}`}
              className="size-full bg-black object-contain"
            />
          )
        ) : (
          asset.imageUrl && (
            // A Sanity CDN rendition, sized by the URL. A GIF's still moves.
            <img
              src={thumbnail(asset.imageUrl)}
              alt={asset.alt ?? ''}
              loading="lazy"
              className="size-full object-contain"
            />
          )
        )}
        {isPostedByHand(asset.kind) && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-gray-900/80 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
            {asset.kind === 'gif' ? 'GIF' : 'Video'}
          </span>
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
        {asset.kind === 'audio' ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Audio track · for studio videos
          </p>
        ) : (
          // The image's alt text, shown for checking. Hidden from screen
          // readers, which already read it as the image's alt.
          <p
            aria-hidden
            className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400"
          >
            {asset.alt}
          </p>
        )}
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
        {asset.studio && (
          // Back to the tab and the speaker or sponsor that made it (§4.2).
          // The studio cannot address a talk or a card variant.
          <Link
            href={openInStudioHref(asset.studio)}
            aria-label={
              opensTheCard(asset.studio)
                ? `Open ${asset.title} in the studio`
                : `Open the studio tab ${asset.title} was made on`
            }
            className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand-cloud-blue hover:underline focus-visible:outline-2 focus-visible:outline-brand-cloud-blue dark:text-blue-300"
          >
            <ArrowTopRightOnSquareIcon className="size-3.5" aria-hidden />
            {opensTheCard(asset.studio) ? 'Open in studio' : 'Open studio tab'}
          </Link>
        )}
        {asset.rights && (
          <p className="text-xs text-gray-600 dark:text-gray-300">
            <span className="text-gray-500 dark:text-gray-400">
              Rights confirmed by
            </span>{' '}
            {asset.rights.confirmedBy ?? 'a former organizer'},{' '}
            {formatDateSafe(asset.rights.confirmedAt)}
          </p>
        )}
        {asset.downloadUrl && (
          // The ORIGINAL file, to post by hand (spec §5): it cannot go into
          // a post yet.
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            <a
              href={asset.downloadUrl}
              download
              aria-label={`Download original ${KIND_NOUN[asset.kind]}: ${asset.title}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-cloud-blue hover:underline focus-visible:outline-2 focus-visible:outline-brand-cloud-blue dark:text-blue-300"
            >
              <ArrowDownTrayIcon className="size-3.5" aria-hidden />
              Download original
            </a>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Post it by hand for now
            </span>
          </div>
        )}
        {kindHasAlt(asset.kind) && (
          <p
            className={clsx(
              'flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-gray-500 tabular-nums dark:text-gray-400',
              !asset.downloadUrl && 'mt-auto',
            )}
          >
            {/* A video's size is its poster's, which is capped: not said. */}
            {asset.kind !== 'video' && asset.width && asset.height ? (
              <span>
                {asset.width} × {asset.height}
              </span>
            ) : null}
            {/* For display only: deleting never waits on it (spec §5). A GIF
                or video is in no post: it cannot be attached yet. */}
            {asset.usedInPosts !== null && asset.kind === 'image' && (
              <span>{usedInPostsLabel(asset.usedInPosts)}</span>
            )}
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

/** "Used in N posts": posts of this organization holding the image. */
export function usedInPostsLabel(count: number): string {
  if (count === 0) return 'Not in a post yet'
  return `Used in ${count} ${count === 1 ? 'post' : 'posts'}`
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
  // The one reader that shows "used in N posts", so the one that counts it.
  const list = api.marketingAsset.list.useQuery(
    { ...filter, usage: true },
    {
      placeholderData: keepPreviousData,
    },
  )
  const filters = api.marketingAsset.filters.useQuery()
  // A subject or tag whose last asset was edited or deleted leaves the menu;
  // its filter goes with it, rather than filtering on something unseen.
  // Adjusted during render, when fresh menus arrive.
  const [menusSeen, setMenusSeen] = useState(filters.data)
  if (filters.data !== menusSeen) {
    setMenusSeen(filters.data)
    const facets = filters.data
    if (facets) {
      const staleSubject =
        filter.subjectId &&
        !facets.subjects.some((s) => s._id === filter.subjectId)
      const staleTag = filter.tag && !facets.tags.includes(filter.tag)
      if (staleSubject || staleTag)
        setFilter({
          ...filter,
          ...(staleSubject ? { subjectId: undefined } : {}),
          ...(staleTag ? { tag: undefined } : {}),
        })
    }
  }
  const edition = filters.data?.edition ?? null
  const filtered = Boolean(
    filter.subjectId ||
    filter.tag ||
    filter.kind ||
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
        description="Images, GIFs and short videos for social posts, kept once with their alt text, and music for studio videos. Only organizers see this gallery."
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
        message={
          deleting && deleting.kind !== 'image'
            ? 'It leaves the gallery, and its file is deleted unless something else still uses it.'
            : 'It leaves the gallery. Posts that already use the image keep it.'
        }
        confirmButtonText="Delete"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  )
}
