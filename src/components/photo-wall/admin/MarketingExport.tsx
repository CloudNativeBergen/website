'use client'

import { useId } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import type { ModerationPost } from '@/lib/photo-wall'
import { api } from '@/lib/trpc/client'

/** The streamed ZIP route (Photo Wall spec §13 P5). */
export const MARKETING_EXPORT_ROUTE = '/api/admin/photo-wall/export'

/** What the ZIP holds: approved posts whose contributor allowed marketing use. */
export const isExported = (post: ModerationPost): boolean =>
  post.status === 'approved' && post.marketingConsent

/**
 * The consented ZIP export on `/admin/photo-wall` (§12, §13 P5). The count
 * comes from the polled queue, the SAME query as the moderation queue, so it
 * sets no interval of its own; the ZIP itself is read live by the route.
 */
export function MarketingExport() {
  const queue = api.photoWall.moderationQueue.useQuery()
  return (
    <MarketingExportView count={queue.data?.posts.filter(isExported).length} />
  )
}

export interface MarketingExportViewProps {
  /** Approved photos with marketing consent; undefined until the queue answers. */
  count?: number
}

export function MarketingExportView({ count }: MarketingExportViewProps) {
  const titleId = useId()
  const noteId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="max-w-xl rounded-lg border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-800"
    >
      <h2
        id={titleId}
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        Marketing photos
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        The approved photos whose contributors allowed marketing use, as a ZIP.
      </p>
      {count === 0 ? (
        <p className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
          No photos with marketing consent yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* A plain download: the browser saves the stream as it arrives,
              holding none of it in the page. */}
          <a
            href={MARKETING_EXPORT_ROUTE}
            download
            aria-describedby={noteId}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:outline-indigo-400"
          >
            <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
            Download ZIP
          </a>
          {count !== undefined && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {count} {count === 1 ? 'photo' : 'photos'}
            </p>
          )}
        </div>
      )}
      <p id={noteId} className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Downloaded copies are the organizers’. The 30-day deletion doesn’t
        remove them, and neither does a contributor deleting a photo or
        unticking marketing later.
      </p>
    </section>
  )
}
