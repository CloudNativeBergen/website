'use client'

import { useState } from 'react'
import {
  Cog6ToothIcon,
  DocumentTextIcon,
  HomeIcon,
  UsersIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  TicketIcon,
  PresentationChartBarIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import {
  DashboardLayout,
  type NavigationSection,
} from '@/components/common/DashboardLayout'
import { SearchModal } from './SearchModal'
import { NotificationProvider } from './NotificationProvider'

const navigation: NavigationSection[] = [
  {
    label: 'Core',
    items: [
      { name: 'Dashboard', href: '/admin', icon: HomeIcon },
      { name: 'Proposals', href: '/admin/proposals', icon: DocumentTextIcon },
      { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
      { name: 'Volunteers', href: '/admin/volunteers', icon: UserGroupIcon },
      { name: 'Workshops', href: '/admin/workshops', icon: AcademicCapIcon },
    ],
  },
  {
    label: 'Events & Content',
    items: [
      { name: 'Tickets', href: '/admin/tickets', icon: TicketIcon },
      {
        name: 'Sponsors',
        href: '/admin/sponsors',
        icon: BuildingOfficeIcon,
      },
      {
        name: 'Marketing',
        href: '/admin/marketing',
        icon: PresentationChartBarIcon,
      },
    ],
  },
  {
    label: 'System',
    items: [{ name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon }],
  },
]

interface ConferenceLogos {
  logo_bright?: string
  logo_dark?: string
  logomark_bright?: string
  logomark_dark?: string
}

interface AdminLayoutProps {
  children: React.ReactNode
  conferenceLogos?: ConferenceLogos
}

export function AdminLayout({ children, conferenceLogos }: AdminLayoutProps) {
  const [searchModalOpen, setSearchModalOpen] = useState(false)

  return (
    <NotificationProvider>
      <DashboardLayout
        mode="admin"
        navigation={navigation}
        title="Admin Dashboard"
        conferenceLogos={conferenceLogos}
        onSearch={() => setSearchModalOpen(true)}
        searchComponent={
          <SearchModal
            open={searchModalOpen}
            onClose={() => setSearchModalOpen(false)}
          />
        }
      >
        {children}
      </DashboardLayout>
    </NotificationProvider>
  )
}
