'use client'

import { DialogTitle } from '@headlessui/react'
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { DataTable, type Column } from '@/components/DataTable'
import type {
  WorkshopSignupExisting,
  WorkshopSignupStatus,
} from '@/lib/workshop/types'

interface SignupDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  status: WorkshopSignupStatus | null
  signups: WorkshopSignupExisting[]
  onConfirmSignup: (signupId: string, userName: string) => void
  onDeleteSignup: (signupId: string, userName: string) => void
  isConfirming?: boolean
  isDeleting?: boolean
}

export function SignupDetailsModal({
  isOpen,
  onClose,
  workshopTitle,
  status,
  signups,
  onConfirmSignup,
  onDeleteSignup,
  isConfirming = false,
  isDeleting = false,
}: SignupDetailsModalProps) {
  const statusLabel = status
    ? status.charAt(0).toUpperCase() + status.slice(1)
    : ''

  const columns: Column<WorkshopSignupExisting>[] = [
    {
      key: 'userName',
      header: 'Name',
      primary: true,
      render: (signup) => (
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {signup.userName}
        </div>
      ),
    },
    {
      key: 'userEmail',
      header: 'Email',
      render: (signup) => (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {signup.userEmail}
        </div>
      ),
    },
    {
      key: 'signedUpAt',
      header: 'Signup Date',
      render: (signup) => {
        const dateStr = signup.signedUpAt || signup._createdAt
        if (!dateStr || typeof dateStr !== 'string') return 'N/A'
        return new Date(dateStr).toLocaleDateString()
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (signup) => (
        <div className="flex items-center gap-2">
          {signup.status === 'waitlist' && (
            <button
              onClick={() => onConfirmSignup(signup._id, signup.userName)}
              disabled={isConfirming || isDeleting}
              className="text-green-600 hover:text-green-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-green-400 dark:hover:text-green-300"
            >
              Move to Confirmed
            </button>
          )}
          <button
            onClick={() => onDeleteSignup(signup._id, signup.userName)}
            disabled={isConfirming || isDeleting}
            className="text-gray-600 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-red-400"
            title="Delete participant"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      padded={false}
      className="relative overflow-hidden px-4 pt-5 pb-4 sm:p-6"
    >
      <div className="absolute top-0 right-0 pt-4 pr-4">
        <button
          type="button"
          className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400"
          onClick={onClose}
        >
          <span className="sr-only">Close</span>
          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div className="sm:flex sm:items-start">
        <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
          <DialogTitle
            as="h3"
            className="mb-4 text-lg leading-6 font-semibold text-gray-900 dark:text-white"
          >
            {workshopTitle} - {statusLabel} Signups
          </DialogTitle>

          <div className="mt-4">
            <DataTable<WorkshopSignupExisting>
              data={signups}
              columns={columns}
              keyExtractor={(signup) => signup._id}
              emptyState={{
                title: `No ${status ?? ''} signups for this workshop`,
              }}
            />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
