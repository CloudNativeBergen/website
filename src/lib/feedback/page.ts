/**
 * WHAT `/f/<code>` SHOWS THIS DEVICE (speaker feedback spec §7.2): the code's
 * state from the index, and on top of it what the device cookie says. Whether
 * this device has answered is decided HERE, on the server, when the page
 * renders, so a reload shows Answered. The own-response read runs only for
 * the Open state and only for a talk the cookie lists; Closed and Not yet
 * open need no read, they offer Delete my answer whenever the cookie lists
 * the talk (§7.4, R1).
 */
import 'server-only'
import {
  resolveFeedbackTarget,
  type FeedbackConference,
  type FeedbackPage,
  type PublicFeedbackTalk,
} from './attendee'
import type { FeedbackColour } from './colour'
import { answeredOn, readDeviceCookie, type Device } from './device'
import { ownFeedbackAnswer } from './response'

/**
 * The page the attendee sees, and what Submit and Delete my answer answer
 * with: one of the code's states, `unavailable` when something could not be
 * read or written, or `answered` for this device's own answer.
 */
export type AttendeeFeedbackState =
  | { state: 'unknown' }
  | { state: 'unavailable' }
  | Extract<FeedbackPage, { state: 'open' }>
  | {
      state: 'answered'
      colour: FeedbackColour
      /** As stored: trimmed, `null` when there is none. */
      comment: string | null
      /** Only for a public talk. */
      talk: PublicFeedbackTalk | null
    }
  | (Extract<FeedbackPage, { state: 'not-yet-open' | 'closed' }> & {
      /** The talk is in this device's cookie list: Delete my answer (§7.4). */
      canDelete: boolean
    })

/**
 * What Delete my answer answers with (§7.4): `deleted` is true ONLY after the
 * delete committed. A refusal carries the page state a reload would show and
 * `deleted: false`, so a stale page (an expired cookie, a rotated code) is
 * never told its answer went. Refusals 1 and 2 stay indistinguishable: the
 * page states are the same ones the page itself shows.
 */
export interface DeleteOutcome {
  deleted: boolean
  page: AttendeeFeedbackState
}

/** The code's state with what the cookie adds to it, short of a read. */
export function attendeeState(
  page: FeedbackPage,
  device: Device | null,
  talkId: string,
): AttendeeFeedbackState {
  if (page.state === 'closed' || page.state === 'not-yet-open') {
    return { ...page, canDelete: !!device && answeredOn(device, talkId) }
  }
  return page
}

/**
 * The page for this device: {@link resolveFeedbackTarget}'s state, then the
 * device's own answer when the window is open and the cookie lists the talk.
 * A missing document is "no answer yet" (the open form): a cookie can list
 * an answer whose commit was lost (§15).
 */
export async function resolveAttendeeState({
  conference,
  code,
  cookie,
  now,
}: {
  conference: FeedbackConference
  code: string
  cookie: string | undefined
  now: Date
}): Promise<AttendeeFeedbackState> {
  const { page, target } = await resolveFeedbackTarget(conference, code, now)
  if (!target) return page
  const device = readDeviceCookie(cookie, now)
  if (page.state !== 'open') return attendeeState(page, device, target.talkId)
  const answer = await ownFeedbackAnswer(device, target.talkId)
  return answer ? { state: 'answered', ...answer, talk: page.talk } : page
}
