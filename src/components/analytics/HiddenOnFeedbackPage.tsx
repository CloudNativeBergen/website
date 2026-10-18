'use client'

import { usePathname } from 'next/navigation'
import { isFeedbackPath } from '@/lib/feedback'

/**
 * Set once the attendee page has rendered in this browser document; never
 * reset. Module state is per document in the browser, but one server process
 * renders every visitor, so it is only ever set in the browser.
 */
let feedbackPageSeen = false

/**
 * Renders its children everywhere except on the attendee feedback page
 * (speaker feedback spec §7.1). The root layout wraps the Pirsch script and
 * the install prompt in it: the layout is a Server Component and cannot see
 * the path, and the page promises no tracking and no prompts.
 *
 * Once `/f` has rendered, it stays shut for the rest of the document. A
 * Pirsch script mounted on a later page reports history navigations
 * (pushState, Back) with the full URL, so a client-side exit from `/f` (a
 * push-notification tap does `router.push`) followed by Back would send the
 * code. Enter and leave `/f` with full page loads all the same.
 */
export function HiddenOnFeedbackPage({
  children,
}: {
  children: React.ReactNode
}) {
  const onFeedbackPage = isFeedbackPath(usePathname())
  if (onFeedbackPage && typeof window !== 'undefined') feedbackPageSeen = true
  return onFeedbackPage || feedbackPageSeen ? null : children
}
