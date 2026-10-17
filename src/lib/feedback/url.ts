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
 * Whether speakers are shown their Feedback Code yet. F1b (#1429) added the
 * attendee page, but its answer buttons stay disabled until the Submit action
 * lands, so the section stays hidden: a printed QR must not lead to a form
 * that cannot be answered. F1c (#1430) sets this to `true` with the buttons.
 */
export const ATTENDEE_PAGE_LIVE: boolean = false

// Case-insensitive: codes are, so an attendee typing `/F/K7M2QX` must be
// kept out of analytics on the not-found page it lands on.
const FEEDBACK_PATH = /^\/f(\/|$)/i

/** Is this the attendee page, `/f` or anything under it? */
export function isFeedbackPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && FEEDBACK_PATH.test(pathname)
}

/**
 * Vercel Analytics' and Speed Insights' `beforeSend` (spec §7.1): the path of
 * the attendee page IS the Feedback Code, so it is replaced, and the query
 * and fragment go with it. Every other URL passes through untouched.
 */
export function redactFeedbackCode<T extends { url: string }>(event: T): T {
  let url: URL
  try {
    url = new URL(event.url)
  } catch {
    return isFeedbackPath(event.url) ? { ...event, url: '/f/[code]' } : event
  }
  if (!isFeedbackPath(url.pathname)) return event
  return { ...event, url: `${url.origin}/f/[code]` }
}
