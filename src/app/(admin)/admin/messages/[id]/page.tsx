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
    // Content-sized column: the card hugs its content and the LIST caps its own
    // height (max-h in ConversationThread's standalone mode), so long threads
    // scroll internally WITHOUT the page claiming a full viewport inside the
    // dashboard shell — an h-[100dvh] wrapper here stacked on the shell's chrome
    // and produced ~200px of dead scroll below the card.
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 shrink-0">
        <BackLink fallbackUrl="/admin/messages">Back to Messages</BackLink>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ConversationThread
          conversationId={id}
          audience="organizer"
          fillHeight
        />
      </div>
    </div>
  )
}
