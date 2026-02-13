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
