import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MessagesInbox } from '@/components/messaging'

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
}

export default function CfpMessagesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Messages
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Your conversations with the organizers.
        </p>
      </div>

      {/* MessagesInbox reads `?view=` via useSearchParams — needs a Suspense
          boundary so this page can still statically render its shell. */}
      <Suspense>
        <MessagesInbox audience="speaker" allowNew />
      </Suspense>
    </div>
  )
}
