'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
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
  /**
   * Why the link's address is not offered (workshops were turned off, so the
   * link opens nothing). Unset: it can be copied. Revoke stays either way.
   */
  copyRefusal?: string
  /**
   * When the sponsor's record last changed (`_updatedAt`). A new value means
   * the record was read again after a change: it is then the truth about the
   * link, over anything this section did before.
   */
  recordUpdatedAt?: string
  /** The link was created or revoked: the host refreshes the sponsor. */
  onChanged?: () => void
}

const quietButton =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10'

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
  copyRefusal,
  recordUpdatedAt,
  onChanged,
}: SponsorEarlyAccessSectionProps) {
  const utils = api.useUtils()
  const clipboard = useCopyToClipboard()
  // WHAT THIS SECTION DID since the record was read, until the record is read
  // again. `record` is the record as it stood then: whether it has a link,
  // and when it last changed. A create or a revoke changes the sponsor, so
  // the refetch that follows brings a record with a new change time. From
  // then on the record is the truth, whoever changed the link last, also when
  // it says what it said before: a colleague may have undone this section's
  // change in between. What this section did is kept only where the record
  // agrees with it.
  const [done, setDone] = useState<{
    record: { hasLink: boolean; updatedAt: string | undefined }
    /** The link this section created (`true`) or revoked (`false`). */
    linked: boolean | null
    /** The address the server last answered. */
    url: string | null
    /**
     * Unpublished copies this section's last create or revoke could not
     * bring in step: after a create they lack the link, after a revoke they
     * still hold it.
     */
    outOfStep: number
  }>({
    record: { hasLink, updatedAt: recordUpdatedAt },
    linked: null,
    url: null,
    outOfStep: 0,
  })
  const [confirming, setConfirming] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (
    done.record.hasLink !== hasLink ||
    done.record.updatedAt !== recordUpdatedAt
  ) {
    const agrees = done.linked === hasLink
    setDone({
      record: { hasLink, updatedAt: recordUpdatedAt },
      linked: null,
      url: agrees ? done.url : null,
      outOfStep: agrees ? done.outOfStep : 0,
    })
  }
  const linked = done.linked ?? hasLink
  const { url, outOfStep } = done

  const create = api.sponsor.crm.earlyAccess.create.useMutation({
    onSuccess: (data) => {
      setDone((was) => ({
        ...was,
        linked: true,
        url: data.url,
        outOfStep: data.notWritten.length,
      }))
      setError(null)
      onChanged?.()
    },
    onError: (failure) => setError(failure.message),
  })
  const revoke = api.sponsor.crm.earlyAccess.revoke.useMutation({
    onSuccess: (data) => {
      setDone((was) => ({
        ...was,
        linked: false,
        url: null,
        outOfStep: data.notCleared.length,
      }))
      setConfirming(false)
      clipboard.reset()
      setError(null)
      onChanged?.()
    },
    onError: (failure) => setError(failure.message),
  })

  const copy = async () => {
    setError(null)
    setFetching(true)
    // ASKED FOR ON EVERY COPY, never reused: a colleague may have revoked the
    // link and created a new one since the last answer.
    const address = utils.sponsor.crm.earlyAccess.getAddress
      .fetch({ sponsorForConferenceId }, { staleTime: 0 })
      .then((answer) => answer.url)
    // Handed over PENDING, so the write is made inside this click.
    const copying = clipboard.copyToClipboard(address)
    try {
      const answered = await address
      setDone((was) => ({ ...was, url: answered }))
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not get the link',
      )
    } finally {
      setFetching(false)
    }
    await copying
  }
  const { copied } = clipboard
  // Not while an address is being asked for, and not when none arrived: that
  // is the error above, not a failed copy.
  const copyFailed = clipboard.failed && !fetching && !error

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
              {copyRefusal ? (
                <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                  {copyRefusal}
                </p>
              ) : (
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
              )}
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
      {outOfStep > 0 && (
        <div
          role="alert"
          className="mt-2 text-xs text-amber-700 dark:text-amber-400"
        >
          {linked ? (
            <>
              <p>
                The link works, but {outOfStep} unpublished{' '}
                {outOfStep === 1 ? 'copy' : 'copies'} of this sponsor in Sanity
                Studio did not get it. Publishing{' '}
                {outOfStep === 1 ? 'it' : 'one of them'} would remove the link.
                Try again, or discard {outOfStep === 1 ? 'it' : 'them'} in
                Studio.
              </p>
              {/* Create writes the STORED link to every copy: the address
                  that was handed out stays the same. */}
              <button
                type="button"
                onClick={() => create.mutate({ sponsorForConferenceId })}
                disabled={busy}
                className={`${quietButton} mt-2`}
              >
                {create.isPending ? 'Trying\u2026' : 'Try again'}
              </button>
            </>
          ) : (
            <p>
              The link is revoked, but {outOfStep} unpublished{' '}
              {outOfStep === 1 ? 'copy' : 'copies'} of this sponsor in Sanity
              Studio still {outOfStep === 1 ? 'holds' : 'hold'} it. Publishing{' '}
              {outOfStep === 1 ? 'it' : 'one of them'} would make the link work
              again: discard {outOfStep === 1 ? 'it' : 'them'} in Studio.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
