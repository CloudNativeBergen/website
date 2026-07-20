import type { Metadata } from 'next'
import { NotificationInbox } from '@/components/notifications/NotificationInbox'

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
}

/**
 * Standalone notification history at the TOP-LEVEL path `/notifications`.
 *
 * Route choice: this lives in the `(cfp)` route group but OUTSIDE its `cfp/`
 * segment, so it resolves to `/notifications` (not `/cfp/notifications`) while
 * inheriting the group layout's auth guard — any signed-in speaker is admitted
 * and a signed-out visitor is redirected to sign-in. It is deliberately NOT
 * admin-gated: the bell (and its notifications) are cross-cutting, and
 * organizers are speakers too, so both audiences reach the same page. The
 * audience-aware Messages/settings links inside adapt per user.
 */
export default function NotificationsPage() {
  return <NotificationInbox />
}
