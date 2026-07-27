'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

import type { BudgetTicketTypeItem } from '@/lib/budget'
import { generateKey } from '@/lib/sanity/helpers'
import { api } from '@/lib/trpc/client'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  checkboxLabelClass,
  inputClass,
  labelClass,
  numberOrNull,
  removeButtonClass,
} from './fields'

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
  defaultOpen?: boolean
}

/**
 * Ticket-mix editor island. Edits the budget's ticket-type assumptions
 * (price incl VAT + attendance flags that drive per-person costs) and the
 * manual "actual sold" counts used as the ticket-income fallback when no
 * ticketing provider is connected.
 */
export function BudgetTicketTypesEditor({
  ticketTypes,
  manualActualsInUse = false,
  scenarioReferencedKeys = [],
  defaultOpen = false,
}: BudgetTicketTypesEditorProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const referencedKeys = new Set(scenarioReferencedKeys)

  const [isOpen, setIsOpen] = useState(defaultOpen)
  // Referenced row awaiting delete confirmation (second click removes).
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
      setIsOpen(false)
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
  const openModal = () => {
    reset()
    setIsOpen(true)
  }
  const closeModal = () => {
    setIsOpen(false)
    reset()
  }

  const update = (key: string, patch: Partial<BudgetTicketTypeItem>) => {
    setItems((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item)),
    )
  }

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
    <>
      <button
        type="button"
        aria-label="Edit ticket types"
        onClick={openModal}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>
      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="xl"
        title="Edit ticket types"
        subtitle={
          manualActualsInUse
            ? 'Prices in NOK incl VAT. "Actual sold" feeds ticket income (no ticketing provider connected).'
            : 'Prices in NOK incl VAT. Attendance flags drive per-person costs; scenario quantities live on scenarios.'
        }
        icon={<PencilSquareIcon className="h-5 w-5" />}
        confirmOnDirtyClose
        isDirty={isDirty && !saveMutation.isPending}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item._key}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                  <div className="col-span-2 sm:col-span-4">
                    <label className={labelClass}>
                      Name
                      <input
                        type="text"
                        className={inputClass}
                        value={item.name}
                        onChange={(e) =>
                          update(item._key, { name: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Price (incl VAT)
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={item.priceInclVat}
                        onChange={(e) =>
                          update(item._key, {
                            priceInclVat: numberOrNull(e.target.value) ?? 0,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Actual sold
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={item.actualCount ?? ''}
                        onChange={(e) =>
                          update(item._key, {
                            actualCount: numberOrNull(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="col-span-2 flex flex-wrap items-end gap-x-4 sm:col-span-4">
                    <label className={checkboxLabelClass}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={item.attendsConference ?? false}
                        onChange={(e) =>
                          update(item._key, {
                            attendsConference: e.target.checked,
                          })
                        }
                      />
                      Conference
                    </label>
                    <label className={checkboxLabelClass}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={item.attendsWorkshop ?? false}
                        onChange={(e) =>
                          update(item._key, {
                            attendsWorkshop: e.target.checked,
                          })
                        }
                      />
                      Workshop
                    </label>
                    <label className={checkboxLabelClass}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={item.workshopCrew ?? false}
                        onChange={(e) =>
                          update(item._key, { workshopCrew: e.target.checked })
                        }
                      />
                      Crew
                    </label>
                    <label className={checkboxLabelClass}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={item.sponsorIncluded ?? false}
                        onChange={(e) =>
                          update(item._key, {
                            sponsorIncluded: e.target.checked,
                          })
                        }
                      />
                      Sponsor-incl
                    </label>
                    <button
                      type="button"
                      aria-label={
                        referencedKeys.has(item._key) &&
                        pendingRemoval === item._key
                          ? `Confirm removing ${item.name || 'ticket type'} (used by scenarios)`
                          : `Remove ${item.name || 'ticket type'}`
                      }
                      onClick={() => {
                        if (
                          referencedKeys.has(item._key) &&
                          pendingRemoval !== item._key
                        ) {
                          setPendingRemoval(item._key)
                          return
                        }
                        setPendingRemoval(null)
                        setItems((prev) =>
                          prev.filter((x) => x._key !== item._key),
                        )
                      }}
                      className={`ml-auto ${removeButtonClass}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
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
            }
          >
            <PlusIcon className="mr-1 h-4 w-4" /> Add ticket type
          </AdminButton>

          {pendingRemoval && (
            <p
              role="alert"
              className="text-sm text-amber-700 dark:text-amber-400"
            >
              This ticket type is referenced by one or more scenarios &mdash;
              click remove again to confirm. Its scenario quantities will be
              dropped.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeModal}
              disabled={saveMutation.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={saveMutation.isPending || !isDirty}
              className="min-h-[44px]"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save ticket types'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
