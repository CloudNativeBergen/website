'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  CheckIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'

export interface SponsorEarlyAccessSectionProps {
  sponsorForConferenceId: string
  /** Whether the sponsor's record stores an early-access link. */
  hasLink: boolean
  /**
   * Why no link can be created for this sponsor right now (its deal is not
   * won, say). Unset: one can. A link that exists stays usable either way.
   */
  createRefusal?: string
  /** The link was created or revoked: the host refreshes the sponsor. */
  onChanged?: () => void
}

const quietButton =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10'

/**
 * Put the text `pending` resolves to on the clipboard. `false` when it could
 * not be done; it never throws.
 *
 * WRITTEN INSIDE THE CLICK where the browser can: a `ClipboardItem` takes the
 * pending text, so the write is made now and filled in when the text arrives.
 * Safari refuses a write that comes after an awaited request. Otherwise, and
 * when that write is refused, a plain write once the text is there.
 */
async function writeToClipboard(pending: Promise<string>): Promise<boolean> {
  const clipboard = navigator.clipboard
  try {
    if (typeof ClipboardItem !== 'undefined' && clipboard?.write) {
      try {
        await clipboard.write([
          new ClipboardItem({
            'text/plain': pending.then(
              (text) => new Blob([text], { type: 'text/plain' }),
            ),
          }),
        ])
        return true
      } catch {
        // Refused, or this browser's ClipboardItem takes no pending text.
      }
    }
    await clipboard.writeText(await pending)
    return true
  } catch {
    return false
  }
}

/**
 * The sponsor's workshop early-access link (#1346, spec §8): create, copy and
 * revoke. THE ADDRESS IS ASKED FOR, on create and on copy, never while the
 * record is only being viewed: finding the portal's working host is a live
 * read on the server.
 */
export function SponsorEarlyAccessSection({
  sponsorForConferenceId,
  hasLink,
  createRefusal,
  onChanged,
}: SponsorEarlyAccessSectionProps) {
  const utils = api.useUtils()
  // What this section did since the record was read. The host's next refresh
  // of the record is the truth again, whoever changed the link.
  const [changedTo, setChangedTo] = useState<boolean | null>(null)
  const [seenHasLink, setSeenHasLink] = useState(hasLink)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [notCleared, setNotCleared] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (hasLink !== seenHasLink) {
    setSeenHasLink(hasLink)
    // Confirmed by the record, or changed by a colleague. An address shown
    // from before a link went away is no longer this link's.
    if (changedTo !== hasLink) setUrl(null)
    setChangedTo(null)
  }
  const linked = changedTo ?? hasLink

  const create = api.sponsor.crm.earlyAccess.create.useMutation({
    onSuccess: (data) => {
      setUrl(data.url)
      setChangedTo(true)
      setNotCleared(0)
      setError(null)
      onChanged?.()
    },
    onError: (failure) => setError(failure.message),
  })
  const revoke = api.sponsor.crm.earlyAccess.revoke.useMutation({
    onSuccess: (data) => {
      setUrl(null)
      setChangedTo(false)
      setConfirming(false)
      setCopied(false)
      setCopyFailed(false)
      setNotCleared(data.notCleared.length)
      setError(null)
      onChanged?.()
    },
    onError: (failure) => setError(failure.message),
  })

  const copy = async () => {
    setError(null)
    setCopyFailed(false)
    setFetching(true)
    // ASKED FOR ON EVERY COPY, never reused: a colleague may have revoked the
    // link and created a new one since the last answer.
    const address = utils.sponsor.crm.earlyAccess.address
      .fetch({ sponsorForConferenceId }, { staleTime: 0 })
      .then((answer) => answer.url)
    const written = writeToClipboard(address)
    try {
      setUrl(await address)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not get the link',
      )
      return
    } finally {
      setFetching(false)
    }
    if (await written) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setCopyFailed(true)
    }
  }

  const busy = create.isPending || revoke.isPending || fetching

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/5">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        Workshop early access
      </h4>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        A link the sponsor can pass on to its people. Whoever opens it can sign
        up for workshops from the sponsor start time, before sign-up opens for
        everyone. They still need a ticket that includes workshops.
      </p>

      {!linked ? (
        !createRefusal ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => create.mutate({ sponsorForConferenceId })}
              disabled={busy}
              className={quietButton}
            >
              <LinkIcon className="size-4" />
              {create.isPending ? 'Creating…' : 'Create link'}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {createRefusal}
          </p>
        )
      ) : (
        <div className="mt-3 space-y-3">
          {url ? (
            <input
              type="text"
              value={url}
              readOnly
              aria-label="Early-access link"
              onFocus={(event) => event.currentTarget.select()}
              className="block w-full rounded-md bg-white px-2 py-1.5 text-xs text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10"
            />
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
              <CheckIcon className="size-4" />
              This sponsor has an early-access link
            </p>
          )}

          {confirming ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-900/20">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                Revoke this link?
              </p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                New early sign-ups through this link stop at once. Sign-ups
                already made stay.
              </p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                A link created later gets a new address. This one never works
                again.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => revoke.mutate({ sponsorForConferenceId })}
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
                >
                  {revoke.isPending ? 'Revoking…' : 'Revoke link'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className={quietButton}
                >
                  Keep link
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copy}
                disabled={busy}
                className={quietButton}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-green-500" />
                ) : (
                  <ClipboardDocumentIcon className="size-4" />
                )}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy}
                className={quietButton}
              >
                <NoSymbolIcon className="size-4" />
                Revoke
              </button>
            </div>
          )}
        </div>
      )}

      {linked && copyFailed && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          Could not copy the link. Select it above and copy it by hand.
        </p>
      )}
      {!linked && notCleared > 0 && (
        <p
          role="alert"
          className="mt-2 text-xs text-amber-700 dark:text-amber-400"
        >
          The link is revoked, but {notCleared} unpublished{' '}
          {notCleared === 1 ? 'copy' : 'copies'} of this sponsor in Sanity
          Studio still {notCleared === 1 ? 'holds' : 'hold'} it. Publishing{' '}
          {notCleared === 1 ? 'it' : 'one of them'} would make the link work
          again: discard {notCleared === 1 ? 'it' : 'them'} in Studio.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
