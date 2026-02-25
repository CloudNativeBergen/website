import {
  HomeIcon,
  DocumentTextIcon,
  UserGroupIcon,
  CalendarIcon,
  BanknotesIcon,
  MegaphoneIcon,
  PhotoIcon,
  CogIcon,
  TicketIcon,
  AcademicCapIcon,
  UserIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../types'

interface AdminPage {
  id: string
  title: string
  url: string
  keywords: string[]
  icon: React.ComponentType<{ className?: string }>
}

const ADMIN_PAGES: AdminPage[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    url: '/admin',
    keywords: ['dashboard', 'home', 'overview'],
    icon: HomeIcon,
  },
  {
    id: 'proposals',
    title: 'Proposals',
    url: '/admin/proposals',
    keywords: ['proposals', 'cfp', 'submissions', 'talks'],
    icon: DocumentTextIcon,
  },
  {
    id: 'speakers',
    title: 'Speakers',
    url: '/admin/speakers',
    keywords: ['speakers', 'presenters', 'people'],
    icon: UserGroupIcon,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    url: '/admin/schedule',
    keywords: ['schedule', 'agenda', 'program', 'timeline'],
    icon: CalendarIcon,
  },
  {
    id: 'sponsors',
    title: 'Sponsors',
    url: '/admin/sponsors',
    keywords: ['sponsors', 'partners', 'companies'],
    icon: BuildingOfficeIcon,
  },
  {
    id: 'sponsor-crm',
    title: 'Sponsor CRM',
    url: '/admin/sponsors/crm',
    keywords: ['sponsor', 'crm', 'pipeline', 'contacts'],
    icon: BuildingOfficeIcon,
  },
  {
    id: 'sponsor-tiers',
    title: 'Sponsor Tiers',
    url: '/admin/sponsors/tiers',
    keywords: ['sponsor', 'tiers', 'levels', 'packages'],
    icon: BanknotesIcon,
  },
  {
    id: 'sponsor-templates',
    title: 'Sponsor Templates',
    url: '/admin/sponsors/templates',
    keywords: ['sponsor', 'templates', 'emails'],
    icon: DocumentTextIcon,
  },
  {
    id: 'tickets',
    title: 'Tickets',
    url: '/admin/tickets',
    keywords: ['tickets', 'sales', 'registration'],
    icon: TicketIcon,
  },
  {
    id: 'orders',
    title: 'Orders',
    url: '/admin/tickets/orders',
    keywords: ['orders', 'purchases', 'sales', 'attendees'],
    icon: TicketIcon,
  },
  {
    id: 'ticket-types',
    title: 'Ticket Types',
    url: '/admin/tickets/types',
    keywords: ['ticket', 'types', 'categories'],
    icon: TicketIcon,
  },
  {
    id: 'discount-codes',
    title: 'Discount Codes',
    url: '/admin/tickets/discount',
    keywords: ['discount', 'codes', 'coupons', 'promo'],
    icon: BanknotesIcon,
  },
  {
    id: 'workshops',
    title: 'Workshops',
    url: '/admin/workshops',
    keywords: ['workshops', 'training', 'sessions'],
    icon: AcademicCapIcon,
  },
  {
    id: 'volunteers',
    title: 'Volunteers',
    url: '/admin/volunteers',
    keywords: ['volunteers', 'staff', 'helpers'],
    icon: UserIcon,
  },
  {
    id: 'marketing',
    title: 'Marketing',
    url: '/admin/marketing',
    keywords: ['marketing', 'content', 'promotion'],
    icon: MegaphoneIcon,
  },
  {
    id: 'gallery',
    title: 'Gallery',
    url: '/admin/gallery',
    keywords: ['gallery', 'photos', 'images', 'media'],
    icon: PhotoIcon,
  },
  {
    id: 'settings',
    title: 'Settings',
    url: '/admin/settings',
    keywords: ['settings', 'configuration', 'config'],
    icon: CogIcon,
  },
]

export class AdminPagesSearchProvider implements SearchProvider {
  readonly category = 'pages' as const
  readonly label = 'Pages'
  readonly priority = 1

  async search(query: string): Promise<SearchProviderResult> {
    const normalizedQuery = query.toLowerCase().trim()

    if (!normalizedQuery) {
      return {
        category: this.category,
        label: this.label,
        items: [],
      }
    }

    const matchedPages = ADMIN_PAGES.filter((page) => {
      return (
        page.title.toLowerCase().includes(normalizedQuery) ||
        page.keywords.some((keyword) => keyword.includes(normalizedQuery))
      )
    })

    const items: SearchResultItem[] = matchedPages.map((page) => ({
      id: page.id,
      title: page.title,
      category: this.category,
      url: page.url,
      icon: page.icon,
    }))

    return {
      category: this.category,
      label: this.label,
      items,
      totalCount: items.length,
    }
  }
}
