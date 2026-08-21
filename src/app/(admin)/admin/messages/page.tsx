import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MessagesWorkspace } from '@/components/messaging'

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
}

/**
 * `/admin/messages` — the three-pane reading surface with nothing selected.
 *
 * The sibling `[id]` route renders the SAME workspace with a conversation
 * selected, so opening a conversation never changes which page an organizer is
 * on — only the URL and which pane is filled.
 */
export default function AdminMessagesPage() {
  return (
    // MessagesWorkspace reads `?view=` / `?pane=` via useSearchParams — needs a
    // Suspense boundary so this page can still statically render its shell.
    <Suspense>
      <MessagesWorkspace />
    </Suspense>
  )
}
