'use client'

import { AdminTablePageLoading } from '@/components/admin/PageLoadingSkeleton'
import { api } from '@/lib/trpc/client'
import { SessionFeedbackAdmin } from './SessionFeedbackAdmin'

/**
 * `/admin/feedback` (speaker feedback spec §10.1): reads
 * `sessionFeedback.adminOverview` and wires Hide, Unhide and Remove to their
 * procedures. Each action resolves once the overview has been read again,
 * so the page never shows a removed response as still there.
 */
export function SessionFeedbackAdminPage({
  conferenceTitle,
}: {
  conferenceTitle?: string
}) {
  const utils = api.useUtils()
  const overview = api.sessionFeedback.adminOverview.useQuery()
  const refresh = {
    onSettled: () => utils.sessionFeedback.adminOverview.invalidate(),
  }
  const hide = api.sessionFeedback.adminHide.useMutation(refresh)
  const unhide = api.sessionFeedback.adminUnhide.useMutation(refresh)
  const remove = api.sessionFeedback.adminRemove.useMutation(refresh)

  if (overview.isPending) return <AdminTablePageLoading />
  // React Query keeps the last data when a refetch fails: the page stays,
  // saying its numbers are earlier ones. Only a first read that failed has
  // nothing else to show.
  if (!overview.data)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-300">
          Could not load Session Feedback: {overview.error?.message}
        </p>
      </div>
    )
  return (
    <SessionFeedbackAdmin
      overview={overview.data}
      conferenceTitle={conferenceTitle}
      onHide={(id) => hide.mutateAsync({ responseIds: [id] })}
      onUnhide={(id) => unhide.mutateAsync({ responseIds: [id] })}
      onRemove={(ids) => remove.mutateAsync({ responseIds: ids })}
      refreshFailed={
        overview.isError
          ? {
              onRetry: () => void overview.refetch(),
              retrying: overview.isFetching,
            }
          : undefined
      }
    />
  )
}
