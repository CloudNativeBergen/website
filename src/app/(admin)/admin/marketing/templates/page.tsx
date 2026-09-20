import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { TemplatesPage } from '@/components/admin/marketing/templates'

/**
 * The organization's Plan Templates (Templates spec §6.3). No conference read
 * here: every Template is resolved server-side from the conference's
 * organization, so the page only needs the org-scoped admin gate.
 */
export default async function MarketingTemplatesPage() {
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

  return <TemplatesPage />
}
