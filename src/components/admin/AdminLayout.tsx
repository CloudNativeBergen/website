'use client'

import { useMemo, useState } from 'react'
import {
  DashboardLayout,
  type NavigationSection,
} from '@/components/common/DashboardLayout'
import { visibleNavSections, withNavBadges } from '@/lib/admin/registry'
import type { FeatureId } from '@/lib/features/registry'
import { api } from '@/lib/trpc/client'
import { CommandPalette } from './CommandPalette'
import { NotificationProvider } from './NotificationProvider'
import { UnlistedBanner } from './UnlistedBanner'

interface ConferenceLogos {
  logoBright?: string
  logoDark?: string
  logomarkBright?: string
  logomarkDark?: string
}

interface AdminLayoutProps {
  children: React.ReactNode
  conferenceLogos?: ConferenceLogos
  /**
   * The current conference is UNLISTED (M0 trial state). Renders a banner above
   * the admin content; admin access itself is never gated on visibility.
   */
  unlisted?: boolean
  /**
   * Every required activation row EXCEPT the launch switch is done (#839).
   * Decides whether the unlisted banner offers "Finish setup" (onto the
   * checklist) or "Go live" (onto the publish switch). Defaults to `false` so
   * an un-resolved caller never points an unconfigured tenant at the switch.
   */
  readyToGoLive?: boolean
  /**
   * Per-organization features the CURRENT org is entitled to, resolved
   * server-side. Destinations tagged with a `feature` in the admin registry are
   * hidden from the sidebar and the ⌘K palette unless listed here — an omitted
   * prop hides every gated destination (fail-closed). Presentation only: each
   * gated page re-checks its entitlement server-side.
   */
  enabledFeatures?: readonly FeatureId[]
}

const NO_FEATURES: readonly FeatureId[] = []

export function AdminLayout({
  children,
  conferenceLogos,
  unlisted = false,
  readyToGoLive = false,
  enabledFeatures = NO_FEATURES,
}: AdminLayoutProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The Session Feedback badge (speaker feedback spec §10.1): one live count
  // read when the shell mounts (it stays mounted across admin navigations),
  // read again when /admin/feedback acts on a flag, and on returning to the
  // tab once a minute old. Not polled: a flag that lands meanwhile rings the
  // bell.
  const flagged = api.sessionFeedback.flaggedCount.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  })
  const navigation: NavigationSection[] = useMemo(
    () =>
      withNavBadges(visibleNavSections(enabledFeatures), {
        flaggedFeedback: flagged.data,
      }),
    [enabledFeatures, flagged.data],
  )

  return (
    <NotificationProvider>
      <DashboardLayout
        mode="admin"
        navigation={navigation}
        title="Admin Dashboard"
        conferenceLogos={conferenceLogos}
        onSearch={() => setPaletteOpen(true)}
        searchComponent={
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            enabledFeatures={enabledFeatures}
          />
        }
      >
        {unlisted ? <UnlistedBanner readyToGoLive={readyToGoLive} /> : null}
        {children}
      </DashboardLayout>
    </NotificationProvider>
  )
}
