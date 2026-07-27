import {
  EXPENSE_CATEGORY_LABELS,
  VARIABLE_COST_BASIS_LABELS,
  type ExpenseCategory,
  type VariableCostBasis,
} from '@/lib/budget'

/** Shared field styling + parsing for the budget editor islands. */

export const inputClass =
  'block w-full rounded-md border-0 bg-white px-2 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600 dark:bg-gray-900 dark:text-white dark:ring-gray-600'

export const labelClass =
  'block text-xs font-medium text-gray-600 dark:text-gray-300'

export const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] =
  Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({
    value: value as ExpenseCategory,
    label,
  }))

export const BASIS_OPTIONS: { value: VariableCostBasis; label: string }[] =
  Object.entries(VARIABLE_COST_BASIS_LABELS).map(([value, label]) => ({
    value: value as VariableCostBasis,
    label,
  }))

/** '' -> null; unparsable -> null; otherwise the number. */
export function numberOrNull(value: string): number | null {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
