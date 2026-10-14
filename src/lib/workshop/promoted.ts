import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendBasicWorkshopConfirmation } from '@/lib/email/workshop'
import { getAllWorkshopSignups } from './sanity'

/**
 * Tells each sign-up a capacity change confirmed from the waitlist (#1344)
 * that it has a seat. An email that fails is not retried, and never fails the
 * capacity change that is already written.
 */
export async function emailPromotedSignups(
  conferenceId: string,
  signupIds: string[],
): Promise<void> {
  if (signupIds.length === 0) return
  const [promoted, { conference }] = await Promise.all([
    getAllWorkshopSignups({
      conferenceId,
      signupIds,
      pageSize: signupIds.length,
    }),
    getConferenceForCurrentDomain({}),
  ])
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
