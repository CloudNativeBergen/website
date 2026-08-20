'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { proposalConversationId } from '@/lib/messaging/links'

export interface ProposalMessagesLinkProps {
  proposalId: string
}

/**
 * Opens the proposal's conversation in the layout-wide `MessageSlideOver`
 * (mounted by `AdminLayout`, driven by `?messageId=`) instead of rendering the
 * thread inline, so an organizer reads messages without losing the proposal.
 *
 * It also honours the LEGACY `#messages` fragment. `conversationLinkPath()`
 * deep-links organizer proposal threads to `/admin/proposals/<id>#messages`,
 * and that exact string is already stored on notification documents in Sanity
 * (matched by `link in $links` for unread counts, deletion and retention) — so
 * the contract must not change. Landing here with that fragment upgrades the
 * URL to `?messageId=…` in place, which pops the slide-over.
 */
export function ProposalMessagesLink({
  proposalId,
}: ProposalMessagesLinkProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const conversationId = proposalConversationId(proposalId)
  const hasMessageId = searchParams.get('messageId') === conversationId

  useEffect(() => {
    if (hasMessageId) return
    if (window.location.hash !== '#messages') return
    const params = new URLSearchParams(searchParams.toString())
    params.set('messageId', conversationId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [hasMessageId, conversationId, pathname, searchParams, router])

  const params = new URLSearchParams(searchParams.toString())
  params.set('messageId', conversationId)

  return (
    <div
      id="messages"
      className="mt-6 flex scroll-mt-24 justify-center border-t border-gray-200 pt-6 dark:border-gray-700"
    >
      <Link
        href={`${pathname}?${params.toString()}`}
        scroll={false}
        className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-700 dark:hover:bg-gray-700"
      >
        <ChatBubbleLeftRightIcon className="size-5" aria-hidden="true" />
        View messages
      </Link>
    </div>
  )
}
