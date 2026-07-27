'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BanknotesIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

import {
  budgetDocumentToModel,
  computeScenario,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ConferenceBudgetDocument,
  type SponsorIncomeActuals,
  type TicketIncomeActuals,
} from '@/lib/budget'
import { formatCurrency } from '@/lib/format'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { useNotification } from '@/components/admin/NotificationProvider'
import { BudgetExpensesEditor } from './BudgetExpensesEditor'
import { BudgetSponsorAssumptionsEditor } from './BudgetSponsorAssumptionsEditor'
import { BudgetTicketTypesEditor } from './BudgetTicketTypesEditor'

export interface BudgetPageClientProps {
  budget: ConferenceBudgetDocument | null
  /** Null when the sponsor pipeline read failed (shown as unavailable). */
  sponsorIncome: SponsorIncomeActuals | null
  /** Live or manual ticket income; null when neither source has data. */
  ticketIncome: TicketIncomeActuals | null
}

/** NOK without decimals, nb-NO locale (house money formatting). */
const nok = (amount: number) => formatCurrency(Math.round(amount), 'NOK')

function netColor(value: number) {
  return value >= 0
    ? 'text-green-700 dark:text-green-400'
    : 'text-red-700 dark:text-red-400'
}

/** Empty state: no budget document yet for this conference. */
function CreateBudgetCard() {
  const router = useRouter()
  const { showNotification } = useNotification()
  const createMutation = api.budget.create.useMutation({
    onSuccess: () => {
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Budget created',
        message: 'Seeded from the reference template - adjust every number.',
      })
    },
    onError: (err) => {
      showNotification({
        type: 'error',
        title: 'Could not create budget',
        message: err.message || 'Failed to create budget.',
      })
    },
  })

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-600 dark:bg-gray-800">
      <BanknotesIcon className="mx-auto h-10 w-10 text-gray-400" />
      <h2 className="mt-3 text-base font-semibold text-gray-900 dark:text-white">
        No budget yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-300">
        Create a budget seeded from the reference template (ticket mix, sponsor
        assumptions, costs and four scenarios), then adjust every number to this
        conference.
      </p>
      <div className="mt-5">
        <AdminButton
          color="blue"
          size="md"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="min-h-[44px]"
        >
          {createMutation.isPending ? 'Creating…' : 'Create budget'}
        </AdminButton>
      </div>
    </div>
  )
}

function BudgetVsActualRow({
  label,
  sublabel,
  budget,
  actual,
  actualText,
  actualNote,
  emphasize = false,
  kind = 'income',
  hideDelta = false,
}: {
  label: string
  sublabel?: string
  budget: number
  actual: number | null
  /**
   * Preformatted replacement for the Actual cell (e.g. per-currency sums
   * that must not be collapsed into one NOK number). No delta is computed
   * against it — pass `actual: null` alongside.
   */
  actualText?: string
  actualNote?: string
  emphasize?: boolean
  /** Delta coloring: for income, above budget is good; for expenses, bad. */
  kind?: 'income' | 'expense'
  /** Hide the delta (e.g. partial actuals where a delta would mislead). */
  hideDelta?: boolean
}) {
  const delta = actual !== null && !hideDelta ? actual - budget : null
  const deltaGood =
    delta !== null && (kind === 'income' ? delta >= 0 : delta <= 0)
  return (
    <tr className={emphasize ? 'font-semibold' : undefined}>
      <td className="py-2 pr-4 text-sm text-gray-900 dark:text-white">
        {label}
        {sublabel ? (
          <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
            {sublabel}
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-4 text-right text-sm whitespace-nowrap text-gray-900 tabular-nums dark:text-white">
        {nok(budget)}
      </td>
      <td className="py-2 pr-4 text-right text-sm whitespace-nowrap text-gray-900 tabular-nums dark:text-white">
        {actualText ?? (actual !== null ? nok(actual) : '—')}
        {actualNote ? (
          <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
            {actualNote}
          </span>
        ) : null}
      </td>
      <td
        className={`py-2 text-right text-sm whitespace-nowrap tabular-nums ${
          delta === null
            ? 'text-gray-400'
            : deltaGood
              ? 'text-green-700 dark:text-green-400'
              : 'text-red-700 dark:text-red-400'
        }`}
      >
        {delta !== null ? `${delta >= 0 ? '+' : ''}${nok(delta)}` : '—'}
      </td>
    </tr>
  )
}

const TABLE_HEAD = (
  <thead>
    <tr className="border-b border-gray-200 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400">
      <th scope="col" className="py-2 pr-4">
        Line
      </th>
      <th scope="col" className="py-2 pr-4 text-right">
        Budget
      </th>
      <th scope="col" className="py-2 pr-4 text-right">
        Actual
      </th>
      <th scope="col" className="py-2 text-right">
        Delta
      </th>
    </tr>
  </thead>
)

export function BudgetPageClient({
  budget,
  sponsorIncome,
  ticketIncome,
}: BudgetPageClientProps) {
  const model = useMemo(
    () => (budget ? budgetDocumentToModel(budget) : null),
    [budget],
  )

  const [scenarioKey, setScenarioKey] = useState<string | null>(null)
  const selectedScenario = useMemo(() => {
    if (!model || model.scenarios.length === 0) return null
    return (
      model.scenarios.find((s) => s.key === scenarioKey) ??
      model.scenarios.find((s) => /baseline/i.test(s.name)) ??
      model.scenarios[0]
    )
  }, [model, scenarioKey])

  const result = useMemo(
    () =>
      model && selectedScenario
        ? computeScenario(model, selectedScenario)
        : null,
    [model, selectedScenario],
  )

  // Manually-entered expense actuals by line key (variable + fixed).
  const expenseActuals = useMemo(() => {
    const actuals = new Map<string, number>()
    for (const cost of budget?.variableCosts ?? []) {
      if (cost.actualAmount != null) actuals.set(cost._key, cost.actualAmount)
    }
    for (const cost of budget?.fixedCosts ?? []) {
      if (cost.actualAmount != null) actuals.set(cost._key, cost.actualAmount)
    }
    return actuals
  }, [budget])

  // Row keys referenced by scenarios - the editors warn before deleting
  // a referenced row (its scenario counts / cut flags would be orphaned).
  const scenarioTicketKeys = useMemo(
    () => [
      ...new Set(
        (budget?.scenarios ?? []).flatMap((scenario) =>
          (scenario.ticketCounts ?? []).map((count) => count.ticketType),
        ),
      ),
    ],
    [budget],
  )
  const scenarioCutCostKeys = useMemo(
    () => [
      ...new Set(
        (budget?.scenarios ?? []).flatMap(
          (scenario) => scenario.cutCosts ?? [],
        ),
      ),
    ],
    [budget],
  )

  const actualTicketRevenue = ticketIncome?.revenue ?? null
  // Sponsor income is grouped BY CURRENCY (see deriveSponsorIncome): only
  // the NOK share enters combined NOK totals — summing across currencies
  // (or converting at a fluctuating rate) would fabricate a number on a
  // budget page. Non-NOK shares render per-currency with a note.
  const sponsorByCurrency = useMemo(
    () => sponsorIncome?.byCurrency ?? [],
    [sponsorIncome],
  )
  const sponsorAllNok = sponsorByCurrency.every((c) => c.currency === 'NOK')
  const sponsorNok = sponsorByCurrency.find((c) => c.currency === 'NOK')
  const sponsorSignedNok = sponsorNok?.signedRevenue ?? 0
  /** Per-currency formatted sums for a field, e.g. "kr 250 000 + US$ 10 000". */
  const sponsorAmounts = (
    field: 'signedRevenue' | 'paidRevenue' | 'openPipelineRevenue',
  ) => {
    const parts = sponsorByCurrency
      .filter((c) => c[field] > 0)
      .map((c) => formatCurrency(Math.round(c[field]), c.currency))
    return parts.length > 0 ? parts.join(' + ') : nok(0)
  }
  // Partial by nature: missing sources contribute 0 but are called out in
  // the UI, and deltas against full budgets are suppressed when a source
  // is missing (a fabricated comparison would mislead).
  const actualIncomeTotal = sponsorSignedNok + (actualTicketRevenue ?? 0)
  const incomeActualsComplete =
    sponsorIncome !== null && actualTicketRevenue !== null && sponsorAllNok
  const hasExpenseActuals = expenseActuals.size > 0
  const actualExpenseTotal = [...expenseActuals.values()].reduce(
    (sum, v) => sum + v,
    0,
  )
  const actualNet = actualIncomeTotal - actualExpenseTotal

  const header = (
    <AdminPageHeader
      icon={<BanknotesIcon className="h-8 w-8" />}
      title="Budget"
      description="Budget vs actuals: expense plan and scenario projections against live sponsor and ticket income."
      actions={
        <Link
          href="/admin/budget/config"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          <Cog6ToothIcon className="h-5 w-5" />
          Configure
        </Link>
      }
      stats={
        result
          ? [
              {
                value: nok(result.totalIncome),
                label: 'Projected income',
                subtitle: selectedScenario?.name,
                color: 'blue',
              },
              {
                value: nok(result.netResult),
                label: 'Projected net',
                subtitle: `${result.marginPct.toFixed(1)}% margin`,
                color: result.netResult >= 0 ? 'green' : 'red',
              },
              {
                value: nok(actualIncomeTotal),
                label: 'Actual income',
                subtitle: sponsorIncome
                  ? `${sponsorIncome.signedCount} sponsors signed${
                      ticketIncome
                        ? ` · ${ticketIncome.ticketCount} tickets`
                        : ''
                    }${sponsorAllNok ? '' : ' · non-NOK sponsor income excluded'}`
                  : 'sponsor data unavailable',
                color: 'green',
              },
              {
                value: nok(actualNet),
                label: 'Actual net so far',
                subtitle: 'income − recorded spend',
                color: actualNet >= 0 ? 'green' : 'red',
              },
            ]
          : undefined
      }
    />
  )

  if (!budget || !model) {
    return (
      <div className="space-y-6">
        {header}
        <CreateBudgetCard />
      </div>
    )
  }

  // Grouped expense lines for the selected scenario. The computed ticketing
  // fee is NOT merged into a category - it renders as its own row, so
  // category budget-vs-actual comparisons only ever cover document lines
  // that CAN receive a recorded actual.
  const expenseLines = result ? result.expenseLines : []
  const categories = EXPENSE_CATEGORIES.filter((category) =>
    expenseLines.some((line) => line.category === category),
  )

  return (
    <div className="space-y-6">
      {header}

      {/* Scenario switcher */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Budget scenario"
      >
        {model.scenarios.map((scenario) => {
          const selected = scenario.key === selectedScenario?.key
          return (
            <button
              key={scenario.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setScenarioKey(scenario.key)}
              className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'
              }`}
            >
              {scenario.name}
            </button>
          )
        })}
      </div>

      {/* Model misconfiguration warnings (e.g. sponsor-included flags) —
          computed by the model instead of silently mis-counting. */}
      {result && result.warnings.length > 0 ? (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-900/20"
        >
          <ExclamationTriangleIcon
            className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {result.warnings.map((warning) => (
              <p key={warning.code}>{warning.message}</p>
            ))}
          </div>
        </div>
      ) : null}

      {result && selectedScenario ? (
        <>
          {/* Headcounts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Conference day', value: result.headcounts.conference },
              { label: 'Workshop day', value: result.headcounts.workshop },
              { label: 'Crew', value: result.headcounts.crew },
              { label: 'Dinner (est)', value: result.headcounts.dinner },
              { label: 'Total tickets', value: result.headcounts.totalTickets },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg bg-white p-3 text-center shadow-xs ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
              >
                <div className="text-lg font-semibold text-gray-900 tabular-nums dark:text-white">
                  {stat.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Income */}
          <CollapsibleSection title="Income" defaultOpen>
            <BudgetTicketTypesEditor
              ticketTypes={budget.ticketTypes ?? []}
              manualActualsInUse={ticketIncome?.source === 'manual'}
              scenarioReferencedKeys={scenarioTicketKeys}
              display={
                <>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    All amounts in NOK, excluding VAT.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      {TABLE_HEAD}
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        <BudgetVsActualRow
                          label="Ticket revenue"
                          sublabel={`${result.headcounts.totalTickets} tickets in scenario`}
                          budget={result.ticketRevenue}
                          actual={actualTicketRevenue}
                          actualNote={
                            ticketIncome
                              ? ticketIncome.source === 'live'
                                ? `live: ${ticketIncome.ticketCount} tickets, ${ticketIncome.orderCount} orders`
                                : `manual: ${ticketIncome.ticketCount} tickets entered`
                              : 'no ticketing data'
                          }
                        />
                        <BudgetVsActualRow
                          label="Sponsorships"
                          sublabel={`tiers ${nok(result.sponsorTierRevenue)} + add-ons ${nok(result.sponsorAddonRevenue)}`}
                          budget={result.sponsorRevenue}
                          actual={
                            sponsorIncome && sponsorAllNok
                              ? sponsorSignedNok
                              : null
                          }
                          actualText={
                            sponsorIncome && !sponsorAllNok
                              ? sponsorAmounts('signedRevenue')
                              : undefined
                          }
                          actualNote={
                            sponsorIncome
                              ? `${sponsorIncome.signedCount} signed · ${sponsorAmounts('paidRevenue')} paid · ${sponsorAmounts('openPipelineRevenue')} in pipeline${
                                  sponsorAllNok
                                    ? ''
                                    : sponsorByCurrency.length > 1
                                      ? ' · mixed currencies — amounts not combined'
                                      : ' · non-NOK income — not compared to the NOK budget'
                                }`
                              : 'sponsor data unavailable'
                          }
                        />
                        <BudgetVsActualRow
                          label="Total income"
                          budget={result.totalIncome}
                          actual={actualIncomeTotal}
                          actualNote={
                            incomeActualsComplete
                              ? undefined
                              : 'partial — see rows'
                          }
                          emphasize
                          hideDelta={!incomeActualsComplete}
                        />
                      </tbody>
                    </table>
                  </div>
                </>
              }
            />
          </CollapsibleSection>

          {/* Expenses */}
          <CollapsibleSection title="Expenses" defaultOpen>
            <BudgetExpensesEditor
              variableCosts={budget.variableCosts ?? []}
              fixedCosts={budget.fixedCosts ?? []}
              scenarioReferencedKeys={scenarioCutCostKeys}
              display={
                <>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    All amounts in NOK, including VAT (what the organization
                    pays).
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      {TABLE_HEAD}
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {categories.map((category) => {
                          const lines = expenseLines.filter(
                            (line) => line.category === category,
                          )
                          const subtotal = lines.reduce(
                            (sum, line) => sum + line.amount,
                            0,
                          )
                          const actualSubtotal = lines.reduce(
                            (sum, line) =>
                              sum + (expenseActuals.get(line.key) ?? 0),
                            0,
                          )
                          const hasActuals = lines.some((line) =>
                            expenseActuals.has(line.key),
                          )
                          // A delta against the FULL category budget is only
                          // honest once every (non-cut) line has a recorded
                          // actual - otherwise partially-recorded spend reads as
                          // a big underspend.
                          const actualsComplete = lines.every(
                            (line) => line.cut || expenseActuals.has(line.key),
                          )
                          return (
                            <BudgetVsActualRow
                              key={category}
                              label={EXPENSE_CATEGORY_LABELS[category]}
                              sublabel={lines
                                .map(
                                  (line) =>
                                    `${line.name}${line.cut ? ' (cut)' : ''}`,
                                )
                                .join(' · ')}
                              budget={subtotal}
                              actual={hasActuals ? actualSubtotal : null}
                              actualNote={
                                hasActuals && !actualsComplete
                                  ? 'recorded so far'
                                  : undefined
                              }
                              kind="expense"
                              hideDelta={!actualsComplete}
                            />
                          )
                        })}
                        <BudgetVsActualRow
                          label={`Ticketing platform fee (${(model.ticketingFeeRate * 100).toFixed(1)}%)`}
                          sublabel="computed on gross ticket revenue"
                          budget={result.ticketingFee}
                          actual={null}
                          kind="expense"
                        />
                        <BudgetVsActualRow
                          label="Variable expenses"
                          sublabel="headcount-driven + ticketing fee"
                          budget={result.totalVariableExpenses}
                          actual={null}
                          kind="expense"
                        />
                        <BudgetVsActualRow
                          label="Fixed expenses"
                          sublabel={
                            selectedScenario.cutCostKeys.length > 0
                              ? `${selectedScenario.cutCostKeys.length} optional cost(s) cut in this scenario`
                              : undefined
                          }
                          budget={result.totalFixedExpenses}
                          actual={null}
                          kind="expense"
                        />
                        <BudgetVsActualRow
                          label="Total expenses"
                          budget={result.totalExpenses}
                          actual={hasExpenseActuals ? actualExpenseTotal : null}
                          actualNote={
                            hasExpenseActuals ? 'recorded so far' : undefined
                          }
                          emphasize
                          kind="expense"
                          hideDelta
                        />
                      </tbody>
                    </table>
                  </div>
                </>
              }
            />
          </CollapsibleSection>

          {/* Sponsor assumptions — tier & add-on price lists that drive the
              scenario sponsor-revenue projections. */}
          <CollapsibleSection title="Sponsor assumptions" defaultOpen>
            <BudgetSponsorAssumptionsEditor
              sponsorTierAssumptions={budget.sponsorTierAssumptions ?? []}
              sponsorAddonAssumptions={budget.sponsorAddonAssumptions ?? []}
            />
          </CollapsibleSection>

          {/* Margin readout */}
          <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Projected net result · {selectedScenario.name}
                </div>
                <div
                  className={`mt-1 text-3xl font-bold tabular-nums ${netColor(result.netResult)}`}
                >
                  {nok(result.netResult)}
                </div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {result.marginPct.toFixed(1)}% margin on{' '}
                  {nok(result.totalIncome)} income
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Actual so far
                </div>
                <div
                  className={`mt-1 text-3xl font-bold tabular-nums ${netColor(actualNet)}`}
                >
                  {nok(actualNet)}
                </div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {nok(actualIncomeTotal)} income − {nok(actualExpenseTotal)}{' '}
                  recorded spend
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
          This budget has no scenarios yet. Add scenarios in the budget document
          to see projections.
        </div>
      )}
    </div>
  )
}
