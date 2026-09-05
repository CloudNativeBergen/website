'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'

/**
 * The per-type opt-in on /admin/tickets/types (#860): publishes a free ticket
 * type on the public /tickets page next to the paid grid, via
 * `conference.updatePublicFreeTickets`.
 *
 * The SERVER decides which rows get this toggle (`isPublicFreeTicketType` in
 * the page) — this island only flips one id. Optimistic: the switch flips
 * immediately and rolls back to the server's answer on error, because the
 * mutation is a single per-id array op with no payload worth waiting for.
 */
export interface PublicFreeTicketToggleProps {
  ticketId: number
  ticketName: string
  initialVisible: boolean
}

export function PublicFreeTicketToggle({
  ticketId,
  ticketName,
  initialVisible,
}: PublicFreeTicketToggleProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [visible, setVisible] = useState(initialVisible)

  const mutation = api.conference.updatePublicFreeTickets.useMutation({
    onSuccess: (_data, variables) => {
      router.refresh()
      showNotification({
        type: 'success',
        title: variables.visible
          ? 'Shown on public tickets page'
          : 'Hidden from public tickets page',
        message: `"${ticketName}" was ${variables.visible ? 'published' : 'removed'}.`,
      })
    },
    onError: (error, variables) => {
      setVisible(!variables.visible)
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to update the public tickets page.',
      })
    },
  })

  const toggle = () => {
    if (mutation.isPending) return
    const next = !visible
    setVisible(next)
    mutation.mutate({ ticketId, visible: next })
  }

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      Show on public tickets page
      <button
        type="button"
        role="switch"
        aria-checked={visible}
        aria-label={`Show "${ticketName}" on public tickets page`}
        disabled={mutation.isPending}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none disabled:opacity-50 ${
          visible ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            visible ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}
