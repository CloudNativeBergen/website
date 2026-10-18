'use server'

import { cookies } from 'next/headers'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  deleteFeedback,
  deviceCookie,
  submitFeedback,
  type AttendeeFeedbackState,
  type SubmitOutcome,
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
): Promise<SubmitOutcome> {
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution)) return { state: 'unavailable' }
  if (isUnknownHost(resolution)) return { state: 'unknown' }

  const store = await cookies()
  const { name, options } = deviceCookie()
  const { outcome, cookie } = await submitFeedback({
    conference: resolution.conference,
    code,
    colour,
    comment,
    cookie: store.get(name)?.value,
    now: new Date(),
  })
  if (cookie) store.set(name, cookie, options)
  return outcome
}

/**
 * Delete my answer on `/f/<code>` (speaker feedback spec §7.4, R1): deletes
 * this device's response about the code's talk and drops the talk from the
 * cookie's list. Takes only the code, like Submit, and answers with the state
 * the page would show on a reload.
 */
export async function deleteFeedbackAnswer(
  code: string,
): Promise<AttendeeFeedbackState> {
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution)) return { state: 'unavailable' }
  if (isUnknownHost(resolution)) return { state: 'unknown' }

  const store = await cookies()
  const { name, options } = deviceCookie()
  const { outcome, cookie } = await deleteFeedback({
    conference: resolution.conference,
    code,
    cookie: store.get(name)?.value,
    now: new Date(),
  })
  if (cookie) store.set(name, cookie, options)
  return outcome
}
