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

  const budget = await getBudgetForConference(conference._id).catch(() => null)

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
