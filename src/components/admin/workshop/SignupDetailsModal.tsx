'use client'

import { useState } from 'react'
import { formatDateSafe } from '@/lib/time'

import { TrashIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { DataTable, type Column } from '@/components/DataTable'
import { EarlyAccessBadge } from './early-signups'
import { ConfirmBeyondCapacityModal } from './ConfirmBeyondCapacityModal'
import { SignupQuestions } from './SignupQuestions'
import type { FullRefusal } from './useSignupActions'
import type {
  WorkshopSignupExisting,
  WorkshopSignupStatus,
} from '@/lib/workshop/types'

interface SignupDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  status: WorkshopSignupStatus | null
  /** `undefined` while they are being read: never shown as an empty list. */
  signups: WorkshopSignupExisting[] | undefined
  onConfirmSignup: (signupId: string, userName: string) => void
  /** Runs after the organizer has answered the question this modal asks. */
  onMoveToWaitlist: (signupId: string, userName: string) => void
  onDeleteSignup: (signupId: string, userName: string) => void
  /**
   * A confirm refused because the workshop is full (#1358), asked about in
   * this modal: "Confirm beyond capacity" or keep them on the waitlist.
   */
  fullRefusal?: FullRefusal | null
  onConfirmBeyondCapacity?: () => void
  onDismissFullRefusal?: () => void
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
  fullRefusal = null,
  onConfirmBeyondCapacity = () => {},
  onDismissFullRefusal = () => {},
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-900 dark:text-white">
          <span>{signup.userName}</span>
          {/* An early sign-up: "via Sponsor", or "early access" when the
              sponsor is no longer in the conference (#1348). */}
          <EarlyAccessBadge earlyAccess={signup.earlyAccess} />
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
          <span className="whitespace-nowrap text-gray-900 dark:text-gray-200">
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
      {signups ? (
        <DataTable<WorkshopSignupExisting>
          data={signups}
          columns={columns}
          keyExtractor={(signup) => signup._id}
          emptyState={{
            title: `No ${status ?? ''} signups for this workshop`,
          }}
        />
      ) : (
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          Reading the sign-ups…
        </p>
      )}

      <SignupQuestions
        moveTarget={moveTarget && { ...moveTarget, workshopTitle }}
        deleteTarget={deleteTarget && { ...deleteTarget, workshopTitle }}
        onCloseMove={() => setMoveTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onMoveToWaitlist={onMoveToWaitlist}
        onDeleteSignup={onDeleteSignup}
        isMoving={isMoving}
        isDeleting={isDeleting}
      />

      {/* Nested like the questions above: a sibling dialog would count as
          an outside click on this one and close it. */}
      <ConfirmBeyondCapacityModal
        refusal={fullRefusal}
        onConfirm={onConfirmBeyondCapacity}
        onClose={onDismissFullRefusal}
        isLoading={isConfirming}
      />
    </ModalShell>
  )
}
