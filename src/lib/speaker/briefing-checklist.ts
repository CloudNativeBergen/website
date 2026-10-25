import type { Conference } from '@/lib/conference/types'
import { getSpeakerBriefing } from './briefing'

/** What the saved speaker info still lacks, for the admin page (#1592). */
export function getSpeakerInfoGaps(
  speakerInfo: Conference['speakerInfo'],
): string[] {
  const { dinner, onsiteContact } = getSpeakerBriefing({ speakerInfo })
  const gaps: string[] = []
  if (dinner && !dinner.startsAt) gaps.push('The dinner has no start time.')
  if (dinner && !dinner.venueName) gaps.push('The dinner has no venue.')
  for (const [i, r] of (dinner?.routes ?? []).entries()) {
    const name = r.label ?? `Route ${i + 1}`
    if (!r.departsAt && !r.departsNote) {
      gaps.push(`${name} has no departure time or note.`)
    }
    if (!r.meetingPoint) gaps.push(`${name} has no meeting point.`)
  }
  if (!onsiteContact) gaps.push('There is no on-site contact.')
  return gaps
}
