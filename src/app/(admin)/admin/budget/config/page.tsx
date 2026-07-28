import Link from 'next/link'

import { getBudgetForConference } from '@/lib/budget'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { BudgetConfigPageClient } from '@/components/admin/budget'

/**
 * Budget configuration sub-page (`/admin/budget/config`).
 *
 * Org-scoped like every admin page: access is gated by the (admin) layout and
 * the budget is resolved from the domain-derived conference. This page owns
 * the SCALAR globals (VAT / fee rates, dinner-participation model) and the
 * SCENARIOS editor — the complex, non-tabular config that does not belong in
 * the main page's inline spreadsheet tables.
 */
export default async function AdminBudgetConfigPage() {
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

  // Distinguish a transient read failure from a genuine "no budget yet" state,
  // matching /admin/budget/page.tsx: a Sanity outage must render a controlled
  // "unavailable" error (and log), never the "create one first" empty state.
  const { budget, error: budgetError } = await getBudgetForConference(
    conference._id,
  ).then(
    (budget) => ({ budget, error: null as Error | null }),
    (error: unknown) => ({ budget: null, error: error as Error }),
  )

  if (budgetError) {
    console.error('Budget config: failed to load budget document', budgetError)
    return (
      <ErrorDisplay
        title="Budget Unavailable"
        message="The budget could not be loaded right now. This is usually transient — reload the page to try again."
      />
    )
  }

  if (!budget) {
    return (
      <div className="space-y-4">
        <ErrorDisplay
          title="No budget to configure"
          message="This conference has no budget yet. Create one first, then configure its rates and scenarios."
        />
        <Link
          href="/admin/budget"
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Back to Budget
        </Link>
      </div>
    )
  }

  return <BudgetConfigPageClient budget={budget} />
}
