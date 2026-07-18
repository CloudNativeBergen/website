'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'

const MAX_SUBJECT = 200
const MAX_BODY = 5000

export interface NewConversationFormProps {
  /**
   * The audience inbox base path new threads route to on creation
   * (e.g. `/cfp/messages`). The created conversation id is appended.
   */
  basePath: string
  /** Optional callback after a thread is created (before navigation). */
  onCreated?: (conversationId: string) => void
  /** Optional cancel handler (e.g. to collapse the form). */
  onCancel?: () => void
}

/**
 * Starts a general (non-proposal) conversation: a subject plus a first message.
 * On success it navigates to the newly created thread.
 */
export function NewConversationForm({
  basePath,
  onCreated,
  onCancel,
}: NewConversationFormProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const sendMutation = api.message.send.useMutation({
    onSuccess: ({ conversationId }) => {
      utils.message.listConversations.invalidate()
      onCreated?.(conversationId)
      router.push(`${basePath}/${conversationId}`)
    },
  })

  const canSubmit =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sendMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    sendMutation.mutate({ subject: subject.trim(), body: body.trim() })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
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

      {sendMutation.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t start the conversation. Please try again.
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
          {sendMutation.isPending ? 'Starting…' : 'Start conversation'}
        </button>
      </div>
    </form>
  )
}
