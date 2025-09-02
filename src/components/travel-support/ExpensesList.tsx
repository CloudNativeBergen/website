import { useState } from 'react'
import {
  PencilIcon,
  TrashIcon,
  PaperClipIcon,
  XMarkIcon,
  MapPinIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import { TravelExpense, TravelExpenseInput } from '@/lib/travel-support/types'
import { TravelSupportService } from '@/lib/travel-support/service'
import { ExpenseForm } from './ExpenseForm'

interface ExpensesListProps {
  expenses: TravelExpense[]
  canEdit?: boolean
  onEdit?: (expenseId: string, expense: TravelExpenseInput) => void
  onDelete?: (expenseId: string) => void
  onDeleteReceipt?: (expenseId: string, receiptIndex: number) => void
  className?: string
  isUpdatingExpense?: boolean
  expenseError?: string | null
}

interface ExpenseItemProps {
  expense: TravelExpense
  canEdit?: boolean
  onEdit?: (expenseId: string, expense: TravelExpenseInput) => void
  onDelete?: (expenseId: string) => void
  onDeleteReceipt?: (expenseId: string, receiptIndex: number) => void
  isEditing?: boolean
  isUpdating?: boolean
  editError?: string | null
  onStartEdit?: () => void
  onCancelEdit?: () => void
}

function ExpenseItem({
  expense,
  canEdit = false,
  onEdit,
  onDelete,
  onDeleteReceipt,
  isEditing = false,
  isUpdating = false,
  editError = null,
  onStartEdit,
  onCancelEdit,
}: ExpenseItemProps) {
  const categoryName = TravelSupportService.getCategoryDisplayName(
    expense.category,
  )
  const formattedAmount = TravelSupportService.formatCurrency(
    expense.amount,
    expense.currency,
    expense.customCurrency,
  )

  const handleExpenseSave = (expenseData: TravelExpenseInput) => {
    if (onEdit) {
      onEdit(expense._id, expenseData)
    }
  }

  const handleCancel = () => {
    if (onCancelEdit) {
      onCancelEdit()
    }
  }

  // If in editing mode, show the form
  if (isEditing) {
    return (
      <div className="rounded-lg border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/50 to-blue-50/50 p-4 shadow-sm transition-all duration-200 dark:border-indigo-700 dark:from-indigo-900/20 dark:to-blue-900/20">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500"></div>
            <h4 className="font-medium text-indigo-900 dark:text-indigo-200">
              Editing: {expense.description}
            </h4>
          </div>
          <button
            onClick={handleCancel}
            disabled={isUpdating}
            className="rounded-md p-1 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-800"
            title="Cancel editing"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <ExpenseForm
          initialData={{
            category: expense.category,
            description: expense.description,
            amount: expense.amount,
            currency: expense.currency,
            customCurrency: expense.customCurrency,
            expenseDate: expense.expenseDate,
            location: expense.location,
            receipts: expense.receipts,
          }}
          onSave={handleExpenseSave}
          onCancel={handleCancel}
          isLoading={isUpdating}
          error={editError || undefined}
          mode="edit"
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 transition-all duration-200 hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-gray-600">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 dark:text-white">
            {expense.description}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
              {categoryName}
            </span>
            {expense.location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-4 w-4 text-gray-400" />
                {expense.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
              {expense.expenseDate}
            </span>
          </div>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
            {formattedAmount}
          </p>
          {expense.receipts && expense.receipts.length > 0 && (
            <div className="mt-2 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <PaperClipIcon className="h-4 w-4" />
              {expense.receipts.length} receipt
              {expense.receipts.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {canEdit && expense.status === 'pending' && (
          <div className="ml-4 flex gap-2">
            {onStartEdit && (
              <button
                onClick={onStartEdit}
                className="group inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 transition-all ring-inset hover:bg-gray-50 hover:ring-indigo-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:ring-indigo-500"
                aria-label={`Edit expense: ${expense.description}`}
              >
                <PencilIcon className="h-4 w-4 transition-transform group-hover:scale-110" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(expense._id)}
                className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 transition-all ring-inset hover:bg-red-100 focus:ring-2 focus:ring-red-600 focus:outline-none dark:bg-red-900/20 dark:text-red-400 dark:ring-red-800 dark:hover:bg-red-900/40"
                aria-label={`Delete expense: ${expense.description}`}
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Receipts Section */}
      {expense.receipts && expense.receipts.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Receipts ({expense.receipts.length})
            </p>
            {expense.receipts.map((receipt, receiptIndex) => (
              <div
                key={receiptIndex}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700/50"
              >
                <div className="flex items-center gap-2">
                  <PaperClipIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {receipt.filename || `Receipt ${receiptIndex + 1}`}
                  </span>
                </div>
                {canEdit &&
                  expense.status === 'pending' &&
                  onDeleteReceipt &&
                  expense.receipts.length > 1 && (
                    <button
                      onClick={() => onDeleteReceipt(expense._id, receiptIndex)}
                      className="inline-flex items-center rounded-md bg-red-100 p-1 text-red-700 hover:bg-red-200 focus:ring-2 focus:ring-red-600 focus:outline-none dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/75"
                      title="Delete receipt"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ExpensesList({
  expenses,
  canEdit = false,
  onEdit,
  onDelete,
  onDeleteReceipt,
  className = '',
  isUpdatingExpense = false,
  expenseError = null,
}: ExpensesListProps) {
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

  const handleStartEdit = (expenseId: string) => {
    setEditingExpenseId(expenseId)
  }

  const handleCancelEdit = () => {
    setEditingExpenseId(null)
  }

  const handleExpenseEdit = async (
    expenseId: string,
    expense: TravelExpenseInput,
  ) => {
    if (onEdit) {
      try {
        await onEdit(expenseId, expense)
        // Only reset editing state on successful update
        setEditingExpenseId(null)
      } catch (error) {
        // Keep editing mode on error so user can retry
        console.error('Failed to update expense:', error)
      }
    }
  }

  if (expenses.length === 0) {
    return (
      <div className={`py-8 text-center ${className}`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <PaperClipIcon className="h-6 w-6 text-gray-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          No expenses yet
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Start by adding your first travel expense.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 transition-all duration-200 ${className}`}>
      {expenses.map((expense) => (
        <div key={expense._id} className="transition-all duration-200">
          <ExpenseItem
            expense={expense}
            canEdit={canEdit}
            onEdit={handleExpenseEdit}
            onDelete={onDelete}
            onDeleteReceipt={onDeleteReceipt}
            isEditing={editingExpenseId === expense._id}
            isUpdating={isUpdatingExpense && editingExpenseId === expense._id}
            editError={editingExpenseId === expense._id ? expenseError : null}
            onStartEdit={() => handleStartEdit(expense._id)}
            onCancelEdit={handleCancelEdit}
          />
        </div>
      ))}
    </div>
  )
}
