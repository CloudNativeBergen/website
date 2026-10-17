import { conferenceBaseUrl } from '@/lib/conference/baseUrl'

/**
 * The attendee URL of a Feedback Code (speaker feedback spec §5):
 * `<conferenceBaseUrl(talk.conference)>/f/<code>`. Always the TALK's own
 * conference, never the host's.
 */
export function feedbackCodeUrl(
  conference: Parameters<typeof conferenceBaseUrl>[0],
  code: string,
): string {
  return `${conferenceBaseUrl(conference)}/f/${code}`
}
