'use client'

import { useSession } from 'next-auth/react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

/**
 * Public-site header wrapper around {@link NotificationBell}.
 *
 * The installed PWA boots to the public landing page, so a signed-in
 * speaker/organizer must be able to see their unread badge there. This gate
 * ensures the bell — and, crucially, its polling `unreadCount` tRPC query —
 * only mounts when there is a session with a speaker. Signed-out visitors
 * render nothing: no layout shift, and no unauthenticated (401-spamming)
 * requests, because the query lives inside `NotificationBell` which never
 * mounts until the gate passes.
 *
 * The public header already sits inside the root layout's `SessionProvider`
 * and `TRPCProvider` (see `src/app/layout.tsx`), so no extra provider wiring
 * is needed here.
 */
export function PublicHeaderBell() {
  const { data: session } = useSession()

  if (!session?.speaker) {
    return null
  }

  return <NotificationBell />
}
