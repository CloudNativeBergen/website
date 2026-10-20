/**
 * The summary's own words (speaker feedback spec §11.1), shared by the bell
 * notification and the email so the two never drift. Client-safe: the email
 * template renders it.
 */
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'

const TITLE_START = 'Your Session Feedback for “'
const TITLE_END = '”'

/**
 * "Your Session Feedback for “<title>”", the bell's title and the email's
 * subject. With `max`, the talk's title is cut (with an ellipsis) so the
 * whole fits.
 */
export function summaryTitle(title: string, max = Infinity): string {
  const room = max - TITLE_START.length - TITLE_END.length
  const name =
    title.length > room
      ? `${truncateToGraphemeBoundary(title, room - 1)}…`
      : title
  return `${TITLE_START}${name}${TITLE_END}`
}
