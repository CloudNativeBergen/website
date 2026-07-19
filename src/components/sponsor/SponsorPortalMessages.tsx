'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'

/** The maximum message body length (mirrors SponsorMessagesSendSchema). */
const MAX_BODY = 5000

/**
 * The sponsor-side message thread on the portal (messaging G2b). Token-authed
 * (no session): reads/sends via the public `sponsorMessages` router, which
 * derives the thread from the token — no conversation id ever leaves the client.
 *
 * Renders a read-only thread + a composer with an author-name picker sourced
 * from the sponsor's contact persons (the server STRICTLY validates the chosen
 * name). Plain, mobile-first styling consistent with the rest of the portal; no
 * ModalShell (an inline section). Polls lightly (20s) while the tab is visible
 * and the composer is idle. Anchored `#messages` by the parent.
 */
export function SponsorPortalMessages({ token }: { token: string }) {
  const [isComposing, setIsComposing] = useState(false)
  const listQuery = api.sponsorMessages.list.useQuery(
    { token },
    {
      // Poll only while visible AND not typing, so a refetch never yanks the
      // composer out from under the sender.
      refetchInterval: () =>
        !isComposing &&
        (typeof document === 'undefined' ||
          document.visibilityState === 'visible')
          ? 20_000
          : false,
      staleTime: 10_000,
    },
  )

  const contactNames = useMemo(
    () => listQuery.data?.contactNames ?? [],
    [listQuery.data?.contactNames],
  )
  const [authorName, setAuthorName] = useState('')
  const [draft, setDraft] = useState('')

  // Default the author to the first contact once names load.
  useEffect(() => {
    if (!authorName && contactNames.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthorName(contactNames[0])
    }
  }, [contactNames, authorName])

  const utils = api.useUtils()
  const sendMutation = api.sponsorMessages.send.useMutation({
    onSuccess: () => {
      setDraft('')
      utils.sponsorMessages.list.invalidate({ token })
    },
  })

  // Oldest-first for display (the server returns newest-first).
  const messages = useMemo(
    () => [...(listQuery.data?.messages ?? [])].reverse(),
    [listQuery.data?.messages],
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const canSend =
    draft.trim().length > 0 && authorName.length > 0 && !sendMutation.isPending

  const submit = () => {
    if (!canSend) return
    sendMutation.mutate({ token, body: draft.trim(), authorName })
  }

  return (
    <div>
      {sendMutation.isError && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {sendMutation.error?.message ??
            'Could not send your message. Please try again.'}
        </div>
      )}

      <div
        ref={scrollRef}
        className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60"
      >
        {listQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading messages&hellip;
          </p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No messages yet. Send a message to the organizers below.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m._id}
              className={
                m.fromSponsor ? 'flex justify-end' : 'flex justify-start'
              }
            >
              <div className="max-w-[85%]">
                <p
                  className={`text-xs font-semibold text-gray-600 dark:text-gray-300 ${
                    m.fromSponsor ? 'text-right' : 'text-left'
                  }`}
                >
                  {m.fromSponsor ? m.authorName || 'You' : 'Organizers'}
                </p>
                <div
                  className={`mt-1 rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.fromSponsor
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-900 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600'
                  }`}
                >
                  {m.body}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 space-y-2">
        {contactNames.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              Sending as
            </label>
            <select
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {contactNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label htmlFor="sponsor-message-composer" className="sr-only">
          Write a message
        </label>
        <textarea
          id="sponsor-message-composer"
          value={draft}
          maxLength={MAX_BODY}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setIsComposing(true)}
          onBlur={() => setIsComposing(false)}
          placeholder="Write a message to the organizers…"
          className="block w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {draft.length}/{MAX_BODY}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
          >
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
