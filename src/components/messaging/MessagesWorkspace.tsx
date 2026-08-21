'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { api } from '@/lib/trpc/client'
import { messagesPaneHref, messagesPaneStep } from '@/lib/messaging/panes'
import type { ConversationListItem } from '@/lib/messaging/types'
import { ConversationThread } from './ConversationThread'
import { MessagesInbox } from './MessagesInbox'
import { ProposalContextPane } from './ProposalContextPane'

/** The organizer messages surface. The `[id]` route renders the same component. */
const BASE_PATH = '/admin/messages'

/**
 * The proposal a `conversation.proposal.<proposalId>` id belongs to, or
 * `undefined` for any other id shape.
 *
 * The inverse of `proposalConversationId()` in `src/lib/messaging/links.ts`.
 * It lives here rather than beside its inverse because that module is the
 * persisted LINK CONTRACT and is deliberately held byte-stable.
 */
function proposalIdFromConversationId(id: string | undefined) {
  const prefix = 'conversation.proposal.'
  if (!id?.startsWith(prefix)) return undefined
  return id.slice(prefix.length) || undefined
}

export interface MessagesWorkspaceProps {
  /**
   * The conversation from `/admin/messages/<id>`. Undefined on the index route,
   * where the workspace shows the list plus an empty reading pane.
   */
  conversationId?: string
}

/**
 * The organizer messages surface as a three-pane email client:
 * **conversation list | thread | proposal context**.
 *
 * ## The URL contract (do not change)
 *
 * Panes are derived from the URL, never from component state:
 *
 * - `/admin/messages` — list (+ an empty reading pane on wide screens)
 * - `/admin/messages/<conversationId>` — that conversation, selected
 * - `/admin/messages/<conversationId>?pane=proposal` — the proposal step
 *
 * `/admin/messages/<conversationId>` is the link string ALREADY PERSISTED on
 * `notification` documents and matched by `link in $links` in seven query sites
 * (`messaging/sanity.ts`, `notification/sanity.ts`, `proposal/data/sanity.ts`,
 * `messaging/retention.ts`, `ConversationThread.tsx`). Retargeting or deleting
 * that route would orphan every historical row — permanent phantom unread and
 * undeletable notifications. It therefore still exists and still renders this
 * conversation; only the LAYOUT around it changed. `?pane=` is additive: a
 * stored link that omits it lands on the thread, exactly as before.
 *
 * ## Rows stay on this page
 *
 * `conversationLinkPath()` — the deep-link contract in `@/lib/messaging/links`
 * — sends an organizer's PROPOSAL thread to `/admin/proposals/<id>#messages`,
 * and it is deliberately unchanged (it is what notification writes use). But on
 * THIS surface the proposal is a pane, so the rows get a local `hrefFor` that
 * keeps every conversation type inside `/admin/messages/<id>`. An organizer
 * reading a proposal-attached thread is never navigated away from the inbox.
 *
 * ## Responsive
 *
 * At `lg` and up the three panes sit side by side. Below `lg` exactly one pane
 * is on screen — the step the URL names — with a back link out of it. The
 * switch is pure CSS keyed on the URL-derived step, so there is no media-query
 * hook, no hydration mismatch and no first-paint flash of the wrong layout.
 *
 * The rails are `lg`-only and sized in rem, so at 393px nothing competes with
 * the thread for width (#878: a fixed 320px rail squeezed a thread to ~100px,
 * and a `w-screen` panel ignored the admin shell's gutter).
 *
 * ## Admin chrome
 *
 * The page wears the house chrome from `docs/ADMIN_SYSTEM.md` — `AdminPageHeader`
 * for the title (icon + title + description, actions on the right, collapsing to
 * the standard kebab below `lg`), not a bespoke `<h1>`, and the primary CTA in
 * that action slot rather than jammed into the view-tab row.
 *
 * The pane frame is a card only where a card means something. At `lg` it is the
 * house content card (`rounded-lg border shadow-sm`) whose job is to hold three
 * panes together. Below `lg` there is exactly ONE pane, so the frame goes
 * full-bleed — border and radius off, negative margins cancelling the shell's
 * `px-2 sm:px-4` gutter and its `py-3` floor. A viewport-tall rounded rectangle
 * holding one conversation row read as an empty floating panel; the same surface
 * running to the screen edges reads as a list view, which is what it is. This is
 * the same move `TableContainer` makes with `md:rounded-lg` and the schedule
 * editor makes with its negative margins.
 */
export function MessagesWorkspace({ conversationId }: MessagesWorkspaceProps) {
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const step = messagesPaneStep(conversationId, searchParams.get('pane'))

  // The composer lives in the inbox but is TRIGGERED from the page header, so
  // its open flag is hoisted here. See `MessagesInbox.showNew`.
  const [showNew, setShowNew] = useState(false)

  // Decides whether a PROPOSAL pane applies, and whether the thread can be
  // STARTED. Shares the cache entry the thread already fills.
  const { data: conversationData } = api.message.getConversation.useQuery(
    { id: conversationId ?? '' },
    { enabled: !!conversationId, retry: false, staleTime: 10_000 },
  )
  const conversation = conversationData?.conversation
  const proposalId =
    conversation?.conversationType === 'proposal'
      ? conversation.proposalId
      : conversation
        ? // A loaded thread of any other type has no proposal.
          undefined
        : // Not loaded — or NOT_FOUND, which is the FIRST-CONTACT case: a
          // proposal thread is a document that does not exist until someone
          // sends into it. Without this the organizer arriving from the
          // proposal page's Message action would be told the conversation
          // "doesn't exist or you don't have access", with the composer hidden,
          // and could never open a thread at all. The id is deterministic, so
          // the proposal is recoverable from it; `ConversationThread` then
          // renders a startable empty thread and the first send materialises
          // the conversation. The SERVER re-authorises that send (`message.send`
          // requires the proposal to be in this conference and the actor to be
          // an organizer of it or a speaker on it), so this widens the UI, not
          // access.
          proposalIdFromConversationId(conversationId)

  const href = (pane: 'list' | 'thread' | 'proposal') =>
    messagesPaneHref({ basePath: BASE_PATH, conversationId, pane, search })

  // Keep the whole surface inside /admin/messages — including proposal threads,
  // which `conversationLinkPath` would otherwise send to the proposal editor.
  const rowHref = (item: ConversationListItem) =>
    messagesPaneHref({
      basePath: BASE_PATH,
      conversationId: item._id,
      pane: 'thread',
      search,
    })

  return (
    /**
     * `data-shell-fit="viewport"` is the contract with `DashboardLayout` (see
     * the `shell-fit:` variant in tailwind.css): the shell stops being a
     * scrolling document and hands this element exactly the height left in the
     * viewport. Each pane then scrolls inside itself — one scrollbar per pane,
     * never one for the page, which is what makes this read as a mail client
     * rather than a long document.
     */
    <div
      data-shell-fit="viewport"
      data-pane={step}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="shrink-0">
        <AdminPageHeader
          icon={<ChatBubbleLeftRightIcon aria-hidden="true" />}
          title="Messages"
          description="Conversations with speakers and sponsors."
          actionItems={[
            {
              label: 'New conversation',
              icon: <PlusIcon aria-hidden="true" />,
              onClick: () => setShowNew(true),
              // Disabled rather than `hidden` while the composer is open:
              // hiding the only item leaves AdminHeaderActions rendering an
              // empty kebab below `lg`.
              disabled: showNew,
            },
          ]}
        />
      </div>

      {/* NO BACKGROUND FILL. The frame inherits the admin page background
          (`bg-white dark:bg-gray-950`, set once on `<body>` in `app/layout.tsx`)
          so the workspace is the same surface as the header above it and as
          every sibling admin page. A fill of its own — the `dark:bg-gray-800`
          this used to carry — put a lighter slab under the panes while the
          header sat on the page, and the seam between them read as an app
          embedded in the app. Separation at `lg` comes from the border and the
          per-pane dividers instead: a border separates without claiming to be a
          different surface. The rest of the house card treatment
          (`rounded-lg border shadow-sm` at `lg`) is unchanged — only the fill
          was the seam. */}
      <div className="-mx-2 -mb-3 flex min-h-0 flex-1 overflow-hidden sm:-mx-4 lg:mx-0 lg:mb-0 lg:rounded-lg lg:border lg:border-gray-200 lg:shadow-sm dark:lg:border-gray-700">
        {/* PANE 1 — conversation list. A rail at lg+, the whole screen on the
            list step, hidden while drilled into a thread on a narrow screen.
            `lg:flex-none` is load-bearing: without it the base `flex-1` (which
            the narrow list step needs) would zero the rail's flex-basis at lg
            and the w-72/xl:w-80 width would never apply. */}
        <div
          data-pane-name="list"
          className={`min-w-0 flex-col border-gray-200 lg:flex lg:w-72 lg:flex-none lg:border-r xl:w-80 dark:border-gray-700 ${
            step === 'list' ? 'flex flex-1' : 'hidden'
          }`}
        >
          <MessagesInbox
            audience="organizer"
            allowNew
            variant="rail"
            hrefFor={rowHref}
            selectedId={conversationId}
            showNew={showNew}
            onShowNewChange={setShowNew}
          />
        </div>

        {/* PANE 2 — the thread. */}
        <div
          data-pane-name="thread"
          className={`min-w-0 flex-1 flex-col lg:flex ${
            step === 'thread' ? 'flex' : 'hidden'
          }`}
        >
          {conversationId ? (
            <>
              {/* Narrow-screen chrome: out to the list, and (when the thread is
                  proposal-attached) into the proposal step. Both are `lg:hidden`
                  — at lg+ the other panes are already on screen. */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-2 py-1 lg:hidden dark:border-gray-700">
                <Link
                  href={href('list')}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                  Messages
                </Link>
                {proposalId && (
                  <Link
                    href={href('proposal')}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-cloud-blue transition hover:bg-brand-cloud-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-blue-300 dark:hover:bg-blue-400/10"
                  >
                    <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
                    Proposal
                  </Link>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col p-3">
                <ConversationThread
                  conversationId={conversationId}
                  // Lets a proposal thread that has never been messaged render
                  // as a startable empty thread instead of "doesn't exist";
                  // the first send materialises the conversation. Ignored once
                  // the conversation exists (`conversationId` wins).
                  proposalId={proposalId}
                  audience="organizer"
                  fillHeight
                  // The pane is a fixed-height flex column, so the thread fills
                  // it: only the message list scrolls and the composer stays
                  // pinned at the bottom — mail-client behaviour.
                  fillParent
                />
              </div>
            </>
          ) : (
            /* Wide-screen resting state: the list is beside this, so the reading
               pane invites a choice rather than sitting blank. Never reachable
               on a narrow screen — with no conversation the step IS `list`. */
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center lg:flex">
              <ChatBubbleLeftRightIcon
                aria-hidden="true"
                className="h-10 w-10 text-gray-400 dark:text-gray-500"
              />
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Select a conversation
              </p>
              <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">
                Proposal threads open here too — with the proposal beside them.
              </p>
            </div>
          )}
        </div>

        {/* PANE 3 — read-only proposal context. Rendered ONLY for a
            proposal-attached conversation; a general or sponsor thread has no
            third pane and the thread takes that width instead.

            Same no-fill rule as the frame: the pane is set apart by its
            `lg:border-l`, not by a tint. Its old `bg-gray-50` /
            `dark:bg-gray-900/40` made a THIRD shade on the surface — page,
            workspace, context rail — which is most of what made the workspace
            read as its own application. */}
        {conversationId && proposalId && (
          <div
            data-pane-name="proposal"
            className={`min-w-0 flex-col border-gray-200 lg:flex lg:w-72 lg:flex-none lg:border-l xl:w-80 dark:border-gray-700 ${
              step === 'proposal' ? 'flex flex-1' : 'hidden'
            }`}
          >
            <ProposalContextPane
              proposalId={proposalId}
              backHref={href('thread')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
