'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { NewConversationForm } from '@/components/messaging'
import { ModalShell } from '@/components/ModalShell'
import { useNotificationSafe } from './NotificationProvider'

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
  const notifications = useNotificationSafe()
  const [sent, setSent] = useState(false)
  const [messageDirty, setMessageDirty] = useState(false)

  const threadHref = `/admin/proposals/${proposalId}#messages`

  const handleCreated = () => {
    setSent(true)
    setMessageDirty(false)
    notifications?.showNotification({
      type: 'success',
      title: 'Message sent',
      message: 'Posted in the proposal conversation.',
    })
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      size="lg"
      title="Send message"
      subtitle={`Proposal thread: ${proposalTitle}`}
      icon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
      confirmOnDirtyClose
      isDirty={messageDirty && !sent}
    >
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
            The speaker(s) will find it in this proposal&apos;s conversation.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue sm:w-auto dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Close
            </button>
            <Link
              href={threadHref}
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue sm:w-auto"
            >
              View conversation
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Your message is posted in the private thread with the speaker(s) on
            this proposal — they are notified in the app (and by email, per
            their preferences).
          </p>
          <NewConversationForm
            basePath="/admin/messages"
            proposalId={proposalId}
            autoFocusFirstField
            onCreated={handleCreated}
            onCancel={onClose}
            onDirtyChange={setMessageDirty}
          />
        </>
      )}
    </ModalShell>
  )
}
