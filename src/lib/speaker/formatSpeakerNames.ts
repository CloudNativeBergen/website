import { Speaker } from './types'

/**
 * Formats speaker names for display
 * - Single speaker: Shows full name (e.g., "John Doe")
 * - Multiple speakers: Shows first names with proper grammar
 *   - 2 speakers: "John and Jane"
 *   - 3 speakers: "John, Jane, and Mike"
 *   - 4+ speakers: "John, Jane, and Mike, Sarah..."
 */
export function formatSpeakerNames(speakers: Speaker[]): string {
  if (speakers.length === 0) return ''

  if (speakers.length === 1) {
    // Show full name for single speaker
    return speakers[0].name
  } else {
    // Use first names only for multiple speakers
    const names = speakers.map((speaker) => speaker.name.split(' ')[0])

    if (names.length === 2) {
      return `${names[0]} and ${names[1]}`
    } else if (names.length === 3) {
      return `${names[0]}, ${names[1]}, and ${names[2]}`
    } else {
      // For more than 3, show first 2 and remaining names
      const remaining = names.slice(2)
      return `${names[0]}, ${names[1]}, and ${remaining.join(', ')}...`
    }
  }
}

/**
 * Formats speaker names from unknown input (e.g., API response)
 * Filters and validates speakers before formatting
 */
export function formatSpeakerNamesFromUnknown(speakers: unknown): string {
  if (!Array.isArray(speakers)) return ''

  const populatedSpeakers = speakers.filter(
    (speaker): speaker is Speaker =>
      speaker &&
      typeof speaker === 'object' &&
      '_id' in speaker &&
      'name' in speaker &&
      typeof speaker.name === 'string',
  )

  return formatSpeakerNames(populatedSpeakers)
}
