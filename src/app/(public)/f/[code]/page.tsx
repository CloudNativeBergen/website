import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import {
  AttendeeFeedbackPage,
  type AttendeeFeedbackState,
} from '@/components/feedback'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { deviceCookie, resolveAttendeeState } from '@/lib/feedback/server'
import { deleteFeedbackAnswer, submitFeedbackAnswer } from './actions'

/**
 * The code is the whole URL (speaker feedback spec §7.1): never indexed, and
 * never sent on as a referrer, to our own analytics endpoints or onwards.
 */
/**
 * Bounds Submit and Delete my answer (Server Actions take the page's limit):
 * a speaker erasure waits this long, and more, before folding a talk whose
 * code it just unset, so a Submit that re-read the code before the erasure
 * has landed by then (`SUBMIT_MAX_DURATION_S`, speaker feedback spec §12.3).
 * A literal: Next reads it statically.
 */
export const maxDuration = 30

export const metadata: Metadata = {
  title: 'Session feedback',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

/**
 * `/f/<code>` — the attendee page a Feedback Code's QR opens (speaker
 * feedback spec §7). The conference is the one serving the Host; a code is
 * looked up only in ITS index, so another tenant's code is Unknown here.
 *
 * Enter and leave this page with FULL page loads only, never `next/link`:
 * Pirsch, once loaded on another page, reports every history navigation
 * (pushState and Back) with the full URL, and only a page it never runs on
 * keeps the code out of it.
 */
export default async function FeedbackCodePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const resolution = await getConferenceForCurrentDomain()

  // A failed read is not "no conference here" (`guard.ts`).
  // Bound to THIS page's code: the client sends the colour and the comment,
  // or nothing.
  const submit = submitFeedbackAnswer.bind(null, code)
  const remove = deleteFeedbackAnswer.bind(null, code)

  if (isConferenceUnavailable(resolution)) {
    return (
      <AttendeeFeedbackPage
        logo={null}
        page={{ state: 'unavailable' }}
        submit={submit}
        remove={remove}
      />
    )
  }
  if (isUnknownHost(resolution)) notFound()

  const { conference } = resolution
  await connection()
  let page: AttendeeFeedbackState
  try {
    // Whether this device has answered is decided here, so a reload shows
    // Answered (§7.2). The cookie is scoped to `/f`, so it arrives.
    const cookie = (await cookies()).get(deviceCookie().name)?.value
    page = await resolveAttendeeState({
      conference,
      code,
      cookie,
      now: new Date(),
    })
  } catch (error) {
    // Not Unknown: a code that exists must not be told it is invalid because
    // a read failed. A thrown read is never cached, so a retry reads again.
    console.error('Could not resolve a Feedback Code', error)
    page = { state: 'unavailable' }
  }

  return (
    <AttendeeFeedbackPage
      logo={pickConferenceLogoProps(conference)}
      page={page}
      submit={submit}
      remove={remove}
    />
  )
}
