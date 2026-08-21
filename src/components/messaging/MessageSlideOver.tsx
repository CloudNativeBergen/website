'use client'

import { Fragment } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ConversationThread } from './ConversationThread'
import { api } from '@/lib/trpc/client'
import { ProposalPreview } from '@/components/admin/ProposalPreview'

/**
 * The messages surface itself — the three-pane reading workspace served by
 * `/admin/messages` and `/admin/messages/<id>`. The slide-over is suppressed
 * there (see below).
 */
const MESSAGES_SURFACE = '/admin/messages'

/**
 * Is `pathname` the messages workspace? Exported for the test that pins the
 * suppression; matches the surface and its `[id]` children, but not an
 * unrelated sibling route that merely starts with the same characters.
 */
export function isMessagesSurface(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname === MESSAGES_SURFACE || pathname.startsWith(`${MESSAGES_SURFACE}/`)
  )
}

/**
 * A layout-wide slide-over for reading ONE conversation without leaving the
 * current admin page. Mounted once by `AdminLayout` and driven entirely by the
 * `?messageId=<conversationId>` query param, so ANY concrete admin route can
 * open it just by adding that param.
 *
 * It is ADDITIVE: the canonical deep links from `conversationLinkPath()` — and
 * the link strings already persisted on notification documents — still point at
 * the full pages (`/admin/proposals/<id>#messages`, `/admin/messages/<id>`).
 *
 * NOT ON THE MESSAGES SURFACE. `/admin/messages` is itself a conversation
 * reader (`MessagesWorkspace`), so a `?messageId=` there would stack a second
 * copy of the same thread — with its own composer and its own auto-mark-read —
 * on top of the one already open in the middle pane. The slide-over stays shut
 * on that route; the workspace reads its selection from the PATH instead.
 *
 * NOT ON THE PROPOSAL PAGE EITHER, for the same reason by a different route:
 * `/admin/proposals/<id>` is the proposal, and the slide-over's companion rail
 * re-rendered that proposal on top of itself. `AdminActionBar` now navigates to
 * `/admin/messages/<conversationId>` instead of setting `?messageId=`. Nothing
 * in the app opens this component today; it is kept for admin pages that have
 * no messaging surface of their own (a proposals LIST row, a sponsor table)
 * where popping a thread in place is the right move.
 */
export function MessageSlideOver() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const messageId = searchParams.get('messageId')
  const isOpen = !!messageId && !isMessagesSurface(pathname)

  const closeSlideOver = () => {
    // Remove the messageId from the URL without losing other query params.
    //
    // `replace`, not `push`: the open URL and the closed URL differ only by
    // this param, so pushing the closed one left the OPEN url as the previous
    // history entry — Back reopened the panel the organizer had just
    // dismissed, and there was no way back to the page they came from.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('messageId')
    const newQuery = params.toString()
    router.replace(newQuery ? `${pathname}?${newQuery}` : pathname, {
      scroll: false,
    })
  }

  // The thread itself is rendered by ConversationThread; this extra read is only
  // to decide whether the proposal side-panel applies.
  const { data: conversation } = api.message.getConversation.useQuery(
    { id: messageId || '' },
    { enabled: isOpen },
  )

  const isProposalMsg =
    conversation?.conversation?.conversationType === 'proposal'
  const proposalId = conversation?.conversation?.proposalId

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeSlideOver}>
        {/* A VISIBLE backdrop. This used to be a bare `fixed inset-0`: an
            invisible full-viewport layer that swallowed every click on the page
            behind it, dismissed on click with nothing to say it would, and gave
            no signal that the page was covered at all. */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60"
            aria-hidden="true"
          />
        </TransitionChild>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
              <TransitionChild
                as={Fragment}
                enter="transform transition ease-in-out duration-300 sm:duration-500"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300 sm:duration-500"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                {/* The width must subtract the parent's peek gutter (pl-10 / sm:pl-16).
                    A plain `w-screen` does NOT shrink to fit it, so on a phone the
                    panel ran 40px past the viewport and the clipped overflow ate the
                    thread's header buttons and the Send button. */}
                <DialogPanel className="pointer-events-auto w-[calc(100vw-2.5rem)] max-w-4xl sm:w-[calc(100vw-4rem)]">
                  <div className="flex h-full flex-col overflow-y-scroll bg-gray-50 shadow-xl dark:bg-gray-900">
                    <div className="flex items-center justify-between bg-white px-4 py-4 shadow-xs sm:px-6 dark:bg-gray-800">
                      <DialogTitle className="text-base leading-6 font-semibold text-gray-900 dark:text-white">
                        Messages
                      </DialogTitle>
                      <div className="ml-3 flex h-7 items-center">
                        <button
                          type="button"
                          className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:bg-gray-800 dark:hover:text-gray-300"
                          onClick={closeSlideOver}
                        >
                          <span className="absolute -inset-2.5" />
                          <span className="sr-only">Close panel</span>
                          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="relative flex flex-1">
                      {/* Left: Message Thread */}
                      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-800">
                        {messageId && (
                          <div className="flex-1 overflow-hidden p-4">
                            <ConversationThread
                              conversationId={messageId}
                              audience="organizer"
                              fillHeight
                            />
                          </div>
                        )}
                      </div>

                      {/* Right: the proposal rail — a companion, not a column the
                          thread can afford to lose width to. Below lg the panel is
                          only as wide as the viewport, so the rail hides and the
                          thread takes the full width. */}
                      {isProposalMsg && proposalId && (
                        <div className="hidden w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 lg:block dark:border-gray-700 dark:bg-gray-900">
                          <ProposalPreviewWrapper proposalId={proposalId} />
                        </div>
                      )}
                    </div>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

function ProposalPreviewWrapper({ proposalId }: { proposalId: string }) {
  const { data, isLoading, error } = api.proposal.admin.getById.useQuery({
    id: proposalId,
  })
  if (isLoading)
    return (
      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
        Loading proposal…
      </p>
    )
  if (error || !data)
    return (
      <p className="p-4 text-sm text-red-600 dark:text-red-400">
        Failed to load proposal.
      </p>
    )

  // No `onClose`: the slide-over owns dismissal, so the preview must not render
  // a second close button that does nothing.
  return <ProposalPreview proposal={data} />
}
