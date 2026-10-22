/**
 * Erasure's Session Feedback branch (speaker feedback spec §12.3, #1438).
 *
 * A talk whose ONLY non-erased speaker is the subject (a co-speaker with
 * `erasedAt` set counts as erased, and so does one whose document is gone)
 * loses its Feedback Code, on the published talk and on every other version,
 * IN the erasure transaction: Submit re-reads the talk, so taps are refused
 * from that moment. Its responses are then folded into totals and deleted
 * exactly as the 24-month fold does (`@/lib/feedback/fold`), in chunks AFTER
 * the transaction, like the image-asset delete, so a large talk cannot fail
 * the erasure.
 *
 * A talk with another live speaker keeps its code and its feedback: never
 * destroy data belonging to somebody who requested nothing. An organizer
 * removes a comment naming the erased person by hand.
 *
 * LOCKED VERSIONS. Sanity locks the versions of a release that is not
 * `active`, and a patch of one would fail the WHOLE erasure transaction on
 * every run. So such a version is never patched: the plan reports the talk as
 * held, the reachable versions still lose the code, and the fold waits (the
 * fold holds a talk with a locked version for the same reason). The same when
 * the releases cannot be listed. The operator re-runs once the release is
 * published or archived; publishing it first would bring the code back, and
 * the re-run unsets it again.
 *
 * Every revision comes from the doc endpoint through the release-aware client
 * (`readTalkVersions`), which is also the API version the erasure transaction
 * is sent at (`COUNT_API_VERSION`, 2025-02-19), so a `versions.**` patch is
 * accepted.
 *
 * Pure planner plus one read function, split from `./erasure.ts` like
 * `./erasure-assets.ts` and `./erasure-mentions.ts`.
 */
import { getPublishedId } from '@sanity/client/csm'
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { PUBLISHED_ONLY, versionsClient } from '@/lib/feedback/sanity'
import {
  readTalkVersions,
  requestCap,
  type TalkDoc,
} from '@/lib/feedback/talk-versions'
import type { ErasureDocumentPatch } from './erasure'

/** One talk the subject speaks on, as the doc endpoint has it now. */
export interface FeedbackTalkInput {
  talk: TalkDoc
  /** The draft and the versions in an `active` release. */
  versions: TalkDoc[]
  /** Versions in a release that is not `active`: never patched. */
  locked: TalkDoc[]
  /** False when the releases could not be listed. */
  releasesListed: boolean
  /** Speakers of the talk OTHER than the subject who exist and are not erased. */
  otherLiveSpeakers: number
  /** The talk's published responses, as the totals count them (§4.3). */
  responses: number
  /**
   * Every published response of the talk, of ANY conference: one written
   * before the talk moved conference is not folded (§15), and must keep the
   * verification from CLEAN.
   */
  responsesAnyConference: number
}

export interface SpeakerFeedbackInputs {
  talks: FeedbackTalkInput[]
}

export interface SpeakerFeedbackPlan {
  /** `feedbackCode` unsets, one per version still holding it. */
  patches: ErasureDocumentPatch[]
  /** Talks those unsets are on: swept after the transaction (§4.2). */
  codeTalkIds: string[]
  /** Talks whose responses are folded after the transaction. */
  foldTalkIds: string[]
  /** Talks the erasure cannot finish: a locked version, or unlisted releases. */
  held: { talkId: string; reason: string }[]
}

/** Each request of the gather ends after this long. */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * The published talks of `referencingDocs` (the subject's inbound
 * references) that the subject speaks on, with their versions, how many
 * OTHER live speakers each has, and how many responses.
 */
export async function fetchSpeakerFeedbackInputs(
  speakerId: string,
  referencingDocs: Array<Record<string, unknown>>,
): Promise<SpeakerFeedbackInputs> {
  const talkIds = [
    ...new Set(
      referencingDocs.flatMap((d) =>
        d._type === 'talk' && typeof d._id === 'string'
          ? [getPublishedId(d._id)]
          : [],
      ),
    ),
  ].sort()
  if (talkIds.length === 0) return { talks: [] }

  const client = versionsClient()
  const talkVersions = await Promise.all(
    talkIds.map((id) =>
      readTalkVersions(client, id, { requestTimeoutMs: REQUEST_TIMEOUT_MS }),
    ),
  )
  const subjectTalks = talkVersions.filter(
    (r): r is typeof r & { published: TalkDoc } =>
      r.published?._type === 'talk' &&
      speakerRefs(r.published).includes(speakerId),
  )
  if (subjectTalks.length === 0) return { talks: [] }

  const others = [
    ...new Set(
      subjectTalks.flatMap((r) =>
        speakerRefs(r.published).filter((id) => id !== speakerId),
      ),
    ),
  ]
  const speakers =
    others.length === 0
      ? []
      : await client.getDocuments<{ _type?: string; erasedAt?: string }>(
          others,
          requestCap(REQUEST_TIMEOUT_MS),
        )
  // A reference whose speaker document is gone is not live (minting's rule).
  const liveIds = new Set(
    speakers.flatMap((s) =>
      s?._type === 'speaker' && !s.erasedAt ? [s._id] : [],
    ),
  )

  const rows =
    (await clientReadUncached.fetch<
      { talk: string | null; conference: string | null }[] | null
    >(
      // groq-global: erasure is a GLOBAL operation (see `./erasure.ts`); these
      // are the responses of the subject's own talks, matched per talk to its
      // conference below, as the totals count them.
      groq`*[_type == "feedbackResponse" && talk._ref in $talkIds && ${PUBLISHED_ONLY}]{ "talk": talk._ref, "conference": conference._ref }`,
      { talkIds: subjectTalks.map((r) => r.published._id) },
      { cache: 'no-store', ...requestCap(REQUEST_TIMEOUT_MS) },
    )) ?? []

  return {
    talks: subjectTalks.map((r) => ({
      talk: r.published,
      versions: r.versions,
      locked: r.locked,
      releasesListed: r.releasesListed,
      otherLiveSpeakers: speakerRefs(r.published).filter(
        (id) => id !== speakerId && liveIds.has(id),
      ).length,
      responses: rows.filter(
        (row) =>
          row.talk === r.published._id &&
          row.conference === r.published.conference?._ref,
      ).length,
      responsesAnyConference: rows.filter((row) => row.talk === r.published._id)
        .length,
    })),
  }
}

/**
 * The fold's eligibility for an erasure (`foldTalkFeedback`'s `eligible`):
 * the talk, as it reads now, still has no live speaker other than the
 * subject. Asked before every chunk, on the read whose revision guards the
 * commit, so a co-speaker added after the erasure read the talk stops the
 * fold instead of deleting feedback that is now theirs too.
 */
export const stillSubjectsAlone =
  (speakerId: string) =>
  async (talk: TalkDoc): Promise<boolean> => {
    // Taken off the talk since (it is being reassigned): not theirs to fold.
    if (!speakerRefs(talk).includes(speakerId)) return false
    const others = speakerRefs(talk).filter((id) => id !== speakerId)
    if (others.length === 0) return true
    const speakers = await versionsClient().getDocuments<{
      _type?: string
      erasedAt?: string
    }>(others, requestCap(REQUEST_TIMEOUT_MS))
    return !speakers.some((s) => s?._type === 'speaker' && !s.erasedAt)
  }

/**
 * The feedback half of the plan. Emits only what still changes something,
 * so a second run over a finished erasure plans nothing.
 */
export function planSpeakerFeedbackErasure(
  speakerId: string,
  inputs: SpeakerFeedbackInputs,
): SpeakerFeedbackPlan {
  const plan: SpeakerFeedbackPlan = {
    patches: [],
    codeTalkIds: [],
    foldTalkIds: [],
    held: [],
  }
  // Co-spoken with somebody live: theirs too, so untouched.
  for (const t of inputs.talks.filter(isSubjectsAlone(speakerId))) {
    const holders = [t.talk, ...t.versions].filter(
      (doc) => doc.feedbackCode !== undefined,
    )
    if (holders.length > 0) plan.codeTalkIds.push(t.talk._id)
    for (const doc of holders) {
      plan.patches.push({
        id: doc._id,
        type: 'talk',
        rev: doc._rev,
        unset: ['feedbackCode'],
        reason: 'Feedback Code of a talk with no other live speaker',
      })
    }
    const lockedCode = t.locked.some((d) => d.feedbackCode !== undefined)
    const foldable = t.releasesListed && t.locked.length === 0
    if (!t.releasesListed) {
      plan.held.push({
        talkId: t.talk._id,
        reason:
          'the releases could not be listed: a release version may still hold the code, and the fold waits; re-run',
      })
    } else if (lockedCode || (t.responses > 0 && !foldable)) {
      plan.held.push({
        talkId: t.talk._id,
        reason:
          'a version waits in a release that is not active (Sanity locks it): it keeps the code and the fold waits; re-run once the release is published or archived',
      })
    }
    if (t.responses > 0 && foldable) plan.foldTalkIds.push(t.talk._id)
  }
  return plan
}

/**
 * A talk the subject speaks on with no OTHER live speaker: the talks this
 * branch acts on. A co-speaker who is erased, or whose document is gone,
 * does not count.
 */
const isSubjectsAlone =
  (speakerId: string) =>
  (t: FeedbackTalkInput): boolean =>
    speakerRefs(t.talk).includes(speakerId) && t.otherLiveSpeakers === 0

const speakerRefs = (talk: TalkDoc): string[] =>
  (talk.speakers ?? [])
    .map((s) => s?._ref)
    .filter((id): id is string => typeof id === 'string')

/** The subject's talks with no other live speaker: the ones this branch acts on. */
export const soleTalkIds = (
  speakerId: string,
  inputs: SpeakerFeedbackInputs,
): string[] =>
  inputs.talks.filter(isSubjectsAlone(speakerId)).map((t) => t.talk._id)

/**
 * What the feedback branch still leaves, for the verification: codes on a
 * talk no live speaker is left on (one the planner would still unset, or one
 * a locked release version keeps), the responses still unfolded there, and
 * the talks it could not finish (held: a locked version, or releases that
 * could not be listed, where a release copy may still hold the code unseen).
 */
export function residualSpeakerFeedback(
  speakerId: string,
  inputs: SpeakerFeedbackInputs,
): { codes: number; responses: number; held: number } {
  const plan = planSpeakerFeedbackErasure(speakerId, inputs)
  const sole = inputs.talks.filter(isSubjectsAlone(speakerId))
  return {
    codes:
      plan.patches.length +
      sole.flatMap((t) => t.locked).filter((d) => d.feedbackCode !== undefined)
        .length,
    responses: sole.reduce((n, t) => n + t.responsesAnyConference, 0),
    held: plan.held.length,
  }
}
