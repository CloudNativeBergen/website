'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'

import type {
  BudgetSponsorAddonItem,
  BudgetSponsorTierItem,
} from '@/lib/budget'
import { formatCurrency } from '@/lib/format'
import { generateKey } from '@/lib/sanity/helpers'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { numberOrNull } from './fields'
import { EditableTableCard } from './EditableTableCard'
import {
  DeleteRowButton,
  NumberCell,
  TextCell,
  tableClass,
  tableWrapClass,
  tbodyRowClass,
  tdClass,
  theadClass,
  thClass,
} from './BudgetTableCells'

export interface BudgetSponsorAssumptionsEditorProps {
  sponsorTierAssumptions: BudgetSponsorTierItem[]
  sponsorAddonAssumptions: BudgetSponsorAddonItem[]
  /**
   * Tier `_key`s referenced by scenario `tierCounts`. Deleting a referenced
   * tier orphans those scenario counts (its projected sponsor revenue and
   * included tickets silently drop), so it takes a confirming second click —
   * the same guard the ticket-type and expense editors use.
   */
  scenarioReferencedTierKeys?: string[]
  /** Add-on `_key`s referenced by scenario `addonCounts` (see above). */
  scenarioReferencedAddonKeys?: string[]
  defaultEditing?: boolean
}

const nok = (amount: number) => formatCurrency(Math.round(amount), 'NOK')

/**
 * Sponsor assumption editor: the tier + a-la-carte add-on price lists that
 * drive scenario sponsor-revenue projections (prices are ex VAT, sponsor CRM
 * convention). Edits INLINE ON THE PAGE as two spreadsheet tables — no modal.
 */
export function BudgetSponsorAssumptionsEditor({
  sponsorTierAssumptions,
  sponsorAddonAssumptions,
  scenarioReferencedTierKeys = [],
  scenarioReferencedAddonKeys = [],
  defaultEditing = false,
}: BudgetSponsorAssumptionsEditorProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const referencedTierKeys = new Set(scenarioReferencedTierKeys)
  const referencedAddonKeys = new Set(scenarioReferencedAddonKeys)

  const [editing, setEditing] = useState(defaultEditing)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [tiers, setTiers] = useState<BudgetSponsorTierItem[]>(() =>
    structuredClone(sponsorTierAssumptions),
  )
  const [addons, setAddons] = useState<BudgetSponsorAddonItem[]>(() =>
    structuredClone(sponsorAddonAssumptions),
  )
  const [error, setError] = useState<string | null>(null)

  const isDirty =
    JSON.stringify({ tiers, addons }) !==
    JSON.stringify({
      tiers: sponsorTierAssumptions,
      addons: sponsorAddonAssumptions,
    })

  const saveMutation = api.budget.updateSponsorAssumptions.useMutation({
    onSuccess: () => {
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Sponsor assumptions updated',
        message: 'Tier and add-on price lists saved.',
      })
      setEditing(false)
    },
    onError: (err) => {
      setError(err.message || 'Failed to save sponsor assumptions.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save sponsor assumptions.',
      })
    },
  })

  const reset = () => {
    setTiers(structuredClone(sponsorTierAssumptions))
    setAddons(structuredClone(sponsorAddonAssumptions))
    setError(null)
    setPendingRemoval(null)
  }
  const startEdit = () => {
    reset()
    setEditing(true)
  }
  const cancel = () => {
    setEditing(false)
    reset()
  }

  const updateTier = (key: string, patch: Partial<BudgetSponsorTierItem>) =>
    setTiers((prev) =>
      prev.map((t) => (t._key === key ? { ...t, ...patch } : t)),
    )
  const updateAddon = (key: string, patch: Partial<BudgetSponsorAddonItem>) =>
    setAddons((prev) =>
      prev.map((a) => (a._key === key ? { ...a, ...patch } : a)),
    )

  const removeTier = (key: string) => {
    if (referencedTierKeys.has(key) && pendingRemoval !== key) {
      setPendingRemoval(key)
      return
    }
    setPendingRemoval(null)
    setTiers((prev) => prev.filter((x) => x._key !== key))
  }
  const removeAddon = (key: string) => {
    if (referencedAddonKeys.has(key) && pendingRemoval !== key) {
      setPendingRemoval(key)
      return
    }
    setPendingRemoval(null)
    setAddons((prev) => prev.filter((x) => x._key !== key))
  }

  const handleSave = () => {
    setError(null)
    if ([...tiers, ...addons].some((item) => !item.name.trim())) {
      setError('Every tier and add-on needs a name.')
      return
    }
    saveMutation.mutate({
      sponsorTierAssumptions: tiers.map((t) => ({
        _key: t._key,
        name: t.name,
        priceExVat: t.priceExVat ?? 0,
        includedTickets: t.includedTickets ?? 0,
      })),
      sponsorAddonAssumptions: addons.map((a) => ({
        _key: a._key,
        name: a.name,
        priceExVat: a.priceExVat ?? 0,
      })),
    })
  }

  const display = (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
          Tiers
        </h3>
        {sponsorTierAssumptions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No tiers defined.
          </p>
        ) : (
          <dl className="divide-y divide-gray-100 dark:divide-gray-800">
            {sponsorTierAssumptions.map((t) => (
              <div key={t._key} className="flex justify-between gap-4 py-1.5">
                <dt className="text-sm text-gray-700 dark:text-gray-300">
                  {t.name}
                  <span className="ml-1 text-xs text-gray-400">
                    · {t.includedTickets ?? 0} tickets
                  </span>
                </dt>
                <dd className="text-sm whitespace-nowrap text-gray-900 tabular-nums dark:text-white">
                  {nok(t.priceExVat ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
          Add-ons
        </h3>
        {sponsorAddonAssumptions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No add-ons defined.
          </p>
        ) : (
          <dl className="divide-y divide-gray-100 dark:divide-gray-800">
            {sponsorAddonAssumptions.map((a) => (
              <div key={a._key} className="flex justify-between gap-4 py-1.5">
                <dt className="text-sm text-gray-700 dark:text-gray-300">
                  {a.name}
                </dt>
                <dd className="text-sm whitespace-nowrap text-gray-900 tabular-nums dark:text-white">
                  {nok(a.priceExVat ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )

  return (
    <EditableTableCard
      editing={editing}
      onStartEdit={startEdit}
      onSave={handleSave}
      onCancel={cancel}
      isDirty={isDirty}
      isSaving={saveMutation.isPending}
      saveLabel="Save assumptions"
      editLabel="Edit assumptions"
      error={error}
      display={display}
    >
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        Prices in NOK, excluding VAT (sponsor CRM convention). Scenario sponsor
        counts live on the config page.
      </p>

      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
        Tiers
      </h3>
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Name</th>
              <th className={`${thClass} text-right`}>Price ex VAT</th>
              <th className={`${thClass} text-right`}>Included tickets</th>
              <th className={`${thClass} text-center`}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t._key} className={tbodyRowClass}>
                <td className={tdClass}>
                  <TextCell
                    ariaLabel="Tier name"
                    value={t.name}
                    onChange={(v) => updateTier(t._key, { name: v })}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Price ex VAT for ${t.name || 'tier'}`}
                    value={t.priceExVat}
                    onChange={(v) =>
                      updateTier(t._key, { priceExVat: numberOrNull(v) ?? 0 })
                    }
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Included tickets for ${t.name || 'tier'}`}
                    widthClass="w-24"
                    value={t.includedTickets ?? 0}
                    onChange={(v) =>
                      updateTier(t._key, {
                        includedTickets: numberOrNull(v) ?? 0,
                      })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <DeleteRowButton
                    ariaLabel={
                      referencedTierKeys.has(t._key) &&
                      pendingRemoval === t._key
                        ? `Confirm removing ${t.name || 'tier'} (used by scenarios)`
                        : `Remove ${t.name || 'tier'}`
                    }
                    pending={pendingRemoval === t._key}
                    onClick={() => removeTier(t._key)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() =>
            setTiers((prev) => [
              ...prev,
              {
                _key: generateKey('sponsortier'),
                name: '',
                priceExVat: 0,
                includedTickets: 0,
              },
            ])
          }
        >
          <PlusIcon className="h-4 w-4" /> Add tier
        </AdminButton>
        {pendingRemoval && tiers.some((t) => t._key === pendingRemoval) ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            That tier is referenced by a scenario — click delete again to
            confirm; its scenario counts will be dropped.
          </span>
        ) : null}
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-900 dark:text-white">
        Add-ons
      </h3>
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Name</th>
              <th className={`${thClass} text-right`}>Price ex VAT</th>
              <th className={`${thClass} text-center`}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {addons.map((a) => (
              <tr key={a._key} className={tbodyRowClass}>
                <td className={tdClass}>
                  <TextCell
                    ariaLabel="Add-on name"
                    value={a.name}
                    onChange={(v) => updateAddon(a._key, { name: v })}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Price ex VAT for ${a.name || 'add-on'}`}
                    value={a.priceExVat}
                    onChange={(v) =>
                      updateAddon(a._key, { priceExVat: numberOrNull(v) ?? 0 })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <DeleteRowButton
                    ariaLabel={
                      referencedAddonKeys.has(a._key) &&
                      pendingRemoval === a._key
                        ? `Confirm removing ${a.name || 'add-on'} (used by scenarios)`
                        : `Remove ${a.name || 'add-on'}`
                    }
                    pending={pendingRemoval === a._key}
                    onClick={() => removeAddon(a._key)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() =>
            setAddons((prev) => [
              ...prev,
              { _key: generateKey('sponsoraddon'), name: '', priceExVat: 0 },
            ])
          }
        >
          <PlusIcon className="h-4 w-4" /> Add add-on
        </AdminButton>
        {pendingRemoval && addons.some((a) => a._key === pendingRemoval) ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            That add-on is referenced by a scenario — click delete again to
            confirm; its scenario counts will be dropped.
          </span>
        ) : null}
      </div>
    </EditableTableCard>
  )
}
