/**
 * A SPEAKER FLAGS A COMMENT FOR ORGANIZERS (speaker feedback spec §9.1,
 * §10.3, §11.2).
 *
 * The order is the guard: the one scoped talk query the results start with
 * (`readSpeakerTalk`), then visibility (§6), and only then the response.
 * Every refusal is the same answer, so a response of another talk or
 * conference is indistinguishable from one that does not exist.
 *
 * THE HANDLE is the response's document id, which `results` already gives
 * the talk's speakers. It is a hash of the device's secret token and the
 * talk (`./device`): it cannot be turned back into the token, differs per
 * talk (so it links nothing across talks), and the only thing it unlocks is
 * this flag, which re-checks that the response belongs to the caller's talk.
 *
 * The response is read through the doc endpoint, not GROQ, which can lag a
 * write by about a second: a flag right after an organizer's Keep would see
 * the flag Keep just cleared and be lost. `flaggedAt` is set only on an
 * unset → set transition under the revision that read saw; a revision that
 * moved is read again. Only that transition notifies the organizers.
 */
import 'server-only'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import {
  NOTIFICATION_TITLE_MAX,
  createNotifications,
} from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'
import { getConferenceOrganizerIds } from '@/lib/organizer-invite/sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { displayName } from '@/lib/text/display'
import { commentOf } from './comment'
import { readSpeakerTalk } from './results'
import { sanityStatus } from '@/lib/sanity/status'
import { getFeedbackSlots } from './sanity'
import { feedbackWindow } from './window'

/** Reads and writes before a flag that keeps losing its revision gives up. */
export const FLAG_ATTEMPTS = 3

export type FlagResult =
  | { status: 'refused' }
  /** Flagged: by this request, or already by another speaker. */
  | { status: 'flagged' }
  /** The revision moved on every attempt. Nothing was written. */
  | { status: 'conflict' }

interface StoredResponse {
  _id: string
  _type: string
  _rev: string
  talk?: { _ref?: string }
  conference?: { _ref?: string }
  colour?: unknown
  comment?: unknown
  hiddenAt?: unknown
  flaggedAt?: unknown
}

export async function flagResponse({
  talkId,
  responseId,
  speakerId,
  conference,
  now,
}: {
  talkId: string
  /** A published response id, checked by the caller's input schema. */
  responseId: string
  speakerId: string
  conference: { _id: string; endDate?: string | null }
  now: Date
}): Promise<FlagResult> {
  const talk = await readSpeakerTalk({
    talkId,
    speakerId,
    conferenceId: conference._id,
  })
  if (!talk) return { status: 'refused' }
  // Speakers can flag only what `results` shows them, and it shows nothing
  // before feedback is visible.
  const window = feedbackWindow({
    slots: await getFeedbackSlots(conference._id, talk._id),
    conferenceEndDate: conference.endDate,
    now,
  })
  if (!window.feedbackVisible) return { status: 'refused' }

  for (let attempt = 0; attempt < FLAG_ATTEMPTS; attempt++) {
    const stored =
      await clientReadUncached.getDocument<StoredResponse>(responseId)
    if (
      !stored ||
      // `getDocument('a,b')` reads a list: the id is checked on what came back.
      stored._id !== responseId ||
      stored._type !== 'feedbackResponse' ||
      stored.talk?._ref !== talk._id ||
      stored.conference?._ref !== conference._id ||
      stored.hiddenAt ||
      !commentOf(stored)
    )
      return { status: 'refused' }
    if (stored.flaggedAt) return { status: 'flagged' }

    try {
      await clientWrite
        .patch(responseId)
        .ifRevisionId(stored._rev)
        .set({ flaggedAt: now.toISOString() })
        .commit()
    } catch (error) {
      if (sanityStatus(error) === 409) continue
      // Deleted since the read (Delete my answer, Remove): never there.
      if (sanityStatus(error) === 404) return { status: 'refused' }
      throw error
    }
    await notifyOrganizers({
      conferenceId: conference._id,
      talkId: talk._id,
      talkTitle: talk.title,
      flaggerId: speakerId,
    })
    return { status: 'flagged' }
  }
  return { status: 'conflict' }
}

const ENDING = '” was flagged by a speaker'

/** The notification's title: the talk's, never the comment's text. */
function flagTitle(talkTitle: string | null): string {
  const name = displayName(talkTitle ?? '') || 'a session'
  const prefix = 'A comment on “'
  const room = NOTIFICATION_TITLE_MAX - prefix.length - ENDING.length
  return `${prefix}${
    name.length > room ? `${truncateToGraphemeBoundary(name, room - 1)}…` : name
  }${ENDING}`
}

/**
 * The bell notification to the conference's organizers but the flagger
 * (§11.2). It carries the talk's title and NEVER the comment: notifications
 * live for 90 days and would outlive Remove, the fold and erasure. NEVER
 * FAILS the flag it rides on: `createNotifications` swallows its own
 * failures, and the organizers read is caught here.
 */
async function notifyOrganizers({
  conferenceId,
  talkId,
  talkTitle,
  flaggerId,
}: {
  conferenceId: string
  talkId: string
  talkTitle: string | null
  flaggerId: string
}): Promise<void> {
  try {
    const organizerIds = await getConferenceOrganizerIds(conferenceId)
    const title = flagTitle(talkTitle)
    await createNotifications(
      [...new Set(organizerIds)]
        .filter((id) => id !== flaggerId)
        .map((recipientId): NotificationInput => ({
          recipientId,
          conferenceId,
          notificationType: 'session_feedback_flagged',
          title,
          message: 'Keep, hide or remove it on Session Feedback.',
          link: '/admin/feedback',
          actorId: flaggerId,
          relatedProposalId: talkId,
        })),
    )
  } catch (error) {
    console.error('Could not notify organizers of a flagged comment', {
      conferenceId,
      talkId,
      error,
    })
  }
}
