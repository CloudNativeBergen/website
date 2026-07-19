import type { Metadata } from 'next'
import { MessagesInbox } from '@/components/messaging'

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
}

export default function AdminMessagesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Messages
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Conversations with speakers across the conference.
        </p>
      </div>

      <MessagesInbox audience="organizer" allowNew />
    </div>
  )
}
