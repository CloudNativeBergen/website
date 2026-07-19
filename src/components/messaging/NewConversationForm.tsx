'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { errorCode } from '@/lib/messaging/trpc'
import { SpeakerCombobox, type SpeakerOption } from './SpeakerCombobox'

const MAX_SUBJECT = 200
const MAX_BODY = 5000

export interface NewConversationFormProps {
  /**
   * The audience inbox base path new threads route to on creation
   * (e.g. `/cfp/messages`). The created conversation id is appended.
   */
  basePath: string
  /**
   * When true (organizer flow), a speaker picker is shown and a recipient is
   * required — the created thread's subject speaker. Speakers omit this: their
   * general threads are implicitly about themselves.
   */
  requireRecipient?: boolean
  /**
   * Organizer flow with a KNOWN target (e.g. a speaker-scoped admin surface):
   * the picker is hidden and this speaker is sent as `recipientSpeakerId`.
   * Takes precedence over `requireRecipient`.
   */
  fixedRecipient?: SpeakerOption
  /**
   * Post the first message into the PROPOSAL's thread instead of starting a
   * general thread (`message.send { proposalId, body }`). The thread's subject
   * is the proposal title, so the subject field and picker are hidden.
   */
  proposalId?: string
  /**
   * Navigate to the created thread on success (default). Callers embedding the
   * form in their own success flow (modal + toast) pass `false`.
   */
  navigateOnCreate?: boolean
  /** Optional callback after a thread is created (before navigation). */
  onCreated?: (conversationId: string) => void
  /** Optional cancel handler (e.g. to collapse the form). */
  onCancel?: () => void
}

/**
 * Starts a conversation: a subject plus a first message. Organizers either
 * pick the recipient speaker the thread is about (`requireRecipient`) or have
 * one preset (`fixedRecipient`); with a `proposalId` the message goes to the
 * proposal's own thread instead. On success it navigates to the new thread
 * unless `navigateOnCreate` is false.
 */
export function NewConversationForm({
  basePath,
  requireRecipient = false,
  fixedRecipient,
  proposalId,
  navigateOnCreate = true,
  onCreated,
  onCancel,
}: NewConversationFormProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const [recipient, setRecipient] = useState<SpeakerOption | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const isProposalThread = Boolean(proposalId)
  const showPicker = requireRecipient && !fixedRecipient && !isProposalThread

  const sendMutation = api.message.send.useMutation({
    onSuccess: ({ conversationId }) => {
      utils.message.listConversations.invalidate()
      if (isProposalThread) {
        // A proposal mount usually renders the thread on the same page —
        // refresh it so the new message appears without a manual reload.
        utils.message.getConversation.invalidate({ id: conversationId })
        utils.message.listMessages.invalidate({ conversationId })
      }
      onCreated?.(conversationId)
      if (navigateOnCreate) {
        router.push(`${basePath}/${conversationId}`)
      }
    },
  })

  // The recipient is only ever unresolvable when the organizer picked one; the
  // server returns NOT_FOUND, which we surface inline against the picker.
  const recipientNotFound =
    showPicker && errorCode(sendMutation.error) === 'NOT_FOUND'

  // A stale NOT_FOUND must not stick to a NEW selection: picking a different
  // speaker resets the mutation so the inline error clears.
  const handleRecipientChange = (speaker: SpeakerOption | null) => {
    if (sendMutation.isError) sendMutation.reset()
    setRecipient(speaker)
  }

  const canSubmit =
    body.trim().length > 0 &&
    (isProposalThread || subject.trim().length > 0) &&
    (!showPicker || recipient !== null) &&
    !sendMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (isProposalThread) {
      sendMutation.mutate({ proposalId, body: body.trim() })
      return
    }
    const recipientId = fixedRecipient?._id ?? recipient?._id
    sendMutation.mutate({
      subject: subject.trim(),
      body: body.trim(),
      ...(fixedRecipient || requireRecipient
        ? { recipientSpeakerId: recipientId }
        : {}),
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      {showPicker && (
        <div>
          <label
            htmlFor="new-conversation-recipient"
            className="block text-sm font-medium text-gray-900 dark:text-white"
          >
            Speaker
          </label>
          <SpeakerCombobox
            id="new-conversation-recipient"
            value={recipient}
            onChange={handleRecipientChange}
            invalid={recipientNotFound}
          />
          {recipientNotFound && (
            <p
              role="alert"
              className="mt-1 text-xs text-red-600 dark:text-red-400"
            >
              Speaker not found. Pick another speaker.
            </p>
          )}
        </div>
      )}

      {fixedRecipient && !isProposalThread && (
        <div>
          <span className="block text-sm font-medium text-gray-900 dark:text-white">
            To
          </span>
          <p className="mt-1 inline-flex rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300">
            {fixedRecipient.name}
          </p>
        </div>
      )}

      {!isProposalThread && (
        <div>
          <label
            htmlFor="new-conversation-subject"
            className="block text-sm font-medium text-gray-900 dark:text-white"
          >
            Subject
          </label>
          <input
            id="new-conversation-subject"
            type="text"
            value={subject}
            maxLength={MAX_SUBJECT}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's this about?"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      )}

      <div>
        <label
          htmlFor="new-conversation-body"
          className="block text-sm font-medium text-gray-900 dark:text-white"
        >
          Message
        </label>
        <textarea
          id="new-conversation-body"
          value={body}
          maxLength={MAX_BODY}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your first message…"
          className="mt-1 block w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
        />
      </div>

      {sendMutation.isError && !recipientNotFound && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t{' '}
          {isProposalThread ? 'send the message' : 'start the conversation'}.
          Please try again.
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {isProposalThread
            ? sendMutation.isPending
              ? 'Sending…'
              : 'Send message'
            : sendMutation.isPending
              ? 'Starting…'
              : 'Start conversation'}
        </button>
      </div>
    </form>
  )
}
