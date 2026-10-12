'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * The server's two ways of saying the page was stale: the stored answers are
 * not the ones the save was based on, or the document moved under the write.
 * And one more: a save that would lose the last grant without the
 * confirmation, which only a stale page sends.
 */
const STALE_PAGE = new Set(['CONFLICT', 'PRECONDITION_FAILED'])

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
  basedOn,
  failed,
  onError,
}: {
  /**
   * The version of the answers the page is showing
   * (`WorkshopTicketList.version`), sent with every save so the server can
   * refuse one made from a page that is no longer what is stored. Absent on
   * `/admin/tickets/types`, whose cards are built from the cached conference:
   * a version from there could be refused for as long as the cache lives.
   */
  basedOn?: string
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
      // THE PAGE IS NOT WHAT IS STORED ANY MORE (another tab, another
      // organizer, Studio). The server refused and wrote nothing; the page
      // reloads itself, so the next click is asked on the current answers.
      if (STALE_PAGE.has(error.data?.code ?? '')) {
        startRefresh(() => router.refresh())
        showNotification({
          type: 'error',
          title: 'This list changed since you opened it',
          message:
            'Nothing was saved. The list has been reloaded: check it and try again.',
        })
        return
      }
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
      mutation.mutate({ ...input, ...(basedOn !== undefined && { basedOn }) })
    },
  }
}
