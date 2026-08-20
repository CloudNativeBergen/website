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
import Link from 'next/link'

/**
 * A layout-wide slide-over for reading ONE conversation without leaving the
 * current admin page. Mounted once by `AdminLayout` and driven entirely by the
 * `?messageId=<conversationId>` query param, so ANY concrete admin route can
 * open it just by adding that param (see `AdminActionBar`, `ProposalMessagesLink`).
 *
 * It is ADDITIVE: the canonical deep links from `conversationLinkPath()` — and
 * the link strings already persisted on notification documents — still point at
 * the full pages (`/admin/proposals/<id>#messages`, `/admin/messages/<id>`).
 */
export function MessageSlideOver() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const messageId = searchParams.get('messageId')
  const isOpen = !!messageId

  const closeSlideOver = () => {
    // Remove the messageId from the URL without losing other query params
    const params = new URLSearchParams(searchParams.toString())
    params.delete('messageId')
    const newQuery = params.toString()
    router.push(newQuery ? `${pathname}?${newQuery}` : pathname)
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
        <div className="fixed inset-0" />

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
                <DialogPanel className="pointer-events-auto w-screen max-w-4xl">
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

                      {/* Right: Proposal Preview (if applicable) */}
                      {isProposalMsg && proposalId && (
                        <div className="w-80 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                          <div className="mb-4">
                            <Link
                              href={`/admin/proposals/${proposalId}`}
                              className="text-sm font-medium text-brand-cloud-blue hover:underline dark:text-blue-400"
                            >
                              Go to Proposal Admin &rarr;
                            </Link>
                          </div>
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
    return <div className="text-sm text-gray-500">Loading proposal...</div>
  if (error || !data)
    return <div className="text-sm text-red-500">Failed to load proposal.</div>

  // No `onClose`: the slide-over owns dismissal, so the preview must not render
  // a second close button that does nothing.
  return (
    <div className="space-y-4">
      <ProposalPreview proposal={data} />
    </div>
  )
}
