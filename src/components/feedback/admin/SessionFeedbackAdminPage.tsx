'use client'

import { useEffect } from 'react'
import { AdminTablePageLoading } from '@/components/admin/PageLoadingSkeleton'
import { api } from '@/lib/trpc/client'
import { SessionFeedbackAdmin } from './SessionFeedbackAdmin'

/**
 * `/admin/feedback` (speaker feedback spec §10.1): reads
 * `sessionFeedback.adminOverview` and wires Hide, Unhide, Keep and Remove to
 * their procedures. Each action resolves once the overview has been read
 * again, so the page never shows a removed response as still there, and
 * reads the nav's flagged count again (`AdminLayout`).
 */
export function SessionFeedbackAdminPage({
  conferenceTitle,
}: {
  conferenceTitle?: string
}) {
  const utils = api.useUtils()
  // Read again on returning to the tab, as the nav badge is (AdminLayout),
  // so the box and the badge never disagree; and on every arrival, however
  // the organizer came (the bell, /notifications, a push): a flag's
  // notification links here, and a cached overview younger than the shared
  // staleTime would not show it.
  const overview = api.sessionFeedback.adminOverview.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })
  // The badge lives in the admin shell, which stays mounted across
  // navigations: read it again on arrival too.
  // (`useUtils` is stable; a property read off it is a fresh proxy.)
  useEffect(() => {
    void utils.sessionFeedback.flaggedCount.invalidate()
  }, [utils])
  const refresh = {
    onSettled: () =>
      Promise.all([
        utils.sessionFeedback.adminOverview.invalidate(),
        utils.sessionFeedback.flaggedCount.invalidate(),
      ]),
  }
  const hide = api.sessionFeedback.adminHide.useMutation(refresh)
  const unhide = api.sessionFeedback.adminUnhide.useMutation(refresh)
  const keep = api.sessionFeedback.adminKeep.useMutation(refresh)
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
      onKeep={(c) => keep.mutateAsync({ responseId: c.id, rev: c.rev })}
      onRemove={(request) => remove.mutateAsync(request)}
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
