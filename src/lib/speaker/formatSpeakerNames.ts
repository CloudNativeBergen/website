import type { Speaker } from './types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { populatedSpeakers } from './utils'

/**
 * Speaker names for a proposal, or `null` when none are populated. Shared by
 * the schedule editor's desktop card and mobile rail. The populated-speaker
 * filtering itself lives in {@link populatedSpeakers}.
 */
export function populatedSpeakerNames(
  proposal: ProposalExisting,
): string | null {
  const populated = populatedSpeakers(proposal)
  return populated.length > 0 ? formatSpeakerNames(populated) : null
}

export function formatSpeakerNames(speakers: Speaker[]): string {
  if (speakers.length === 0) return ''

  if (speakers.length === 1) {
    return speakers[0].name
  } else {
    const names = speakers.map((speaker) => speaker.name.split(' ')[0])

    if (names.length === 2) {
      return `${names[0]} and ${names[1]}`
    } else if (names.length === 3) {
      return `${names[0]}, ${names[1]}, and ${names[2]}`
    } else {
      const remaining = names.slice(2)
      return `${names[0]}, ${names[1]}, and ${remaining.join(', ')}...`
    }
  }
}
