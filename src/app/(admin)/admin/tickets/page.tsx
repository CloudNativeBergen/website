import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
  type TicketingAdminAccess,
} from '@/lib/tickets/admin-access'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput, EventTicket } from '@/lib/tickets/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { Conference } from '@/lib/conference/types'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketAnalysisClient,
  TicketingStateNotice,
} from '@/components/admin'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import {
  FreeTicketAllocationTable,
  CategoryBreakdownTable,
  SponsorAllocationTable,
} from './TicketBreakdownTables'
import {
  TicketIcon,
  ShoppingBagIcon,
  CreditCardIcon,
  DocumentTextIcon,
  EnvelopeOpenIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline'

import { DEFAULT_TARGET_CONFIG } from '@/lib/tickets/config'
import {
  calculateCategoryStats,
  calculateSponsorTickets,
  calculateFreeTicketAllocation,
  calculateTicketStatistics,
} from '@/lib/tickets/utils'
import { tallyParticipants } from '@/lib/tickets/participants'
import type { TicketClassificationContext } from '@/lib/tickets/classification'
import { resolveSpeakerTicketType } from '@/lib/tickets/speakerStatus'
import { parseTicketAmount } from '@/lib/tickets/amount'
import { getSpeakers, getOrganizerCount } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'

async function getTicketData(
  access: Extract<TicketingAdminAccess, { state: 'ready' }>,
) {
  try {
    return await access.provider.fetchEventTickets(access.eventRef)
  } catch (error) {
    throw new Error(`Unable to fetch tickets: ${(error as Error).message}`)
  }
}

async function processTicketAnalysis(
  tickets: EventTicket[],
  conference: Conference,
  speakerCount: number,
) {
  const targetConfig = conference.ticketTargets || DEFAULT_TARGET_CONFIG
  // 0 = never configured, and it stays 0: see `config.ts`. Everything
  // downstream must treat it as "unknown", not divide by it.
  const capacity = conference.ticketCapacity ?? 0

  if (tickets.length === 0) return null

  try {
    const input: ProcessTicketSalesInput = {
      tickets: tickets.map((t) => ({
        order_id: t.order_id,
        order_date: t.order_date,
        category: t.category,
        sum: t.sum,
      })),
      config: targetConfig,
      capacity,
      conference,
      conferenceDate:
        conference.startDate ||
        conference.programDate ||
        new Date().toISOString(),
      speakerCount,
    }

    const processor = new TicketSalesProcessor(input)
    return processor.process()
  } catch (error) {
    console.error('Failed to process ticket analysis:', error)
    return null
  }
}

/**
 * The inputs `classifyTicket` needs, or `null` when the event's discount list
 * could not be read.
 *
 * `null` is the honest answer, not an empty list: without the codes a redeemed
 * ticket's worth is unknown, and the participant count is presented as
 * unverified (see `tallyParticipants`). It must never fall back to the old
 * price split. Only Checkin exposes discounts — `listDiscounts` is keyed on a
 * numeric Checkin event id and Tito unsupported-errors on it, exactly as
 * `/admin/tickets/discount` already treats it.
 */
async function buildClassificationContext(
  access: Extract<TicketingAdminAccess, { state: 'ready' }>,
  conference: Conference,
): Promise<TicketClassificationContext | null> {
  if (access.eventRef.provider === 'tito') return null

  let discounts
  try {
    ;({ discounts } = await access.provider.listDiscounts(
      access.eventRef.eventId,
    ))
  } catch (err) {
    console.error('Unable to read discount codes for ticket counting:', err)
    return null
  }

  // A failed type lookup only costs us the DERIVED speaker type name;
  // `classifyTicket` still matches the historical literal, so it is not a
  // reason to call the whole classification unavailable.
  const speakerTicketTypeName = await resolveSpeakerTicketType(
    { configured: true, provider: access.provider, eventRef: access.eventRef },
    conference.organization?._ref,
  )
    .then((type) => type?.name)
    .catch(() => undefined)

  return {
    discounts,
    sponsorNames: conference.sponsors?.map((s) => s.sponsor.name) ?? [],
    speakerTicketTypeName,
    ticketTypeRoles: conference.ticketTypeRoles,
  }
}

export default async function AdminTickets() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
    })

  // A failed conference read is the ONLY error case here. "Not bound to an
  // event" and "no ticketing integration" are states, not errors — see
  // `resolveTicketingAdminAccess`.
  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  const access = await resolveTicketingAdminAccess(conference)
  if (access.state !== 'ready') {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<TicketIcon />}
          title="Ticket Management"
          description="Manage sold tickets and attendee information for"
          contextHighlight={conference.title}
          actionItems={[
            {
              label: 'Page Content',
              href: '/admin/tickets/content',
              icon: <DocumentTextIcon className="h-4 w-4" />,
            },
          ]}
        />
        <TicketingStateNotice
          state={access.state}
          providerLabel={ticketingProviderLabel(access.providerType)}
          surface="ticket sales"
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
        title="Failed to Load Ticket Data"
        message={error}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  const paidTickets = allTickets.filter((t) => parseTicketAmount(t.sum) > 0)
  const freeTickets = allTickets.filter((t) => parseTicketAmount(t.sum) === 0)

  // ONE dedup over ALL tickets. Deduping paid and free separately and adding
  // the two counts double-counted everyone holding both a comp and a purchase.
  const participantTally = tallyParticipants(
    allTickets,
    await buildClassificationContext(access, conference),
  )

  const { speakers: confirmedSpeakers } = await getSpeakers(
    conference._id,
    [Status.confirmed],
    false,
  )
  const { count: organizerCount } = await getOrganizerCount(conference._id)

  const paidOnlyAnalysis = await processTicketAnalysis(
    paidTickets,
    conference,
    confirmedSpeakers.length,
  )
  const allTicketsAnalysis = await processTicketAnalysis(
    allTickets,
    conference,
    confirmedSpeakers.length,
  )

  const basicStats = calculateTicketStatistics(paidTickets)
  const statistics = paidOnlyAnalysis?.statistics || {
    ...basicStats,
    categoryBreakdown: {},
    sponsorTickets: 0,
    speakerTickets: 0,
  }

  const categoryStats = calculateCategoryStats(
    paidTickets,
    statistics.totalPaidTickets,
  )
  const sponsorTicketsByTier = calculateSponsorTickets(conference)

  const freeTicketAllocation = calculateFreeTicketAllocation(
    conference,
    confirmedSpeakers.length,
    organizerCount,
    freeTickets,
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Ticket Management"
        description="Manage sold tickets and attendee information for"
        contextHighlight={conference.title}
        actionItems={[
          {
            label: 'Page Content',
            href: '/admin/tickets/content',
            icon: <DocumentTextIcon className="h-4 w-4" />,
          },
          {
            label: 'Ticket Types',
            href: '/admin/tickets/types',
            icon: <QueueListIcon className="h-4 w-4" />,
          },
          {
            label: 'Orders',
            href: '/admin/tickets/orders',
            icon: <ShoppingBagIcon className="h-4 w-4" />,
          },
          {
            label: 'Discounts',
            href: '/admin/tickets/discount',
            icon: <CreditCardIcon className="h-4 w-4" />,
          },
          {
            label: 'Invitation Letters',
            href: '/admin/invitations',
            icon: <EnvelopeOpenIcon className="h-4 w-4" />,
          },
        ]}
      />

      <TicketAnalysisClient
        ticketData={{
          allTickets,
          paidTickets,
          freeTickets,
        }}
        participantTally={participantTally}
        conference={{
          _id: conference._id,
          ticketCapacity: conference.ticketCapacity,
          ticketTargets: conference.ticketTargets,
        }}
        analysisData={{
          paidAnalysis: paidOnlyAnalysis,
          allTicketsAnalysis,
        }}
        freeTicketAllocation={freeTicketAllocation}
        defaultTargetConfig={DEFAULT_TARGET_CONFIG}
        chartFallback={
          categoryStats.length > 0 ? (
            <CategoryBreakdownTable stats={categoryStats} />
          ) : undefined
        }
      />

      <div>
        <CollapsibleSection
          title="Free Ticket Allocation & Usage"
          defaultOpen={true}
        >
          <FreeTicketAllocationTable allocation={freeTicketAllocation} />
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>Note:</strong> Free tickets are allocated to sponsors from
              each tier&apos;s complimentary ticket count, one per confirmed
              speaker, and one per organizer. The &quot;claimed&quot; count
              shows how many free tickets have been registered in the system.
              Set a tier&apos;s allowance under Sponsor Tiers; a tier with none
              contributes nothing here.
            </p>
          </div>
        </CollapsibleSection>
      </div>

      {categoryStats.length > 0 && (
        <div>
          <CollapsibleSection
            title="Breakdown by Ticket Type"
            defaultOpen={false}
          >
            <CategoryBreakdownTable stats={categoryStats} />
          </CollapsibleSection>
        </div>
      )}

      {/* Sponsor Tickets Breakdown */}
      {statistics.sponsorTickets > 0 && (
        <div>
          <CollapsibleSection
            title="Sponsor Ticket Allocations"
            defaultOpen={false}
          >
            <SponsorAllocationTable
              tierData={sponsorTicketsByTier}
              totalSponsorTickets={statistics.sponsorTickets}
            />
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <strong>Note:</strong> Sponsor tickets are allocated through
                sponsorship agreements. Pod sponsors receive 2 tickets, Service
                sponsors receive 3 tickets, and Ingress sponsors receive 5
                tickets each. Speaker tickets are allocated one per confirmed
                speaker.
              </p>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
