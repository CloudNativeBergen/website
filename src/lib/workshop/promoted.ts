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
  const notSent = (ids: string[], why: unknown) =>
    console.error(
      '[workshop] promotion emails not sent, promoted sign-ups:',
      ids,
      why,
    )
  const read = await Promise.all([
    getAllWorkshopSignups({
      conferenceId,
      signupIds,
      pageSize: signupIds.length,
    }),
    getConferenceForCurrentDomain({}),
  ]).catch((error: unknown) => {
    notSent(signupIds, error)
    return null
  })
  if (!read) return
  const [promoted, { conference, error }] = read
  // A conference that could not be read comes back as a fallback, not a
  // failure: no email goes out in a name that is not the conference's.
  if (!conference || error) return notSent(signupIds, error)
  // One moved back to the waitlist since is not told it has a seat.
  const stillConfirmed = promoted.filter((s) => s.status === 'confirmed')
  const sent = await Promise.allSettled(
    stillConfirmed.map((signup) =>
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
  // A send that fails answers with an `error`; it does not throw. Each one
  // is logged with the sign-up it was for.
  const failed = stillConfirmed.flatMap((signup, i) => {
    const result = sent[i]
    const why =
      result.status === 'rejected' ? result.reason : result.value?.error
    return result.status === 'rejected' || why !== undefined
      ? [{ id: signup._id, why }]
      : []
  })
  if (failed.length > 0) {
    notSent(
      failed.map((f) => f.id),
      failed.map((f) => f.why),
    )
  }
}
