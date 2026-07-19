import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BackLink } from '@/components/BackButton'
import { ConversationThread } from '@/components/messaging'
import { getAuthSession } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Conversation',
  robots: { index: false, follow: false },
}

interface AdminConversationPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminConversationPage({
  params,
}: AdminConversationPageProps) {
  const { id } = await params

  // The admin layout already denies non-organizers, but redirect any speaker
  // who reaches this route to their own labelled surface rather than the bare
  // "Access Denied" wall (audience-correct deep link, admin mirror of /cfp).
  const session = await getAuthSession()
  if (session?.speaker && !session.speaker.isOrganizer) {
    redirect(`/cfp/messages/${id}`)
  }

  return (
    // dvh-bounded column so the composer stays pinned above the iOS PWA
    // keyboard: the message list flexes and scrolls, the composer does not.
    <div className="mx-auto flex h-[100dvh] max-w-3xl flex-col p-4">
      <div className="mb-4 shrink-0">
        <BackLink fallbackUrl="/admin/messages">Back to Messages</BackLink>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ConversationThread
          conversationId={id}
          audience="organizer"
          fillHeight
        />
      </div>
    </div>
  )
}
