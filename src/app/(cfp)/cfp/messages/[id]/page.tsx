import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BackLink } from '@/components/BackButton'
import { ConversationThread } from '@/components/messaging'
import { getAuthSession } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Conversation',
  robots: { index: false, follow: false },
}

interface CfpConversationPageProps {
  params: Promise<{ id: string }>
}

export default async function CfpConversationPage({
  params,
}: CfpConversationPageProps) {
  const { id } = await params

  // Audience-correct deep link: an organizer following a handed /cfp link would
  // otherwise land on a speaker-labelled surface. Send them to the admin thread.
  const session = await getAuthSession()
  if (session?.speaker?.isOrganizer && !session.isImpersonating) {
    redirect(`/admin/messages/${id}`)
  }

  return (
    // Content-sized column: the card hugs its content and the LIST caps its own
    // height (max-h in ConversationThread's standalone mode), so long threads
    // scroll internally WITHOUT the page claiming a full viewport inside the
    // dashboard shell — an h-[100dvh] wrapper here stacked on the shell's chrome
    // and produced ~200px of dead scroll below the card.
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 shrink-0">
        <BackLink fallbackUrl="/cfp/messages">Back to Messages</BackLink>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ConversationThread conversationId={id} audience="speaker" fillHeight />
      </div>
    </div>
  )
}
