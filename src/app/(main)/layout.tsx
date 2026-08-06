import { Layout } from '@/components/Layout'
import { PlatformLanding } from '@/components/PlatformLanding'
import { PlatformUnavailable } from '@/components/PlatformUnavailable'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const resolution = await getConferenceForCurrentDomain()

  // ORDER MATTERS (#848). A FAILED read must be answered before the
  // unknown-host branch, never folded into it: the two used to be
  // indistinguishable here, so a total Sanity/network failure rendered every
  // live tenant's homepage as `PlatformLanding` — "No conference here yet…
  // Claim it" — inviting strangers to claim a paying customer's domain for as
  // long as the outage lasted. We do not know what lives at this Host; say so.
  if (isConferenceUnavailable(resolution)) {
    return <PlatformUnavailable />
  }

  // When the Host resolves to no conference, short-circuit the ENTIRE (main)
  // subtree: render one platform landing instead of the tenant chrome. Because
  // `children` is never placed in the tree, the child page's server component
  // never executes — so pages that dereference an empty conference (e.g. cfp's
  // `conference.formats.filter`) can't crash on an unknown host.
  if (isUnknownHost(resolution)) {
    return <PlatformLanding signupUrl={process.env.PLATFORM_SIGNUP_URL} />
  }

  return <Layout conference={resolution.conference}>{children}</Layout>
}
