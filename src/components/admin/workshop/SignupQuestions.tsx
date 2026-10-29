'use client'

import { ConfirmationModal } from '@/components/admin/ConfirmationModal'

/** The sign-up an organizer is being asked about. */
export interface SignupQuestionTarget {
  signupId: string
  userName: string
  workshopTitle: string
}

/**
 * The two questions asked before an organizer changes one sign-up: "Move to
 * waitlist" and "Delete signup". Shared by the sign-up list of a workshop and
 * the flagged list (#1333), so both ask the same thing in the same words.
 *
 * Render it inside the dialog that holds the list: a sibling dialog would
 * count as an outside click on that one and close it.
 */
export function SignupQuestions({
  moveTarget,
  deleteTarget,
  onCloseMove,
  onCloseDelete,
  onMoveToWaitlist,
  onDeleteSignup,
  isMoving = false,
  isDeleting = false,
}: {
  moveTarget: SignupQuestionTarget | null
  deleteTarget: SignupQuestionTarget | null
  onCloseMove: () => void
  onCloseDelete: () => void
  onMoveToWaitlist: (signupId: string, userName: string) => void
  onDeleteSignup: (signupId: string, userName: string) => void
  isMoving?: boolean
  isDeleting?: boolean
}) {
  return (
    <>
      {/* What the organizer cannot see from the list, said before the seat is
          taken away: the attendee is told nothing, nobody on the waitlist is
          moved up, and the person is not out of the running (a capacity
          increase seats the earliest sign-ups first, which they usually are). */}
      <ConfirmationModal
        isOpen={moveTarget !== null}
        onClose={onCloseMove}
        onConfirm={() => {
          if (moveTarget) {
            onMoveToWaitlist(moveTarget.signupId, moveTarget.userName)
          }
          onCloseMove()
        }}
        title="Move to waitlist"
        message={
          moveTarget
            ? `Move ${moveTarget.userName} to the waitlist for ${moveTarget.workshopTitle}? They lose their seat and get no email about it. They stay in line by sign-up date, so a capacity increase can seat them again. The seat is open to whoever signs up next.`
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
        onClose={onCloseDelete}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteSignup(deleteTarget.signupId, deleteTarget.userName)
          }
          onCloseDelete()
        }}
        title="Delete signup"
        message={
          deleteTarget
            ? `Are you sure you want to permanently delete ${deleteTarget.userName}'s signup for ${deleteTarget.workshopTitle}? This cannot be undone.`
            : ''
        }
        confirmButtonText="Delete"
        variant="danger"
        isLoading={isDeleting}
        guardSecondTap
      />
    </>
  )
}
