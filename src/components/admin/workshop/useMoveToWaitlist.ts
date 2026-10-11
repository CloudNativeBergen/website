import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * "Move to waitlist" for one confirmed sign-up (#1331).
 *
 * The procedure is `batchCancelSignups`: its name says cancel, and what it does
 * is set `waitlist` and free the seat. Nothing here, and nothing the organizer
 * reads, calls it cancel. The attendee is not emailed.
 *
 * `onMoved` runs whenever the server answered, also when it could not make the
 * move: the lists should show what is stored either way.
 */
export function useMoveToWaitlist(onMoved: () => void) {
  const { showNotification } = useNotification()
  const mutation = api.workshop.admin.batchCancelSignups.useMutation()

  const moveToWaitlist = (signupId: string, userName: string) => {
    mutation.mutate(
      { signupIds: [signupId] },
      {
        onSuccess: ({ results }) => {
          onMoved()
          // The procedure reports a batch as a success and counts what failed.
          showNotification(
            results.failed > 0
              ? {
                  type: 'error',
                  title: 'Could not move to waitlist',
                  message: `${userName}'s sign-up was not changed. Try again.`,
                }
              : {
                  type: 'success',
                  title: 'Moved to waitlist',
                  message: `${userName} is on the waitlist. No email was sent.`,
                },
          )
        },
        onError: (error) => {
          showNotification({
            type: 'error',
            title: 'Could not move to waitlist',
            message: error.message,
          })
        },
      },
    )
  }

  return { moveToWaitlist, isMoving: mutation.isPending }
}
