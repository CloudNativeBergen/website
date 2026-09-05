import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { BackgroundPatternProvider } from '@/components/BackgroundPatternProvider'
import { TenantThemeStyle } from '@/components/TenantThemeStyle'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { pickHeaderConference } from '@/lib/conference/logo'
import { Conference } from '@/lib/conference/types'

export async function Layout({
  children,
  conference,
  showFooter = true,
}: {
  children: React.ReactNode
  conference: Conference
  showFooter?: boolean
}) {
  return (
    <BackgroundPatternProvider
      pattern={normalizeBackgroundPattern(conference.backgroundPattern)}
    >
      <TenantThemeStyle conference={conference} />
      {/* Header is a client component: pass the pick, never the whole
          conference — its props are serialized into the public flight
          payload, private fields (agentConfig, checkinCustomerId, teams)
          included. */}
      <Header c={pickHeaderConference(conference)} />
      <main className="flex-auto">{children}</main>
      {showFooter && <Footer c={conference} />}
    </BackgroundPatternProvider>
  )
}
