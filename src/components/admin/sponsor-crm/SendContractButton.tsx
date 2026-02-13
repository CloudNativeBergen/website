'use client'

import { useState } from 'react'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SendContractModal } from './SendContractModal'

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

  const isSent = sponsor.contractStatus === 'contract-sent'
  const isSigned = sponsor.contractStatus === 'contract-signed'

  if (isSigned) {
    return null
  }

  return (
    <>
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
