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

  return (
    <TalkFeedbackPanel
      feedback={feedback.data}
      code={
        showCode ? (
          <AdminFeedbackCodePanel talkId={talkId} title={title} embedded />
        ) : undefined
      }
      onSaveCards={(c) =>
        cards.mutateAsync({
          id: talkId,
          feedback: {
            greenCount: c.green,
            yellowCount: c.yellow,
            redCount: c.red,
          },
        })
      }
      onHide={(id) => hide.mutateAsync({ responseIds: [id] })}
      onUnhide={(id) => unhide.mutateAsync({ responseIds: [id] })}
      onRemove={(request) =>
        removeInRequests(request, (chunk) => remove.mutateAsync(chunk))
      }
    />
  )
}
