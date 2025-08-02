'use client'

import {
  DocumentTextIcon,
  UserIcon,
  PlusIcon,
  ListBulletIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import {
  DashboardLayout,
  NavigationItem,
} from '@/components/common/DashboardLayout'

const navigation: NavigationItem[] = [
  { name: 'Profile', href: '/cfp/profile', icon: UserIcon },
  { name: 'Submit Talk', href: '/cfp/submit', icon: PlusIcon },
  { name: 'My Proposals', href: '/cfp/list', icon: ListBulletIcon },
  { name: 'Email Settings', href: '/cfp/admin', icon: EnvelopeIcon },
]

interface CFPLayoutProps {
  children: React.ReactNode
}

export function CFPLayout({ children }: CFPLayoutProps) {
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
