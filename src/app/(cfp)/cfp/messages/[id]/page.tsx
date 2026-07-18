import type { Metadata } from 'next'
import { BackLink } from '@/components/BackButton'
import { ConversationThread } from '@/components/messaging'

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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <BackLink fallbackUrl="/cfp/messages">Back to Messages</BackLink>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ConversationThread conversationId={id} audience="speaker" />
      </div>
    </div>
  )
}
