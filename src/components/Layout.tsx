import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { BackgroundPatternProvider } from '@/components/BackgroundPatternProvider'
import { TenantThemeStyle } from '@/components/TenantThemeStyle'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { pickHeaderConference } from '@/lib/conference/logo'
import { Conference } from '@/lib/conference/types'
import { getPhotoWall } from '@/lib/photo-wall/cache'
import { isPostingOpen } from '@/lib/photo-wall/window'
import { resolveEnabledFeaturesForConference } from '@/lib/features/enabled'

export async function Layout({
  children,
  conference,
  showFooter = true,
}: {
  children: React.ReactNode
  conference: Conference
  showFooter?: boolean
}) {
  // Per request: `now` is fresh, the wall read is tag-cached and every
  // settings change expires it, so the menu flips at Oslo midnight unaided.
  // No wall or a failed read hides the menu entries rather than failing the page.
  const [wall, enabledFeatures] = await Promise.all([
    getPhotoWall(conference._id).catch(() => null),
    // Gates the user menu's admin links; a failed read hides the gated ones.
    resolveEnabledFeaturesForConference(conference).catch(() => []),
  ])
  const photoWall = wall
    ? isPostingOpen(wall, conference, new Date())
      ? 'open'
      : 'closed'
    : undefined
  return (
    <BackgroundPatternProvider
      pattern={normalizeBackgroundPattern(conference.backgroundPattern)}
    >
      <TenantThemeStyle conference={conference} />
      {/* Header is a client component: pass the pick, never the whole
          conference — its props are serialized into the public flight
          payload, private fields (agentConfig, checkinCustomerId, teams)
          included. */}
      <Header
        c={pickHeaderConference(conference)}
        photoWall={photoWall}
        enabledFeatures={enabledFeatures}
      />
      <main className="flex-auto">{children}</main>
      {showFooter && <Footer c={conference} />}
    </BackgroundPatternProvider>
  )
}
