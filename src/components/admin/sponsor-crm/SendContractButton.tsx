'use client'

import { useState } from 'react'
import {
  CheckCircleIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SendContractModal } from './SendContractModal'
import { api } from '@/lib/trpc/client'

interface SendContractButtonProps {
  conferenceId: string
  sponsor: SponsorForConferenceExpanded
  onSuccess?: () => void
}

export function SendContractButton({
  conferenceId,
  sponsor,
  onSuccess,
}: SendContractButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const checkStatus = api.sponsor.crm.checkSignatureStatus.useMutation({
    onSuccess: () => onSuccess?.(),
    onError: (err) => console.error('Failed to check signature status:', err),
  })

  const isSent = sponsor.contractStatus === 'contract-sent'
  const isSigned = sponsor.contractStatus === 'contract-signed'
  const isPending =
    sponsor.signatureStatus === 'pending' && !!sponsor.signatureId

  if (isSigned) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2.5 py-1.5 text-sm font-semibold text-green-700 ring-1 ring-green-600/20 ring-inset dark:bg-green-900/20 dark:text-green-400 dark:ring-green-400/20"
        title={
          sponsor.contractSignedAt
            ? `Signed ${new Date(sponsor.contractSignedAt).toLocaleDateString()}`
            : 'Contract signed'
        }
      >
        <CheckCircleIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Signed</span>
      </span>
    )
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
          title={isSent ? 'Resend contract' : 'Send contract'}
        >
          <DocumentTextIcon className="h-4 w-4" />
          <span className="hidden sm:inline">
            {isSent ? 'Resend' : 'Contract'}
          </span>
        </button>
        {isPending && (
          <button
            type="button"
            onClick={() => checkStatus.mutate({ id: sponsor._id })}
            disabled={checkStatus.isPending}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1.5 text-sm text-gray-600 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-600 dark:hover:bg-gray-700"
            title="Check signing status with Adobe Sign"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${checkStatus.isPending ? 'animate-spin' : ''}`}
            />
          </button>
        )}
      </div>
      <SendContractModal
        conferenceId={conferenceId}
        sponsor={sponsor}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={() => {
          setIsOpen(false)
          onSuccess?.()
        }}
      />
    </>
  )
}
