import { getAuthSession } from '@/lib/auth'
import {
  isOrganizerForCurrentOrg,
  resolveCurrentOrgId,
} from '@/lib/authz/organizer'
import { AssetsPage } from '@/components/admin/marketing/assets'

/**
 * The organization's marketing asset gallery (docs/MARKETING_ASSETS_SPEC.md).
 * Organization-owned, so the page needs only the org-scoped admin gate; every
 * read and write resolves the organization again on the server.
 */
export default async function MarketingAssetsPage() {
  const session = await getAuthSession()
  const orgId = await resolveCurrentOrgId()

  // ORG-SCOPED admin gate (CaaS T1-2, #614), matching the (admin) layout.
  if (!orgId || !(await isOrganizerForCurrentOrg(session?.speaker))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Access Denied
        </p>
      </div>
    )
  }

  return <AssetsPage orgId={orgId} />
}
