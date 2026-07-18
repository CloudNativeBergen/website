'use client'

import { TrackTalk } from '@/lib/conference/types'
import {
  ArrowsRightLeftIcon,
  PencilIcon,
  ArrowsUpDownIcon,
  DocumentDuplicateIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

import { BottomSheet } from '../BottomSheet'

/* -------------------------------------------------------------------------- */
/* Card action sheet (tap a scheduled talk/service)                           */
/* -------------------------------------------------------------------------- */

export function CardActionSheet({
  talk,
  onMove,
  onRename,
  onDuration,
  onDuplicate,
  onRemove,
  onClose,
}: {
  talk: TrackTalk
  onMove: () => void
  onRename: () => void
  onDuration: () => void
  onDuplicate: () => void
  onRemove: () => void
  onClose: () => void
}) {
  // A real service session has a placeholder; a talk-less slot without one
  // (defensive) must not surface the service-only actions.
  const isService = !talk.talk && !!talk.placeholder
  const title = talk.talk?.title ?? talk.placeholder ?? 'Untitled'
  const action =
    'inline-flex min-h-[44px] w-full items-center justify-start gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

  return (
    <BottomSheet title={title} onClose={onClose}>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        {talk.startTime}–{talk.endTime}
        {isService ? ' · Service session' : ''}
      </p>
      <div className="space-y-2">
        <button type="button" onClick={onMove} className={action}>
          <ArrowsRightLeftIcon className="h-5 w-5" />
          {isService ? 'Move to another slot' : 'Move or swap'}
        </button>
        {isService && (
          <>
            <button type="button" onClick={onRename} className={action}>
              <PencilIcon className="h-5 w-5" />
              Rename
            </button>
            <button type="button" onClick={onDuration} className={action}>
              <ArrowsUpDownIcon className="h-5 w-5" />
              Change duration
            </button>
            <button type="button" onClick={onDuplicate} className={action}>
              <DocumentDuplicateIcon className="h-5 w-5" />
              Duplicate to all tracks
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-[44px] w-full items-center justify-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
        >
          <TrashIcon className="h-5 w-5" />
          Remove from schedule
        </button>
      </div>
    </BottomSheet>
  )
}
