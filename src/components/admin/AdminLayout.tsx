'use client'

import { useMemo, useState } from 'react'
import {
  DashboardLayout,
  type NavigationSection,
} from '@/components/common/DashboardLayout'
import { visibleNavSections } from '@/lib/admin/registry'
import type { FeatureId } from '@/lib/features/registry'
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
  enabledFeatures = NO_FEATURES,
}: AdminLayoutProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigation: NavigationSection[] = useMemo(
    () => visibleNavSections(enabledFeatures),
    [enabledFeatures],
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
        {unlisted ? <UnlistedBanner /> : null}
        {children}
      </DashboardLayout>
    </NotificationProvider>
  )
}
