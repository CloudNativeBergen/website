import {
  deriveManualTicketIncome,
  deriveSponsorIncome,
  deriveTicketIncome,
  getBudgetForConference,
  type TicketIncomeActuals,
} from '@/lib/budget'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { BudgetPageClient, ErrorDisplay } from '@/components/admin'

/**
 * Admin budget page (budget module M1).
 *
 * Org-scoped like every admin page: access is gated by the (admin) layout,
 * and ALL data is resolved from the domain-derived conference. The income
 * side is read-only derivation over data the platform already holds:
 * - sponsor income live from the CRM pipeline (closed-won deals),
 * - ticket income live from the ticketing provider (order-sum dedupe),
 *   falling back to manually-entered actual counts on the budget's ticket
 *   types when no provider is configured.
 */
export default async function AdminBudgetPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError?.message ?? 'No conference found'}
      />
    )
  }

  // The live-ticket fetch (secret store + external provider API) only needs
  // `conference`, so it runs in parallel with the Sanity reads.
  const fetchLiveTicketIncome =
    async (): Promise<TicketIncomeActuals | null> => {
      const ticketing = await resolveTicketingProvider(conference)
      if (!ticketing.configured) return null
      try {
        const tickets = await ticketing.provider.fetchEventTickets(
          ticketing.eventRef,
        )
        return deriveTicketIncome(tickets)
      } catch (error) {
        // Soft-fail to the manual fallback: a provider outage must not take
        // down the budget page.
        console.error('Budget: failed to fetch live ticket sales', error)
        return null
      }
    }

  const [budget, sponsorsResult, liveTicketIncome] = await Promise.all([
    getBudgetForConference(conference._id),
    listSponsorsForConference(conference._id),
    fetchLiveTicketIncome(),
  ])

  // A failed sponsor read must surface as "unavailable", not as 0 signed
  // revenue - fabricated zeros on a budget page mislead.
  const sponsorIncome = sponsorsResult.error
    ? null
    : deriveSponsorIncome(sponsorsResult.sponsors ?? [])
  if (sponsorsResult.error) {
    console.error(
      'Budget: failed to load sponsor pipeline',
      sponsorsResult.error,
    )
  }

  let ticketIncome = liveTicketIncome
  if (!ticketIncome && budget) {
    const manual = deriveManualTicketIncome(
      budget.ticketTypes ?? [],
      budget.vatRate,
    )
    ticketIncome = manual.ticketCount > 0 ? manual : null
  }

  return (
    <BudgetPageClient
      budget={budget}
      sponsorIncome={sponsorIncome}
      ticketIncome={ticketIncome}
    />
  )
}
