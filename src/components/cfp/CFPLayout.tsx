'use client'

import { useSession } from 'next-auth/react'
import {
  UserIcon,
  PlusIcon,
  ListBulletIcon,
  EnvelopeIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline'
import { AppEnvironment } from '@/lib/environment/config'
import {
  DashboardLayout,
  NavigationItem,
} from '@/components/common/DashboardLayout'
import { Flags } from '@/lib/speaker/types'

interface CFPLayoutProps {
  children: React.ReactNode
}

export function CFPLayout({ children }: CFPLayoutProps) {
  const { data: session } = useSession()

  // Check if current speaker is eligible for travel funding
  // In test mode, always eligible if speaker exists
  // In production, must have requiresTravelFunding flag
  const isEligibleForTravelSupport =
    session?.speaker?.flags?.includes(Flags.requiresTravelFunding) ||
    (AppEnvironment.isTestMode && session?.speaker)

  // Base navigation items
  const baseNavigation: NavigationItem[] = [
    { name: 'Profile', href: '/cfp/profile', icon: UserIcon },
    { name: 'Submit Talk', href: '/cfp/submit', icon: PlusIcon },
    { name: 'My Proposals', href: '/cfp/list', icon: ListBulletIcon },
  ]

  // Conditionally add travel support
  const navigationWithTravelSupport: NavigationItem[] =
    isEligibleForTravelSupport
      ? [
          ...baseNavigation,
          {
            name: 'Travel Support',
            href: '/cfp/expense',
            icon: CreditCardIcon,
          },
        ]
      : baseNavigation

  // Add email settings at the end
  const navigation: NavigationItem[] = [
    ...navigationWithTravelSupport,
    { name: 'Email Settings', href: '/cfp/admin', icon: EnvelopeIcon },
  ]

  return (
    <DashboardLayout
      mode="speaker"
      navigation={navigation}
      title="Speaker Dashboard"
    >
      {children}
    </DashboardLayout>
  )
}
