'use client'

import { useState } from 'react'
import { formatDateSafe } from '@/lib/time'

import { TrashIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
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
  const [deleteTarget, setDeleteTarget] = useState<{
    signupId: string
    userName: string
  } | null>(null)

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
        return formatDateSafe(dateStr)
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
            onClick={() =>
              setDeleteTarget({
                signupId: signup._id,
                userName: signup.userName,
              })
            }
            disabled={isConfirming || isDeleting}
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
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
      title={`${workshopTitle} - ${statusLabel} Signups`}
    >
      <DataTable<WorkshopSignupExisting>
        data={signups}
        columns={columns}
        keyExtractor={(signup) => signup._id}
        emptyState={{
          title: `No ${status ?? ''} signups for this workshop`,
        }}
      />

      <ConfirmationModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteSignup(deleteTarget.signupId, deleteTarget.userName)
          }
          setDeleteTarget(null)
        }}
        title="Delete signup"
        message={
          deleteTarget
            ? `Are you sure you want to permanently delete ${deleteTarget.userName}'s signup for ${workshopTitle}? This cannot be undone.`
            : ''
        }
        confirmButtonText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </ModalShell>
  )
}
