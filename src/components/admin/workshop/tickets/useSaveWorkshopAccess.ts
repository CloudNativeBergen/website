'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

interface Notice {
  title: string
  message: string
}

/**
 * The one way this section saves: `tickets.admin.setWorkshopAccess`, then a
 * refresh of the page so every row shows what the save left stored, and a
 * notification either way. The control and the orphaned-entry removal both
 * save through it.
 */
export function useSaveWorkshopAccess({
  failed,
  onError,
}: {
  /** The notification when the save is refused or fails. */
  failed: Notice
  /** Undo whatever was shown ahead of the save. */
  onError?: () => void
}) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [refreshing, startRefresh] = useTransition()
  /** What to say once the save in flight has landed. */
  const saved = useRef<Notice | null>(null)

  const mutation = api.tickets.admin.setWorkshopAccess.useMutation({
    onSuccess: () => {
      startRefresh(() => router.refresh())
      if (saved.current) {
        showNotification({ type: 'success', ...saved.current })
      }
    },
    onError: (error) => {
      onError?.()
      showNotification({
        type: 'error',
        title: failed.title,
        message: error.message || failed.message,
      })
    },
  })
  /** A save is on its way, or the page has not re-rendered with it yet. */
  const busy = mutation.isPending || refreshing

  return {
    busy,
    /** The write itself is still outstanding. */
    pending: mutation.isPending,
    save(
      input: Parameters<typeof mutation.mutate>[0],
      /** Said on success. Decided at the click, from what the page showed. */
      success: Notice,
    ) {
      if (busy) return
      saved.current = success
      mutation.mutate(input)
    },
  }
}
