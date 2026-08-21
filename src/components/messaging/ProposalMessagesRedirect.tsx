'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
 * Three properties this component must keep. The first was the original bug;
 * the other two are what a naive fix gets wrong.
 *
 * - `replace`, not `push`. A pushed hop leaves `/admin/proposals/<id>#messages`
 *   in history, so Back from the workspace lands here and redirects straight
 *   forward again — the organizer cannot get out.
 * - It must fire on a SAME-ROUTE hash navigation, not only on mount. An
 *   organizer already viewing `/admin/proposals/<id>` who clicks that proposal's
 *   row in the notification bell (or a warm push routed by
 *   `NotificationClickSync`) gets a soft navigation that only adds `#messages`:
 *   no remount, and `useRouter()` hands back App Router's module singleton, so
 *   an effect keyed on `[proposalId, router]` alone would never re-run and the
 *   click would do nothing at all. `searchParams` is memoised per canonical URL
 *   — which includes the fragment — so listing it re-runs the effect; the
 *   `hashchange` listener covers a hash typed straight into the address bar,
 *   which App Router does not see.
 * - It must not fire repeatedly for the SAME arrival. `handled` latches while
 *   the fragment is still `#messages` (covering StrictMode's double effect and
 *   any re-render before the navigation commits) and resets as soon as it is
 *   not, so a later arrival is still honoured.
 */
export function ProposalMessagesRedirect({
  proposalId,
}: ProposalMessagesRedirectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handled = useRef(false)

  useEffect(() => {
    const maybeRedirect = () => {
      if (window.location.hash !== '#messages') {
        handled.current = false
        return
      }
      if (handled.current) return
      handled.current = true
      router.replace(`/admin/messages/${proposalConversationId(proposalId)}`)
    }

    maybeRedirect()
    window.addEventListener('hashchange', maybeRedirect)
    return () => window.removeEventListener('hashchange', maybeRedirect)
    // `searchParams` is in the deps for its IDENTITY, not its value: it changes
    // on every App Router URL change, including a fragment-only one. Dropping
    // it silently breaks the same-route case described above.
  }, [proposalId, router, searchParams])

  return null
}
