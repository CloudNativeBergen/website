'use server'

import { cookies } from 'next/headers'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { deviceCookie } from '@/lib/feedback/device'
import { submitFeedback, type SubmitOutcome } from '@/lib/feedback/submit'

/**
 * Submit on `/f/<code>` (speaker feedback spec §7.4). A Server Action, not a
 * tRPC procedure: the device cookie is scoped to `Path=/f` and never reaches
 * `/api/trpc`, and an action posts to the page's own URL. It takes only the
 * code and the colour; the conference comes from the Host and the talk from
 * the conference's index, never from the client.
 *
 * CSRF is covered by Next's Server Action origin check and the `SameSite=Lax`,
 * host-only cookie: never widen `serverActions.allowedOrigins`.
 */
export async function submitFeedbackAnswer(
  code: string,
  colour: string,
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
    cookie: store.get(name)?.value,
    now: new Date(),
  })
  if (cookie) store.set(name, cookie, options)
  return outcome
}
