'use client'

import { useState } from 'react'
import {
  DashboardLayout,
  type NavigationSection,
} from '@/components/common/DashboardLayout'
import { ADMIN_NAV_SECTIONS } from '@/lib/admin/registry'
import { CommandPalette } from './CommandPalette'
import { NotificationProvider } from './NotificationProvider'
import { UnlistedBanner } from './UnlistedBanner'

const navigation: NavigationSection[] = ADMIN_NAV_SECTIONS

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
}

export function AdminLayout({
  children,
  conferenceLogos,
  unlisted = false,
}: AdminLayoutProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)

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
          />
        }
      >
        {unlisted ? <UnlistedBanner /> : null}
        {children}
      </DashboardLayout>
    </NotificationProvider>
  )
}
