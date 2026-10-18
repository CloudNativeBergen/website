/**
 * SUBMIT (speaker feedback spec §7.4): one tap records a Feedback Colour on
 * this device's response about the talk, and a later tap changes it.
 *
 * Refused before any write or talk-specific read, in this order:
 * 1. the code resolves, through the conference's index, to a confirmed,
 *    published talk of the conference serving the request;
 * 2. the Feedback Window is open;
 * 3. the colour is exactly one Feedback Colour;
 * 4. the cookie is one this server signed. A missing or invalid one is "no
 *    response from this device": a new token, never an error.
 * Refusals 1 and 2 answer with the page state the attendee would see on a
 * reload. Then the talk is read again by id through the doc endpoint, since
 * the index can be one `cacheLife` stale: a rotated, withdrawn, folded or
 * erased talk refuses at once.
 *
 * THE WRITE is one transaction: `createIfNotExists` on the deterministic id,
 * then a patch that `set`s only the colour and the time. It never touches
 * `hiddenAt` or `flaggedAt`, so an attendee can't un-hide a comment by
 * answering again. Two first taps that race both commit; the second's create
 * does nothing, and the last write wins. _Implementation detail:_ the spec's
 * create-then-patch-on-409 has the same outcome in two requests.
 */
import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { normalizeShortCode } from '@/lib/marketing/short-code'
import {
  resolveFeedbackTarget,
  type FeedbackConference,
  type FeedbackPage,
  type PublicFeedbackTalk,
} from './attendee'
import { isFeedbackColour, type FeedbackColour } from './colour'
import { feedbackResponseId, readDeviceCookie, recordAnswer } from './device'

export type SubmitOutcome =
  | FeedbackPage
  | { state: 'unavailable' }
  | {
      state: 'answered'
      colour: FeedbackColour
      /** The heading the tap was made under: only for a public talk. */
      talk: PublicFeedbackTalk | null
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
  cookie,
  now,
}: {
  conference: FeedbackConference
  code: unknown
  colour: unknown
  cookie: string | undefined
  now: Date
}): Promise<{ outcome: SubmitOutcome; cookie?: string }> {
  const { page, target } = await resolveFeedbackTarget(conference, rawCode, now)
  if (!target || page.state !== 'open') return { outcome: page }
  if (!isFeedbackColour(colour)) return { outcome: page }
  const device = readDeviceCookie(cookie, now)

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
      .patch(id, (patch) => patch.set({ colour, submittedAt }))
      .commit()
  } catch (error) {
    console.error('Could not save a Feedback Response', error)
    return { outcome: { state: 'unavailable' }, cookie: next.value }
  }
  return {
    outcome: { state: 'answered', colour, talk: page.talk },
    cookie: next.value,
  }
}
