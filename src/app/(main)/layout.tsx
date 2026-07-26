import { Layout } from '@/components/Layout'
import { PlatformLanding } from '@/components/PlatformLanding'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { conference, error } = await getConferenceForCurrentDomain()

  // When the Host resolves to no conference, short-circuit the ENTIRE (main)
  // subtree: render one platform landing instead of the tenant chrome. Because
  // `children` is never placed in the tree, the child page's server component
  // never executes — so pages that dereference an empty conference (e.g. cfp's
  // `conference.formats.filter`) can't crash on an unknown host.
  if (isUnknownHost({ conference, error })) {
    return <PlatformLanding signupUrl={process.env.PLATFORM_SIGNUP_URL} />
  }

  return <Layout conference={conference}>{children}</Layout>
}
