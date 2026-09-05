import { Speaker, SpeakerWithReviewInfo, Flags } from './types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { Status } from '@/lib/proposal/types'

/**
 * Determine whether a speaker has previously accepted talks at other conferences.
 * Used in the proposal review UI and admin speakers page as a shared utility
 * for speaker-experience classification.
 */
export function hasPreviousAcceptedTalks(
  speaker: Speaker & { proposals?: ProposalExisting[] },
  currentConferenceId?: string,
): boolean {
  if (!speaker.proposals || speaker.proposals.length === 0) {
    return false
  }

  if (!currentConferenceId) {
    return false
  }

  return speaker.proposals.some((proposal) => {
    const isAcceptedOrConfirmed =
      proposal.status === Status.accepted ||
      proposal.status === Status.confirmed

    if (!isAcceptedOrConfirmed) {
      return false
    }

    if (proposal.conference) {
      const proposalConferenceId =
        typeof proposal.conference === 'object' && '_id' in proposal.conference
          ? proposal.conference._id
          : proposal.conference
      return proposalConferenceId !== currentConferenceId
    }

    return false
  })
}

export function generateSlugFromName(name: string): string {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return ''
  }

  return name.trim().replace(/\s+/g, '-').toLowerCase()
}

export function getSpeakerSlug(
  speaker: Pick<Speaker, 'slug' | 'name'>,
): string {
  if (!speaker.slug?.trim()) {
    const warningMsg = `WARNING: Speaker missing slug! Name: "${speaker.name}", ID: ${(speaker as Speaker)._id || 'unknown'}. Using generated slug as fallback.`
    console.warn(warningMsg)

    // Generate a fallback slug from the name
    const generatedSlug = generateSlugFromName(speaker.name)
    if (generatedSlug) {
      return generatedSlug
    }

    // Ultimate fallback if name is also invalid
    console.error('CRITICAL: Cannot generate slug - invalid speaker name')
    return 'unknown-speaker'
  }

  return speaker.slug
}

export function getSpeakerFilename(
  speaker: Pick<Speaker, 'slug' | 'name'>,
): string {
  return getSpeakerSlug(speaker)
}

/**
 * The fully-populated speakers on a proposal. `ProposalExisting['speakers']` is
 * `Speaker[] | Reference[]` depending on whether the GROQ query dereferenced
 * them, so anything reading speaker fields must narrow first — an unexpanded
 * reference has no `name`. Callers get the real domain type instead of an
 * ad-hoc inline shape.
 */
export function populatedSpeakers(proposal: ProposalExisting): Speaker[] {
  if (!Array.isArray(proposal.speakers)) return []
  return proposal.speakers.filter(
    (s): s is Speaker =>
      !!s && typeof s === 'object' && 'name' in s && typeof s.name === 'string',
  )
}

export function checkSpeakerFlags(
  speakers: (Speaker | SpeakerWithReviewInfo)[],
  flag: Flags,
): boolean {
  return speakers.some((speaker) => speaker?.flags?.includes(flag))
}

export function getSpeakerIndicators(
  speakers: (Speaker | SpeakerWithReviewInfo)[],
) {
  return {
    isSeasonedSpeaker: speakers.some(
      (speaker) =>
        'previousAcceptedTalks' in speaker &&
        speaker.previousAcceptedTalks &&
        speaker.previousAcceptedTalks.length > 0,
    ),
    isNewSpeaker:
      speakers.length === 0 ||
      speakers.every(
        (speaker) =>
          !('previousAcceptedTalks' in speaker) ||
          !speaker.previousAcceptedTalks ||
          speaker.previousAcceptedTalks.length === 0,
      ),
    isLocalSpeaker: checkSpeakerFlags(speakers, Flags.localSpeaker),
    isUnderrepresentedSpeaker: checkSpeakerFlags(
      speakers,
      Flags.diverseSpeaker,
    ),
    requiresTravelSupport: checkSpeakerFlags(
      speakers,
      Flags.requiresTravelFunding,
    ),
  }
}

/**
 * Which value a surface rendered from `session.speaker` should actually show.
 *
 * `session.speaker` is a JWT snapshot written at sign-in by `applySpeakerToToken`
 * and refreshed only by an explicit `useSession().update()`. The session cookie
 * rolls, so an active user never re-signs-in. Two failure modes follow, and this
 * resolver answers both the same way:
 *
 *   - STALE: a photo uploaded later — on the profile page, or on another device
 *     — stays stale in that token indefinitely (#875).
 *   - ABSENT: the snapshot only carries a fixed subset of fields, so anything
 *     outside it (`title`, #958) never arrives at all.
 *
 * So the document wins. The fallback is not symmetric on purpose: a speaker
 * whose document carries nothing for the field keeps whatever the token has,
 * rather than being blanked by a null projection. The cost is that a value
 * cleared everywhere lingers on such a surface until the token is re-minted,
 * which is the better failure of the two.
 */
export function resolveSnapshotField(
  documentValue: string | null | undefined,
  snapshotValue: string | null | undefined,
): string | null | undefined {
  return documentValue ? documentValue : snapshotValue
}
