'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

import type {
  BudgetFixedCostItem,
  BudgetVariableCostItem,
  ExpenseCategory,
  VariableCostBasis,
} from '@/lib/budget'
import { generateKey } from '@/lib/sanity/helpers'
import { api } from '@/lib/trpc/client'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  BASIS_OPTIONS,
  CATEGORY_OPTIONS,
  inputClass,
  labelClass,
  numberOrNull,
  removeButtonClass,
} from './fields'

export interface BudgetExpensesEditorProps {
  variableCosts: BudgetVariableCostItem[]
  fixedCosts: BudgetFixedCostItem[]
  /**
   * `_key`s referenced by scenarios (cut-cost lists). Deleting a referenced
   * row silently orphans those references, so it takes a confirming second
   * click.
   */
  scenarioReferencedKeys?: string[]
  defaultOpen?: boolean
}

/**
 * Expense CRUD editor island (house editor idiom: pencil trigger +
 * ModalShell with dirty-close confirm, save via tRPC + router.refresh).
 * Edits BOTH expense arrays of the budget document: per-person variable
 * costs and fixed costs (with optional-cost flag and manual actuals).
 */
export function BudgetExpensesEditor({
  variableCosts,
  fixedCosts,
  scenarioReferencedKeys = [],
  defaultOpen = false,
}: BudgetExpensesEditorProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const referencedKeys = new Set(scenarioReferencedKeys)

  const [isOpen, setIsOpen] = useState(defaultOpen)
  // Referenced row awaiting delete confirmation (second click removes).
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [variable, setVariable] = useState<BudgetVariableCostItem[]>(() =>
    structuredClone(variableCosts),
  )
  const [fixed, setFixed] = useState<BudgetFixedCostItem[]>(() =>
    structuredClone(fixedCosts),
  )
  const [error, setError] = useState<string | null>(null)

  const isDirty =
    JSON.stringify({ variable, fixed }) !==
    JSON.stringify({ variable: variableCosts, fixed: fixedCosts })

  const saveMutation = api.budget.updateExpenses.useMutation({
    onSuccess: () => {
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Expenses updated',
        message: 'Budget expense lines saved.',
      })
      setIsOpen(false)
    },
    onError: (err) => {
      setError(err.message || 'Failed to save expenses.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save expenses.',
      })
    },
  })

  const reset = () => {
    setVariable(structuredClone(variableCosts))
    setFixed(structuredClone(fixedCosts))
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

  const updateVariable = (
    key: string,
    patch: Partial<BudgetVariableCostItem>,
  ) => {
    setVariable((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item)),
    )
  }
  const updateFixed = (key: string, patch: Partial<BudgetFixedCostItem>) => {
    setFixed((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item)),
    )
  }

  const handleSave = () => {
    setError(null)
    if ([...variable, ...fixed].some((item) => !item.name.trim())) {
      setError('Every expense line needs a name.')
      return
    }
    saveMutation.mutate({
      variableCosts: variable.map((item) => ({
        ...item,
        actualAmount: item.actualAmount ?? null,
      })),
      fixedCosts: fixed.map((item) => ({
        ...item,
        optional: item.optional ?? false,
        actualAmount: item.actualAmount ?? null,
      })),
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Edit expenses"
        onClick={openModal}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>
      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="xl"
        title="Edit expenses"
        subtitle="Fixed costs (with optional-cost flags) and per-person variable costs. Amounts in NOK incl VAT."
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
          className="space-y-6"
        >
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Fixed costs
            </h3>
            <div className="mt-2 space-y-3">
              {fixed.map((item) => (
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
                            updateFixed(item._key, { name: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="sm:col-span-3">
                      <label className={labelClass}>
                        Category
                        <select
                          className={inputClass}
                          value={item.category}
                          onChange={(e) =>
                            updateFixed(item._key, {
                              category: e.target.value as ExpenseCategory,
                            })
                          }
                        >
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Budget (NOK)
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={item.amount}
                          onChange={(e) =>
                            updateFixed(item._key, {
                              amount: numberOrNull(e.target.value) ?? 0,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Actual (NOK)
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={item.actualAmount ?? ''}
                          onChange={(e) =>
                            updateFixed(item._key, {
                              actualAmount: numberOrNull(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex items-end justify-between gap-2 sm:col-span-1">
                      <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={item.optional ?? false}
                          onChange={(e) =>
                            updateFixed(item._key, {
                              optional: e.target.checked,
                            })
                          }
                        />
                        Optional
                      </label>
                      <button
                        type="button"
                        aria-label={
                          referencedKeys.has(item._key) &&
                          pendingRemoval === item._key
                            ? `Confirm removing ${item.name || 'fixed cost'} (used by scenarios)`
                            : `Remove ${item.name || 'fixed cost'}`
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
                          setFixed((prev) =>
                            prev.filter((x) => x._key !== item._key),
                          )
                        }}
                        className={removeButtonClass}
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
              className="mt-3"
              onClick={() =>
                setFixed((prev) => [
                  ...prev,
                  {
                    _key: generateKey('fixedcost'),
                    name: '',
                    category: 'other',
                    amount: 0,
                    optional: false,
                    actualAmount: null,
                  },
                ])
              }
            >
              <PlusIcon className="mr-1 h-4 w-4" /> Add fixed cost
            </AdminButton>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Variable costs (per person)
            </h3>
            <div className="mt-2 space-y-3">
              {variable.map((item) => (
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
                            updateVariable(item._key, { name: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Category
                        <select
                          className={inputClass}
                          value={item.category}
                          onChange={(e) =>
                            updateVariable(item._key, {
                              category: e.target.value as ExpenseCategory,
                            })
                          }
                        >
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        NOK / person
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={item.amountPerPerson}
                          onChange={(e) =>
                            updateVariable(item._key, {
                              amountPerPerson:
                                numberOrNull(e.target.value) ?? 0,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Basis
                        <select
                          className={inputClass}
                          value={item.basis}
                          onChange={(e) =>
                            updateVariable(item._key, {
                              basis: e.target.value as VariableCostBasis,
                            })
                          }
                        >
                          {BASIS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex items-end gap-2 sm:col-span-2">
                      <label className={`${labelClass} grow`}>
                        Actual (NOK)
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={item.actualAmount ?? ''}
                          onChange={(e) =>
                            updateVariable(item._key, {
                              actualAmount: numberOrNull(e.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name || 'variable cost'}`}
                        onClick={() =>
                          setVariable((prev) =>
                            prev.filter((x) => x._key !== item._key),
                          )
                        }
                        className={`${removeButtonClass} shrink-0`}
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
              className="mt-3"
              onClick={() =>
                setVariable((prev) => [
                  ...prev,
                  {
                    _key: generateKey('varcost'),
                    name: '',
                    category: 'catering',
                    amountPerPerson: 0,
                    basis: 'conference',
                    actualAmount: null,
                  },
                ])
              }
            >
              <PlusIcon className="mr-1 h-4 w-4" /> Add variable cost
            </AdminButton>
          </section>

          {pendingRemoval && (
            <p
              role="alert"
              className="text-sm text-amber-700 dark:text-amber-400"
            >
              This cost is referenced by one or more scenarios &mdash; click
              remove again to confirm. Scenario references to it will be
              orphaned.
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
              {saveMutation.isPending ? 'Saving…' : 'Save expenses'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
