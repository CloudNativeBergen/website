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
  StarIcon,
  PresentationChartBarIcon,
  CreditCardIcon,
  AcademicCapIcon,
  PhotoIcon,
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
  { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
  { name: 'Featured', href: '/admin/featured', icon: StarIcon },
  { name: 'Gallery', href: '/admin/gallery', icon: PhotoIcon },
  { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
  { name: 'Tickets', href: '/admin/tickets', icon: TicketIcon },
  { name: 'Workshops', href: '/admin/workshops', icon: AcademicCapIcon },
  {
    name: 'Travel Support',
    href: '/admin/travel-support',
    icon: CreditCardIcon,
  },
  { name: 'Volunteers', href: '/admin/volunteers', icon: UserGroupIcon },
  { name: 'Sponsors', href: '/admin/sponsors', icon: BuildingOfficeIcon },
  {
    name: 'Marketing',
    href: '/admin/marketing',
    icon: PresentationChartBarIcon,
  },
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
