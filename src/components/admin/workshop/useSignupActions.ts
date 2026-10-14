import { useRef, useState } from 'react'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * A confirm refused because the workshop is full (#1358), waiting for the
 * organizer's answer: `seatsTaken` now, `after` what confirming would make
 * it. `changed`: refused again after they accepted a count, because a seat
 * changed hands meanwhile; the numbers are the new ones.
 */
export interface FullRefusal {
  signupId: string
  userName: string
  workshopId: string
  workshopTitle: string
  seatsTaken: number
  capacity: number
  after: number
  changed: boolean
}

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
 * A confirm into a FULL workshop is refused by the server and asked about
 * here (#1358): `full` holds the question, `confirmBeyondCapacity` answers it
 * by sending the confirm again with the count the organizer saw, and
 * `dismissFull` leaves the sign-up on the waitlist. A seat taken meanwhile
 * makes that count stale, and the server asks again with the new numbers.
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
  const utils = api.useUtils()
  // A DELETE CHANGES A COUNT ON ANOTHER PAGE (#1348): the sponsor CRM board's
  // rows (`sponsor.crm.list`) carry how many early sign-ups were made through
  // each sponsor's links, and are polled every 30 seconds. Marked stale
  // after every delete attempt, also a refused one (the sign-up may be gone
  // all the same). Only a delete: a confirm and a move change no count.
  //
  // This reads nothing unless the board is on screen: `invalidate` refetches
  // the queries someone is showing. A board Next keeps hidden is read when it
  // is shown again.
  const sponsorCountsChanged = () => void utils.sponsor.crm.list.invalidate()
  const [full, setFull] = useState<FullRefusal | null>(null)
  // Which confirm may still ask: `dismissFull` (also the list closing) ends
  // it, and a refusal that lands after that is told, not asked, so the next
  // list opened does not show a question about another one.
  const asking = useRef(0)

  const refused =
    (action: keyof typeof TITLES, userName: string) =>
    (error: { message: string; data?: { code?: string } | null }) => {
      onSettled()
      // No `data`: no answer came back (the connection dropped, the request
      // timed out). The server may have made the change all the same, so this
      // is not reported as a failure, and the browser's "Failed to fetch" is
      // not shown.
      if (!error.data) {
        showNotification({
          type: 'warning',
          title: 'No answer from the server',
          message: `${userName}'s sign-up may or may not have been changed. Check the list before trying again.`,
        })
        return
      }
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

  /**
   * One sign-up's confirm, with the count the organizer `accepted` to go past
   * capacity to (the refusal they answered), or none.
   */
  const confirmOne = (
    signupId: string,
    userName: string,
    accepted: FullRefusal | undefined,
  ) => {
    const ask = ++asking.current
    confirm.mutate(
      {
        signupIds: [signupId],
        sendEmails: true,
        ...(accepted && {
          acceptSeats: { [accepted.workshopId]: accepted.after },
        }),
      },
      {
        onSuccess: ({ results }) => {
          onSettled()
          // Refused as full (#1358): asked, with the numbers as they are now.
          const [refusal] = results.full
          if (refusal && ask !== asking.current) {
            showNotification({
              type: 'warning',
              title: `${userName} was not confirmed`,
              message: `${refusal.title} is full (${refusal.seatsTaken} of ${refusal.capacity} seats). Open its waitlist to confirm beyond capacity.`,
            })
            return
          }
          if (refusal) {
            setFull({
              signupId,
              userName,
              workshopId: refusal.workshopId,
              workshopTitle: refusal.title,
              seatsTaken: refusal.seatsTaken,
              capacity: refusal.capacity,
              after: refusal.after,
              changed: accepted !== undefined,
            })
            return
          }
          setFull(null)
          if (results.failed > 0) return unchanged('confirm', userName)
          // Past capacity is the organizer's call (#1344), and is named.
          const [beyond] = results.beyondCapacity
          alert(
            beyond
              ? `✅ ${userName} confirmed beyond capacity (${beyond.seatsTaken} of ${beyond.capacity} seats). Confirmation email sent.`
              : `✅ ${userName} confirmed! Confirmation email sent.`,
          )
        },
        onError: (error) => {
          setFull(null)
          refused('confirm', userName)(error)
        },
      },
    )
  }

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
      confirmOne(signupId, userName, undefined),

    full,
    confirmBeyondCapacity: () => {
      if (!full) return
      confirmOne(full.signupId, full.userName, full)
    },
    dismissFull: () => {
      asking.current++
      setFull(null)
    },

    remove: (signupId: string, userName: string) =>
      remove.mutate(
        { signupId },
        {
          onSuccess: () => {
            sponsorCountsChanged()
            onSettled()
          },
          onError: (error) => {
            sponsorCountsChanged()
            refused('remove', userName)(error)
          },
        },
      ),

    isMoving: move.isPending,
    isConfirming: confirm.isPending,
    isDeleting: remove.isPending,
  }
}
