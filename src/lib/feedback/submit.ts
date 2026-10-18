/**
 * SUBMIT (speaker feedback spec §7.4): one tap records a Feedback Colour on
 * this device's response about the talk, and a later tap changes it.
 *
 * Refused before any write or talk-specific read, in this order:
 * 1. the code resolves, through the conference's index, to a confirmed,
 *    published talk of the conference serving the request;
 * 2. the Feedback Window is open;
 * 3. the colour is exactly one Feedback Colour, and the comment, if any, is
 *    a string of at most {@link MAX_COMMENT_LENGTH} characters once trimmed;
 * 4. the cookie is one this server signed. A missing or invalid one is "no
 *    response from this device": a new token, never an error.
 * Refusals 1 and 2 answer with the page state the attendee would see on a
 * reload. Then the talk is read again by id through the doc endpoint, since
 * the index can be one `cacheLife` stale: a rotated, withdrawn, folded or
 * erased talk refuses at once.
 *
 * THE WRITE is one transaction: `createIfNotExists` on the deterministic id,
 * then a patch that `set`s only the colour, the comment and the time (an
 * emptied comment is `unset`). It never touches `hiddenAt` or `flaggedAt`, so
 * an attendee can't un-hide a comment by answering or rewording it again.
 * "Change answer" and "Send comment" are this one action with the current or
 * the new colour and comment (§7.4). Two first taps that race both commit; the second's create
 * does nothing, and the last write wins. _Implementation detail:_ the spec's
 * create-then-patch-on-409 has the same outcome in two requests.
 */
import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { normalizeShortCode } from '@/lib/marketing/short-code'
import { resolveFeedbackTarget, type FeedbackConference } from './attendee'
import { expireFeedbackResponse } from './cache'
import { isFeedbackColour } from './colour'
import {
  feedbackResponseId,
  readDeviceCookie,
  recordAnswer,
  type DeviceCookie,
} from './device'
import { MAX_COMMENT_LENGTH } from './comment'
import { attendeeState, type AttendeeFeedbackState } from './page'

/**
 * The comment as it will be stored: `null` for none or blank, `undefined`
 * when it is not a comment at all (not a string, or too long once trimmed).
 */
function normalizeComment(comment: unknown): string | null | undefined {
  if (comment === undefined || comment === null) return null
  if (typeof comment !== 'string') return undefined
  const trimmed = comment.trim()
  if (trimmed.length > MAX_COMMENT_LENGTH) return undefined
  return trimmed || null
}

interface TalkDoc {
  _id: string
  status?: string
  feedbackCode?: unknown
  conference?: { _ref?: string }
}

/**
 * What the attendee sees after the tap, and the device cookie to set: on
 * every attempted write, saved or not, never on a refusal.
 */
export async function submitFeedback({
  conference,
  code: rawCode,
  colour,
  comment: rawComment,
  cookie,
  now,
}: {
  conference: FeedbackConference
  code: unknown
  colour: unknown
  comment?: unknown
  cookie: string | undefined
  now: Date
}): Promise<{ outcome: AttendeeFeedbackState; cookie?: DeviceCookie }> {
  const { page, target } = await resolveFeedbackTarget(conference, rawCode, now)
  if (!target) return { outcome: page }
  // Reading the cookie is no fetch, so the order of §7.4 holds; an invalid
  // one is "no response from this device", never an error.
  const device = readDeviceCookie(cookie, now)
  // Closed or Not yet open: with Delete my answer when the cookie lists the talk.
  if (page.state !== 'open') {
    return { outcome: attendeeState(page, device, target.talkId) }
  }
  if (!isFeedbackColour(colour)) return { outcome: page }
  const comment = normalizeComment(rawComment)
  if (comment === undefined) return { outcome: page }

  let talk: TalkDoc | undefined
  try {
    talk = await clientWrite.getDocument<TalkDoc>(target.talkId)
  } catch (error) {
    console.error('Could not read the talk of a Feedback Code', error)
    return { outcome: { state: 'unavailable' } }
  }
  if (
    talk?._id !== target.talkId ||
    talk.status !== 'confirmed' ||
    talk.conference?._ref !== conference._id ||
    normalizeShortCode(
      typeof talk.feedbackCode === 'string' ? talk.feedbackCode : null,
    ) !== target.code
  ) {
    return { outcome: { state: 'unknown' } }
  }

  // The cookie is set whatever the write's outcome: a commit that was applied
  // but whose answer was lost looks like a failure here, and a retry under a
  // new token would count this phone twice. Under this token the retry lands
  // on the same response.
  const next = recordAnswer(device, target.talkId, now)
  const id = feedbackResponseId(next.device.token, target.talkId)
  const submittedAt = now.toISOString()
  try {
    await clientWrite
      .transaction()
      .createIfNotExists({
        _id: id,
        _type: 'feedbackResponse',
        talk: { _type: 'reference', _ref: target.talkId },
        conference: { _type: 'reference', _ref: conference._id },
        colour,
        submittedAt,
      })
      .patch(id, (patch) =>
        comment === null
          ? patch.set({ colour, submittedAt }).unset(['comment'])
          : patch.set({ colour, comment, submittedAt }),
      )
      .commit()
  } catch (error) {
    console.error('Could not save a Feedback Response', error)
    return { outcome: { state: 'unavailable' }, cookie: next.cookie }
  }
  // A commit whose answer was lost may have applied too, but what the page
  // would then show is the stale answer, not a wrong one; the expiry rides on
  // the confirmed write only.
  expireFeedbackResponse(id)
  return {
    outcome: { state: 'answered', colour, comment, talk: page.talk },
    cookie: next.cookie,
  }
}
