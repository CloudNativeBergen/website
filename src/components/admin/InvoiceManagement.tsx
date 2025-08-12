'use client'

import { useState } from 'react'
import { ConferenceSponsorDetailed, InvoiceInfo } from '@/lib/sponsor/types'
import { InvoiceEditor } from '@/components/admin'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

interface InvoiceManagementProps {
  sponsors: ConferenceSponsorDetailed[]
}

export default function InvoiceManagement({
  sponsors,
}: InvoiceManagementProps) {
  const [selectedSponsor, setSelectedSponsor] =
    useState<ConferenceSponsorDetailed | null>(null)
  const { showNotification } = useNotification()

  const updateInvoiceMutation = api.sponsor.updateInvoice.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Invoice updated',
        message: 'Invoice information has been successfully updated.',
      })
      setSelectedSponsor(null)
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Failed to update invoice',
        message: error.message,
      })
    },
  })

  const handleInvoiceSave = async (invoice: InvoiceInfo) => {
    if (!selectedSponsor) return

    await updateInvoiceMutation.mutateAsync({
      id: selectedSponsor.sponsor._id,
      invoice,
    })
  }

  return (
    <div className="mt-8">
      <h2 className="mb-6 text-lg font-medium text-gray-900">
        Invoice Management
      </h2>

      {/* Sponsor List */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sponsors.map((sponsorData) => (
          <div
            key={sponsorData.sponsor._id}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
            onClick={() => setSelectedSponsor(sponsorData)}
          >
            <h3 className="font-medium text-gray-900">
              {sponsorData.sponsor.name}
            </h3>
            <p className="text-sm text-gray-500">{sponsorData.tier.title}</p>
            <div className="mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  sponsorData.sponsor.invoice?.status === 'paid'
                    ? 'bg-green-100 text-green-800'
                    : sponsorData.sponsor.invoice?.status === 'sent'
                      ? 'bg-blue-100 text-blue-800'
                      : sponsorData.sponsor.invoice?.status === 'overdue'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-orange-100 text-orange-800'
                }`}
              >
                {sponsorData.sponsor.invoice?.status || 'pending'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Invoice Editor Modal */}
      {selectedSponsor && (
        <div className="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-gray-500 p-4">
          <div className="max-h-screen w-full max-w-4xl overflow-y-auto rounded-lg bg-white">
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Invoice for {selectedSponsor.sponsor.name}
                </h3>
                <button
                  onClick={() => setSelectedSponsor(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <InvoiceEditor
                invoice={selectedSponsor.sponsor.invoice}
                sponsorName={selectedSponsor.sponsor.name}
                onSave={handleInvoiceSave}
                isLoading={updateInvoiceMutation.isPending}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
