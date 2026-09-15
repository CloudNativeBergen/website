import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { TaskEditorPage } from '@/components/admin/marketing'

/**
 * The full-page Task editor (spec §7, #1012). The Task id is proven to be
 * this conference's by the `marketing.task.*` procedures, never here.
 */
export default async function MarketingTaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getAuthSession()

  // ORG-SCOPED admin gate (CaaS T1-2, #614), matching the (admin) layout.
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Access Denied
        </p>
      </div>
    )
  }

  return <TaskEditorPage taskId={id} />
}
