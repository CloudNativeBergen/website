'use client'

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { StatusBadge } from '@/components/StatusBadge'
import type {
  OrphanedWorkshopEntry,
  WorkshopTicketList,
  WorkshopTicketType,
} from '@/lib/workshop/ticket-list'
import { WORKSHOP_TICKETS_ANCHOR } from './anchor'
import { BuiltInListConfirm, Question } from './Question'
import { WorkshopAccessControl } from './WorkshopAccessControl'
import { quoteNames } from './names'
import { useSaveWorkshopAccess } from './useSaveWorkshopAccess'
import { typeKey } from '@/lib/tickets/classification'
import { useTicketHolders } from '../holders'

const HEADING_ID = 'workshop-tickets-heading'

/**
 * The card around the list: the heading, and the anchor the ticket-types page
 * links to. Its own component so the anchor exists while the ticket types are
 * still being read from the provider.
 */
function WorkshopTicketsFrame({
  badge,
  open = false,
  children,
}: {
  badge?: ReactNode
  /** Starts open: something here needs the organizer. */
  open?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={WORKSHOP_TICKETS_ANCHOR}
      aria-labelledby={HEADING_ID}
      className="scroll-mt-24 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
    >
      {/* Collapsed by default: rarely changed once set. */}
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
          <TicketIcon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
          <h3
            id={HEADING_ID}
            // Focusable from code only: focus lands here when the control that
            // held it leaves the page (a removed entry).
            tabIndex={-1}
            className="text-lg font-medium text-gray-900 outline-none dark:text-white"
          >
            Workshop tickets
          </h3>
          {badge}
          <ChevronDownIcon className="ml-auto size-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500" />
        </summary>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Holders of a ticket type that grants workshop access can sign up for
          workshops.
        </p>
        {children}
      </details>
    </section>
  )
}

/**
 * THE SHAPE OF WHAT IS COMING, shown while the ticket types are read from the
 * provider, so the workshops below do not jump when the list streams in: a
 * conference has a dozen ticket types or so.
 */
export function WorkshopTicketsSkeleton() {
  return (
    <WorkshopTicketsFrame>
      <p className="sr-only" role="status">
        Reading the ticket types…
      </p>
      <ul
        aria-hidden
        className="mt-2 animate-pulse divide-y divide-gray-100 dark:divide-gray-800"
      >
        {Array.from({ length: 6 }, (_, row) => (
          <li
            key={row}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
          >
            <div className="h-5 w-56 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <div className="h-11 flex-1 basis-40 rounded-md bg-gray-200 sm:w-44 sm:flex-none dark:bg-gray-700" />
              <div className="h-11 flex-1 basis-40 rounded-md bg-gray-200 sm:w-40 sm:flex-none dark:bg-gray-700" />
            </div>
          </li>
        ))}
      </ul>
    </WorkshopTicketsFrame>
  )
}

export interface WorkshopTicketsSectionProps {
  /**
   * The list, built on the server from the provider's ticket types and the
   * stored answers. `null` when it could not be loaded: an unread list is
   * never shown as an empty one.
   */
  list: WorkshopTicketList | null
  /** The ticketing vendor's name, for copy. */
  providerLabel: string
  /**
   * With no list: it was NOT the vendor's ticket types that failed to read,
   * so the section names no cause it does not know.
   */
  causeUnknown?: boolean
  /** "Sponsor Early Access Opens" is set: early access can take effect. */
  sponsorStartSet?: boolean
}

/**
 * "Workshop tickets" on `/admin/workshops` (#1332): which ticket types let
 * their holders sign up for workshops.
 *
 * It is the list `workshopAccessOf` reads, and every row saves through
 * `tickets.admin.setWorkshopAccess`. What is true of the whole list is said
 * once, here: that nothing is marked yet and which types the built-in list
 * therefore grants, and which types and entries need an organizer.
 */
export function WorkshopTicketsSection({
  list,
  providerLabel,
  causeUnknown = false,
  sponsorStartSet = false,
}: WorkshopTicketsSectionProps) {
  if (!list) {
    return (
      <WorkshopTicketsFrame open>
        <div
          role="alert"
          className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
        >
          <p className="font-medium">
            {causeUnknown
              ? 'This list could not be loaded.'
              : `The ticket types could not be read from ${providerLabel}.`}
          </p>
          {/* WHAT COULD NOT BE SHOWN, and nothing about what did or did not
              change: this state can replace the list right after a save. */}
          <p className="mt-1">
            The list cannot be shown or changed right now. Reload the page to
            try again.
          </p>
        </div>
      </WorkshopTicketsFrame>
    )
  }

  // A PROVIDER THAT LISTS NOTHING. There is nothing to mark, and nothing it
  // says can make a stored answer orphaned, so neither a switch nor a removal
  // is offered. Said as a fact, not as an error: the read worked.
  if (list.types.length === 0) {
    return (
      <WorkshopTicketsFrame>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          {providerLabel} lists no ticket types for this event, so there is
          nothing to set here.
        </p>
      </WorkshopTicketsFrame>
    )
  }

  const notSet = list.types
    .filter((type) => type.access === 'unclassified')
    .map((type) => type.typeName)

  const needsDecision =
    notSet.length > 0 ||
    list.orphaned.length > 0 ||
    list.orphanedEarlyAccess.length > 0

  return (
    <WorkshopTicketsFrame
      open={needsDecision || !list.configured}
      badge={
        !list.configured && (
          <StatusBadge label="Not configured" color="yellow" />
        )
      }
    >
      {needsDecision && (
        // A labelled region, NOT a live one: it holds buttons and questions,
        // and a live region would be read out again whole on every change.
        <section
          aria-labelledby="workshop-tickets-attention"
          className="mt-4 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900"
        >
          <p
            id="workshop-tickets-attention"
            className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200"
          >
            <ExclamationTriangleIcon className="size-4 shrink-0" />
            Needs a decision
          </p>
          {notSet.length > 0 && (
            <>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                {quoteNames(notSet)} {notSet.length === 1 ? 'is' : 'are'} not
                set. {notSet.length === 1 ? 'Its holders' : 'Their holders'}{' '}
                cannot sign up for workshops until you choose an answer below.
              </p>
              <LockedOutCounts notSet={notSet} />
            </>
          )}
          {list.orphaned.length > 0 && (
            <ul className="mt-1 divide-y divide-amber-200 dark:divide-amber-900">
              {list.orphaned.map((entry) => (
                <OrphanedEntry
                  key={entry.typeName}
                  entry={entry}
                  builtInGranted={list.builtInGranted}
                  providerLabel={providerLabel}
                  basedOn={list.version}
                />
              ))}
            </ul>
          )}
          {list.orphanedEarlyAccess.length > 0 && (
            <ul className="mt-1 divide-y divide-amber-200 dark:divide-amber-900">
              {list.orphanedEarlyAccess.map((typeName) => (
                <OrphanedEarlyAccess
                  key={typeName}
                  typeName={typeName}
                  providerLabel={providerLabel}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {!list.configured && (
        <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
          <p className="font-medium">This list is not configured yet.</p>
          <p className="mt-1">
            No ticket type is set to grant access, so the built-in list decides.{' '}
            {list.builtInGranted.length > 0
              ? `Holders of ${quoteNames(list.builtInGranted)} can sign up for workshops, and nobody else can. Setting a type to grant access switches the built-in list off.`
              : 'It matches none of this conference’s ticket types, so nobody can sign up for workshops until a type is set to grant access.'}
          </p>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Early access lets holders sign up from “Sponsor Early Access Opens”,
        with no link.
        {!sponsorStartSet &&
          ' No sponsor start time is set, so early access has no effect yet.'}
      </p>

      <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        {list.types.map((type, index) => (
          <li key={`${index}:${type.typeName}`}>
            <WorkshopAccessControl
              type={type}
              configured={list.configured}
              builtInGranted={list.builtInGranted}
              row
              basedOn={list.version}
            />
            <EarlyAccessToggle type={type} />
          </li>
        ))}
      </ul>
    </WorkshopTicketsFrame>
  )
}

/**
 * "Early access" for one ticket type: its holders may sign up from the
 * sponsor start time, with no link. Only a type that grants workshop access
 * can be turned on; one that is on can always be turned off.
 */
function EarlyAccessToggle({ type }: { type: WorkshopTicketType }) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [refreshing, startRefresh] = useTransition()
  const mutation = api.workshop.admin.setEarlyAccessTicketType.useMutation({
    onSuccess: () => startRefresh(() => router.refresh()),
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not save early access',
        message: error.message,
      }),
  })
  const grants = type.access === 'granted'
  const id = useId()
  const busy = mutation.isPending || refreshing
  return (
    <div className="flex flex-wrap items-center gap-x-2 pb-3 text-sm">
      <input
        id={id}
        type="checkbox"
        aria-label={`Early access for ${type.typeName}`}
        checked={!!type.earlyAccess}
        disabled={busy || (!grants && !type.earlyAccess)}
        onChange={(event) =>
          mutation.mutate({
            typeName: type.typeName,
            earlyAccess: event.target.checked,
          })
        }
        className="size-4 rounded border-gray-300 text-indigo-600 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
      />
      <label htmlFor={id} className="text-gray-700 dark:text-gray-300">
        Early access
      </label>
      {!grants && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Only for types that grant workshop access.
        </span>
      )}
    </div>
  )
}

/**
 * An early-access type name that matches no provider type: renamed or removed
 * there. It admits nobody whose ticket no longer carries the name, so it is
 * removed with no question.
 */
function OrphanedEarlyAccess({
  typeName,
  providerLabel,
}: {
  typeName: string
  providerLabel: string
}) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [refreshing, startRefresh] = useTransition()
  const mutation = api.workshop.admin.setEarlyAccessTicketType.useMutation({
    onSuccess: () => startRefresh(() => router.refresh()),
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not remove early access',
        message: error.message,
      }),
  })
  const busy = mutation.isPending || refreshing
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
      <p className="min-w-0 flex-1 basis-60 text-sm text-amber-800 dark:text-amber-300">
        “{typeName}” is set to early access, but {providerLabel} lists no ticket
        type with that name. It may have been renamed there.
      </p>
      <button
        type="button"
        onClick={() => {
          if (!busy) mutation.mutate({ typeName, earlyAccess: false })
        }}
        aria-disabled={busy}
        aria-label={`Remove early access for "${typeName}"`}
        className="min-h-11 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
      >
        {busy ? 'Removing…' : 'Remove early access'}
      </button>
    </li>
  )
}

/**
 * How many people each not-set type keeps out (#1333, spec §3): holders of
 * the type with no ticket that grants workshop access. From the page's one
 * read of the ticket holders; nothing while it is being read, and never a
 * zero for a read that failed. A type no ticket carries keeps nobody out.
 */
function LockedOutCounts({ notSet }: { notSet: readonly string[] }) {
  const holders = useTicketHolders()
  if (holders?.state === 'unavailable') {
    return (
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        How many people hold {notSet.length === 1 ? 'it' : 'them'} is
        unavailable: the tickets could not be read.
      </p>
    )
  }
  if (holders?.state !== 'ready') return null
  // The join keys types as the rule does; the ticket may spell it otherwise.
  const people = (typeName: string) =>
    holders.stats.lockedOut.find(
      (type) => typeKey(type.typeName) === typeKey(typeName),
    )?.people ?? 0
  return (
    <ul className="mt-1 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
      {notSet.map((typeName) => {
        const n = people(typeName)
        return (
          <li key={typeName}>
            “{typeName}”:{' '}
            {n === 0
              ? 'nobody is refused for it yet.'
              : n === 1
                ? '1 person holds it and is refused.'
                : `${n} people hold it and are refused.`}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A stored answer for a ticket type the provider no longer lists, usually
 * after a rename there. It can only be removed: there is no ticket type left to
 * answer for. The removal takes the workshop answer and leaves a seating
 * answer in place (the server decides which, from the stored entry).
 */
function OrphanedEntry({
  entry,
  builtInGranted,
  providerLabel,
  basedOn,
}: {
  entry: OrphanedWorkshopEntry
  builtInGranted: readonly string[]
  providerLabel: string
  basedOn: string
}) {
  // A REMOVAL IS ALWAYS ASKED ABOUT. Whether the provider keeps the old name
  // on tickets already sold after a rename is not known here; if it does,
  // removing a granting entry locks those holders out. The question says so,
  // and the one for the last grant says more. If another row's save changes
  // what it says (this stops or starts being the last grant, or the built-in
  // list would grant something else), it closes: a question stays on screen
  // only while what it says still holds.
  const facts = JSON.stringify([
    entry.grantsWorkshop,
    entry.lastGranting,
    builtInGranted,
  ])
  const [askedOn, setAskedOn] = useState<string | null>(null)
  if (askedOn !== null && askedOn !== facts) setAskedOn(null)
  const confirming = askedOn === facts
  const setConfirming = (open: boolean) => setAskedOn(open ? facts : null)
  /** Focus returns here when the question closes. */
  const button = useRef<HTMLButtonElement>(null)
  const { busy, save } = useSaveWorkshopAccess({
    basedOn,
    failed: {
      title: 'Could not remove',
      message: 'Failed to remove the entry.',
    },
  })

  // ONCE REMOVED, THIS ROW LEAVES THE PAGE, and the focus its button holds
  // would fall back to the top of the document. It goes to the section's
  // heading instead. A layout effect: its cleanup runs while the button is
  // still in the document, so it can still tell that it had focus.
  useLayoutEffect(() => {
    const removeButton = button.current
    return () => {
      if (removeButton && removeButton === document.activeElement) {
        document.getElementById(HEADING_ID)?.focus()
      }
    }
  }, [])

  const close = () => {
    setConfirming(false)
    button.current?.focus()
  }

  const remove = () => {
    if (confirming) close()
    save(
      {
        updates: [{ typeName: entry.typeName, grantsWorkshop: null }],
        // Only ever sent from the confirmation that named the consequence.
        ...(entry.lastGranting && { allowBuiltInList: true }),
      },
      {
        title: 'Entry removed',
        message: `The workshop answer for “${entry.typeName}” is removed.`,
      },
    )
  }

  return (
    <li
      className="py-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && confirming) close()
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-60 text-sm text-amber-800 dark:text-amber-300">
          “{entry.typeName}” is saved as{' '}
          {entry.grantsWorkshop
            ? 'granting workshop access'
            : 'not granting workshop access'}
          , but {providerLabel} lists no ticket type with that name. It may have
          been renamed there.
        </p>
        <button
          ref={button}
          type="button"
          onClick={() => {
            if (!busy) setConfirming(true)
          }}
          // Not `disabled`, which would drop the focus returned here.
          aria-disabled={busy}
          aria-label={`Remove the entry for "${entry.typeName}"`}
          className="min-h-11 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          {busy ? 'Removing…' : 'Remove entry'}
        </button>
      </div>
      {confirming &&
        (entry.lastGranting ? (
          <BuiltInListConfirm
            builtInGranted={builtInGranted}
            confirmLabel="Remove and use the built-in list"
            onConfirm={remove}
            onCancel={close}
          />
        ) : (
          <Question
            title={`This removes the saved answer for “${entry.typeName}”.`}
            cancelLabel="Keep the entry"
            confirmLabel="Remove it"
            onConfirm={remove}
            onCancel={close}
          >
            {entry.grantsWorkshop
              ? 'Anyone whose ticket still carries that name will no longer be able to sign up for workshops.'
              : 'It is set to No, so nobody gains or loses access.'}
          </Question>
        ))}
    </li>
  )
}
