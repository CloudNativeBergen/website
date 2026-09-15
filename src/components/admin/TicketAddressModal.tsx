'use client'

import { useState } from 'react'
import { TicketIcon, TrashIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { formatDateSafe } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * Link the address a speaker's ticket was bought under.
 *
 * The claim status is a join on ADDRESSES: a speaker who registered with an
 * address we do not hold reads "Not claimed" forever, and the ticket sits on
 * /admin/tickets/orders with nothing connecting it to them. This finds that
 * ticket and adds its address to the speaker's identity.
 *
 * IT GRANTS SIGN-IN, and the copy says so twice — once as standing context and
 * once in the confirmation — because an organizer who reads only the button
 * label must still not be surprised. The address joins `knownEmails`: the
 * person can sign in with it from then on, and removing it here is what takes
 * that away again.
 */
export function TicketAddressModal({
  isOpen,
  onClose,
  speakerId,
  speakerName,
  onLinked,
}: {
  isOpen: boolean
  onClose: () => void
  speakerId: string | null
  speakerName?: string
  /** Called after an address is linked or removed, so the row can be re-read. */
  onLinked?: () => void
}) {
  const [query, setQuery] = useState('')
  /**
   * The address awaiting confirmation. The confirm step exists because the
   * consequence — this person can now sign in as this speaker — is not visible
   * in a button that says "Link address".
   */
  const [pending, setPending] = useState<string | null>(null)
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  // RESET ON A NEW SPEAKER. The modal stays mounted between openings, so a
  // half-finished confirmation would otherwise survive a close and be confirmed
  // against the NEXT speaker's id — granting sign-in on the wrong profile. The
  // React-blessed "adjust state during render" pattern (as in `ModalShell`),
  // not an effect, so the stale address can never reach a paint.
  const [shownFor, setShownFor] = useState(speakerId)
  if (shownFor !== speakerId) {
    setShownFor(speakerId)
    setPending(null)
    setQuery('')
  }

  const grantsQuery = api.speaker.admin.ticketEmails.useQuery(
    { id: speakerId ?? '' },
    { enabled: isOpen && !!speakerId },
  )

  // The search runs on the trimmed term and only from two characters, the same
  // floor the server enforces — so a one-character term never becomes a request
  // whose only possible answer is "too short".
  const term = query.trim()
  const searchQuery = api.tickets.admin.searchEventTickets.useQuery(
    { query: term },
    { enabled: isOpen && term.length >= 2, retry: false },
  )

  const addMutation = api.speaker.admin.addTicketEmail.useMutation()
  const removeMutation = api.speaker.admin.removeTicketEmail.useMutation()

  const refresh = async () => {
    await utils.speaker.admin.ticketEmails.invalidate({ id: speakerId ?? '' })
    onLinked?.()
  }

  const handleAdd = async (email: string) => {
    if (!speakerId) return
    try {
      await addMutation.mutateAsync({ id: speakerId, email })
      await refresh()
      setPending(null)
      setQuery('')
      showNotification({
        type: 'success',
        title: 'Ticket address linked',
        message: `${email} now matches this speaker's ticket, and can sign in to this profile.`,
      })
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Could not link the address',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleRemove = async (email: string) => {
    if (!speakerId) return
    try {
      await removeMutation.mutateAsync({ id: speakerId, email })
      await refresh()
      showNotification({
        type: 'success',
        title: 'Ticket address removed',
        message: `${email} no longer matches this speaker, and can no longer sign in to this profile.`,
      })
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Could not remove the address',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const grants = grantsQuery.data?.grants ?? []
  const held = new Set(grants.map((grant) => grant.email))
  const results = searchQuery.data?.tickets ?? []
  const busy = addMutation.isPending || removeMutation.isPending

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Ticket address"
      subtitle={speakerName}
      icon={<TicketIcon className="h-5 w-5" />}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">
        A ticket matches a speaker by email address. If they registered with an
        address we do not have — a work address, say — their ticket reads as not
        claimed. Search this event&apos;s tickets and link the address they
        used.
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        A linked address becomes part of this speaker&apos;s identity: whoever
        reads mail at it can sign in to this speaker profile. Link an address
        only when you are satisfied it belongs to this person. Removing it here
        takes that access away again.
      </p>

      <div className="mt-5">
        <h3 className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white">
          Linked ticket addresses
        </h3>
        {grantsQuery.isPending ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Loading&hellip;
          </p>
        ) : grants.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            None yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
            {grants.map((grant) => (
              <li
                key={grant._key ?? grant.email}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-gray-100">
                    {grant.email}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {[
                      grant.addedByName
                        ? `Linked by ${grant.addedByName}`
                        : 'Linked',
                      grant.addedAt ? formatDateSafe(grant.addedAt) : null,
                      grant.ticketId ? `ticket ${grant.ticketId}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(grant.email)}
                  disabled={busy}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <label
          htmlFor="ticket-search"
          className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white"
        >
          Search tickets
        </label>
        <input
          id="ticket-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or email address"
          // 16px minimum: anything smaller makes iOS Safari zoom the page on
          // focus and the organizer has to pinch back out.
          className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />

        <div className="mt-3">
          {term.length < 2 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Type at least two characters.
            </p>
          ) : searchQuery.isPending ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Searching&hellip;
            </p>
          ) : searchQuery.isError ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The ticket list could not be read.
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No tickets match that.
            </p>
          ) : (
            <TicketSearchResultList
              tickets={results}
              linked={held}
              busy={busy}
              onPick={setPending}
            />
          )}
        </div>
      </div>

      {pending && (
        <TicketGrantConfirm
          email={pending}
          speakerName={speakerName}
          busy={busy}
          linking={addMutation.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => handleAdd(pending)}
        />
      )}
    </ModalShell>
  )
}

/**
 * The matching tickets. Enough of each to recognize the person — name, the
 * address it was bought under, and the category — and deliberately nothing
 * else: no order id, no sum, no payment state.
 *
 * Exported so it can be seen in isolation; the modal is the only caller.
 */
export function TicketSearchResultList({
  tickets,
  linked,
  busy = false,
  onPick,
}: {
  tickets: { name: string; email: string; category: string }[]
  /** Addresses already linked to this speaker — nothing to do for those. */
  linked: ReadonlySet<string>
  busy?: boolean
  onPick: (email: string) => void
}) {
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {tickets.map((ticket) => (
        <li
          key={`${ticket.email}-${ticket.category}`}
          className="flex items-center justify-between gap-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {ticket.name || ticket.email}
            </p>
            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
              {ticket.email}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {ticket.category}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onPick(ticket.email)}
            disabled={busy || linked.has(ticket.email)}
            className="min-h-[44px] shrink-0 rounded-lg bg-brand-cloud-blue px-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {linked.has(ticket.email) ? 'Linked' : 'Link address'}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The confirmation. It names the CONSEQUENCE — this person can sign in — rather
 * than asking whether the organizer is sure, and the button says what it does.
 * An organizer who reads only the button label should still not be surprised.
 */
export function TicketGrantConfirm({
  email,
  speakerName,
  busy = false,
  linking = false,
  onCancel,
  onConfirm,
}: {
  email: string
  speakerName?: string
  busy?: boolean
  linking?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="mt-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700/60 dark:bg-yellow-900/20">
      <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
        Link {email} to {speakerName ?? 'this speaker'}?
      </p>
      <p className="mt-1 text-sm text-yellow-900 dark:text-yellow-200">
        Whoever reads mail at this address will be able to sign in to this
        speaker profile and see everything it holds. The link is recorded with
        your name, and can be removed here.
      </p>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand-cloud-blue px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          {linking ? 'Linking…' : 'Link and grant sign-in'}
        </button>
      </div>
    </div>
  )
}
