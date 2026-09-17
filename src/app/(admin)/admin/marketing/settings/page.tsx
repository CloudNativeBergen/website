import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { PlanSettingsPage } from '@/components/admin/marketing/settings'

export default async function MarketingSettingsPage() {
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

  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    console.error('Error loading conference:', error)
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-lg font-semibold text-red-500 dark:text-red-400">
          Error loading conference data
        </p>
      </div>
    )
  }

  return <PlanSettingsPage />
}
