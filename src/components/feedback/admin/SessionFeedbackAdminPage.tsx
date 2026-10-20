'use client'

import { AdminTablePageLoading } from '@/components/admin/PageLoadingSkeleton'
import { ErrorDisplay } from '@/components/admin/ErrorDisplay'
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
  if (overview.error)
    return (
      <ErrorDisplay
        title="Could not load Session Feedback"
        message={overview.error.message}
      />
    )
  return (
    <SessionFeedbackAdmin
      overview={overview.data}
      conferenceTitle={conferenceTitle}
      onHide={(id) => hide.mutateAsync({ responseIds: [id] })}
      onUnhide={(id) => unhide.mutateAsync({ responseIds: [id] })}
      onRemove={(ids) => remove.mutateAsync({ responseIds: ids })}
    />
  )
}
