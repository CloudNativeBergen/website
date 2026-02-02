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
  ConferenceLogos,
} from '@/components/common/DashboardLayout'
import { Flags } from '@/lib/speaker/types'
import { useImpersonateQueryString } from '@/lib/impersonation'

interface CFPLayoutProps {
  children: React.ReactNode
  conferenceLogos?: ConferenceLogos
}

export function CFPLayout({ children, conferenceLogos }: CFPLayoutProps) {
  const { data: session } = useSession()
  const impersonateQuery = useImpersonateQueryString()

  const isEligibleForTravelSupport =
    session?.speaker?.flags?.includes(Flags.requiresTravelFunding) ||
    (AppEnvironment.isTestMode && session?.speaker)

  const baseNavigation: NavigationItem[] = [
    {
      name: 'Profile',
      href: `/cfp/profile${impersonateQuery}`,
      icon: UserIcon,
    },
    {
      name: 'Submit Talk',
      href: `/cfp/proposal${impersonateQuery}`,
      icon: PlusIcon,
    },
    {
      name: 'My Proposals',
      href: `/cfp/list${impersonateQuery}`,
      icon: ListBulletIcon,
    },
  ]

  const navigationWithTravelSupport: NavigationItem[] =
    isEligibleForTravelSupport
      ? [
          ...baseNavigation,
          {
            name: 'Travel Support',
            href: `/cfp/expense${impersonateQuery}`,
            icon: CreditCardIcon,
          },
        ]
      : baseNavigation

  const navigation: NavigationItem[] = [
    ...navigationWithTravelSupport,
    {
      name: 'Email Settings',
      href: `/cfp/admin${impersonateQuery}`,
      icon: EnvelopeIcon,
    },
  ]

  return (
    <DashboardLayout
      mode="speaker"
      navigation={navigation}
      title="Speaker Dashboard"
      conferenceLogos={conferenceLogos}
    >
      {children}
    </DashboardLayout>
  )
}
