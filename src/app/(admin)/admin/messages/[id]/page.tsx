import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { MessagesWorkspace } from '@/components/messaging'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'

export const metadata: Metadata = {
  title: 'Conversation',
  robots: { index: false, follow: false },
}

interface AdminConversationPageProps {
  params: Promise<{ id: string }>
}

/**
 * `/admin/messages/<conversationId>` — LOAD-BEARING URL, do not retarget.
 *
 * This exact path is the link string already PERSISTED on `notification`
 * documents (`conversationEmailLinkPath`, and `conversationLinkPath` for
 * general/sponsor threads) and matched by `link in $links` in seven query
 * sites across `messaging/sanity.ts`, `notification/sanity.ts`,
 * `proposal/data/sanity.ts`, `messaging/retention.ts` and
 * `ConversationThread.tsx`. Changing it would orphan every historical row:
 * permanent phantom unread counts and notifications that can never be deleted.
 *
 * What changed is only what it RENDERS. It used to be a standalone thread page
 * behind a "Back to Messages" link; it is now the same three-pane workspace the
 * index route renders, with this conversation selected — so a notification link
 * lands the organizer IN the inbox, on the right conversation, with the
 * proposal context beside it, rather than on a page of its own.
 */
export default async function AdminConversationPage({
  params,
}: AdminConversationPageProps) {
  const { id } = await params

  // The admin layout already denies non-organizers, but redirect any speaker
  // who reaches this route to their own labelled surface rather than the bare
  // "Access Denied" wall (audience-correct deep link, admin mirror of /cfp).
  const session = await getAuthSession()
  if (session?.speaker && !(await isOrganizerForCurrentOrg(session.speaker))) {
    redirect(`/cfp/messages/${id}`)
  }

  return (
    <Suspense>
      <MessagesWorkspace conversationId={id} />
    </Suspense>
  )
}
