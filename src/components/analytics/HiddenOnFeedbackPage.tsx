'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { isFeedbackPath } from '@/lib/feedback'
import { isScreenModePath } from '@/lib/photo-wall/screen'

/**
 * Whether the attendee page has rendered in this browser document; never
 * reset. Written only by an effect, so only ever in the browser: one server
 * process renders every visitor.
 */
const feedbackPage = { seen: false }

/**
 * Renders its children everywhere except on the attendee feedback page
 * (speaker feedback spec §7.1) and the Photo Wall's Screen Mode,
 * `/wall/screen` (Photo Wall spec §9.2). The root layout wraps the Pirsch
 * script and the install prompt in it: the layout is a Server Component and
 * cannot see the path, and both pages promise no tracking and no prompts.
 *
 * Once `/f` has rendered, it stays shut for the rest of the document. A
 * Pirsch script mounted on a later page reports history navigations
 * (pushState, Back) with the full URL, so a client-side exit from `/f` (a
 * push-notification tap does `router.push`) followed by Back would send the
 * code. Enter and leave `/f` with full page loads all the same. Screen Mode
 * is hidden only while it shows: its URL carries nothing to leak, and a
 * venue screen never leaves it.
 */
export function HiddenOnFeedbackPage({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const onFeedbackPage = isFeedbackPath(pathname)
  useEffect(() => {
    if (onFeedbackPage) feedbackPage.seen = true
  }, [onFeedbackPage])
  return onFeedbackPage || isScreenModePath(pathname) || feedbackPage.seen
    ? null
    : children
}
