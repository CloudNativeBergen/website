'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExclamationTriangleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { StatusBadge } from '@/components/StatusBadge'
import type {
  OrphanedWorkshopEntry,
  WorkshopTicketList,
} from '@/lib/workshop/ticket-list'
import { WORKSHOP_TICKETS_ANCHOR } from './anchor'
import { BuiltInListConfirm } from './BuiltInListConfirm'
import { WorkshopAccessControl } from './WorkshopAccessControl'
import { quoteNames } from './names'

/**
 * The card around the list: the heading, and the anchor the ticket-types page
 * links to. Its own component so the anchor exists while the ticket types are
 * still being read from the provider.
 */
export function WorkshopTicketsFrame({
  badge,
  children,
}: {
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={WORKSHOP_TICKETS_ANCHOR}
      aria-labelledby="workshop-tickets-heading"
      className="scroll-mt-24 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TicketIcon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
        <h3
          id="workshop-tickets-heading"
          className="text-lg font-medium text-gray-900 dark:text-white"
        >
          Workshop tickets
        </h3>
        {badge}
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Holders of a ticket type that grants workshop access can sign up for
        workshops.
      </p>
      {children}
    </section>
  )
}

export interface WorkshopTicketsSectionProps {
  /**
   * The list, built on the server from the provider's ticket types and the
   * stored answers. `null` when the provider could not be read: an unread list
   * is never shown as an empty one.
   */
  list: WorkshopTicketList | null
  /** The ticketing vendor's name, for copy. */
  providerLabel: string
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
}: WorkshopTicketsSectionProps) {
  if (!list) {
    return (
      <WorkshopTicketsFrame>
        <div
          role="alert"
          className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
        >
          <p className="font-medium">
            The ticket types could not be read from {providerLabel}.
          </p>
          <p className="mt-1">
            The list cannot be shown or changed until they can. The saved list
            still decides who can sign up. Reload the page to try again.
          </p>
        </div>
      </WorkshopTicketsFrame>
    )
  }

  const notSet = list.types
    .filter((type) => type.access === 'unclassified')
    .map((type) => type.typeName)

  return (
    <WorkshopTicketsFrame
      badge={
        !list.configured && (
          <StatusBadge label="Not configured" color="yellow" />
        )
      }
    >
      {(notSet.length > 0 || list.orphaned.length > 0) && (
        <div
          role="status"
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
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
              {quoteNames(notSet)} {notSet.length === 1 ? 'is' : 'are'} not set.{' '}
              {notSet.length === 1 ? 'Its holders' : 'Their holders'} cannot
              sign up for workshops until you choose an answer below.
            </p>
          )}
          {list.orphaned.length > 0 && (
            <ul className="mt-1 divide-y divide-amber-200 dark:divide-amber-900">
              {list.orphaned.map((entry) => (
                <OrphanedEntry
                  key={entry.typeName}
                  entry={entry}
                  builtInGranted={list.builtInGranted}
                  providerLabel={providerLabel}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {!list.configured && (
        <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900">
          <p className="font-medium">This list is not configured yet.</p>
          <p className="mt-1">
            No ticket type is marked, so the built-in list decides.{' '}
            {list.builtInGranted.length > 0
              ? `Holders of ${quoteNames(list.builtInGranted)} can sign up for workshops, and nobody else can.`
              : 'It matches none of this conference’s ticket types, so nobody can sign up for workshops until you mark a type.'}{' '}
            Marking a type switches the built-in list off.
          </p>
        </div>
      )}

      {list.types.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          {providerLabel} lists no ticket types for this event.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
          {list.types.map((type, index) => (
            <li key={`${index}:${type.typeName}`}>
              <WorkshopAccessControl
                typeName={type.typeName}
                declaredGrantsWorkshop={type.stored}
                workshopConfigured={list.configured}
                bridgeGrantsThisType={
                  !list.configured && type.access === 'granted'
                }
                bridgeGrantedOtherTypes={
                  list.configured
                    ? []
                    : list.builtInGranted.filter(
                        (name) => name !== type.typeName,
                      )
                }
                lastGranting={type.lastGranting}
                builtInGranted={list.builtInGranted}
                row={{ access: type.access }}
              />
            </li>
          ))}
        </ul>
      )}
    </WorkshopTicketsFrame>
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
}: {
  entry: OrphanedWorkshopEntry
  builtInGranted: readonly string[]
  providerLabel: string
}) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [confirming, setConfirming] = useState(false)
  const [refreshing, startRefresh] = useTransition()

  const mutation = api.tickets.admin.setWorkshopAccess.useMutation({
    onSuccess: () => {
      startRefresh(() => router.refresh())
      showNotification({
        type: 'success',
        title: 'Entry removed',
        message: `The workshop answer for “${entry.typeName}” is removed.`,
      })
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Could not remove',
        message: error.message || 'Failed to remove the entry.',
      })
    },
  })
  const busy = mutation.isPending || refreshing

  const remove = () => {
    if (busy) return
    setConfirming(false)
    mutation.mutate({
      updates: [{ typeName: entry.typeName, grantsWorkshop: null }],
      // Only ever sent from the confirmation that named the consequence.
      ...(entry.lastGranting && { allowBuiltInList: true }),
    })
  }

  return (
    <li className="py-2">
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
          type="button"
          onClick={() => (entry.lastGranting ? setConfirming(true) : remove())}
          disabled={busy}
          aria-label={`Remove the entry for "${entry.typeName}"`}
          className="min-h-11 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          {busy ? 'Removing…' : 'Remove entry'}
        </button>
      </div>
      {confirming && (
        <BuiltInListConfirm
          builtInGranted={builtInGranted}
          confirmLabel="Remove and use the built-in list"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  )
}
