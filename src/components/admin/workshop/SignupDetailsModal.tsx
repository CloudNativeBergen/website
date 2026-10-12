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
  /** Runs after the organizer has answered the question this modal asks. */
  onMoveToWaitlist: (signupId: string, userName: string) => void
  onDeleteSignup: (signupId: string, userName: string) => void
  isConfirming?: boolean
  isMoving?: boolean
  isDeleting?: boolean
}

export function SignupDetailsModal({
  isOpen,
  onClose,
  workshopTitle,
  status,
  signups,
  onConfirmSignup,
  onMoveToWaitlist,
  onDeleteSignup,
  isConfirming = false,
  isMoving = false,
  isDeleting = false,
}: SignupDetailsModalProps) {
  const [deleteTarget, setDeleteTarget] = useState<{
    signupId: string
    userName: string
  } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{
    signupId: string
    userName: string
  } | null>(null)
  const isBusy = isConfirming || isMoving || isDeleting

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
        // An explicit colour: the cell otherwise inherits the page's, which is
        // black on this dark surface when the theme is dark and the OS is not.
        return (
          <span className="text-gray-900 dark:text-gray-200">
            {!dateStr || typeof dateStr !== 'string'
              ? 'N/A'
              : formatDateSafe(dateStr)}
          </span>
        )
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
              disabled={isBusy}
              className="min-h-11 text-green-600 hover:text-green-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-green-400 dark:hover:text-green-300"
            >
              Move to Confirmed
            </button>
          )}
          {signup.status === 'confirmed' && (
            <button
              onClick={() =>
                setMoveTarget({
                  signupId: signup._id,
                  userName: signup.userName,
                })
              }
              disabled={isBusy}
              className="min-h-11 text-blue-600 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Move to waitlist
            </button>
          )}
          <button
            onClick={() =>
              setDeleteTarget({
                signupId: signup._id,
                userName: signup.userName,
              })
            }
            disabled={isBusy}
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

      {/* What the organizer cannot see from the list, said before the seat is
          taken away: the attendee is told nothing, nobody on the waitlist is
          moved up, and the person is not out of the running (a capacity
          increase seats the earliest sign-ups first, which they usually are). */}
      <ConfirmationModal
        isOpen={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        onConfirm={() => {
          if (moveTarget) {
            onMoveToWaitlist(moveTarget.signupId, moveTarget.userName)
          }
          setMoveTarget(null)
        }}
        title="Move to waitlist"
        message={
          moveTarget
            ? `Move ${moveTarget.userName} to the waitlist for ${workshopTitle}? They lose their seat and get no email about it. They stay in line by sign-up date, so a capacity increase can seat them again. The seat is open to whoever signs up next.`
            : ''
        }
        confirmButtonText="Move to waitlist"
        cancelButtonText="Keep confirmed"
        variant="warning"
        isLoading={isMoving}
        guardSecondTap
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
        guardSecondTap
      />
    </ModalShell>
  )
}
