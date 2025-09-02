'use client'

import { useState } from 'react'
import {
  BankingDetails,
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
} from '@/lib/travel-support/types'
import {
  Input,
  Dropdown,
  HelpText,
  ErrorText,
  Checkbox,
} from '@/components/Form'
import { ValidationErrorSummary } from './ErrorComponents'
import { ErrorBoundary } from './ErrorBoundary'

interface BankingDetailsFormProps {
  initialData?: BankingDetails
  onSave: (data: BankingDetails) => void
  isLoading?: boolean
  error?: string
}

export function BankingDetailsForm({
  initialData,
  onSave,
  isLoading = false,
  error,
}: BankingDetailsFormProps) {
  const [formData, setFormData] = useState<BankingDetails>({
    beneficiaryName: initialData?.beneficiaryName || '',
    bankName: initialData?.bankName || '',
    iban: initialData?.iban || '',
    accountNumber: initialData?.accountNumber || '',
    swiftCode: initialData?.swiftCode || '',
    country: initialData?.country || '',
    preferredCurrency: initialData?.preferredCurrency || 'NOK',
  })

  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})

  // Financial data processing consent
  const [financialDataConsent, setFinancialDataConsent] = useState(false)

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.beneficiaryName.trim()) {
      errors.beneficiaryName = 'Beneficiary name is required'
    }

    if (!formData.bankName.trim()) {
      errors.bankName = 'Bank name is required'
    }

    if (!formData.swiftCode.trim()) {
      errors.swiftCode = 'SWIFT/BIC code is required'
    } else if (
      formData.swiftCode.length < 8 ||
      formData.swiftCode.length > 11
    ) {
      errors.swiftCode = 'SWIFT/BIC code must be 8-11 characters'
    }

    if (!formData.country.trim()) {
      errors.country = 'Country is required'
    }

    if (!formData.iban && !formData.accountNumber) {
      errors.iban = 'Either IBAN or Account Number is required'
      errors.accountNumber = 'Either IBAN or Account Number is required'
    }

    // Add consent validation
    if (!financialDataConsent) {
      errors.consent =
        'You must consent to financial data processing to save banking details'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      onSave(formData)
    }
  }

  const updateField = (field: keyof BankingDetails, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]:
        field === 'preferredCurrency' ? (value as SupportedCurrency) : value,
    }))
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  return (
    <ErrorBoundary>
      <form onSubmit={handleSubmit} className="space-y-12">
        <div className="border-b border-gray-900/10 pb-12 dark:border-white/10">
          <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
            Banking Details for Reimbursement
          </h2>
          <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">
            Provide your banking information for international wire transfers.
            All information is securely stored and only accessible to
            organizers.
          </p>

          {error && (
            <div className="mt-6 rounded-md bg-red-50 p-4 dark:bg-red-900/10">
              <ErrorText>{error}</ErrorText>
            </div>
          )}

          {Object.keys(validationErrors).length > 0 && (
            <div className="mt-6">
              <ValidationErrorSummary errors={validationErrors} />
            </div>
          )}

          <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <Input
                name="beneficiaryName"
                label="Beneficiary Name *"
                value={formData.beneficiaryName}
                setValue={(value) => updateField('beneficiaryName', value)}
              />
              {validationErrors.beneficiaryName && (
                <ErrorText>{validationErrors.beneficiaryName}</ErrorText>
              )}
              <HelpText>Full name as it appears on your bank account</HelpText>
            </div>

            <div className="sm:col-span-6">
              <Input
                name="bankName"
                label="Bank Name *"
                value={formData.bankName}
                setValue={(value) => updateField('bankName', value)}
              />
              {validationErrors.bankName && (
                <ErrorText>{validationErrors.bankName}</ErrorText>
              )}
            </div>

            <div className="sm:col-span-3">
              <Input
                name="iban"
                label="IBAN"
                value={formData.iban || ''}
                setValue={(value) => updateField('iban', value)}
              />
              {validationErrors.iban && (
                <ErrorText>{validationErrors.iban}</ErrorText>
              )}
              <HelpText>
                International Bank Account Number (for EU/EEA countries).
                Example: DE89 3704 0044 0532 0130 00
              </HelpText>
            </div>

            <div className="sm:col-span-3">
              <Input
                name="accountNumber"
                label="Account Number"
                value={formData.accountNumber || ''}
                setValue={(value) => updateField('accountNumber', value)}
              />
              {validationErrors.accountNumber && (
                <ErrorText>{validationErrors.accountNumber}</ErrorText>
              )}
              <HelpText>
                Use this field if your country doesn&apos;t use IBAN
              </HelpText>
            </div>

            <div className="sm:col-span-3">
              <Input
                name="swiftCode"
                label="SWIFT/BIC Code *"
                value={formData.swiftCode}
                setValue={(value) =>
                  updateField('swiftCode', value.toUpperCase())
                }
              />
              {validationErrors.swiftCode && (
                <ErrorText>{validationErrors.swiftCode}</ErrorText>
              )}
              <HelpText>
                8-11 character bank identifier for international transfers.
                Example: DEUTDEFF
              </HelpText>
            </div>

            <div className="sm:col-span-3">
              <Input
                name="country"
                label="Country *"
                value={formData.country}
                setValue={(value) => updateField('country', value)}
              />
              {validationErrors.country && (
                <ErrorText>{validationErrors.country}</ErrorText>
              )}
              <HelpText>Country where your bank account is located</HelpText>
            </div>

            <div className="sm:col-span-3">
              <Dropdown
                name="preferredCurrency"
                label="Preferred Currency *"
                value={formData.preferredCurrency}
                setValue={(value) => updateField('preferredCurrency', value)}
                options={
                  new Map(
                    SUPPORTED_CURRENCIES.map((currency) => [
                      currency,
                      currency,
                    ]),
                  )
                }
              />
              {validationErrors.preferredCurrency && (
                <ErrorText>{validationErrors.preferredCurrency}</ErrorText>
              )}
              <HelpText>
                Currency for expense summaries and reimbursements
              </HelpText>
            </div>
          </div>
        </div>

        {/* Financial Data Processing Consent */}
        <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
          <fieldset>
            <legend className="sr-only">
              Financial Data Processing Consent
            </legend>
            <div>
              <h3 className="text-base leading-6 font-semibold text-gray-900 dark:text-white">
                Financial Data Processing
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                We need your consent to process your financial data for travel
                reimbursements. Please review our{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Privacy Policy
                </a>{' '}
                for detailed information.
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <Checkbox
                name="financial-data-consent"
                label="I consent to the processing of my financial data for travel reimbursements"
                value={financialDataConsent}
                setValue={setFinancialDataConsent}
              >
                <HelpText>
                  <span className="text-red-600 dark:text-red-400">
                    Required:
                  </span>{' '}
                  We need this consent to process your banking details, handle
                  reimbursements, and manage financial transactions related to
                  your travel expenses.
                </HelpText>
              </Checkbox>
              {validationErrors.consent && (
                <ErrorText>{validationErrors.consent}</ErrorText>
              )}
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex items-center justify-end gap-x-6">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
          >
            {isLoading ? 'Saving...' : 'Save Banking Details'}
          </button>
        </div>
      </form>
    </ErrorBoundary>
  )
}
