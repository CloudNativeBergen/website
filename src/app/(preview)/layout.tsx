import type { Metadata } from 'next'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * The CHROME-LESS admin route group.
 *
 * Pages here are organizer-only, exactly like `(admin)`, but they are rendered
 * INSIDE something else — today, the homepage composer's preview iframe — so
 * they must not carry the admin shell. The sidebar, command palette and
 * notification chrome that `(admin)/admin/layout.tsx` wraps every page in would
 * be nonsense inside a frame that is supposed to show a tenant's front page, and
 * a nested layout cannot opt out of an ancestor layout: the only way to shed it
 * is a sibling route group. Hence this file, whose whole job is to repeat the
 * gate and nothing else.
 *
 * THE GATE IS THE SAME GATE, deliberately duplicated rather than shared through
 * a helper component: it is four lines, and an org-scoped authorization check is
 * the last place to introduce indirection. `isOrganizerForCurrentOrg` resolves
 * the org from the request Host, so a preview URL opened against another
 * tenant's domain is denied even for an organizer of a different conference.
 *
 * Routes under `/admin/*` are already `Disallow`ed in `robots.txt`; the noindex
 * metadata above is the belt to that braces.
 */
export default async function PreviewRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Access Denied</p>
      </div>
    )
  }

  return <>{children}</>
}
