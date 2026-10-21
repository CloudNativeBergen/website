'use client'

import { api } from '@/lib/trpc/client'
import { removeInRequests } from '@/lib/feedback/bulk-remove'
import { AdminFeedbackCodePanel } from '../AdminFeedbackCodePanel'
import { TalkFeedbackPanel } from './TalkFeedbackPanel'

/**
 * `/admin/proposals/[id]`'s Session Feedback (speaker feedback spec §10.2):
 * reads `sessionFeedback.adminTalk` and wires Card Counts, Hide, Unhide and
 * Remove. Each action resolves once the talk has been read again. A talk
 * that is not one of this conference's shows nothing.
 */
export function TalkFeedbackAdminPanel({
  talkId,
  title,
  showCode,
}: {
  talkId: string
  title: string
  /** The Feedback Code section: confirmed talks, once codes are live. */
  showCode: boolean
}) {
  const utils = api.useUtils()
  const feedback = api.sessionFeedback.adminTalk.useQuery(
    { talkId },
    { retry: false },
  )
  // `/admin/feedback` holds the same responses and totals: a visit there
  // after acting here must not show what this page just changed.
  const refresh = {
    onSettled: () =>
      Promise.all([
        utils.sessionFeedback.adminTalk.invalidate({ talkId }),
        utils.sessionFeedback.adminOverview.invalidate(),
      ]),
  }
  const hide = api.sessionFeedback.adminHide.useMutation(refresh)
  const unhide = api.sessionFeedback.adminUnhide.useMutation(refresh)
  const remove = api.sessionFeedback.adminRemove.useMutation(refresh)
  const cards = api.proposal.admin.updateAudienceFeedback.useMutation(refresh)

  // The Feedback Code stands on its own while the feedback read is not
  // there: an organizer can still print, mint or rotate.
  const ownCode = showCode ? (
    <AdminFeedbackCodePanel talkId={talkId} title={title} />
  ) : null

  // Not a talk of this conference: the code panel refuses the same way.
  if (feedback.error?.data?.code === 'NOT_FOUND') return ownCode
  if (!feedback.data)
    return (
      <div className="space-y-4">
        {feedback.error ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              Session Feedback could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => feedback.refetch()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            role="status"
            aria-label="Loading Session Feedback"
            className="h-48 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
          />
        )}
        {ownCode}
      </div>
    )

  // A refetch after an action failed: React Query keeps the earlier data,
  // so say the numbers are earlier ones (as /admin/feedback does).
  const stale = feedback.isError
  return (
    <div className="space-y-2">
      {/* Always mounted: words set in a live region are announced. */}
      <div
        className={
          stale
            ? 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200'
            : 'sr-only'
        }
      >
        <p role="status" aria-live="polite">
          {stale
            ? feedback.isFetching
              ? 'Refreshing…'
              : 'Couldn’t refresh, showing earlier numbers.'
            : ''}
        </p>
        {stale && (
          <button
            type="button"
            aria-disabled={feedback.isFetching}
            onClick={() => {
              if (!feedback.isFetching) void feedback.refetch()
            }}
            className="min-h-9 rounded-md px-3 font-semibold hover:bg-yellow-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-700 aria-disabled:cursor-wait aria-disabled:opacity-60 dark:hover:bg-yellow-900/40"
          >
            Retry
          </button>
        )}
      </div>
      <TalkFeedbackPanel
        feedback={feedback.data}
        code={
          showCode ? (
            <AdminFeedbackCodePanel talkId={talkId} title={title} embedded />
          ) : undefined
        }
        onSaveCards={async (c) => {
          const saved = await cards.mutateAsync({
            id: talkId,
            feedback: {
              greenCount: c.green,
              yellowCount: c.yellow,
              redCount: c.red,
            },
          })
          // When the save committed: the panel keeps the counts on screen
          // until a read of the talk is at least that recent.
          const at = (saved as { _updatedAt?: unknown } | null)?._updatedAt
          return typeof at === 'string' ? at : null
        }}
        onHide={(id) => hide.mutateAsync({ responseIds: [id] })}
        onUnhide={(id) => unhide.mutateAsync({ responseIds: [id] })}
        onRemove={(request) =>
          removeInRequests(request, (chunk) => remove.mutateAsync(chunk))
        }
      />
    </div>
  )
}
