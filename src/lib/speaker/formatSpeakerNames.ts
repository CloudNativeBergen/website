import { Speaker } from './types'

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
