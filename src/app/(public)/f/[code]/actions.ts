'use server'

import { cookies } from 'next/headers'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  deleteFeedback,
  deviceCookie,
  submitFeedback,
  type AttendeeFeedbackState,
  type DeleteOutcome,
  type FeedbackConference,
} from '@/lib/feedback/server'

/**
 * Submit on `/f/<code>` (speaker feedback spec §7.4). A Server Action, not a
 * tRPC procedure: the device cookie is scoped to `Path=/f` and never reaches
 * `/api/trpc`, and an action posts to the page's own URL. It takes only the
 * code, the colour and the comment; the conference comes from the Host and
 * the talk from the conference's index, never from the client.
 *
 * CSRF is covered by Next's Server Action origin check and the `SameSite=Lax`,
 * host-only cookie: never widen `serverActions.allowedOrigins`.
 */
export async function submitFeedbackAnswer(
  code: string,
  colour: string,
  comment?: string,
): Promise<AttendeeFeedbackState> {
  return withDevice(
    (conference, cookie, now) =>
      submitFeedback({ conference, code, colour, comment, cookie, now }),
    (state) => state,
  )
}

/**
 * Delete my answer on `/f/<code>` (speaker feedback spec §7.4, R1): deletes
 * this device's response about the code's talk and drops the talk from the
 * cookie's list. Takes only the code, like Submit, and answers with the state
 * the page would show on a reload, and whether anything was deleted: a stale
 * page is refused with its current state, never told its answer went.
 */
export async function deleteFeedbackAnswer(
  code: string,
): Promise<DeleteOutcome> {
  return withDevice(
    (conference, cookie, now) =>
      deleteFeedback({ conference, code, cookie, now }),
    (page) => ({ deleted: false, page }),
  )
}

/**
 * The conference serving the Host and this device's cookie, around one
 * action; the cookie the action hands back is set with the decided options.
 */
async function withDevice<Outcome>(
  action: (
    conference: FeedbackConference,
    cookie: string | undefined,
    now: Date,
  ) => Promise<{ outcome: Outcome; cookie?: string }>,
  refuse: (state: { state: 'unavailable' | 'unknown' }) => Outcome,
): Promise<Outcome> {
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution)) {
    return refuse({ state: 'unavailable' })
  }
  if (isUnknownHost(resolution)) return refuse({ state: 'unknown' })

  const store = await cookies()
  const { name, options } = deviceCookie()
  const { outcome, cookie } = await action(
    resolution.conference,
    store.get(name)?.value,
    new Date(),
  )
  if (cookie) store.set(name, cookie, options)
  return outcome
}
