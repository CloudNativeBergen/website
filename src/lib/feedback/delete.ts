/**
 * DELETE MY ANSWER (speaker feedback spec §7.4): this device's response about
 * the talk is deleted, and the talk dropped from the cookie's list; the token
 * stays. Allowed for as long as the cookie is valid, including after the
 * window closed or the talk moved (R1).
 *
 * Refused before any write or talk-specific read, in this order:
 * 1. the code resolves, through the conference's index, to a confirmed,
 *    published talk of the conference serving the request;
 * 2. the cookie is one this server signed AND lists this talk. Otherwise
 *    there is "no response from this device", and the answer is the page
 *    state the attendee would see on a reload, never an error that differs
 *    by talk.
 * The id is deterministic, so the delete needs no read first, and deleting
 * an id that holds nothing (a lost commit, §15) is harmless.
 */
import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { resolveFeedbackTarget, type FeedbackConference } from './attendee'
import { expireFeedbackResponse } from './cache'
import {
  answeredOn,
  feedbackResponseId,
  forgetAnswer,
  readDeviceCookie,
  type DeviceCookie,
} from './device'
import { attendeeState, type DeleteOutcome } from './page'

/**
 * What the attendee sees after the delete, and the device cookie to set:
 * only once the delete is confirmed. A failed delete keeps the cookie as it
 * was, so Delete my answer stays on offer.
 */
export async function deleteFeedback({
  conference,
  code: rawCode,
  cookie,
  now,
}: {
  conference: FeedbackConference
  code: unknown
  cookie: string | undefined
  now: Date
}): Promise<{ outcome: DeleteOutcome; cookie?: DeviceCookie }> {
  const { page, target } = await resolveFeedbackTarget(conference, rawCode, now)
  if (!target) return { outcome: { deleted: false, page } }
  const device = readDeviceCookie(cookie, now)
  if (!device || !answeredOn(device, target.talkId)) {
    return {
      outcome: {
        deleted: false,
        page: attendeeState(page, null, target.talkId),
      },
    }
  }

  const id = feedbackResponseId(device.token, target.talkId)
  try {
    await clientWrite.delete(id)
  } catch (error) {
    console.error('Could not delete a Feedback Response', error)
    return { outcome: { deleted: false, page: { state: 'unavailable' } } }
  }
  expireFeedbackResponse(id)
  const next = forgetAnswer(device, target.talkId, now)
  return {
    outcome: {
      deleted: true,
      page: attendeeState(page, next.device, target.talkId),
    },
    cookie: next.cookie,
  }
}
