'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { isFeedbackPath } from '@/lib/feedback'

/**
 * Whether the attendee page has rendered in this browser document; never
 * reset. Written only by an effect, so only ever in the browser: one server
 * process renders every visitor.
 */
const feedbackPage = { seen: false }

/**
 * Renders its children everywhere except on the attendee feedback page
 * (speaker feedback spec §7.1). The root layout wraps the install prompt in
 * it: the layout is a Server Component and cannot see the path, and the page
 * promises no prompts.
 *
 * Once `/f` has rendered, it stays shut for the rest of the document, including
 * after a client-side exit (a push-notification tap does `router.push`). Enter
 * and leave `/f` with full page loads so any future history-tracking script
 * cannot see the code when navigating Back.
 */
export function HiddenOnFeedbackPage({
  children,
}: {
  children: React.ReactNode
}) {
  const onFeedbackPage = isFeedbackPath(usePathname())
  useEffect(() => {
    if (onFeedbackPage) feedbackPage.seen = true
  }, [onFeedbackPage])
  return onFeedbackPage || feedbackPage.seen ? null : children
}
