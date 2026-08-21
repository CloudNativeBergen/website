'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { proposalConversationId } from '@/lib/messaging/links'

export interface ProposalMessagesRedirectProps {
  proposalId: string
}

/**
 * Honours the LEGACY `#messages` fragment on the organizer proposal page.
 *
 * `conversationLinkPath()` deep-links organizer proposal threads to
 * `/admin/proposals/<id>#messages`, and that exact string is already stored on
 * notification documents in Sanity (matched by `link in $links` for unread
 * counts, deletion and retention) — so the contract must not change. Organizers
 * now READ proposal threads in the messages workspace, so landing here with the
 * fragment forwards to `/admin/messages/<conversationId>`.
 *
 * Renders nothing: a fragment is never sent to the server, so the hop has to
 * happen in the browser, but it has no UI of its own.
 *
 * Two properties this component must keep, both of which were bugs in the
 * `?messageId=` opener it replaces:
 *
 * - `replace`, not `push`. A pushed hop leaves `/admin/proposals/<id>#messages`
 *   in history, so Back from the workspace lands here and redirects straight
 *   forward again — the organizer cannot get out.
 * - Fires AT MOST ONCE per mount (`redirected`). The previous effect had
 *   `searchParams` in its deps and no guard, so every re-render re-applied it.
 */
export function ProposalMessagesRedirect({
  proposalId,
}: ProposalMessagesRedirectProps) {
  const router = useRouter()
  const redirected = useRef(false)

  useEffect(() => {
    if (redirected.current) return
    if (window.location.hash !== '#messages') return
    redirected.current = true
    router.replace(`/admin/messages/${proposalConversationId(proposalId)}`)
  }, [proposalId, router])

  return null
}
