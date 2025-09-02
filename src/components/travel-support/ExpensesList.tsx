import {
  PencilIcon,
  TrashIcon,
  PaperClipIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { TravelExpense } from '@/lib/travel-support/types'
import { TravelSupportService } from '@/lib/travel-support/service'

interface ExpensesListProps {
  expenses: TravelExpense[]
  canEdit?: boolean
  onEdit?: (expense: TravelExpense) => void
  onDelete?: (expenseId: string) => void
  onDeleteReceipt?: (expenseId: string, receiptIndex: number) => void
  className?: string
}

interface ExpenseItemProps {
  expense: TravelExpense
  canEdit?: boolean
  onEdit?: (expense: TravelExpense) => void
  onDelete?: (expenseId: string) => void
  onDeleteReceipt?: (expenseId: string, receiptIndex: number) => void
}

function ExpenseItem({
  expense,
  canEdit = false,
  onEdit,
  onDelete,
  onDeleteReceipt,
}: ExpenseItemProps) {
  const categoryName = TravelSupportService.getCategoryDisplayName(
    expense.category,
  )
  const formattedAmount = TravelSupportService.formatCurrency(
    expense.amount,
    expense.currency,
    expense.customCurrency,
  )

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 dark:text-white">
            {expense.description}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
              {categoryName}
            </span>
            {expense.location && <span>📍 {expense.location}</span>}
            <span>📅 {expense.expenseDate}</span>
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
            {onEdit && (
              <button
                onClick={() => onEdit(expense)}
                className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(expense._id)}
                className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 ring-inset hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-800 dark:hover:bg-red-900/40"
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
                      className="inline-flex items-center rounded-md bg-red-100 p-1 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/75"
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
}: ExpensesListProps) {
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
    <div className={`space-y-4 ${className}`}>
      {expenses.map((expense) => (
        <ExpenseItem
          key={expense._id}
          expense={expense}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
          onDeleteReceipt={onDeleteReceipt}
        />
      ))}
    </div>
  )
}
