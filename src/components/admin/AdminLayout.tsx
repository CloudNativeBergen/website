'use client'

import { useState } from 'react'
import {
  Cog6ToothIcon,
  DocumentTextIcon,
  HomeIcon,
  UsersIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  TicketIcon,
  StarIcon,
  PresentationChartBarIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline'
import {
  DashboardLayout,
  NavigationItem,
} from '@/components/common/DashboardLayout'
import { SearchModal } from './SearchModal'
import { NotificationProvider } from './NotificationProvider'

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon },
  { name: 'Proposals', href: '/admin/proposals', icon: DocumentTextIcon },
  { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
  { name: 'Tickets', href: '/admin/tickets', icon: TicketIcon },
  { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
  {
    name: 'Travel Support',
    href: '/admin/travel-support',
    icon: CreditCardIcon,
  },
  { name: 'Sponsors', href: '/admin/sponsors', icon: BuildingOfficeIcon },
  {
    name: 'Marketing',
    href: '/admin/marketing',
    icon: PresentationChartBarIcon,
  },
  { name: 'Featured', href: '/admin/featured', icon: StarIcon },
  { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
]

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [searchModalOpen, setSearchModalOpen] = useState(false)

  return (
    <NotificationProvider>
      <DashboardLayout
        mode="admin"
        navigation={navigation}
        title="Admin Dashboard"
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
