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
 * erased talk refuses at once. So does a talk none of whose speakers exists
 * and is not erased: its feedback would belong to nobody (§12.3). An erasure
 * unsets such a talk's code, but a draft or release copy that dropped a live
 * co-speaker, published later, can bring one back.
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
import { requestCap } from './talk-versions'
import { SUBMIT_COMMIT_BUDGET_MS, SUBMIT_REQUEST_TIMEOUT_MS } from './bounds'

const INVALID_COMMENT = Symbol('invalid comment')

/**
 * What the tap says about the comment: `undefined` when it sent none (a
 * colour-only tap leaves the stored comment UNTOUCHED, so a stale tab's
 * Change answer never erases what another tab sent), `null` for an
 * explicitly emptied box (sent as `''`: unset), the trimmed text to store, or
 * {@link INVALID_COMMENT} when it is not a comment at all (not a string, or
 * too long once trimmed).
 */
function normalizeComment(
  comment: unknown,
): string | null | undefined | typeof INVALID_COMMENT {
  if (comment === undefined) return undefined
  if (typeof comment !== 'string') return INVALID_COMMENT
  const trimmed = comment.trim()
  if (trimmed.length > MAX_COMMENT_LENGTH) return INVALID_COMMENT
  return trimmed || null
}

interface TalkDoc {
  _id: string
  status?: string
  feedbackCode?: unknown
  conference?: { _ref?: string }
  speakers?: ({ _ref?: unknown } | null)[] | null
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
  if (comment === INVALID_COMMENT) return { outcome: page }

  // Bounded on its own, not by the platform: a speaker erasure waits out
  // SUBMIT_WRITE_BOUND_MS before folding a talk whose code it unset (§12.3).
  const readStartedAt = Date.now()
  let talk: TalkDoc | undefined
  try {
    talk = await clientWrite.getDocument<TalkDoc>(
      target.talkId,
      requestCap(SUBMIT_REQUEST_TIMEOUT_MS),
    )
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
  let live: boolean
  try {
    live = await hasLiveSpeaker(talk)
  } catch (error) {
    console.error('Could not read the speakers of a Feedback Code', error)
    return { outcome: { state: 'unavailable' } }
  }
  if (!live) return { outcome: { state: 'unknown' } }
  // The code checked above may be gone by now: too late, write nothing.
  if (Date.now() - readStartedAt > SUBMIT_COMMIT_BUDGET_MS) {
    console.error('A Feedback Response came too late after its check')
    return { outcome: { state: 'unavailable' } }
  }

  // The cookie is set whatever the write's outcome: a commit that was applied
  // but whose answer was lost looks like a failure here, and a retry under a
  // new token would count this phone twice. Under this token the retry lands
  // on the same response.
  const next = recordAnswer(device, target.talkId, now)
  const id = feedbackResponseId(next.device.token, target.talkId)
  const submittedAt = now.toISOString()
  // What the page is told is what is STORED, read off the commit's own
  // answer (`returnDocuments`: one document per mutation, no extra read), so
  // a stale tab that changed the colour sees the comment another tab sent.
  let stored: ResponseDoc | undefined
  try {
    const docs = await clientWrite
      .transaction()
      .createIfNotExists({
        _id: id,
        _type: 'feedbackResponse',
        talk: { _type: 'reference', _ref: target.talkId },
        conference: { _type: 'reference', _ref: conference._id },
        colour,
        submittedAt,
      })
      .patch(id, (patch) => {
        const set = patch.set({
          colour,
          submittedAt,
          ...(typeof comment === 'string' ? { comment } : {}),
        })
        return comment === null ? set.unset(['comment']) : set
      })
      .commit({
        returnDocuments: true,
        ...requestCap(SUBMIT_REQUEST_TIMEOUT_MS),
      })
    stored = (docs as (ResponseDoc | undefined)[])
      .filter((doc) => doc?._id === id)
      .at(-1)
  } catch (error) {
    console.error('Could not save a Feedback Response', error)
    return { outcome: { state: 'unavailable' }, cookie: next.cookie }
  }
  // A commit whose answer was lost may have applied too, but what the page
  // would then show is the stale answer, not a wrong one; the expiry rides on
  // the confirmed write only.
  expireFeedbackResponse(id)
  return {
    outcome: {
      state: 'answered',
      colour,
      comment: await storedComment(stored, id, comment),
      talk: page.talk,
    },
    cookie: next.cookie,
  }
}

interface ResponseDoc {
  _id: string
  comment?: unknown
}

/** A speaker of the talk exists and is not erased (minting's rule, §5). */
async function hasLiveSpeaker(talk: TalkDoc): Promise<boolean> {
  const ids = (talk.speakers ?? []).flatMap((s) =>
    typeof s?._ref === 'string' ? [s._ref] : [],
  )
  if (ids.length === 0) return false
  const speakers = await clientWrite.getDocuments<{
    _type?: string
    erasedAt?: unknown
  }>(ids, requestCap(SUBMIT_REQUEST_TIMEOUT_MS))
  return speakers.some((s) => s?._type === 'speaker' && !s.erasedAt)
}

/**
 * The comment as stored after the write. Sanity answers a `returnDocuments`
 * commit with a document per mutation, but may carry none for a mutation
 * that changed nothing (undocumented); the fallback is one by-id read. If
 * that fails too: what this tap sent is what is stored, when it sent one;
 * after a colour-only tap the comment is UNKNOWN (`undefined`), never "no
 * comment", so the page keeps what it last knew instead of showing an empty
 * box over a stored comment.
 */
async function storedComment(
  stored: ResponseDoc | undefined,
  id: string,
  sent: string | null | undefined,
): Promise<string | null | undefined> {
  if (!stored) {
    try {
      stored = (await clientWrite.getDocument<ResponseDoc>(id)) ?? undefined
    } catch (error) {
      console.error('Could not read back a Feedback Response', error)
      return sent
    }
  }
  return typeof stored?.comment === 'string' ? stored.comment : null
}
