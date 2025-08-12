'use client'

import { useState } from 'react'
import { InvoiceInfo, INVOICE_STATUS_OPTIONS } from '@/lib/sponsor/types'
import { formatCurrency } from '@/lib/format'
import {
  DocumentTextIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { Button } from '@/components/Button'

interface InvoiceEditorProps {
  invoice?: InvoiceInfo
  sponsorName: string
  onSave: (invoice: InvoiceInfo) => Promise<void>
  isLoading?: boolean
}

export default function InvoiceEditor({
  invoice,
  sponsorName,
  onSave,
  isLoading = false,
}: InvoiceEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<InvoiceInfo>(
    invoice || {
      status: 'pending',
      currency: 'NOK',
    },
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSave(formData)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save invoice:', error)
    }
  }

  const handleCancel = () => {
    setFormData(invoice || { status: 'pending', currency: 'NOK' })
    setIsEditing(false)
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'paid':
        return 'text-green-700 bg-green-100'
      case 'sent':
        return 'text-blue-700 bg-blue-100'
      case 'overdue':
        return 'text-red-700 bg-red-100'
      case 'cancelled':
        return 'text-gray-700 bg-gray-100'
      case 'partial':
        return 'text-yellow-700 bg-yellow-100'
      case 'pending':
      default:
        return 'text-orange-700 bg-orange-100'
    }
  }

  if (!isEditing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DocumentTextIcon className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">
              Invoice Information
            </h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-1"
          >
            <PencilIcon className="h-4 w-4" />
            <span>Edit</span>
          </Button>
        </div>

        {invoice ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(
                    invoice.status,
                  )}`}
                >
                  {invoice.status
                    ? invoice.status.charAt(0).toUpperCase() +
                      invoice.status.slice(1)
                    : 'Pending'}
                </span>
              </dd>
            </div>

            {invoice.date && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Invoice Date
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(invoice.date).toLocaleDateString()}
                </dd>
              </div>
            )}

            {invoice.due_date && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Due Date</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(invoice.due_date).toLocaleDateString()}
                </dd>
              </div>
            )}

            {invoice.amount && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Amount</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatCurrency(invoice.amount, invoice.currency || 'NOK')}
                </dd>
              </div>
            )}

            {invoice.our_ref && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Our Reference
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {invoice.our_ref}
                </dd>
              </div>
            )}

            {invoice.their_ref && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Their Reference
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {invoice.their_ref}
                </dd>
              </div>
            )}

            {invoice.notes && (
              <div className="md:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Notes</dt>
                <dd className="mt-1 text-sm text-gray-900">{invoice.notes}</dd>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No invoice information
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Click Edit to add invoice details for {sponsorName}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <DocumentTextIcon className="h-5 w-5 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900">
            Edit Invoice Information
          </h3>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-gray-700"
            >
              Status
            </label>
            <select
              id="status"
              value={formData.status || 'pending'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  status: e.target
                    .value as (typeof INVOICE_STATUS_OPTIONS)[number],
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {INVOICE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Invoice Date
            </label>
            <input
              type="date"
              id="date"
              value={formData.date || ''}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="due_date"
              className="block text-sm font-medium text-gray-700"
            >
              Due Date
            </label>
            <input
              type="date"
              id="due_date"
              value={formData.due_date || ''}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount
            </label>
            <input
              type="number"
              id="amount"
              value={formData.amount || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  amount: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>

          <div>
            <label
              htmlFor="currency"
              className="block text-sm font-medium text-gray-700"
            >
              Currency
            </label>
            <select
              id="currency"
              value={formData.currency || 'NOK'}
              onChange={(e) =>
                setFormData({ ...formData, currency: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="NOK">NOK</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="our_ref"
              className="block text-sm font-medium text-gray-700"
            >
              Our Reference
            </label>
            <input
              type="text"
              id="our_ref"
              value={formData.our_ref || ''}
              onChange={(e) =>
                setFormData({ ...formData, our_ref: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="Invoice number or reference"
            />
          </div>

          <div>
            <label
              htmlFor="their_ref"
              className="block text-sm font-medium text-gray-700"
            >
              Their Reference
            </label>
            <input
              type="text"
              id="their_ref"
              value={formData.their_ref || ''}
              onChange={(e) =>
                setFormData({ ...formData, their_ref: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="PO number or reference"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700"
          >
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            value={formData.notes || ''}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Additional notes about the invoice..."
          />
        </div>

        <div className="flex justify-end space-x-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex items-center space-x-1"
          >
            <XMarkIcon className="h-4 w-4" />
            <span>Cancel</span>
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            className="flex items-center space-x-1"
          >
            <CheckIcon className="h-4 w-4" />
            <span>{isLoading ? 'Saving...' : 'Save Invoice'}</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
