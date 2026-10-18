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
import { resolveFeedbackTarget, type FeedbackPage } from './attendee'
import { isFeedbackColour, type FeedbackColour } from './colour'
import { feedbackResponseId, readDeviceCookie, recordAnswer } from './device'

export type SubmitOutcome =
  | FeedbackPage
  | { state: 'unavailable' }
  | { state: 'answered'; colour: FeedbackColour }

interface TalkDoc {
  _id: string
  status?: string
  feedbackCode?: unknown
  conference?: { _ref?: string }
}

/**
 * What the attendee sees after the tap, and the device cookie to set (only
 * when the answer was saved).
 */
export async function submitFeedback({
  conference,
  code: rawCode,
  colour,
  cookie,
  now,
}: {
  conference: Parameters<typeof resolveFeedbackTarget>[0]
  code: unknown
  colour: unknown
  cookie: string | undefined
  now: Date
}): Promise<{ outcome: SubmitOutcome; cookie?: string }> {
  const { page, target } = await resolveFeedbackTarget(
    conference,
    rawCode,
    now,
  )
  if (!target || page.state !== 'open') return { outcome: page }
  if (!isFeedbackColour(colour)) return { outcome: page }
  const device = readDeviceCookie(cookie, now)

  try {
    const talk = await clientWrite.getDocument<TalkDoc>(target.talkId)
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

    const next = recordAnswer(device, target.talkId, now)
    const id = feedbackResponseId(next.device.token, target.talkId)
    const submittedAt = now.toISOString()
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
    return { outcome: { state: 'answered', colour }, cookie: next.value }
  } catch (error) {
    console.error('Could not save a Feedback Response', error)
    return { outcome: { state: 'unavailable' } }
  }
}
