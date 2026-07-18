import type { Metadata } from 'next'
import { BackLink } from '@/components/BackButton'
import { ConversationThread } from '@/components/messaging'

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

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4">
        <BackLink fallbackUrl="/admin/messages">Back to Messages</BackLink>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ConversationThread conversationId={id} audience="organizer" />
      </div>
    </div>
  )
}
