/**
 * THIS DEVICE'S OWN RESPONSE (speaker feedback spec §7.4), for the Answered
 * state. Read only for a talk the cookie lists, by its deterministic id,
 * through the doc endpoint (`getDocument`: never GROQ or the CDN, which can
 * lag the write), inside a `'use cache: remote'` read of 5 minutes tagged per
 * response. Submit and Delete my answer expire the tag with `updateTag`.
 * Without the cache, a script holding a valid cookie could reload the page
 * for unlimited billable reads.
 *
 * What leaves this module is the colour and the comment, nothing else: the
 * page is never told a comment was hidden or flagged.
 */
import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { feedbackResponseTag } from '@/lib/cache/tags'
import { clientReadUncached } from '@/lib/sanity/client'
import { isFeedbackColour, type FeedbackColour } from './colour'
import { answeredOn, feedbackResponseId, type Device } from './device'

/** What the attendee page learns about its own answer. */
export interface OwnFeedbackAnswer {
  colour: FeedbackColour
  comment: string | null
}

/**
 * 5 minutes (§7.4). `expire` one second past `revalidate`, as the index's
 * life (`attendee.ts`): Next requires it LONGER, and equal could throw in a
 * stricter release.
 */
export const FEEDBACK_RESPONSE_LIFE = {
  stale: 60,
  revalidate: 60 * 5,
  expire: 60 * 5 + 1,
} as const

/** The id shape `feedbackResponseId` mints; nothing else reaches the doc endpoint. */
const RESPONSE_ID = /^feedbackResponse-[0-9a-f]{32}$/

interface ResponseRow {
  _id: string
  _type: string
  talk?: { _ref?: string }
  colour?: unknown
  comment?: unknown
}

/**
 * The response with this id as stored, projected to what the page may learn,
 * or `null` when there is none. Cached per id under {@link feedbackResponseTag}.
 */
async function readOwnResponse(id: string): Promise<{
  talkId: string | null
  colour: unknown
  comment: unknown
} | null> {
  'use cache: remote'
  cacheLife(FEEDBACK_RESPONSE_LIFE)
  cacheTag(feedbackResponseTag(id))

  const doc = await clientReadUncached.getDocument<ResponseRow>(id)
  // `getDocument('a,b')` reads a LIST, and a lagging or foreign answer is not
  // this response: the id and the type are checked on what came back.
  if (!doc || doc._id !== id || doc._type !== 'feedbackResponse') return null
  return {
    talkId: doc.talk?._ref ?? null,
    colour: doc.colour,
    comment: doc.comment,
  }
}

/**
 * This device's answer about `talkId`, or `null`: no valid cookie, a talk the
 * cookie does not list (no read at all), or no document under the id. A
 * cookie can list an answer whose commit was lost (§15), so a missing
 * document is "no answer yet", never an error.
 */
export async function ownFeedbackAnswer(
  device: Device | null,
  talkId: string,
): Promise<OwnFeedbackAnswer | null> {
  if (!device || !answeredOn(device, talkId)) return null
  const id = feedbackResponseId(device.token, talkId)
  if (!RESPONSE_ID.test(id)) return null
  const stored = await readOwnResponse(id)
  if (!stored || stored.talkId !== talkId || !isFeedbackColour(stored.colour)) {
    return null
  }
  return {
    colour: stored.colour,
    comment: typeof stored.comment === 'string' ? stored.comment : null,
  }
}
