import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { buildTicketSummary } from '@/lib/tickets/summary'
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

/**
 * THIS PAGE RENDERS. IT DOES NOT COMPUTE.
 *
 * Every figure below comes from `buildTicketSummary` — the same function
 * `tickets.admin.summary` serves, called directly rather than through a
 * server-side tRPC caller so there is demonstrably ONE implementation and no
 * fabricated request context in a Server Component. Do not reintroduce a
 * calculation here: `page.test.tsx` asserts the rendered values against the
 * summary's own, and the six PRs that unified `isPaidTicket` are what a second
 * copy costs.
 */
export default async function AdminTickets() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      sponsors: true,
    })

  // A failed conference read is the ONLY error case the summary cannot speak
  // for — without a conference there is nothing to summarise. "Not bound to an
  // event" and "no ticketing integration" are states, not errors; the summary
  // carries them (see `resolveTicketingAdminAccess`).
  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  const summary = await buildTicketSummary(conference)

  const header = (
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
        ...(summary.state === 'ready'
          ? [
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
            ]
          : []),
      ]}
    />
  )

  if (summary.state === 'error') {
    return (
      <ErrorDisplay
        title="Failed to Load Ticket Data"
        message={summary.message}
        backLink={{ href: '/admin', label: 'Back to Admin Dashboard' }}
      />
    )
  }

  if (summary.state !== 'ready') {
    return (
      <div className="space-y-6">
        {header}
        <TicketingStateNotice
          state={summary.state}
          providerLabel={summary.providerLabel}
          surface="ticket sales"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <TicketAnalysisClient
        ticketCounts={summary.ticketCounts}
        participantTally={summary.participants}
        conference={{
          _id: conference._id,
          ticketCapacity: conference.ticketCapacity,
          ticketTargets: conference.ticketTargets,
        }}
        analysisData={{
          paidAnalysis: summary.analysis.paid,
          allTicketsAnalysis: summary.analysis.all,
        }}
        freeTicketAllocation={summary.freeTicketAllocation}
        defaultTargetConfig={DEFAULT_TARGET_CONFIG}
        // The Revenue card says which basis it shows (Checkin ex VAT, Tito
        // tax-inclusive) instead of leaving the reader to assume one.
        amountsIncludeVat={summary.amountsIncludeVat}
        chartFallback={
          summary.categoryStats.length > 0 ? (
            <CategoryBreakdownTable stats={summary.categoryStats} />
          ) : undefined
        }
      />

      {/* `CollapsibleSection` gives its body no padding — every other caller
          pads it to the `px-6` the header uses. Without it the tables ran to
          the card edge and sat ~8px left of the section title, and the notes
          sat further left again and flush against the card's bottom edge. */}
      <CollapsibleSection
        title="Free Ticket Allocation & Usage"
        defaultOpen={true}
      >
        <div className="px-6 py-4">
          <FreeTicketAllocationTable
            allocation={summary.freeTicketAllocation}
            providerLabel={summary.providerLabel}
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
        </div>
      </CollapsibleSection>

      {summary.categoryStats.length > 0 && (
        <CollapsibleSection
          title="Breakdown by Ticket Type"
          defaultOpen={false}
        >
          <div className="px-6 py-4">
            <CategoryBreakdownTable stats={summary.categoryStats} />
          </div>
        </CollapsibleSection>
      )}

      {/* Sponsor Tickets Breakdown. Gated on ALLOCATIONS, not redemptions: a
          conference that has signed sponsors but not opened sales used to be
          told it had no sponsor allocations at all. */}
      {summary.sponsorAllocationTotal > 0 && (
        <CollapsibleSection
          title="Sponsor Ticket Allocations"
          defaultOpen={false}
        >
          <div className="px-6 py-4">
            {/* The percentage column is each tier's share of the ALLOCATED
                sponsor tickets — the number this table is about. It used to
                divide by the sponsor tickets sales analysis had recognised,
                so every bar read 0% before the first redemption. */}
            <SponsorAllocationTable
              tierData={summary.sponsorTicketsByTier}
              totalSponsorTickets={summary.sponsorAllocationTotal}
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
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
