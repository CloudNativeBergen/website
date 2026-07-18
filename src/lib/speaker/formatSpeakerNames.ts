import { Speaker } from './types'
import type { ProposalExisting } from '@/lib/proposal/types'

/**
 * Speaker names for a proposal, or `null` when none are populated. Filters
 * `proposal.speakers` down to fully-populated speaker objects (a reference that
 * wasn't expanded has no `name`) before formatting. Shared by the schedule
 * editor's desktop card and mobile rail so the populated-speaker filtering lives
 * in one place.
 */
export function populatedSpeakerNames(
  proposal: ProposalExisting,
): string | null {
  const populated = Array.isArray(proposal.speakers)
    ? (proposal.speakers.filter(
        (s) =>
          s &&
          typeof s === 'object' &&
          'name' in s &&
          typeof s.name === 'string',
      ) as Speaker[])
    : []
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
