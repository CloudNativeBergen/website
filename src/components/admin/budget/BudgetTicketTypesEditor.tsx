'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'

import type { BudgetTicketTypeItem } from '@/lib/budget'
import { generateKey } from '@/lib/sanity/helpers'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { numberOrNull } from './fields'
import { EditableTableCard } from './EditableTableCard'
import {
  CheckboxCell,
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

export interface BudgetTicketTypesEditorProps {
  ticketTypes: BudgetTicketTypeItem[]
  /** True when manual actual counts are the active ticket-income source. */
  manualActualsInUse?: boolean
  /**
   * `_key`s referenced by scenario ticket counts. Deleting a referenced row
   * silently zeroes those scenario quantities, so it takes a confirming
   * second click.
   */
  scenarioReferencedKeys?: string[]
  /** Read-only summary shown when not editing (the budget-vs-actual rows). */
  display: ReactNode
  /** Force edit mode on mount (Storybook / deep links). */
  defaultEditing?: boolean
}

/**
 * Ticket-mix editor: edits the budget's ticket-type assumptions (price incl
 * VAT + attendance flags that drive per-person costs) and the manual "actual
 * sold" counts used as the ticket-income fallback. Edits INLINE ON THE PAGE
 * as a full-width spreadsheet table (one row per ticket type) — no modal.
 */
export function BudgetTicketTypesEditor({
  ticketTypes,
  manualActualsInUse = false,
  scenarioReferencedKeys = [],
  display,
  defaultEditing = false,
}: BudgetTicketTypesEditorProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const referencedKeys = new Set(scenarioReferencedKeys)

  const [editing, setEditing] = useState(defaultEditing)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [items, setItems] = useState<BudgetTicketTypeItem[]>(() =>
    structuredClone(ticketTypes),
  )
  const [error, setError] = useState<string | null>(null)

  const isDirty = JSON.stringify(items) !== JSON.stringify(ticketTypes)

  const saveMutation = api.budget.updateTicketTypes.useMutation({
    onSuccess: () => {
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Ticket types updated',
        message: 'Budget ticket mix saved.',
      })
      setEditing(false)
    },
    onError: (err) => {
      setError(err.message || 'Failed to save ticket types.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save ticket types.',
      })
    },
  })

  const reset = () => {
    setItems(structuredClone(ticketTypes))
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

  const update = (key: string, patch: Partial<BudgetTicketTypeItem>) => {
    setItems((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item)),
    )
  }

  const removeRow = (key: string) => {
    if (referencedKeys.has(key) && pendingRemoval !== key) {
      setPendingRemoval(key)
      return
    }
    setPendingRemoval(null)
    setItems((prev) => prev.filter((x) => x._key !== key))
  }

  const addRow = () =>
    setItems((prev) => [
      ...prev,
      {
        _key: generateKey('tickettype'),
        name: '',
        priceInclVat: 0,
        attendsConference: true,
        attendsWorkshop: false,
        workshopCrew: false,
        sponsorIncluded: false,
        actualCount: null,
      },
    ])

  const handleSave = () => {
    setError(null)
    if (items.some((item) => !item.name.trim())) {
      setError('Every ticket type needs a name.')
      return
    }
    if (items.filter((item) => item.sponsorIncluded).length > 1) {
      setError('At most one ticket type can be sponsor-included.')
      return
    }
    if (items.some((item) => item.attendsWorkshop && item.workshopCrew)) {
      setError(
        'A ticket type cannot be both a workshop attendee and workshop-day crew (it would be double-counted in workshop-day costs).',
      )
      return
    }
    saveMutation.mutate({
      ticketTypes: items.map((item) => ({
        _key: item._key,
        name: item.name,
        priceInclVat: item.priceInclVat ?? 0,
        attendsConference: item.attendsConference ?? false,
        attendsWorkshop: item.attendsWorkshop ?? false,
        workshopCrew: item.workshopCrew ?? false,
        sponsorIncluded: item.sponsorIncluded ?? false,
        actualCount: item.actualCount ?? null,
      })),
    })
  }

  return (
    <EditableTableCard
      editing={editing}
      onStartEdit={startEdit}
      onSave={handleSave}
      onCancel={cancel}
      isDirty={isDirty}
      isSaving={saveMutation.isPending}
      saveLabel="Save ticket types"
      editLabel="Edit ticket types"
      error={error}
      display={display}
    >
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        {manualActualsInUse
          ? 'Prices in NOK incl VAT. “Actual sold” feeds ticket income (no ticketing provider connected).'
          : 'Prices in NOK incl VAT. Attendance flags drive per-person costs; scenario quantities live on the config page.'}
      </p>
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Name</th>
              <th className={`${thClass} text-right`}>Price incl VAT</th>
              <th className={`${thClass} text-center`}>Conf</th>
              <th className={`${thClass} text-center`}>Workshop</th>
              <th className={`${thClass} text-center`}>Crew</th>
              <th className={`${thClass} text-center`}>Sponsor-incl</th>
              <th className={`${thClass} text-right`}>Actual sold</th>
              <th className={`${thClass} text-center`}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._key} className={tbodyRowClass}>
                <td className={tdClass}>
                  <TextCell
                    ariaLabel="Ticket type name"
                    value={item.name}
                    onChange={(v) => update(item._key, { name: v })}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Price incl VAT for ${item.name || 'ticket type'}`}
                    value={item.priceInclVat}
                    onChange={(v) =>
                      update(item._key, {
                        priceInclVat: numberOrNull(v) ?? 0,
                      })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <CheckboxCell
                    ariaLabel={`${item.name || 'Ticket type'} attends conference`}
                    checked={item.attendsConference ?? false}
                    onChange={(c) =>
                      update(item._key, { attendsConference: c })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <CheckboxCell
                    ariaLabel={`${item.name || 'Ticket type'} attends workshop`}
                    checked={item.attendsWorkshop ?? false}
                    onChange={(c) => update(item._key, { attendsWorkshop: c })}
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <CheckboxCell
                    ariaLabel={`${item.name || 'Ticket type'} is workshop-day crew`}
                    checked={item.workshopCrew ?? false}
                    onChange={(c) => update(item._key, { workshopCrew: c })}
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <CheckboxCell
                    ariaLabel={`${item.name || 'Ticket type'} is sponsor-included`}
                    checked={item.sponsorIncluded ?? false}
                    onChange={(c) => update(item._key, { sponsorIncluded: c })}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Actual sold for ${item.name || 'ticket type'}`}
                    value={item.actualCount ?? ''}
                    placeholder="—"
                    widthClass="w-24"
                    onChange={(v) =>
                      update(item._key, { actualCount: numberOrNull(v) })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <DeleteRowButton
                    ariaLabel={
                      referencedKeys.has(item._key) &&
                      pendingRemoval === item._key
                        ? `Confirm removing ${item.name || 'ticket type'} (used by scenarios)`
                        : `Remove ${item.name || 'ticket type'}`
                    }
                    pending={pendingRemoval === item._key}
                    onClick={() => removeRow(item._key)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <AdminButton variant="secondary" size="sm" onClick={addRow}>
          <PlusIcon className="h-4 w-4" /> Add ticket type
        </AdminButton>
        {pendingRemoval ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            That ticket type is referenced by a scenario — click delete again to
            confirm; its scenario quantities will be dropped.
          </span>
        ) : null}
      </div>
    </EditableTableCard>
  )
}
