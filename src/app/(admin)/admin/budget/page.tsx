import {
  deriveManualTicketIncome,
  deriveSponsorIncome,
  deriveTicketIncome,
  getBudgetForConference,
  type TicketIncomeActuals,
} from '@/lib/budget'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import { resolveTicketingAdminAccess } from '@/lib/tickets/admin-access'
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
  // `conference`, so it runs in parallel with the Sanity reads. It goes through
  // `resolveTicketingAdminAccess` rather than the provider directly so an
  // operator's explicit ticketing DENY reaches this surface too: a kill switch
  // that leaves live ticket revenue on the budget page is only half a switch.
  // Everything short of `ready` falls back to the manually-entered actuals,
  // exactly as an unconfigured provider always has.
  const fetchLiveTicketIncome =
    async (): Promise<TicketIncomeActuals | null> => {
      const access = await resolveTicketingAdminAccess(conference)
      if (access.state !== 'ready') return null
      try {
        const tickets = await access.provider.fetchEventTickets(access.eventRef)
        return deriveTicketIncome(tickets)
      } catch (error) {
        // Soft-fail to the manual fallback: a provider outage must not take
        // down the budget page.
        console.error('Budget: failed to fetch live ticket sales', error)
        return null
      }
    }

  // The budget read soft-fails like the sponsor/ticket reads: a transient
  // Sanity failure must render a controlled "unavailable" state, not the
  // framework error boundary. It is kept DISTINCT from the "no budget yet"
  // empty state (budget === null) — a transient failure must never offer
  // "Create budget".
  const [budgetResult, sponsorsResult, liveTicketIncome] = await Promise.all([
    getBudgetForConference(conference._id).then(
      (budget) => ({ budget, error: null as Error | null }),
      (error: unknown) => ({ budget: null, error: error as Error }),
    ),
    listSponsorsForConference(conference._id),
    fetchLiveTicketIncome(),
  ])

  if (budgetResult.error) {
    console.error('Budget: failed to load budget document', budgetResult.error)
    return (
      <ErrorDisplay
        title="Budget Unavailable"
        message="The budget could not be loaded right now. This is usually transient — reload the page to try again."
      />
    )
  }
  const budget = budgetResult.budget

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
