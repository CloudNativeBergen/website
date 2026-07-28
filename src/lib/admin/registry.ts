/**
 * Static registry of every admin destination — the sidebar pages, the deeper
 * sub-pages that have no nav entry, and the Settings page's section anchors.
 *
 * The registry is the single source of truth for BOTH the admin sidebar
 * (AdminLayout renders `ADMIN_NAV_SECTIONS`) and the ⌘K command palette
 * (`searchDestinations`), so a page added to the nav is automatically
 * searchable and the two can never drift apart. Settings destinations are
 * derived from `SETTINGS_GROUPS` / `SETTINGS_TIERS` in `@/lib/settings/groups`
 * for the same reason.
 *
 * An entry may carry an optional `feature` (a `FeatureId` from the per-org
 * feature registry). Both consumers filter through `visibleNavSections` /
 * `visibleDestinations`, so a destination for a feature the current org is not
 * entitled to disappears from the sidebar AND the palette at once. Hiding is
 * presentation, never security — the page re-checks the entitlement server-side.
 */

import {
  AcademicCapIcon,
  BanknotesIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  EyeIcon,
  HeartIcon,
  HomeIcon,
  IdentificationIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  ShieldCheckIcon,
  SignalIcon,
  TicketIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import type { NavigationItem } from '@/components/common/DashboardLayout'
import { SETTINGS_GROUPS, SETTINGS_TIERS } from '@/lib/settings/groups'
import type { FeatureId } from '@/lib/features/registry'

export type AdminDestinationKind = 'page' | 'setting' | 'action'

/** Icon component type, matching how the admin nav stores Heroicons. */
export type AdminDestinationIcon = NavigationItem['icon']

/**
 * The per-organization feature an admin destination belongs to
 * (`src/lib/features/registry.ts`). ABSENT means "always available" — the vast
 * majority. When present, the destination is hidden from the sidebar and the
 * ⌘K palette unless the current org is entitled (see {@link visibleNavSections}
 * / {@link visibleDestinations}); hiding is presentation only — the page itself
 * re-checks the entitlement server-side.
 */
type AdminDestinationFeature = { feature?: FeatureId }

export interface AdminDestination extends AdminDestinationFeature {
  id: string
  title: string
  keywords: string[]
  /** A page (`/admin/tickets`) or a deep anchor (`/admin/settings#schedule`). */
  href: string
  group: string
  kind: AdminDestinationKind
  icon?: AdminDestinationIcon
}

interface AdminNavEntry extends NavigationItem, AdminDestinationFeature {
  keywords: string[]
}

export interface AdminNavSection {
  label: string
  items: AdminNavEntry[]
}

/** Sidebar navigation for the admin dashboard (rendered by AdminLayout). */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    label: 'Core',
    items: [
      {
        name: 'Dashboard',
        href: '/admin',
        icon: HomeIcon,
        keywords: ['home', 'overview', 'start'],
      },
      {
        name: 'Proposals',
        href: '/admin/proposals',
        icon: DocumentTextIcon,
        keywords: ['cfp', 'submissions', 'talks', 'review'],
      },
      {
        name: 'Schedule',
        href: '/admin/schedule',
        icon: CalendarDaysIcon,
        keywords: ['agenda', 'program', 'timeline', 'tracks'],
      },
      {
        name: 'Messages',
        href: '/admin/messages',
        icon: EnvelopeIcon,
        keywords: ['inbox', 'conversations', 'threads', 'broadcast'],
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        name: 'Speakers',
        href: '/admin/speakers',
        icon: UsersIcon,
        keywords: ['presenters', 'people', 'profiles'],
      },
      {
        name: 'Staff',
        href: '/admin/staff',
        icon: IdentificationIcon,
        keywords: ['team', 'organizers', 'crew'],
      },
      {
        name: 'Volunteers',
        href: '/admin/volunteers',
        icon: UserGroupIcon,
        keywords: ['helpers', 'crew', 'shifts'],
      },
      {
        name: 'Workshops',
        href: '/admin/workshops',
        icon: AcademicCapIcon,
        keywords: ['training', 'sessions', 'capacity', 'signups'],
        feature: 'workshops',
      },
    ],
  },
  {
    label: 'Events & Content',
    items: [
      {
        name: 'Tickets',
        href: '/admin/tickets',
        icon: TicketIcon,
        keywords: ['sales', 'registration', 'attendees', 'checkin'],
      },
      {
        name: 'Sponsors',
        href: '/admin/sponsors',
        icon: BuildingOfficeIcon,
        keywords: ['partners', 'companies', 'sponsorship'],
      },
      {
        name: 'Marketing',
        href: '/admin/marketing',
        icon: PresentationChartBarIcon,
        keywords: ['content', 'promotion', 'campaigns'],
      },
      {
        name: 'Budget',
        href: '/admin/budget',
        icon: BanknotesIcon,
        keywords: [
          'finances',
          'money',
          'expenses',
          'income',
          'scenarios',
          'margin',
          'actuals',
        ],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        name: 'Settings',
        href: '/admin/settings',
        icon: Cog6ToothIcon,
        keywords: ['configuration', 'config', 'conference'],
      },
    ],
  },
]

/** Admin pages reachable only from within a section (no sidebar entry). */
const ADMIN_SUB_PAGES: Omit<AdminDestination, 'kind'>[] = [
  {
    // Moved out of the sidebar (the nav had grown tall enough to scroll);
    // reachable from the Settings page and still ⌘K-searchable here.
    id: 'agents',
    title: 'Agents',
    href: '/admin/agents',
    group: 'System',
    keywords: ['ai', 'automation', 'bots', 'agents'],
    icon: CpuChipIcon,
  },
  {
    id: 'budget-config',
    title: 'Budget Configuration',
    href: '/admin/budget/config',
    group: 'Events & Content',
    keywords: [
      'budget config',
      'vat',
      'rates',
      'ticketing fee',
      'scenarios',
      'dinner',
      'assumptions',
    ],
    icon: BanknotesIcon,
  },
  {
    id: 'speakers-badge',
    title: 'Speaker Badges',
    href: '/admin/speakers/badge',
    group: 'People',
    keywords: ['badge', 'badges', 'print', 'qr'],
    icon: IdentificationIcon,
  },
  {
    id: 'speakers-travel-support',
    title: 'Travel Support',
    href: '/admin/speakers/travel-support',
    group: 'People',
    keywords: ['travel', 'funding', 'reimbursement', 'expenses'],
    icon: HeartIcon,
  },
  {
    id: 'tickets-orders',
    title: 'Ticket Orders',
    href: '/admin/tickets/orders',
    group: 'Events & Content',
    keywords: ['orders', 'purchases', 'attendees', 'sales'],
    icon: TicketIcon,
  },
  {
    id: 'tickets-types',
    title: 'Ticket Types',
    href: '/admin/tickets/types',
    group: 'Events & Content',
    keywords: ['types', 'categories', 'pricing'],
    icon: TicketIcon,
  },
  {
    id: 'tickets-discount',
    title: 'Discount Codes',
    href: '/admin/tickets/discount',
    group: 'Events & Content',
    keywords: ['discount', 'codes', 'coupons', 'promo', 'voucher'],
    icon: BanknotesIcon,
  },
  {
    id: 'tickets-companies',
    title: 'Company Breakdown',
    href: '/admin/tickets/companies',
    group: 'Events & Content',
    keywords: ['companies', 'organizations', 'breakdown'],
    icon: BuildingOfficeIcon,
  },
  {
    id: 'tickets-content',
    title: 'Tickets Page Content',
    href: '/admin/tickets/content',
    group: 'Events & Content',
    keywords: ['content', 'copy', 'faq', 'public page'],
    icon: DocumentTextIcon,
  },
  {
    id: 'sponsors-crm',
    title: 'Sponsor CRM',
    href: '/admin/sponsors/crm',
    group: 'Events & Content',
    keywords: ['crm', 'pipeline', 'leads', 'deals', 'prospects'],
    icon: BuildingOfficeIcon,
  },
  {
    id: 'sponsors-contacts',
    title: 'Sponsor Contacts',
    href: '/admin/sponsors/contacts',
    group: 'Events & Content',
    keywords: ['contacts', 'people', 'email'],
    icon: UsersIcon,
  },
  {
    id: 'sponsors-contracts',
    title: 'Sponsor Contracts',
    href: '/admin/sponsors/contracts',
    group: 'Events & Content',
    keywords: ['contracts', 'agreements', 'signing', 'invoices'],
    icon: ClipboardDocumentListIcon,
  },
  {
    id: 'sponsors-activity',
    title: 'Sponsor Activity Log',
    href: '/admin/sponsors/activity',
    group: 'Events & Content',
    keywords: ['activity', 'audit', 'log', 'history'],
    icon: ClipboardDocumentListIcon,
  },
  {
    id: 'sponsors-tiers',
    title: 'Sponsor Tiers',
    href: '/admin/sponsors/tiers',
    group: 'Events & Content',
    keywords: ['tiers', 'levels', 'packages', 'pricing'],
    icon: BanknotesIcon,
  },
  {
    id: 'sponsors-templates',
    title: 'Sponsor Email Templates',
    href: '/admin/sponsors/templates',
    group: 'Events & Content',
    keywords: ['templates', 'emails', 'outreach'],
    icon: EnvelopeIcon,
  },
  {
    id: 'marketing-gallery',
    title: 'Gallery',
    href: '/admin/marketing/gallery',
    group: 'Events & Content',
    keywords: ['gallery', 'photos', 'images', 'media'],
    icon: PhotoIcon,
  },
  {
    id: 'marketing-featured',
    title: 'Featured Content',
    href: '/admin/marketing/featured',
    group: 'Events & Content',
    keywords: ['featured', 'highlights', 'homepage'],
    icon: PresentationChartBarIcon,
  },
]

/**
 * Search synonyms for the Settings sections, keyed by group id, covering the
 * cards each section contains (card membership lives in the settings page JSX).
 */
const SETTINGS_GROUP_KEYWORDS: Record<string, string[]> = {
  'identity-brand': [
    'name',
    'tagline',
    'organizer',
    'logo',
    'logos',
    'branding',
    'colors',
    'colours',
    'theme',
    'city',
    'country',
    'venue',
    'visibility',
    'unlisted',
  ],
  schedule: [
    'dates',
    'deadlines',
    'timeline',
    'cfp dates',
    'announcement',
    'key dates',
  ],
  'call-for-papers': ['cfp', 'goals', 'targets', 'submissions', 'revenue'],
  'tickets-registration': [
    'registration',
    'ticketing',
    'provider',
    'tito',
    'checkin',
    'check-in',
    'capacity',
    'workshop signups',
    'homepage stats',
  ],
  sponsors: [
    'sponsorship',
    'tiers',
    'benefits',
    'packages',
    'prospectus',
    'partners',
  ],
  'team-content': [
    'organizers',
    'teams',
    'contact',
    'slack',
    'domains',
    'social links',
    'topics',
    'formats',
    'homepage',
    'composition',
  ],
}

const SETTINGS_TIER_KEYWORDS: Record<string, string[]> = {
  'system-status': [
    'health',
    'integrations',
    'environment',
    'build',
    'version',
    'status',
  ],
  'self-check': ['diagnostics', 'probes', 'validation', 'checks', 'doctor'],
}

const SETTINGS_TIER_ICONS: Record<string, AdminDestinationIcon> = {
  'system-status': SignalIcon,
  'self-check': ShieldCheckIcon,
}

/** Per-card deep-link anchors on the settings page (beyond the group anchors). */
const SETTINGS_CARD_ANCHORS: {
  id: string
  title: string
  keywords: string[]
  icon: AdminDestinationIcon
}[] = [
  {
    id: 'visibility',
    title: 'Visibility',
    keywords: ['unlisted', 'listed', 'live', 'public', 'indexing', 'robots'],
    icon: EyeIcon,
  },
]

function pageIdFromHref(href: string): string {
  return href === '/admin'
    ? 'dashboard'
    : href.replace(/^\/admin\//, '').replace(/\//g, '-')
}

export const ADMIN_DESTINATIONS: AdminDestination[] = [
  ...ADMIN_NAV_SECTIONS.flatMap((section) =>
    section.items.map((item): AdminDestination => ({
      id: pageIdFromHref(item.href),
      title: item.name,
      keywords: item.keywords,
      href: item.href,
      group: section.label,
      kind: 'page',
      icon: item.icon,
      ...(item.feature ? { feature: item.feature } : {}),
    })),
  ),
  ...ADMIN_SUB_PAGES.map((page): AdminDestination => ({
    ...page,
    kind: 'page',
  })),
  ...SETTINGS_GROUPS.map((group): AdminDestination => ({
    id: `settings-${group.id}`,
    title: group.title,
    keywords: SETTINGS_GROUP_KEYWORDS[group.id] ?? [],
    href: `/admin/settings#${group.id}`,
    group: 'Settings',
    kind: 'setting',
    icon: Cog6ToothIcon,
  })),
  ...SETTINGS_TIERS.filter((tier) => tier.id !== 'configuration').map(
    (tier): AdminDestination => ({
      id: `settings-${tier.id}`,
      title: tier.navLabel,
      keywords: SETTINGS_TIER_KEYWORDS[tier.id] ?? [],
      href: `/admin/settings#${tier.id}`,
      group: 'Settings',
      kind: 'setting',
      icon: SETTINGS_TIER_ICONS[tier.id] ?? Cog6ToothIcon,
    }),
  ),
  ...SETTINGS_CARD_ANCHORS.map((card): AdminDestination => ({
    id: `settings-${card.id}`,
    title: card.title,
    keywords: card.keywords,
    href: `/admin/settings#${card.id}`,
    group: 'Settings',
    kind: 'setting',
    icon: card.icon,
  })),
]

/**
 * Whether a feature-tagged entry is visible to an org with `enabledFeatures`.
 * Untagged entries are always visible; a tagged one requires the entitlement,
 * so an empty/omitted set hides every gated destination (fail-closed).
 */
function isFeatureVisible(
  entry: AdminDestinationFeature,
  enabledFeatures: readonly FeatureId[],
): boolean {
  return !entry.feature || enabledFeatures.includes(entry.feature)
}

/**
 * The sidebar sections an org with `enabledFeatures` may see — feature-gated
 * items are dropped, and a section left with no items disappears entirely.
 */
export function visibleNavSections(
  enabledFeatures: readonly FeatureId[],
  sections: readonly AdminNavSection[] = ADMIN_NAV_SECTIONS,
): AdminNavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        isFeatureVisible(item, enabledFeatures),
      ),
    }))
    .filter((section) => section.items.length > 0)
}

/** The ⌘K destinations an org with `enabledFeatures` may see. */
export function visibleDestinations(
  enabledFeatures: readonly FeatureId[],
  destinations: readonly AdminDestination[] = ADMIN_DESTINATIONS,
): AdminDestination[] {
  return destinations.filter((destination) =>
    isFeatureVisible(destination, enabledFeatures),
  )
}

export interface AdminDestinationGroup {
  group: string
  items: AdminDestination[]
}

const WORD_SPLIT = /[\s/&-]+/

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const char of haystack) {
    if (char === needle[i]) i++
    if (i === needle.length) return true
  }
  return i === needle.length
}

function scoreText(text: string, query: string): number {
  const t = text.toLowerCase()
  if (t === query) return 100
  if (t.startsWith(query)) return 90
  if (t.split(WORD_SPLIT).some((word) => word.startsWith(query))) return 80
  if (t.includes(query)) return 70
  if (query.length >= 3 && isSubsequence(query, t)) return 40
  return 0
}

/**
 * Simple prefix/substring/subsequence score over title + keywords.
 * 0 means no match; keyword matches rank slightly below title matches.
 */
export function scoreDestination(
  destination: AdminDestination,
  query: string,
): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const titleScore = scoreText(destination.title, q)
  let keywordScore = 0
  for (const keyword of destination.keywords) {
    keywordScore = Math.max(keywordScore, scoreText(keyword, q))
  }
  return Math.max(titleScore, keywordScore > 0 ? keywordScore - 15 : 0)
}

/**
 * Rank destinations for a palette query and group them by `group` (groups
 * ordered by their best-scoring hit). An empty query returns every destination
 * in registry order — the palette's browse mode.
 */
export function searchDestinations(
  query: string,
  destinations: readonly AdminDestination[] = ADMIN_DESTINATIONS,
): AdminDestinationGroup[] {
  const q = query.trim().toLowerCase()
  const matches = !q
    ? [...destinations]
    : destinations
        .map((destination, index) => ({
          destination,
          index,
          score: scoreDestination(destination, q),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.destination)

  const grouped = new Map<string, AdminDestination[]>()
  for (const destination of matches) {
    const items = grouped.get(destination.group)
    if (items) {
      items.push(destination)
    } else {
      grouped.set(destination.group, [destination])
    }
  }
  return [...grouped.entries()].map(([group, items]) => ({ group, items }))
}
