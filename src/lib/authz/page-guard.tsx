import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'

/**
 * "Access Denied" for a page an organizer-only read sits behind, or null to
 * carry on.
 *
 * The admin LAYOUT already checks organizer standing, but `src/proxy.ts` only
 * requires that /admin requests carry SOME session — so the layout is the only
 * thing between a self-registered speaker and the page, and a layout check is
 * presentation. Pages holding a secret worth money (the sponsor invite link is
 * a bearer token that buys hidden tickets) ask again for themselves.
 *
 * Call it BEFORE the read it guards, and return its result when non-null:
 * the point is that an unauthorized request never causes the fetch, not that
 * its output is withheld afterwards.
 */
export async function denyNonOrganizer(): Promise<React.ReactNode | null> {
  const session = await getAuthSession()
  if (await isOrganizerForCurrentOrg(session?.speaker)) return null
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-lg text-gray-500 dark:text-gray-400">Access Denied</p>
    </div>
  )
}
