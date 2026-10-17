'use client'

import { usePathname } from 'next/navigation'
import { isFeedbackPath } from '@/lib/feedback'

/**
 * Renders its children everywhere except on the attendee feedback page
 * (speaker feedback spec §7.1). The root layout wraps the Pirsch script and
 * the install prompt in it: the layout is a Server Component and cannot see
 * the path, and the page promises no tracking and no prompts.
 */
export function HiddenOnFeedbackPage({
  children,
}: {
  children: React.ReactNode
}) {
  return isFeedbackPath(usePathname()) ? null : children
}
