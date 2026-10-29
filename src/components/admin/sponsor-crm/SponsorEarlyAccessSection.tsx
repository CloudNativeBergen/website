'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import {
  CheckIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
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
  /**
   * Whether the conference has a "Sponsor early access opens" time. `false`:
   * a link gives no head start yet, and the section says so. Known from the
   * conference the page already holds; the section asks for nothing.
   */
  sponsorStartSet?: boolean
  /**
   * How many early sign-ups were made through this sponsor's links, confirmed
   * and waitlisted together (#1348). Read with the sponsor's record; the
   * section asks for nothing. Unset: the record carries no count.
   */
  earlySignupCount?: number
  /**
   * The "Early sign-ups" list narrowed to this sponsor. Unset: the count is
   * said without a link (workshops were turned off, so the list is gone).
   */
  earlySignupsHref?: string
  /**
   * The link was created or revoked, or turned out not to be what the record
   * says: the host reads the sponsor again.
   */
  onChanged?: () => void
  /**
   * Send the link by email (#1347): opens the host's Send modal on the
   * "Workshop early access" kind, which asks the server whether it may be
   * sent and creates the link if there is none. Unset: no send action.
   */
  onSend?: () => void
}

const quietButton =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10 dark:focus-visible:outline-indigo-400'

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
  sponsorStartSet,
  earlySignupCount,
  earlySignupsHref,
  onChanged,
  onSend,
}: SponsorEarlyAccessSectionProps) {
  const utils = api.useUtils()
  /**
   * What just happened, for a screen reader: said politely. A live region
   * speaks only when its text CHANGES, so this is emptied when the next
   * action starts (`start`), and an action that ends with the same words is
   * heard again.
   */
  const [announcement, setAnnouncement] = useState('')
  const clipboard = useCopyToClipboard({
    onSuccess: () => setAnnouncement('Link copied'),
  })
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
     * The ids of the unpublished copies this section's last create or revoke
     * could not bring in step: after a create they lack the link, after a
     * revoke they still hold it. After a revoke they are not always this
     * sponsor's own: see `LeftAfterRevoke`.
     */
    behind: readonly string[]
  }>({
    record: { hasLink, updatedAt: recordUpdatedAt },
    linked: null,
    url: null,
    behind: [],
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
      behind: agrees ? done.behind : [],
    })
  }
  const linked = done.linked ?? hasLink
  const { url, behind } = done
  const outOfStep = behind.length

  // KEYBOARD FOCUS FOLLOWS THE ACTION. Each action replaces the control that
  // was pressed; without this, focus falls back to the page. The control that
  // takes its place gets it, or the section's heading when there is none.
  // While something is in flight the buttons are `aria-disabled`, not
  // `disabled`: a disabled button drops focus too.
  const heading = useRef<HTMLHeadingElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  const copyButton = useRef<HTMLButtonElement>(null)
  const revokeButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<
    'create' | 'copy' | 'revoke' | 'keep' | 'heading' | null
  >(null)
  // A copy found the link gone. Copy link disappears only when the host has
  // read the record again; if that leaves the keyboard nowhere, Create link
  // (or the heading) takes it. Focus the organizer has moved is left alone.
  const linkFoundGone = useRef(false)
  useEffect(() => {
    if (linkFoundGone.current && !linked) {
      linkFoundGone.current = false
      const lost =
        !document.activeElement || document.activeElement === document.body
      if (lost) (createButton.current ?? heading.current)?.focus()
    }
    const next = focusNext.current
    if (!next) return
    focusNext.current = null
    const control = {
      create: createButton,
      copy: copyButton,
      revoke: revokeButton,
      keep: keepButton,
      heading,
    }[next]
    ;(control.current ?? heading.current)?.focus()
  })
  // A create or a revoke is on its way. What the last action said is taken
  // off the page for that time, the warning about copies included, so that
  // the answer is said anew even when it is the same answer. `retry`: it was
  // started from "Try again", which decides where the keyboard goes after.
  const [acting, setActing] = useState(false)
  const startedByRetry = useRef(false)
  const start = (retry: boolean) => {
    startedByRetry.current = retry
    setActing(true)
    setAnnouncement('')
    setError(null)
  }

  const create = api.sponsor.crm.earlyAccess.create.useMutation({
    onSuccess: (data) => {
      setDone((was) => ({
        ...was,
        linked: true,
        url: data.url,
        behind: data.notWritten,
      }))
      setActing(false)
      setError(null)
      setAnnouncement('Link created')
      // After "Try again" with a copy still behind, the keyboard stays on
      // "Try again". Otherwise the pressed button is gone: Copy link.
      if (!(startedByRetry.current && data.notWritten.length > 0)) {
        focusNext.current = 'copy'
      }
      onChanged?.()
    },
    onError: (failure) => {
      setActing(false)
      setError(failure.message)
    },
  })
  const revoke = api.sponsor.crm.earlyAccess.revoke.useMutation({
    onSuccess: (data) => {
      setDone((was) => ({
        ...was,
        linked: false,
        url: null,
        behind: data.notCleared,
      }))
      setConfirming(false)
      clipboard.reset()
      setActing(false)
      setError(null)
      setAnnouncement('Link revoked')
      // After "Try again": on it while a copy is left, and on the heading
      // when none is. NOT on Create link: a second Enter there would create
      // a new link. After the confirmation, where one press was asked for
      // twice already, Create link takes the place of what was pressed.
      if (!startedByRetry.current) focusNext.current = 'create'
      else if (data.notCleared.length === 0) focusNext.current = 'heading'
      onChanged?.()
    },
    onError: (failure) => {
      setActing(false)
      setError(failure.message)
    },
  })

  const copy = async () => {
    setError(null)
    setAnnouncement('')
    setFetching(true)
    linkFoundGone.current = false
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
      // The record said there is a link and the server could not give its
      // address: a colleague may have revoked it. Read the record again.
      linkFoundGone.current = true
      onChanged?.()
    } finally {
      setFetching(false)
    }
    await copying
  }
  const { copied } = clipboard
  // Not while an address is being asked for, and not when none arrived: that
  // is the error above, not a failed copy.
  const copyFailed = clipboard.failed && !fetching && !error

  const busy = acting || create.isPending || revoke.isPending || fetching
  // A press while something is in flight does nothing: every handler below
  // starts with this check, since `aria-disabled` alone stops no click.
  const sendAction = onSend && (
    <button
      type="button"
      onClick={() => {
        if (!busy) onSend()
      }}
      aria-disabled={busy}
      className={quietButton}
    >
      <EnvelopeIcon className="size-4" />
      Send by email
    </button>
  )

  return (
    <div className="relative rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/5">
      <h4
        ref={heading}
        tabIndex={-1}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Workshop early access
      </h4>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        A link the sponsor can pass on to its people. Whoever opens it can sign
        up for workshops from the time set as &ldquo;Sponsor early access
        opens&rdquo;, before registration opens for everyone. They still need a
        ticket that includes workshops.
      </p>
      {sponsorStartSet === false && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          No &ldquo;Sponsor early access opens&rdquo; time is set for this
          conference, so a link gives no head start yet. Set one under
          Workshops.
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {!linked ? (
        !createRefusal ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              ref={createButton}
              type="button"
              onClick={() => {
                if (busy) return
                start(false)
                create.mutate({ sponsorForConferenceId })
              }}
              aria-disabled={busy}
              className={quietButton}
            >
              <LinkIcon className="size-4" />
              {create.isPending ? 'Creating…' : 'Create link'}
            </button>
            {sendAction}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
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
                  onClick={() => {
                    if (busy) return
                    start(false)
                    revoke.mutate({ sponsorForConferenceId })
                  }}
                  aria-disabled={busy}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                >
                  {revoke.isPending ? 'Revoking…' : 'Revoke link'}
                </button>
                <button
                  ref={keepButton}
                  type="button"
                  onClick={() => {
                    if (busy) return
                    setConfirming(false)
                    focusNext.current = 'revoke'
                  }}
                  aria-disabled={busy}
                  className={quietButton}
                >
                  Keep link
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {copyRefusal ? (
                <p className="w-full text-xs text-amber-700 dark:text-amber-400">
                  {copyRefusal}
                </p>
              ) : (
                <button
                  ref={copyButton}
                  type="button"
                  onClick={() => {
                    if (!busy) void copy()
                  }}
                  aria-disabled={busy}
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
              {sendAction}
              <button
                ref={revokeButton}
                type="button"
                onClick={() => {
                  if (busy) return
                  setConfirming(true)
                  focusNext.current = 'keep'
                }}
                aria-disabled={busy}
                className={quietButton}
              >
                <NoSymbolIcon className="size-4" />
                Revoke
              </button>
            </div>
          )}
        </div>
      )}

      <EarlySignupCount
        count={earlySignupCount}
        href={earlySignupsHref}
        linked={linked}
      />

      {linked && copyFailed && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          Could not copy the link. Select it above and copy it by hand.
        </p>
      )}
      {outOfStep > 0 && (
        <>
          {/* Taken off the page while a retry runs, and put back with its
              answer: said anew also when it is word for word the same. */}
          {!acting && (
            <p
              role="alert"
              className="mt-2 text-xs text-amber-700 dark:text-amber-400"
            >
              {linked ? (
                <>
                  The link works, but {outOfStep} unpublished{' '}
                  {outOfStep === 1 ? 'copy' : 'copies'} of this sponsor in
                  Sanity Studio did not get it. Publishing{' '}
                  {outOfStep === 1 ? 'it' : 'one of them'} would remove the
                  link. Try again, or discard {outOfStep === 1 ? 'it' : 'them'}{' '}
                  in Studio.
                </>
              ) : (
                <LeftAfterRevoke
                  copies={behind}
                  sponsorForConferenceId={sponsorForConferenceId}
                />
              )}
            </p>
          )}
          {/* Beside the warning, not inside it: a button is not part of what
              is announced. With a link, create writes the STORED link to
              every copy (the address handed out stays the same); without
              one, revoke clears what the last revoke left, and is handed
              the copies it named: one of another record it cannot find
              from this sponsor, which holds no link by now. */}
          <button
            type="button"
            onClick={() => {
              if (busy) return
              start(true)
              if (linked) create.mutate({ sponsorForConferenceId })
              else
                revoke.mutate({
                  sponsorForConferenceId,
                  leftCopies: [...behind],
                })
            }}
            aria-disabled={busy}
            className={`${quietButton} mt-2`}
          >
            {acting ? 'Trying…' : 'Try again'}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * What a revoke left: the unpublished copies that still hold the revoked
 * link. Usually they are this sponsor's own draft or release copies. A link
 * that was copied to ANOTHER sponsor record is revoked there too, and an
 * unpublished copy of that record can be what is left: the warning says so.
 */
function LeftAfterRevoke({
  copies,
  sponsorForConferenceId,
}: {
  copies: readonly string[]
  sponsorForConferenceId: string
}) {
  const own = copies.filter(
    (id) =>
      id === `drafts.${sponsorForConferenceId}` ||
      (id.startsWith('versions.') &&
        id.split('.').slice(2).join('.') === sponsorForConferenceId),
  ).length
  const others = copies.length - own
  const one = copies.length === 1
  return (
    <>
      The link is revoked, but {copies.length} unpublished{' '}
      {one ? 'copy' : 'copies'}{' '}
      {others === 0
        ? 'of this sponsor '
        : own === 0
          ? 'of another sponsor record '
          : ''}
      in Sanity Studio still {one ? 'holds' : 'hold'} it
      {own > 0 && others > 0
        ? `: ${own} of this sponsor and ${others} of another sponsor record`
        : ''}
      . Publishing {one ? 'it' : 'one of them'} would make the link work again.
      Try again, or discard {one ? 'it' : 'them'} in Studio.
    </>
  )
}

/**
 * How many early sign-ups were made through this sponsor's links (#1348,
 * spec §9): sign-ups, not people, and the ones made through a link revoked
 * since are among them, so it is said for a sponsor without a link too. The
 * count links to the "Early sign-ups" list narrowed to this sponsor.
 */
function EarlySignupCount({
  count,
  href,
  linked,
}: {
  count: number | undefined
  href: string | undefined
  linked: boolean
}) {
  if (count === undefined || (count === 0 && !linked)) return null
  const text = 'mt-3 text-sm text-gray-600 dark:text-gray-400'
  if (count === 0) {
    return (
      <p className={text}>
        No early sign-ups through this sponsor&rsquo;s links yet.
      </p>
    )
  }
  const one = count === 1
  const counted = `${count} early sign-up${one ? '' : 's'}`
  return (
    <p className={text}>
      {href ? (
        // NOT PREFETCHED: opening a sponsor's record must not render the
        // workshops page, whose reads are live.
        <Link
          href={href}
          prefetch={false}
          className="font-semibold text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {counted}
        </Link>
      ) : (
        <span className="font-semibold text-gray-900 dark:text-white">
          {counted}
        </span>
      )}{' '}
      {one ? 'was' : 'were'} made through this sponsor&rsquo;s links
      {one ? '.' : ', confirmed and waitlisted together.'}
    </p>
  )
}
