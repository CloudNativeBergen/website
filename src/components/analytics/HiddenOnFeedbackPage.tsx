'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { isFeedbackPath } from '@/lib/feedback'
import { isScreenModePath } from '@/lib/photo-wall/screen'

/**
 * Whether the attendee page or Screen Mode has rendered in this browser
 * document; never reset. Written only by an effect, so only ever in the
 * browser: one server process renders every visitor.
 */
const untrackedPage = { seen: false }

/**
 * Renders its children everywhere except on the attendee feedback page
 * (speaker feedback spec §7.1) and the Photo Wall's Screen Mode,
 * `/wall/screen` (Photo Wall spec §9.2). The root layout wraps the Pirsch
 * script and the install prompt in it: the layout is a Server Component and
 * cannot see the path, and both pages promise no tracking and no prompts.
 *
 * Once either has rendered, it stays shut for the rest of the document. A
 * Pirsch script mounted on a later page reports history navigations
 * (pushState, Back) with the full URL: for `/f` that is the Feedback Code
 * (a push-notification tap does `router.push`, then Back), for Screen Mode a
 * visit that is not one. Enter and leave both with full page loads all the
 * same; a venue screen never leaves.
 */
export function HiddenOnFeedbackPage({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const untracked = isFeedbackPath(pathname) || isScreenModePath(pathname)
  useEffect(() => {
    if (untracked) untrackedPage.seen = true
  }, [untracked])
  return untracked || untrackedPage.seen ? null : children
}
