'use client'

import { useId } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { BUTTON, CARD } from './PhotoWallAdmin'

/** The streamed ZIP route (Photo Wall spec §13 P5). */
export const MARKETING_EXPORT_ROUTE = '/api/admin/photo-wall/export'

export interface MarketingExportProps {
  /**
   * How many photos the ZIP holds, as the server counts them with the ZIP's
   * own rule (`photoWall.settings`); unknown when absent.
   */
  count?: number
}

/** The consented ZIP export on `/admin/photo-wall` (§12, §13 P5). */
export function MarketingExport({ count }: MarketingExportProps) {
  const titleId = useId()
  const noteId = useId()
  return (
    <section aria-labelledby={titleId} className={`${CARD} max-w-xl`}>
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
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* A plain download: the browser saves the stream as it
                arrives, holding none of it in the page. */}
            <a
              href={MARKETING_EXPORT_ROUTE}
              download
              aria-describedby={noteId}
              className={BUTTON}
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
          {/* The page can't see a download fail: the browser reports it. */}
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            If the download stops partway, start it again.
          </p>
        </>
      )}
      <p id={noteId} className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Downloaded copies belong to the organizers. The 30-day deletion doesn’t
        remove them, and neither does a contributor deleting a photo or
        unticking marketing later.
      </p>
    </section>
  )
}
