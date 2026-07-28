'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'

import type {
  BudgetFixedCostItem,
  BudgetVariableCostItem,
  ExpenseCategory,
  VariableCostBasis,
} from '@/lib/budget'
import { generateKey } from '@/lib/sanity/helpers'
import { api } from '@/lib/trpc/client'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { BASIS_OPTIONS, CATEGORY_OPTIONS, numberOrNull } from './fields'
import { EditableTableCard } from './EditableTableCard'
import {
  CheckboxCell,
  DeleteRowButton,
  NumberCell,
  SelectCell,
  TextCell,
  tableClass,
  tableWrapClass,
  tbodyRowClass,
  tdClass,
  theadClass,
  thClass,
} from './BudgetTableCells'

export interface BudgetExpensesEditorProps {
  variableCosts: BudgetVariableCostItem[]
  fixedCosts: BudgetFixedCostItem[]
  /**
   * `_key`s referenced by scenarios (cut-cost lists). Deleting a referenced
   * row silently orphans those references, so it takes a confirming second
   * click.
   */
  scenarioReferencedKeys?: string[]
  /** Read-only summary shown when not editing (expense-by-category rows). */
  display: ReactNode
  defaultEditing?: boolean
}

/**
 * Expense editor: edits BOTH expense arrays of the budget document — fixed
 * costs (with optional-cost flag + manual actuals) and per-person variable
 * costs. Edits INLINE ON THE PAGE as two full-width spreadsheet tables (one
 * row per line item) — no modal, no per-row cards.
 */
export function BudgetExpensesEditor({
  variableCosts,
  fixedCosts,
  scenarioReferencedKeys = [],
  display,
  defaultEditing = false,
}: BudgetExpensesEditorProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const referencedKeys = new Set(scenarioReferencedKeys)

  const [editing, setEditing] = useState(defaultEditing)
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
      setEditing(false)
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
  const startEdit = () => {
    reset()
    setEditing(true)
  }
  const cancel = () => {
    setEditing(false)
    reset()
  }

  const updateVariable = (
    key: string,
    patch: Partial<BudgetVariableCostItem>,
  ) =>
    setVariable((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item)),
    )
  const updateFixed = (key: string, patch: Partial<BudgetFixedCostItem>) =>
    setFixed((prev) =>
      prev.map((item) => (item._key === key ? { ...item, ...patch } : item)),
    )

  const removeFixed = (key: string) => {
    if (referencedKeys.has(key) && pendingRemoval !== key) {
      setPendingRemoval(key)
      return
    }
    setPendingRemoval(null)
    setFixed((prev) => prev.filter((x) => x._key !== key))
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
    <EditableTableCard
      editing={editing}
      onStartEdit={startEdit}
      onSave={handleSave}
      onCancel={cancel}
      isDirty={isDirty}
      isSaving={saveMutation.isPending}
      saveLabel="Save expenses"
      editLabel="Edit expenses"
      error={error}
      display={display}
    >
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        All amounts in NOK, including VAT (what the organization pays).
      </p>

      {/* Fixed costs */}
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
        Fixed costs
      </h3>
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>Category</th>
              <th className={`${thClass} text-right`}>Budget</th>
              <th className={`${thClass} text-right`}>Actual</th>
              <th className={`${thClass} text-center`}>Optional</th>
              <th className={`${thClass} text-center`}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fixed.map((item) => (
              <tr key={item._key} className={tbodyRowClass}>
                <td className={tdClass}>
                  <TextCell
                    ariaLabel="Fixed cost name"
                    value={item.name}
                    onChange={(v) => updateFixed(item._key, { name: v })}
                  />
                </td>
                <td className={tdClass}>
                  <SelectCell
                    ariaLabel={`Category for ${item.name || 'fixed cost'}`}
                    value={item.category}
                    options={CATEGORY_OPTIONS}
                    onChange={(v) =>
                      updateFixed(item._key, { category: v as ExpenseCategory })
                    }
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Budget for ${item.name || 'fixed cost'}`}
                    value={item.amount}
                    onChange={(v) =>
                      updateFixed(item._key, { amount: numberOrNull(v) ?? 0 })
                    }
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Actual for ${item.name || 'fixed cost'}`}
                    value={item.actualAmount ?? ''}
                    placeholder="—"
                    onChange={(v) =>
                      updateFixed(item._key, { actualAmount: numberOrNull(v) })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <CheckboxCell
                    ariaLabel={`${item.name || 'Fixed cost'} is optional`}
                    checked={item.optional ?? false}
                    onChange={(c) => updateFixed(item._key, { optional: c })}
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <DeleteRowButton
                    ariaLabel={
                      referencedKeys.has(item._key) &&
                      pendingRemoval === item._key
                        ? `Confirm removing ${item.name || 'fixed cost'} (used by scenarios)`
                        : `Remove ${item.name || 'fixed cost'}`
                    }
                    pending={pendingRemoval === item._key}
                    onClick={() => removeFixed(item._key)}
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
          <PlusIcon className="h-4 w-4" /> Add fixed cost
        </AdminButton>
        {pendingRemoval ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            That cost is referenced by a scenario — click delete again to
            confirm; scenario references will be orphaned.
          </span>
        ) : null}
      </div>

      {/* Variable costs */}
      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-900 dark:text-white">
        Variable costs (per person)
      </h3>
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead className={theadClass}>
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>Category</th>
              <th className={`${thClass} text-right`}>NOK / person</th>
              <th className={thClass}>Basis</th>
              <th className={`${thClass} text-right`}>Actual</th>
              <th className={`${thClass} text-center`}>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {variable.map((item) => (
              <tr key={item._key} className={tbodyRowClass}>
                <td className={tdClass}>
                  <TextCell
                    ariaLabel="Variable cost name"
                    value={item.name}
                    onChange={(v) => updateVariable(item._key, { name: v })}
                  />
                </td>
                <td className={tdClass}>
                  <SelectCell
                    ariaLabel={`Category for ${item.name || 'variable cost'}`}
                    value={item.category}
                    options={CATEGORY_OPTIONS}
                    onChange={(v) =>
                      updateVariable(item._key, {
                        category: v as ExpenseCategory,
                      })
                    }
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`NOK per person for ${item.name || 'variable cost'}`}
                    value={item.amountPerPerson}
                    onChange={(v) =>
                      updateVariable(item._key, {
                        amountPerPerson: numberOrNull(v) ?? 0,
                      })
                    }
                  />
                </td>
                <td className={tdClass}>
                  <SelectCell
                    ariaLabel={`Basis for ${item.name || 'variable cost'}`}
                    value={item.basis}
                    options={BASIS_OPTIONS}
                    onChange={(v) =>
                      updateVariable(item._key, {
                        basis: v as VariableCostBasis,
                      })
                    }
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <NumberCell
                    ariaLabel={`Actual for ${item.name || 'variable cost'}`}
                    value={item.actualAmount ?? ''}
                    placeholder="—"
                    onChange={(v) =>
                      updateVariable(item._key, {
                        actualAmount: numberOrNull(v),
                      })
                    }
                  />
                </td>
                <td className={`${tdClass} text-center`}>
                  <DeleteRowButton
                    ariaLabel={`Remove ${item.name || 'variable cost'}`}
                    onClick={() =>
                      setVariable((prev) =>
                        prev.filter((x) => x._key !== item._key),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <AdminButton
          variant="secondary"
          size="sm"
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
          <PlusIcon className="h-4 w-4" /> Add variable cost
        </AdminButton>
      </div>
    </EditableTableCard>
  )
}
