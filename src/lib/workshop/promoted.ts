import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendBasicWorkshopConfirmation } from '@/lib/email/workshop'
import { getAllWorkshopSignups } from './sanity'

/**
 * Tells each sign-up a capacity change confirmed from the waitlist (#1344)
 * that it has a seat. The capacity change is already written: nothing here
 * fails it. An email, or the read it needs, that fails is not retried; the
 * ids are logged so the emails can be sent by hand.
 */
export async function emailPromotedSignups(
  conferenceId: string,
  signupIds: string[],
): Promise<void> {
  if (signupIds.length === 0) return
  const read = await Promise.all([
    getAllWorkshopSignups({
      conferenceId,
      signupIds,
      pageSize: signupIds.length,
    }),
    getConferenceForCurrentDomain({}),
  ]).catch((error: unknown) => {
    console.error(
      '[workshop] promotion emails not sent, promoted sign-ups:',
      signupIds,
      error,
    )
    return null
  })
  if (!read) return
  const [promoted, { conference }] = read
  if (!conference) return
  await Promise.allSettled(
    promoted.map((signup) =>
      sendBasicWorkshopConfirmation({
        userEmail: signup.userEmail,
        userName: signup.userName,
        status: 'confirmed',
        conference,
        workshopTitle: signup.workshop?.title ?? 'Workshop',
        workshopDate: (signup.workshop as { date?: string })?.date,
        workshopTime: (signup.workshop as { startTime?: string })?.startTime,
      }),
    ),
  )
}
