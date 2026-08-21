'use client'

import { Fragment } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import Link from 'next/link'
import {
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useTheme } from 'next-themes'
import { ConversationThread } from './ConversationThread'
import { proposalConversationId } from '@/lib/messaging/links'

export interface ProposalMessagePanelProps {
  /** The proposal whose thread this panel reads. */
  proposalId: string
  /** Open state — owned by the caller as LOCAL React state (see below). */
  open: boolean
  /** Backdrop click, Escape and the ✕ all route here. */
  onClose: () => void
}

/**
 * Read and reply to ONE proposal's thread without leaving the proposal page.
 *
 * Four properties are deliberate, and each replaces a failure of the
 * layout-wide slide-over this supersedes:
 *
 * - PAGE-LOCAL. Rendered by `AdminActionBar` on the proposal detail page only,
 *   never by a layout — no other admin route can produce it.
 * - STATE-DRIVEN. `open` is plain React state. It is NOT derived from the URL:
 *   a query param that an effect wrote and the close handler removed re-ran the
 *   effect that wrote it, and the panel could not be closed at all. Nothing here
 *   reads or writes `searchParams`, and this component imports no router.
 * - THREAD ONLY. No proposal title card, no preview rail, no second copy of the
 *   page behind it — the organizer is already looking at the proposal. For the
 *   FULL surface (inbox + thread + proposal context) the header links out to
 *   `/admin/messages/<conversationId>`, which stays the canonical deep-link
 *   target for ⌘M and for every stored notification link.
 * - A REAL backdrop. Dimmed and visible, so it is obvious the page behind is
 *   covered, and ✕ / Escape / backdrop-click all close.
 *
 * FIRST CONTACT: a proposal conversation is a document created by the first
 * send, so most opens here find nothing. `ConversationThread` is mounted with
 * `proposalId` (not `conversationId`) precisely because that mode treats the
 * server's NOT_FOUND as an empty, startable thread and posts the first message
 * with `{ proposalId }` to materialise it. Passing the derived conversation id
 * instead would render an honest "doesn't exist" dead end.
 */
export function ProposalMessagePanel({
  proposalId,
  open,
  onClose,
}: ProposalMessagePanelProps) {
  // HeadlessUI portals the dialog to `document.body`, outside any wrapper that
  // carries the `dark` class in Storybook/embedded contexts — so the panel
  // re-declares the theme on its own root, as `ModalShell` does.
  const { theme } = useTheme()
  const workspaceHref = `/admin/messages/${proposalConversationId(proposalId)}`

  return (
    <Transition show={open} as={Fragment}>
      <Dialog
        as="div"
        className={`relative z-50 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={onClose}
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/50" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full">
            <TransitionChild
              as={Fragment}
              enter="transform transition ease-in-out duration-300 sm:duration-500"
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in-out duration-300 sm:duration-500"
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              {/* `w-screen max-w-md` with NO peek gutter on the parent: a
                  gutter that the panel width does not subtract pushed the panel
                  past the viewport on a phone and clipped the composer's Send
                  button off-screen. */}
              <DialogPanel className="pointer-events-auto flex h-full w-screen max-w-md flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <DialogTitle className="font-space-grotesk text-base font-semibold text-gray-900 dark:text-white">
                    Messages
                  </DialogTitle>
                  <div className="flex items-center gap-1">
                    <Link
                      href={workspaceHref}
                      prefetch={false}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-cloud-blue transition hover:bg-brand-cloud-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-blue-300 dark:hover:bg-blue-400/10"
                    >
                      Open in Messages
                      <ArrowTopRightOnSquareIcon
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    </Link>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close messages"
                      className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* A fixed-height flex column, which is what `fillParent`
                    requires: the message list takes the remainder and the
                    composer pins to the bottom of the panel. */}
                <div className="flex min-h-0 flex-1 flex-col px-4 pb-2">
                  <ConversationThread
                    proposalId={proposalId}
                    audience="organizer"
                    fillHeight
                    fillParent
                  />
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
