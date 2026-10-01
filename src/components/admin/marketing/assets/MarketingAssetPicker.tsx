'use client'

import clsx from 'clsx'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { STUDIO_FORMATS, type StudioFormat } from '@/lib/marketing-asset'

/**
 * An entry of the organization's marketing asset gallery (assets spec §5).
 * Picking one sends only its id: the server copies the image reference and
 * the alt text.
 */
export interface MarketingAssetPick {
  id: string
  title: string
  alt: string
  thumbnailSrc: string | null
  /** A GIF or video cannot go into a post yet: shown, but not pickable. */
  attachable: boolean
  /** Where it sits: "About Ada Lovelace", "CND 2026", "Whole organization". */
  context: string
  /**
   * Its Format (formats spec §6), shown on the tile; absent where the picker
   * does not rank by one.
   */
  format?: StudioFormat
  /**
   * What picking it warns: the crop the post's Channel applies to this
   * Format. Null when it is the Channel's own. Never a refusal.
   */
  formatWarning?: string | null
  /** Its Format is the one the post's Channel ranks first: highlighted. */
  formatPreferred?: boolean
}

/** The list a picker shows, with its search and edition filter. */
export interface MarketingAssetSource {
  assets: MarketingAssetPick[]
  isLoading: boolean
  /** The list could not be read: said, never shown as an empty gallery. */
  error?: string | null
  onRetry?: () => void
  search: string
  onSearchChange: (search: string) => void
  allEditions: boolean
  onAllEditionsChange: (all: boolean) => void
}

/**
 * The marketing asset gallery as a picker: search, "All editions" and a grid
 * of thumbnails. Shared by the post editor (#1163) and a render Task (#1166);
 * each says what a pick does, and what an asset it cannot take is called.
 */
export function MarketingAssetPicker({
  source,
  disabled = false,
  onPick,
  pickLabel,
  notPickable,
  empty,
}: {
  source: MarketingAssetSource
  disabled?: boolean
  onPick: (asset: MarketingAssetPick) => void
  /** The accessible name of a pickable asset's button. */
  pickLabel: (asset: MarketingAssetPick) => string
  /** Why an asset cannot be picked: the tooltip, and the badge in brief. */
  notPickable: { reason: string; badge: string }
  /** Said when the gallery has nothing (and no search is typed). */
  empty: string
}) {
  return (
    <div
      role="group"
      aria-label="Marketing assets"
      className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">Search marketing assets</span>
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            value={source.search}
            onChange={(e) => source.onSearchChange(e.target.value)}
            // Inside an editor's form: Enter must not submit it.
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            placeholder="Search title and tags"
            className="block min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 pl-8 text-sm shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>
        <label className="inline-flex min-h-[40px] items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={source.allEditions}
            onChange={(e) => source.onAllEditionsChange(e.target.checked)}
            className="size-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700"
          />
          All editions
        </label>
      </div>
      {source.isLoading ? (
        <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      ) : source.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-red-600 dark:text-red-400"
        >
          <span>Could not load the marketing assets: {source.error}</span>
          {source.onRetry && (
            <AdminButton
              type="button"
              size="xs"
              variant="secondary"
              onClick={source.onRetry}
            >
              Try again
            </AdminButton>
          )}
        </div>
      ) : source.assets.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {source.search.trim() ? 'No marketing asset matches.' : empty}
        </p>
      ) : (
        <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
          {source.assets.map((asset) => (
            <li key={asset.id} className="min-w-0">
              <button
                type="button"
                disabled={disabled || !asset.attachable}
                onClick={() => onPick(asset)}
                aria-label={
                  asset.attachable
                    ? pickLabel(asset)
                    : `${asset.title} (${asset.context}): ${notPickable.badge.toLowerCase()}`
                }
                title={asset.attachable ? asset.alt : notPickable.reason}
                className="group block w-full rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed"
              >
                <span className="relative block aspect-square overflow-hidden rounded bg-gray-100 ring-offset-2 group-enabled:group-hover:ring-2 group-enabled:group-hover:ring-brand-cloud-blue dark:bg-gray-800 dark:ring-offset-gray-900">
                  {asset.thumbnailSrc && (
                    <img
                      src={asset.thumbnailSrc}
                      alt=""
                      loading="lazy"
                      className={clsx(
                        'size-full object-cover',
                        !asset.attachable && 'opacity-40',
                      )}
                    />
                  )}
                  {asset.format && (
                    <span
                      aria-hidden
                      data-format-preferred={asset.formatPreferred === true}
                      className={clsx(
                        'absolute top-1 left-1 rounded px-1 py-0.5 text-[10px] leading-none font-medium',
                        asset.formatPreferred
                          ? 'bg-brand-cloud-blue text-white'
                          : 'bg-white/90 text-gray-700 dark:bg-gray-900/85 dark:text-gray-300',
                      )}
                    >
                      {STUDIO_FORMATS[asset.format].label}
                    </span>
                  )}
                  {!asset.attachable && (
                    <span className="absolute inset-x-1 bottom-1 rounded bg-gray-900/80 px-1 py-0.5 text-center text-[11px] leading-tight font-medium text-white">
                      {notPickable.badge}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs font-medium text-gray-800 dark:text-gray-100">
                  {asset.title}
                </span>
                <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {asset.context}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
