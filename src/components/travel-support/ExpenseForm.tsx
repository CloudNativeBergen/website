'use client'

import { useState } from 'react'
import { DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { ExpenseCategory, TravelExpenseInput } from '@/lib/travel-support/types'
import { TIMEOUTS } from '@/lib/travel-support/config'
import {
  Input,
  Dropdown,
  HelpText,
  ErrorText,
  Checkbox,
} from '@/components/Form'
import { NetworkErrorDisplay, ValidationErrorSummary } from './ErrorComponents'
import { ErrorBoundary } from './ErrorBoundary'

// Generate a unique key for receipt items
const generateReceiptKey = () => {
  return `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

interface ExpenseFormProps {
  onSave: (expense: TravelExpenseInput) => void
  onCancel: () => void
  isLoading?: boolean
  error?: string
  initialData?: Partial<TravelExpenseInput>
  mode?: 'add' | 'edit'
}

const categoryOptions = new Map([
  [ExpenseCategory.ACCOMMODATION, 'Accommodation'],
  [ExpenseCategory.TRANSPORTATION, 'Transportation'],
  [ExpenseCategory.MEALS, 'Meals'],
  [ExpenseCategory.VISA, 'Visa/Immigration'],
  [ExpenseCategory.OTHER, 'Other'],
])

const currencyOptions = new Map([
  ['NOK', 'Norwegian Krone (NOK)'],
  ['USD', 'US Dollar (USD)'],
  ['EUR', 'Euro (EUR)'],
  ['GBP', 'British Pound (GBP)'],
  ['SEK', 'Swedish Krona (SEK)'],
  ['DKK', 'Danish Krone (DKK)'],
  ['OTHER', 'Other (specify)'],
])

export function ExpenseForm({
  onSave,
  onCancel,
  isLoading = false,
  error,
  initialData,
  mode = 'add',
}: ExpenseFormProps) {
  const [formData, setFormData] = useState<Partial<TravelExpenseInput>>({
    category: initialData?.category || ExpenseCategory.ACCOMMODATION,
    currency: initialData?.currency || 'NOK',
    description: initialData?.description || '',
    amount: initialData?.amount || undefined,
    customCurrency: initialData?.customCurrency || '',
    expenseDate: initialData?.expenseDate || '',
    location: initialData?.location || '',
    receipts: initialData?.receipts || [],
  })

  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [networkError, setNetworkError] = useState<boolean>(false)

  // Receipt processing consent
  const [receiptProcessingConsent, setReceiptProcessingConsent] =
    useState(false)

  // Track existing receipts separately from new files
  const existingReceipts = initialData?.receipts || []

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.description?.trim()) {
      errors.description = 'Description is required'
    }

    if (!formData.amount || formData.amount <= 0) {
      errors.amount = 'Amount must be greater than 0'
    }

    if (!formData.expenseDate) {
      errors.expenseDate = 'Expense date is required'
    }

    if (formData.currency === 'OTHER' && !formData.customCurrency?.trim()) {
      errors.customCurrency = 'Currency code is required'
    }

    if (receiptFiles.length === 0 && existingReceipts.length === 0) {
      errors.receipts = 'At least one receipt is required'
    }

    // Add consent validation only if receipts are being uploaded
    if (
      (receiptFiles.length > 0 || existingReceipts.length > 0) &&
      !receiptProcessingConsent
    ) {
      errors.consent =
        'You must consent to receipt processing to submit expenses with receipts'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsUploading(true)

    try {
      // Upload new receipt files with better error handling
      const newReceipts = await Promise.all(
        receiptFiles.map(async (file) => {
          try {
            const formData = new FormData()
            formData.append('files', file)

            const controller = new AbortController()
            const timeoutId = setTimeout(
              () => controller.abort(),
              TIMEOUTS.fileUpload,
            )

            const response = await fetch('/api/travel-support/upload-receipt', {
              method: 'POST',
              body: formData,
              signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
              if (response.status === 413) {
                throw new Error(`File "${file.name}" is too large (max 10MB)`)
              }
              if (response.status === 400) {
                const errorData = await response
                  .json()
                  .catch(() => ({ error: 'Invalid file format' }))
                throw new Error(
                  `File "${file.name}": ${errorData.error || 'Invalid file'}`,
                )
              }
              if (response.status >= 500) {
                throw new Error(
                  `Server error uploading "${file.name}". Please try again.`,
                )
              }

              const errorData = await response
                .json()
                .catch(() => ({ error: 'Upload failed' }))
              throw new Error(
                `Failed to upload "${file.name}": ${errorData.error}`,
              )
            }

            const uploadResult = await response.json()

            if (!uploadResult.asset?._ref) {
              throw new Error(`Invalid upload response for "${file.name}"`)
            }

            return {
              _key: generateReceiptKey(),
              file: {
                _type: 'file' as const,
                asset: {
                  _ref: uploadResult.asset._ref,
                  _type: 'reference' as const,
                },
              },
              filename: uploadResult.filename || file.name,
              uploadedAt: new Date().toISOString(),
            }
          } catch (uploadError) {
            if (uploadError instanceof Error) {
              if (uploadError.name === 'AbortError') {
                throw new Error(
                  `Upload timeout for "${file.name}". Please try again.`,
                )
              }
              throw uploadError
            }
            throw new Error(`Failed to upload "${file.name}": Unknown error`)
          }
        }),
      )

      // Combine existing receipts with new uploads
      const allReceipts = [...existingReceipts, ...newReceipts]

      const expense: TravelExpenseInput = {
        category: formData.category!,
        description: formData.description!,
        amount: formData.amount!,
        currency: formData.currency as TravelExpenseInput['currency'],
        ...(formData.currency === 'OTHER' && formData.customCurrency
          ? { customCurrency: formData.customCurrency }
          : {}),
        expenseDate: formData.expenseDate!,
        location: formData.location,
        receipts: allReceipts,
      }

      onSave(expense)
    } catch (error) {
      console.error('Failed to process expense:', error)

      // Check for network errors
      if (error instanceof Error) {
        if (
          error.message.includes('network') ||
          error.message.includes('fetch') ||
          error.message.includes('Failed to fetch')
        ) {
          setNetworkError(true)
          return
        }
      }

      // Provide more specific error messages for non-network errors
      let errorMessage = 'Failed to upload receipts'
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = 'Upload timeout. Please try again with smaller files.'
        } else {
          errorMessage = error.message
        }
      }

      setValidationErrors({
        receipts: errorMessage,
      })
    } finally {
      setIsUploading(false)
    }
  }

  const updateField = <K extends keyof TravelExpenseInput>(
    field: K,
    value: TravelExpenseInput[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear validation error for this field
    if (validationErrors[field as string]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[field as string]
        return newErrors
      })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      addFiles(files)
    }
  }

  const addFiles = (files: File[]) => {
    // Filter out invalid files and track rejected ones
    const validFiles: File[] = []
    const rejectedFiles: string[] = []

    files.forEach((file) => {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
      ]
      const maxSize = 10 * 1024 * 1024 // 10MB

      if (!allowedTypes.includes(file.type)) {
        rejectedFiles.push(`${file.name} (invalid file type)`)
      } else if (file.size > maxSize) {
        rejectedFiles.push(`${file.name} (file too large)`)
      } else {
        validFiles.push(file)
      }
    })

    if (validFiles.length > 0) {
      setReceiptFiles((prev) => [...prev, ...validFiles])
    }

    if (rejectedFiles.length > 0) {
      setValidationErrors((prev) => ({
        ...prev,
        receipts: `Some files were rejected: ${rejectedFiles.join(', ')}`,
      }))
    } else if (validFiles.length > 0) {
      // Clear receipts validation error if we successfully added files
      setValidationErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors.receipts
        return newErrors
      })
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const removeFile = (index: number) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <ErrorBoundary>
      <form onSubmit={handleSubmit} className="space-y-12">
        <div className="border-b border-gray-900/10 pb-12 dark:border-white/10">
          <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
            {mode === 'edit' ? 'Edit Expense' : 'Add Expense'}
          </h2>
          <p className="mt-1 text-sm/6 text-gray-600 dark:text-gray-400">
            {mode === 'edit'
              ? 'Update your expense details and receipts.'
              : 'Provide details about your travel-related expense and upload receipt(s).'}
          </p>

          {error && (
            <div className="mt-6 rounded-md bg-red-50 p-4 dark:bg-red-900/10">
              <ErrorText>{error}</ErrorText>
            </div>
          )}

          {networkError && (
            <div className="mt-6">
              <NetworkErrorDisplay onRetry={() => setNetworkError(false)} />
            </div>
          )}

          {Object.keys(validationErrors).length > 0 && (
            <div className="mt-6">
              <ValidationErrorSummary errors={validationErrors} />
            </div>
          )}

          <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Dropdown
                name="category"
                label="Category *"
                value={formData.category || ''}
                setValue={(value) => updateField('category', value)}
                options={categoryOptions}
              />
              {validationErrors.category && (
                <ErrorText>{validationErrors.category}</ErrorText>
              )}
            </div>

            <div className="sm:col-span-3">
              <Input
                name="amount"
                label="Amount *"
                type="number"
                value={formData.amount?.toString() || ''}
                setValue={(value) =>
                  updateField('amount', parseFloat(value) || 0)
                }
              />
              {validationErrors.amount && (
                <ErrorText>{validationErrors.amount}</ErrorText>
              )}
            </div>

            <div className="sm:col-span-3">
              <Dropdown
                name="currency"
                label="Currency *"
                value={formData.currency || 'NOK'}
                setValue={(value) => updateField('currency', value)}
                options={currencyOptions}
              />
            </div>

            {formData.currency === 'OTHER' && (
              <div className="sm:col-span-3">
                <Input
                  name="customCurrency"
                  label="Currency Code *"
                  value={formData.customCurrency || ''}
                  setValue={(value) =>
                    updateField('customCurrency', value.toUpperCase())
                  }
                />
                {validationErrors.customCurrency && (
                  <ErrorText>{validationErrors.customCurrency}</ErrorText>
                )}
                <HelpText>
                  Enter 3-letter currency code (e.g., CAD, AUD, JPY)
                </HelpText>
              </div>
            )}

            <div className="sm:col-span-3">
              <Input
                name="expenseDate"
                label="Expense Date *"
                type="date"
                value={formData.expenseDate || ''}
                setValue={(value) => updateField('expenseDate', value)}
              />
              {validationErrors.expenseDate && (
                <ErrorText>{validationErrors.expenseDate}</ErrorText>
              )}
            </div>

            <div className="sm:col-span-3">
              <Input
                name="location"
                label="Location"
                value={formData.location || ''}
                setValue={(value) => updateField('location', value)}
              />
              {validationErrors.location && (
                <ErrorText>{validationErrors.location}</ErrorText>
              )}
              <HelpText>
                City/Country (e.g., &quot;Copenhagen, Denmark&quot; or
                &quot;Copenhagen → Bergen&quot;)
              </HelpText>
            </div>

            <div className="col-span-full">
              <Input
                name="description"
                label="Description *"
                value={formData.description || ''}
                setValue={(value) => updateField('description', value)}
              />
              {validationErrors.description && (
                <ErrorText>{validationErrors.description}</ErrorText>
              )}
              <HelpText>Detailed description of the expense</HelpText>
            </div>

            <div className="col-span-full">
              <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                Receipt(s) *
              </label>

              {/* Show existing receipts in edit mode */}
              {mode === 'edit' && existingReceipts.length > 0 && (
                <div className="mt-2 mb-4">
                  <p className="mb-2 text-sm/6 font-medium text-gray-900 dark:text-white">
                    Current receipts:
                  </p>
                  <div className="space-y-2">
                    {existingReceipts.map((receipt, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          📎 {receipt.filename}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(receipt.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Upload additional receipts below (optional):
                  </p>
                </div>
              )}

              <div
                className={`mt-2 flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors ${
                  isDragOver
                    ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20'
                    : 'border-gray-900/25 dark:border-white/25'
                } dark:bg-white/5`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-500">
                    <DocumentIcon className="h-full w-full" />
                  </div>
                  <div className="mt-4 flex text-sm/6 text-gray-600 dark:text-gray-300">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-transparent font-semibold text-indigo-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:focus-within:outline-indigo-500 dark:hover:text-indigo-300"
                    >
                      <span>Upload files</span>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs/5 text-gray-600 dark:text-gray-400">
                    PDF, JPG, PNG up to 10MB
                  </p>
                </div>
              </div>
              {validationErrors.receipts && (
                <ErrorText>{validationErrors.receipts}</ErrorText>
              )}
              <HelpText>
                Upload receipt files (PDF, JPG, PNG). You can select multiple
                files.
              </HelpText>

              {receiptFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm/6 font-medium text-gray-900 dark:text-white">
                    Uploaded files:
                  </p>
                  {receiptFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        <XMarkIcon className="mr-1 h-3 w-3" />
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Receipt Processing Consent - only show if receipts are involved */}
        {(receiptFiles.length > 0 || existingReceipts.length > 0) && (
          <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
            <fieldset>
              <legend className="sr-only">Receipt Processing Consent</legend>
              <div>
                <h3 className="text-base leading-6 font-semibold text-gray-900 dark:text-white">
                  Document Processing
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  We need your consent to process and store your receipt
                  documents for expense verification.
                </p>
              </div>

              <div className="mt-4 space-y-4">
                <Checkbox
                  name="receipt-processing-consent"
                  label="I consent to the processing and storage of my receipt documents"
                  value={receiptProcessingConsent}
                  setValue={setReceiptProcessingConsent}
                >
                  <HelpText>
                    <span className="text-red-600 dark:text-red-400">
                      Required:
                    </span>{' '}
                    We need this consent to store and process your receipts for
                    expense verification and reimbursement purposes.
                  </HelpText>
                </Checkbox>
                {validationErrors.consent && (
                  <ErrorText>{validationErrors.consent}</ErrorText>
                )}
              </div>
            </fieldset>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-x-6">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/20 dark:hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || isUploading}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:shadow-none dark:focus-visible:outline-indigo-500"
          >
            {isUploading
              ? 'Uploading receipts...'
              : isLoading
                ? mode === 'edit'
                  ? 'Updating...'
                  : 'Adding...'
                : mode === 'edit'
                  ? 'Update Expense'
                  : 'Add Expense'}
          </button>
        </div>
      </form>
    </ErrorBoundary>
  )
}
