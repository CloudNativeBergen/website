'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AdjustmentsHorizontalIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

import {
  DEFAULT_DINNER_PARTICIPATION,
  type ConferenceBudgetDocument,
} from '@/lib/budget'
import { generateKey } from '@/lib/sanity/helpers'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useNotification } from '@/components/admin/NotificationProvider'
import { inputClass, labelClass, numberOrNull } from './fields'
import {
  NumberCell,
  tableClass,
  tableWrapClass,
  tbodyRowClass,
  tdClass,
  theadClass,
  thClass,
} from './BudgetTableCells'

export interface BudgetConfigPageClientProps {
  budget: ConferenceBudgetDocument
}

/** Fraction (0.045) → percent input string ("4.5") without float noise. */
const toPercent = (fraction: number) =>
  String(Number((fraction * 100).toFixed(4)))
const fromPercent = (value: string) => (numberOrNull(value) ?? 0) / 100

/**
 * Normalized percent-facing form values for the global parameters, derived
 * from a budget document. Normalizing through {@link toPercent} means "4.50"
 * and "4.5" collapse to the same string, so re-deriving this after a save
 * clears the dirty flag instead of leaving Save stuck enabled.
 */
function budgetToGlobals(budget: ConferenceBudgetDocument) {
  return {
    vat: toPercent(budget.vatRate),
    fee: toPercent(budget.ticketingFeeRate),
    floor: toPercent(
      budget.dinnerParticipation?.floor ?? DEFAULT_DINNER_PARTICIPATION.floor,
    ),
    base: toPercent(
      budget.dinnerParticipation?.base ?? DEFAULT_DINNER_PARTICIPATION.base,
    ),
    decay: String(
      budget.dinnerParticipation?.decay ?? DEFAULT_DINNER_PARTICIPATION.decay,
    ),
  }
}

interface ScenarioDraft {
  _key: string
  name: string
  description: string
  ticketCounts: Record<string, number>
  tierCounts: Record<string, number>
  addonCounts: Record<string, number>
  cutCosts: string[]
}

function toDraft(
  scenario: NonNullable<ConferenceBudgetDocument['scenarios']>[number],
): ScenarioDraft {
  // Duplicate references keep the FIRST entry, matching the computation mapper
  // (`src/lib/budget/mapper.ts`). `Object.fromEntries` would be last-write-wins
  // and could silently change projections when saving legacy/bypassed docs
  // that carry duplicate count rows.
  const record = <T,>(
    items: T[] | undefined,
    key: (t: T) => string,
    value: (t: T) => number,
  ) => {
    const out: Record<string, number> = {}
    for (const item of items ?? []) {
      const k = key(item)
      if (!(k in out)) out[k] = value(item)
    }
    return out
  }
  return {
    _key: scenario._key,
    name: scenario.name,
    description: scenario.description ?? '',
    ticketCounts: record(
      scenario.ticketCounts,
      (c) => c.ticketType,
      (c) => c.quantity ?? 0,
    ),
    tierCounts: record(
      scenario.tierCounts,
      (c) => c.tier,
      (c) => c.count ?? 0,
    ),
    addonCounts: record(
      scenario.addonCounts,
      (c) => c.addon,
      (c) => c.count ?? 0,
    ),
    cutCosts: scenario.cutCosts ?? [],
  }
}

export function BudgetConfigPageClient({
  budget,
}: BudgetConfigPageClientProps) {
  const router = useRouter()
  const { showNotification } = useNotification()

  // Reference lists for the scenario count rows.
  const ticketTypes = budget.ticketTypes ?? []
  const tiers = budget.sponsorTierAssumptions ?? []
  const addons = budget.sponsorAddonAssumptions ?? []
  const optionalFixed = (budget.fixedCosts ?? []).filter((c) => c.optional)

  // --- Global parameters (percent-facing inputs) ---------------------------
  const initialGlobals = useMemo(() => budgetToGlobals(budget), [budget])
  const [globals, setGlobals] = useState(initialGlobals)
  const [globalsError, setGlobalsError] = useState<string | null>(null)
  const globalsDirty =
    JSON.stringify(globals) !== JSON.stringify(initialGlobals)

  const configMutation = api.budget.updateConfig.useMutation({
    onSuccess: ({ budget: saved }) => {
      // Re-seed the form from the persisted document so equivalent percent
      // strings (e.g. "4.50" → "4.5") normalize and the dirty flag clears.
      setGlobals(budgetToGlobals(saved))
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Configuration saved',
        message: 'Global budget parameters updated.',
      })
    },
    onError: (err) =>
      setGlobalsError(err.message || 'Failed to save configuration.'),
  })

  const saveGlobals = () => {
    setGlobalsError(null)
    // Percent-facing inputs map to fractions ≤ 1 server-side; block > 100 here
    // with a clear message instead of surfacing a "fraction" error on save.
    const percentFields: [label: string, value: string][] = [
      ['VAT rate', globals.vat],
      ['Ticketing fee', globals.fee],
      ['Dinner floor', globals.floor],
      ['Dinner base', globals.base],
    ]
    for (const [label, value] of percentFields) {
      const pct = numberOrNull(value)
      if (pct !== null && (pct < 0 || pct > 100)) {
        setGlobalsError(`${label} must be between 0 and 100%.`)
        return
      }
    }
    const decay = numberOrNull(globals.decay) ?? 0
    if (decay <= 0) {
      setGlobalsError('Dinner decay must be greater than 0.')
      return
    }
    configMutation.mutate({
      vatRate: fromPercent(globals.vat),
      ticketingFeeRate: fromPercent(globals.fee),
      dinnerParticipation: {
        floor: fromPercent(globals.floor),
        base: fromPercent(globals.base),
        decay,
      },
    })
  }

  // --- Scenarios -----------------------------------------------------------
  const initialScenarios = useMemo(
    () => (budget.scenarios ?? []).map(toDraft),
    [budget],
  )
  const [scenarios, setScenarios] = useState<ScenarioDraft[]>(() =>
    structuredClone(initialScenarios),
  )
  const [scenariosError, setScenariosError] = useState<string | null>(null)
  const scenariosDirty =
    JSON.stringify(scenarios) !== JSON.stringify(initialScenarios)

  const scenariosMutation = api.budget.updateScenarios.useMutation({
    onSuccess: ({ budget: saved }) => {
      // `updateScenarios` runs `ensureUniqueArrayKeys`, which can rewrite
      // scenario (and nested count) `_key`s server-side. Re-seed local state
      // from the persisted document so later edits target the persisted keys
      // and the dirty flag reflects the normalized data.
      setScenarios((saved.scenarios ?? []).map(toDraft))
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Scenarios saved',
        message: 'Budget scenarios updated.',
      })
    },
    onError: (err) =>
      setScenariosError(err.message || 'Failed to save scenarios.'),
  })

  const updateScenario = (key: string, patch: Partial<ScenarioDraft>) =>
    setScenarios((prev) =>
      prev.map((s) => (s._key === key ? { ...s, ...patch } : s)),
    )
  const setCount = (
    key: string,
    field: 'ticketCounts' | 'tierCounts' | 'addonCounts',
    refKey: string,
    value: number,
  ) =>
    setScenarios((prev) =>
      prev.map((s) =>
        s._key === key
          ? { ...s, [field]: { ...s[field], [refKey]: value } }
          : s,
      ),
    )
  const toggleCut = (key: string, costKey: string, cut: boolean) =>
    setScenarios((prev) =>
      prev.map((s) =>
        s._key === key
          ? {
              ...s,
              cutCosts: cut
                ? [...new Set([...s.cutCosts, costKey])]
                : s.cutCosts.filter((c) => c !== costKey),
            }
          : s,
      ),
    )

  const addScenario = () =>
    setScenarios((prev) => [
      ...prev,
      {
        _key: generateKey('scenario'),
        name: '',
        description: '',
        ticketCounts: {},
        tierCounts: {},
        addonCounts: {},
        cutCosts: [],
      },
    ])

  const saveScenarios = () => {
    setScenariosError(null)
    if (scenarios.some((s) => !s.name.trim())) {
      setScenariosError('Every scenario needs a name.')
      return
    }
    scenariosMutation.mutate({
      scenarios: scenarios.map((s) => ({
        _key: s._key,
        name: s.name,
        description: s.description || undefined,
        ticketCounts: Object.entries(s.ticketCounts).map(
          ([ticketType, quantity]) => ({ ticketType, quantity }),
        ),
        tierCounts: Object.entries(s.tierCounts).map(([tier, count]) => ({
          tier,
          count,
        })),
        addonCounts: Object.entries(s.addonCounts).map(([addon, count]) => ({
          addon,
          count,
        })),
        cutCosts: s.cutCosts,
      })),
    })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Cog6ToothIcon />}
        title="Budget configuration"
        description="Global rates and scenario assumptions that drive every projection on the budget page."
        backLink={{ href: '/admin/budget', label: 'Back to Budget' }}
      />

      {/* Global parameters */}
      <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
        <div className="flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Global parameters
          </h2>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          VAT and platform-fee rates, plus the dinner-participation decay model
          (participation = max(floor, base − attendees ÷ decay)).
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            VAT rate (%)
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className={inputClass}
              value={globals.vat}
              onChange={(e) =>
                setGlobals((g) => ({ ...g, vat: e.target.value }))
              }
            />
          </label>
          <label className={labelClass}>
            Ticketing fee (%)
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className={inputClass}
              value={globals.fee}
              onChange={(e) =>
                setGlobals((g) => ({ ...g, fee: e.target.value }))
              }
            />
          </label>
          <div className="hidden lg:block" />
          <label className={labelClass}>
            Dinner floor (%)
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              className={inputClass}
              value={globals.floor}
              onChange={(e) =>
                setGlobals((g) => ({ ...g, floor: e.target.value }))
              }
            />
          </label>
          <label className={labelClass}>
            Dinner base (%)
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              className={inputClass}
              value={globals.base}
              onChange={(e) =>
                setGlobals((g) => ({ ...g, base: e.target.value }))
              }
            />
          </label>
          <label className={labelClass}>
            Dinner decay (attendees)
            <input
              type="number"
              min={1}
              step="1"
              className={inputClass}
              value={globals.decay}
              onChange={(e) =>
                setGlobals((g) => ({ ...g, decay: e.target.value }))
              }
            />
          </label>
        </div>

        {globalsError ? (
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {globalsError}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <AdminButton
            color="blue"
            size="md"
            onClick={saveGlobals}
            disabled={configMutation.isPending || !globalsDirty}
            className="min-h-[44px]"
          >
            {configMutation.isPending ? 'Saving…' : 'Save parameters'}
          </AdminButton>
        </div>
      </section>

      {/* Scenarios */}
      <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Scenarios
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Projected ticket, sponsor-tier and add-on quantities per scenario, and
          which optional fixed costs are cut. Sponsor-included tickets are
          derived from tier counts, so they have no quantity here.
        </p>

        <div className="mt-4 space-y-4">
          {scenarios.map((s) => (
            <div
              key={s._key}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
            >
              <div className="flex flex-wrap items-start gap-3">
                <label className={`${labelClass} flex-1`}>
                  Name
                  <input
                    type="text"
                    className={inputClass}
                    value={s.name}
                    onChange={(e) =>
                      updateScenario(s._key, { name: e.target.value })
                    }
                  />
                </label>
                <label className={`${labelClass} flex-[2]`}>
                  Description
                  <input
                    type="text"
                    className={inputClass}
                    value={s.description}
                    onChange={(e) =>
                      updateScenario(s._key, { description: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove scenario ${s.name || 'scenario'}`}
                  onClick={() =>
                    setScenarios((prev) =>
                      prev.filter((x) => x._key !== s._key),
                    )
                  }
                  className="mt-5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <ScenarioCountTable
                  heading="Ticket counts"
                  rows={ticketTypes
                    .filter((t) => !t.sponsorIncluded)
                    .map((t) => ({ key: t._key, label: t.name }))}
                  value={s.ticketCounts}
                  onChange={(refKey, v) =>
                    setCount(s._key, 'ticketCounts', refKey, v)
                  }
                />
                <ScenarioCountTable
                  heading="Sponsor tiers"
                  rows={tiers.map((t) => ({ key: t._key, label: t.name }))}
                  value={s.tierCounts}
                  onChange={(refKey, v) =>
                    setCount(s._key, 'tierCounts', refKey, v)
                  }
                />
                <ScenarioCountTable
                  heading="Add-ons"
                  rows={addons.map((a) => ({ key: a._key, label: a.name }))}
                  value={s.addonCounts}
                  onChange={(refKey, v) =>
                    setCount(s._key, 'addonCounts', refKey, v)
                  }
                />
              </div>

              {optionalFixed.length > 0 ? (
                <div className="mt-4">
                  <h4 className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Optional costs cut in this scenario
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {optionalFixed.map((c) => (
                      <label
                        key={c._key}
                        className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-900"
                          checked={s.cutCosts.includes(c._key)}
                          onChange={(e) =>
                            toggleCut(s._key, c._key, e.target.checked)
                          }
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <AdminButton variant="secondary" size="sm" onClick={addScenario}>
            <PlusIcon className="h-4 w-4" /> Add scenario
          </AdminButton>
        </div>

        {scenariosError ? (
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {scenariosError}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <AdminButton
            color="blue"
            size="md"
            onClick={saveScenarios}
            disabled={scenariosMutation.isPending || !scenariosDirty}
            className="min-h-[44px]"
          >
            {scenariosMutation.isPending ? 'Saving…' : 'Save scenarios'}
          </AdminButton>
        </div>
      </section>
    </div>
  )
}

function ScenarioCountTable({
  heading,
  rows,
  value,
  onChange,
}: {
  heading: string
  rows: { key: string; label: string }[]
  value: Record<string, number>
  onChange: (refKey: string, value: number) => void
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {heading}
      </h4>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">None defined.</p>
      ) : (
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Item</th>
                <th className={`${thClass} text-right`}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={tbodyRowClass}>
                  <td className={`${tdClass} text-gray-700 dark:text-gray-300`}>
                    {row.label}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <NumberCell
                      ariaLabel={`${heading} — ${row.label}`}
                      widthClass="w-20"
                      value={value[row.key] ?? 0}
                      onChange={(v) => onChange(row.key, numberOrNull(v) ?? 0)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
