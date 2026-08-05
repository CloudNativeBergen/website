import { groupTicketsByOrder } from '@/lib/tickets/api'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
  type TicketingAdminAccess,
} from '@/lib/tickets/admin-access'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { EventTicket, GroupedOrder } from '@/lib/tickets/types'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketingStateNotice,
} from '@/components/admin'
import {
  BuildingOfficeIcon,
  TicketIcon,
  ShoppingBagIcon,
  HomeIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { EmptyState } from '@/components/EmptyState'
import { CompanyBreakdownTable } from './CompanyBreakdownTable'

/**
 * Fetches through the RESOLVED provider (Checkin or Tito). The "no credentials"
 * case is a STATE handled before this runs, not an empty ticket list — see
 * `resolveTicketingAdminAccess`.
 */
async function getTicketData(
  access: Extract<TicketingAdminAccess, { state: 'ready' }>,
): Promise<EventTicket[]> {
  try {
    return await access.provider.fetchEventTickets(access.eventRef)
  } catch (error) {
    throw new Error(
      `Failed to fetch event tickets: ${(error as Error).message}`,
    )
  }
}

function normalizeCompanyName(company: string): string {
  let normalized = company.toLowerCase().trim()

  // Remove common suffixes
  normalized = normalized
    .replace(/\s+as$/i, '')
    .replace(/\s+asa$/i, '')
    .replace(/\s+nuf$/i, '')
    .replace(/\s+eric$/i, '')
    .replace(/\s+gmbh$/i, '')

  // Remove common company type words
  normalized = normalized
    .replace(/\s+consulting$/i, '')
    .replace(/\s+services$/i, '')
    .replace(/\s+forsikring$/i, '')
    .replace(/\s+bank$/i, '')
    .replace(/\s+group$/i, '')
    .replace(/\s+solutions$/i, '')
    .replace(/\s+technologies$/i, '')
    .replace(/\s+labs$/i, '')
    .replace(/\s+academy$/i, '')
    .replace(/\s+web\s+services$/i, '')
    .replace(/\s+issuing$/i, '')
    .replace(/\s+card$/i, '')

  // Remove location names
  normalized = normalized
    .replace(/\s+bergen$/i, '')
    .replace(/\s+norge$/i, '')
    .replace(/\s+norway$/i, '')
    .replace(/\s+nordic$/i, '')

  // Specific company normalizations
  const companyMappings: Record<string, string> = {
    tietoevry: 'tietoevry',
    'tieto evry': 'tietoevry',
    trice: 'tietoevry',
    evry: 'tietoevry',
    dnb: 'dnb',
    'dnb carnegie': 'dnb',
    sparebanken: 'sparebanken',
    'sparebank 1 utvikling': 'sparebank 1',
    tryg: 'tryg',
    'helse vest ikt': 'helse vest ikt',
    'universitetet i': 'universitetet i bergen',
    'university of': 'universitetet i bergen',
    uib: 'universitetet i bergen',
    telenor: 'telenor',
    'tv 2': 'tv 2',
    tv2: 'tv 2',
    sonat: 'sonat',
    framo: 'framo',
    proact: 'proact',
    conoa: 'proact',
    vivicta: 'vivicta',
    frende: 'frende',
    stacc: 'stacc',
    sikri: 'sikri',
    'ks digital': 'ks digital',
    sidero: 'sidero labs',
    siderolabs: 'sidero labs',
    blinq: 'blinq',
    'redpill linpro': 'redpill linpro',
    kraftlauget: 'kraftlauget',
    enabler: 'enabler',
    aws: 'amazon web services',
    amazon: 'amazon web services',
    nav: 'nav',
    'nav it': 'nav',
    'nav teknolog': 'nav',
    'fjord line': 'fjord line',
    'tussa ikt': 'tussa ikt',
    islandgarden: 'islandgarden',
    kystverket: 'kystverket',
    help: 'help',
    'vipps mobilepay': 'vipps mobilepay',
    ulriken: 'ulriken',
    ambita: 'ambita',
    boligmappa: 'boligmappa',
    webstep: 'webstep',
    coresoft: 'coresoft',
    equinor: 'equinor',
    bouvet: 'bouvet',
    xait: 'xait',
    lettfrem: 'lettfrem',
    godver: 'godver',
    fourenergy: 'fourenergy',
    vimond: 'vimond',
    scaleaq: 'scaleaq',
    'scale aq': 'scaleaq',
    aiven: 'aiven',
    '42bits': '42bits',
    signicat: 'signicat',
    'statsforvalterens fellestjenester': 'statsforvalterens',
    'google cloud': 'google cloud',
    netsecurity: 'netsecurity',
    omegapoint: 'omegapoint',
    oda: 'oda',
    elkjøp: 'elkjøp',
    schibsted: 'schibsted',
    iverdi: 'iverdi',
    metria: 'metria',
    politiet: 'politiet',
    sikt: 'sikt',
    itslearning: 'itslearning',
    spir: 'spir',
    sysdig: 'sysdig',
    bekk: 'bekk',
    instech: 'instech',
    miles: 'miles',
    'sopra steria': 'sopra steria',
    dynatrace: 'dynatrace',
    nscale: 'nscale',
    rawkode: 'rawkode academy',
    'giant swarm': 'giant swarm',
    dash0: 'dash0',
    netbird: 'netbird',
    'nortech ai': 'nortech ai',
    authzed: 'authzed',
    edb: 'edb',
    grafana: 'grafana labs',
    victoriametrics: 'victoriametrics',
    fiskeridirektoratet: 'fiskeridirektoratet',
    forsvaret: 'forsvaret',
    cessda: 'cessda',
    embriq: 'embriq',
    folkehelseinstituttet: 'folkehelseinstituttet',
    'o s hansen': 'o s hansen',
    narhval: 'narhval',
    experis: 'experis',
    reflektion: 'reflektion',
    apparat: 'apparat',
    aidn: 'aidn',
    edgeworks: 'edgeworks',
    skatteetaten: 'skatteetaten',
  }

  // Try to match against known companies
  for (const [key, value] of Object.entries(companyMappings)) {
    if (normalized.includes(key)) {
      return value
    }
  }

  return normalized.trim()
}

interface CompanyBreakdown {
  originalName: string
  normalizedName: string
  attendeeCount: number
  orderCount: number
}

function generateCompanyBreakdown(orders: GroupedOrder[]): CompanyBreakdown[] {
  const companyMap = new Map<string, CompanyBreakdown>()

  orders.forEach((order) => {
    // Exclude orders with speaker tickets
    const hasSpeakerTicket = order.tickets.some((ticket) =>
      ticket.category.toLowerCase().includes('speaker'),
    )
    if (hasSpeakerTicket) {
      return
    }

    const companyField = order.fields.find((f) => f.key === 'company')
    if (companyField?.value) {
      const originalName = companyField.value
      const normalizedName = normalizeCompanyName(originalName)

      if (companyMap.has(normalizedName)) {
        const existing = companyMap.get(normalizedName)!
        existing.attendeeCount += order.totalTickets
        existing.orderCount += 1
      } else {
        companyMap.set(normalizedName, {
          originalName,
          normalizedName,
          attendeeCount: order.totalTickets,
          orderCount: 1,
        })
      }
    }
  })

  return Array.from(companyMap.values()).sort(
    (a, b) => b.attendeeCount - a.attendeeCount,
  )
}

export default async function CompaniesAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  const access = await resolveTicketingAdminAccess(conference)
  const providerLabel = ticketingProviderLabel(access.providerType)

  if (access.state !== 'ready') {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<BuildingOfficeIcon />}
          title="Company Breakdown"
          description="Overview of attending companies for"
          contextHighlight={conference.title}
          backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
        />
        <TicketingStateNotice
          state={access.state}
          providerLabel={providerLabel}
          surface="attending companies"
        />
      </div>
    )
  }

  let allTickets: EventTicket[] = []
  let error: string | null = null

  try {
    allTickets = await getTicketData(access)
  } catch (err) {
    error = (err as Error).message
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Data"
        message={`Unable to fetch tickets from ${providerLabel}: ${error}. Please check your API credentials and event configuration.`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  const orders = groupTicketsByOrder(allTickets)
  const companyBreakdown = generateCompanyBreakdown(orders)

  const totalAttendees = companyBreakdown.reduce(
    (sum, c) => sum + c.attendeeCount,
    0,
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<BuildingOfficeIcon />}
        title="Company Breakdown"
        description="Overview of attending companies for"
        contextHighlight={conference.title}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
        stats={[
          {
            label: 'Total Companies',
            value: companyBreakdown.length.toString(),
          },
          {
            label: 'Total Attendees',
            value: totalAttendees.toString(),
          },
          {
            label: 'Avg Per Company',
            value:
              companyBreakdown.length > 0
                ? Math.round(
                    totalAttendees / companyBreakdown.length,
                  ).toString()
                : '0',
          },
        ]}
      />

      <div>
        {companyBreakdown.length === 0 ? (
          <EmptyState
            icon={BuildingOfficeIcon}
            title="No companies found"
            description="No company information available in ticket orders."
            className="rounded-lg bg-white p-12 shadow dark:bg-gray-900"
          />
        ) : (
          <CompanyBreakdownTable
            companies={companyBreakdown}
            totalAttendees={totalAttendees}
          />
        )}
      </div>

      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/tickets/orders"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <ShoppingBagIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  View Orders
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  See all ticket orders
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/tickets"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <TicketIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Ticket Analytics
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  View sales performance
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <HomeIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Back to Dashboard
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Return to the main admin dashboard
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
