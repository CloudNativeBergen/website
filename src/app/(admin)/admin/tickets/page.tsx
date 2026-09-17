import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
  type TicketingAdminAccess,
} from '@/lib/tickets/admin-access'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type {
  ProcessTicketSalesInput,
  EventTicket,
  TicketAnalysisOutcome,
} from '@/lib/tickets/types'
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
  calculateTicketStatistics,
} from '@/lib/tickets/utils'
import {
  calculateFreeTicketAllocation,
  countOrUnknown,
} from '@/lib/tickets/freeAllocation'
import { tallyParticipants } from '@/lib/tickets/participants'
import { buildClassificationContext } from '@/lib/tickets/classificationContext'
import {
  joinSpeakerTicketStatus,
  redeemedSpeakerEmails,
  toTicketCandidates,
  SPEAKER_TICKET_CATEGORY,
} from '@/lib/tickets/speakerStatus'
import { fetchSpeakerTicketInputs } from '@/lib/speaker/ticketInputs'
import { calculateDiscountUsage } from '@/lib/discounts'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'
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

/**
 * Runs the sales analysis and says which of the three things happened. A thrown
 * analysis comes back as `unavailable` and is rendered as a failure — it is NOT
 * flattened into the same `null` that means "no tickets", because the client
 * substitutes a zeroed analysis for `null` and would present the failure as a
 * confident 0% on track. See `TicketAnalysisOutcome`.
 */
async function processTicketAnalysis(
  tickets: EventTicket[],
  conference: Conference,
  speakerCount: number,
): Promise<TicketAnalysisOutcome> {
  const targetConfig = conference.ticketTargets || DEFAULT_TARGET_CONFIG
  // 0 = never configured, and it stays 0: see `config.ts`. Everything
  // downstream must treat it as "unknown", not divide by it.
  const capacity = conference.ticketCapacity ?? 0

  if (tickets.length === 0) return { status: 'empty' }

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
    return { status: 'ok', analysis: processor.process() }
  } catch (error) {
    console.error('Failed to process ticket analysis:', error)
    return { status: 'unavailable', error: (error as Error).message }
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

  const classification = await buildClassificationContext(access, conference)

  // ONE dedup over ALL tickets. Deduping paid and free separately and adding
  // the two counts double-counted everyone holding both a comp and a purchase.
  const participantTally = tallyParticipants(allTickets, classification)

  const { speakers: confirmedSpeakers, err: speakersErr } = await getSpeakers(
    conference._id,
    [Status.confirmed],
    false,
  )
  const { count: organizerCount, err: organizerErr } = await getOrganizerCount(
    conference._id,
  )

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
  const statistics =
    paidOnlyAnalysis.status === 'ok'
      ? paidOnlyAnalysis.analysis.statistics
      : {
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

  // Each free-ticket category is claimed in a DIFFERENT way, so each one is
  // counted from its own source — see `lib/tickets/freeAllocation`.
  //
  // Sponsors: redemptions of their 100%-off codes. Usage is reconstructed from
  // the tickets we already hold, so a code with no redemption gets a resolved
  // ZERO rather than falling through to the provider's own counter (the
  // `actualUsage` contract in `lib/discounts/types`).
  const discountUsage = calculateDiscountUsage(allTickets)
  const discountsWithUsage: EventDiscountWithUsage[] | null =
    classification.discounts?.map((discount) => ({
      ...discount,
      actualUsage: discount.triggerValue
        ? (discountUsage[discount.triggerValue.toUpperCase()] ?? {
            usageCount: 0,
            ticketIds: [],
            totalPaid: 0,
          })
        : undefined,
    })) ?? null

  // Speakers: the SAME derivation `/admin/speakers` uses. Without an identified
  // speaker ticket type there is no way to tell an unclaimed comp from a claim
  // filed under a category name we never learned, so claims stay unknown rather
  // than reading as "not claimed".
  const speakerTicketInputs = await fetchSpeakerTicketInputs(conference._id, [
    Status.confirmed,
  ])
  const redeemedEmails = classification.speakerTicketTypeName
    ? redeemedSpeakerEmails(toTicketCandidates(allTickets), [
        classification.speakerTicketTypeName,
        SPEAKER_TICKET_CATEGORY,
      ])
    : null
  const speakerStatuses = speakerTicketInputs
    ? joinSpeakerTicketStatus(speakerTicketInputs, redeemedEmails)
    : null

  const freeTicketAllocation = calculateFreeTicketAllocation({
    sponsors:
      conference.sponsors?.map((s) => ({
        name: s.sponsor.name,
        tier: s.tier,
      })) ?? [],
    discounts: discountsWithUsage,
    // A failed read answers 0 WITH an error; rendering that 0 as an allocation
    // would state a fact the server never obtained.
    speakerCount: countOrUnknown({
      count: confirmedSpeakers.length,
      err: speakersErr,
    }),
    speakerStatuses,
    organizerCount: countOrUnknown({
      count: organizerCount,
      err: organizerErr,
    }),
  })

  const sponsorAllocationTotal = Object.values(sponsorTicketsByTier).reduce(
    (total, tier) => total + tier.tickets,
    0,
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
        // Read off the ADAPTER, so the Revenue card says which basis it shows
        // (Checkin ex VAT, Tito tax-inclusive) instead of leaving the reader to
        // assume one.
        amountsIncludeVat={access.provider.amountsIncludeVat}
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
          <FreeTicketAllocationTable
            allocation={freeTicketAllocation}
            providerLabel={ticketingProviderLabel(access.providerType)}
          />
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>Note:</strong> Free tickets are allocated to sponsors from
              each tier&apos;s complimentary ticket count, one per confirmed
              speaker, and one per organizer. Set a tier&apos;s allowance under
              Sponsor Tiers; a tier with none contributes nothing here. Each
              category is claimed differently, so each is counted from its own
              source: sponsor comps are redemptions of a sponsor&apos;s 100%-off
              discount code, speaker comps are invitation-gated speaker tickets,
              and an organizer comp cannot be told apart from any other free
              ticket — so it is reported as unknown rather than as zero.
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

      {/* Sponsor Tickets Breakdown. Gated on ALLOCATIONS, not redemptions: a
          conference that has signed sponsors but not opened sales used to be
          told it had no sponsor allocations at all. */}
      {sponsorAllocationTotal > 0 && (
        <div>
          <CollapsibleSection
            title="Sponsor Ticket Allocations"
            defaultOpen={false}
          >
            {/* The percentage column is each tier's share of the ALLOCATED
                sponsor tickets — the number this table is about. It used to
                divide by the sponsor tickets sales analysis had recognised,
                so every bar read 0% before the first redemption. */}
            <SponsorAllocationTable
              tierData={sponsorTicketsByTier}
              totalSponsorTickets={sponsorAllocationTotal}
            />
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <strong>Note:</strong> Sponsor tickets are allocated through
                sponsorship agreements. The per-sponsor number comes from each
                tier&apos;s own complimentary ticket allowance, editable under
                Sponsor Tiers. Speaker tickets are allocated one per confirmed
                speaker.
              </p>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
