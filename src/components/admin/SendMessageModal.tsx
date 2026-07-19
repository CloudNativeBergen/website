'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { NewConversationForm } from '@/components/messaging'
import { useNotificationSafe } from './NotificationProvider'
import { useModalA11y } from './schedule/useModalA11y'

export interface SendMessageModalProps {
  /** The proposal whose thread the message is posted to. */
  proposalId: string
  /** The proposal title — the thread's subject. */
  proposalTitle: string
  onClose: () => void
}

/**
 * "Send message" modal for the admin proposal surface (messaging M4): posts
 * into the proposal's conversation thread (all proposal speakers + organizers)
 * via {@link NewConversationForm}'s proposal mode. Replaces the old 1:1
 * "Send email" modal — one-to-many broadcasts remain email
 * (GeneralBroadcastModal). Mount only while open.
 */
export function SendMessageModal({
  proposalId,
  proposalTitle,
  onClose,
}: SendMessageModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const notifications = useNotificationSafe()
  const [sent, setSent] = useState(false)

  // Escape closes, focus is trapped and restored, body scroll locked.
  useModalA11y(dialogRef, onClose)

  const threadHref = `/admin/proposals/${proposalId}#messages`

  const handleCreated = () => {
    setSent(true)
    notifications?.showNotification({
      type: 'success',
      title: 'Message sent',
      message: 'Posted in the proposal conversation.',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-message-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-xl bg-white shadow-xl focus:outline-none dark:bg-gray-900"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="flex min-w-0 items-start gap-2.5">
            <ChatBubbleLeftRightIcon
              className="mt-0.5 h-5 w-5 shrink-0 text-brand-cloud-blue dark:text-blue-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2
                id="send-message-modal-title"
                className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white"
              >
                Send message
              </h2>
              <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                Proposal thread: {proposalTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {sent ? (
            <div className="text-center">
              <CheckCircleIcon
                className="mx-auto h-10 w-10 text-green-500"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                Message sent
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                The speaker(s) will find it in this proposal&apos;s
                conversation.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Close
                </button>
                <Link
                  href={threadHref}
                  onClick={onClose}
                  className="inline-flex items-center rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  View conversation
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                Your message is posted in the private thread with the speaker(s)
                on this proposal — they are notified in the app (and by email,
                per their preferences).
              </p>
              <NewConversationForm
                basePath="/admin/messages"
                proposalId={proposalId}
                navigateOnCreate={false}
                onCreated={handleCreated}
                onCancel={onClose}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
