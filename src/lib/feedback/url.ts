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

/**
 * Whether `/f/<code>` serves the attendee page yet. F1a hands out the code
 * and its QR; the page arrives with F1b (#1429), which sets this to `true`.
 * Until then the speaker section stays hidden, so no printed QR leads to a 404.
 */
export const ATTENDEE_PAGE_LIVE: boolean = false
