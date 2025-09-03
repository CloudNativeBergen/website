import { PencilIcon, PlusIcon } from '@heroicons/react/24/outline'
import { BankingDetails } from '@/lib/travel-support/types'

interface BankingDetailsDisplayProps {
  bankingDetails: BankingDetails
  canEdit?: boolean
  onEdit?: () => void
  className?: string
}

function BankingDetailField({
  label,
  value,
  isMonospace = false,
}: {
  label: string
  value: string | undefined
  isMonospace?: boolean
}) {
  if (!value) return null

  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={`text-sm text-gray-900 dark:text-white ${isMonospace ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

export function BankingDetailsDisplay({
  bankingDetails,
  canEdit = false,
  onEdit,
  className = '',
}: BankingDetailsDisplayProps) {
  const hasDetails = Boolean(bankingDetails.beneficiaryName)

  if (!hasDetails) {
    return (
      <div className={`py-8 text-center ${className}`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <svg
            className="h-6 w-6 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          No banking details
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add your banking information for reimbursements.
        </p>
        {canEdit && onEdit && (
          <div className="mt-4">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <PlusIcon className="h-4 w-4" />
              Add Banking Details
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-start justify-between">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <BankingDetailField
            label="Beneficiary Name"
            value={bankingDetails.beneficiaryName}
          />
          <BankingDetailField
            label="Bank Name"
            value={bankingDetails.bankName}
          />
          <BankingDetailField
            label="IBAN"
            value={bankingDetails.iban}
            isMonospace
          />
          <BankingDetailField
            label="Account Number"
            value={bankingDetails.accountNumber}
            isMonospace
          />
          <BankingDetailField
            label="SWIFT/BIC Code"
            value={bankingDetails.swiftCode}
            isMonospace
          />
          <BankingDetailField label="Country" value={bankingDetails.country} />
          <BankingDetailField
            label="Preferred Currency"
            value={bankingDetails.preferredCurrency}
          />
        </div>

        {canEdit && onEdit && (
          <button
            onClick={onEdit}
            className="ml-4 inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
        )}
      </div>
    </div>
  )
}
