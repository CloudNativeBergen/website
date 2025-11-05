import { Speaker, SpeakerWithReviewInfo, Flags } from './types'

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
