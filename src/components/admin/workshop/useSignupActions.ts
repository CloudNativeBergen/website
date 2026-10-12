import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

/** What the organizer is told when an action on one sign-up did not happen. */
const TITLES = {
  move: 'Could not move to waitlist',
  confirm: 'Could not confirm',
  remove: 'Could not delete',
} as const

/**
 * The actions on ONE sign-up in the list on `/admin/workshops`: "Move to
 * Confirmed", "Move to waitlist" (#1331) and delete.
 *
 * "Move to waitlist" goes through `batchCancelSignups`: its name says cancel,
 * and what it does is set `waitlist` and free the seat. Nothing here, and
 * nothing the organizer reads, calls it cancel. The attendee is not emailed.
 *
 * `onSettled` runs after EVERY attempt, whatever came of it: the lists should
 * show what is stored. It matters most when the attempt failed. An attendee's
 * cancel deletes the sign-up, so the row an organizer acts on may be gone; the
 * server then answers NOT_FOUND, and a list that is not read again keeps the
 * row and fails every retry the same way.
 */
export function useSignupActions(onSettled: () => void) {
  const { showNotification } = useNotification()
  const move = api.workshop.admin.batchCancelSignups.useMutation()
  const confirm = api.workshop.admin.batchConfirmSignups.useMutation()
  const remove = api.workshop.admin.deleteSignup.useMutation()

  const refused =
    (action: keyof typeof TITLES, userName: string) =>
    (error: { message: string; data?: { code?: string } | null }) => {
      onSettled()
      showNotification({
        type: 'error',
        title: TITLES[action],
        // NOT_FOUND is all the server says. That the attendee cancelled is the
        // likely reason, not a known one.
        message:
          error.data?.code === 'NOT_FOUND'
            ? `${userName}'s sign-up was not found. They may have cancelled it.`
            : error.message,
      })
    }

  /** Both batch procedures answer "success" for the batch and count what failed. */
  const unchanged = (action: keyof typeof TITLES, userName: string) =>
    showNotification({
      type: 'error',
      title: TITLES[action],
      message: `${userName}'s sign-up was not changed. Try again.`,
    })

  return {
    moveToWaitlist: (signupId: string, userName: string) =>
      move.mutate(
        { signupIds: [signupId] },
        {
          onSuccess: ({ results }) => {
            onSettled()
            if (results.failed > 0) return unchanged('move', userName)
            showNotification({
              type: 'success',
              title: 'Moved to waitlist',
              message: `${userName} is on the waitlist. No email was sent.`,
            })
          },
          onError: refused('move', userName),
        },
      ),

    confirm: (signupId: string, userName: string) =>
      confirm.mutate(
        { signupIds: [signupId], sendEmails: true },
        {
          onSuccess: ({ results }) => {
            onSettled()
            if (results.failed > 0) return unchanged('confirm', userName)
            alert(`✅ ${userName} confirmed! Confirmation email sent.`)
          },
          onError: refused('confirm', userName),
        },
      ),

    remove: (signupId: string, userName: string) =>
      remove.mutate(
        { signupId },
        { onSuccess: onSettled, onError: refused('remove', userName) },
      ),

    isMoving: move.isPending,
    isConfirming: confirm.isPending,
    isDeleting: remove.isPending,
  }
}
