'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { StatusBadge } from '@/components/StatusBadge'
import type { TicketTypeProposal } from '@/lib/tickets/discovery'

/**
 * Whether this ticket type seats a human — the one question no ticket provider
 * answers, asked where the organizer can actually see the type.
 *
 * Until this existed, `conference.ticketTypeRoles` could only be edited in
 * Sanity Studio, so the participant count on /admin/tickets depended on a field
 * an organizer had to know existed. Here the three states are on the card:
 *
 *  - DECLARED — a human answered. Settled, and still changeable: a mistaken
 *    confirm must be reversible without Studio.
 *  - PROPOSED — `@/lib/tickets/discovery` read the evidence and suggested a
 *    role. It is rendered as a suggestion, WITH its evidence and its sample
 *    size, because an organizer confirming a role they cannot check is how a
 *    wrong number becomes a blessed one. Nothing is pre-selected.
 *  - UNKNOWN — nobody declared it and nothing hints. It counts as seating
 *    someone, which is what this page says out loud.
 *
 * Confirming is one click: the suggested option is a button, and pressing it
 * writes the declaration. Both options are always offered, so overriding a
 * proposal costs the same one click as agreeing with it.
 */
export interface TicketTypeRoleControlProps {
  /** The vendor's own type name — what gets written to `ticketTypeRoles`. */
  typeName: string
  /** The declared role, when a human has already answered. */
  declaredAdmits?: boolean
  /** What discovery proposed, if anything. */
  proposal?: TicketTypeProposal
}

export function TicketTypeRoleControl({
  typeName,
  declaredAdmits,
  proposal,
}: TicketTypeRoleControlProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [declared, setDeclared] = useState(declaredAdmits)

  const mutation = api.tickets.admin.setTicketTypeRole.useMutation({
    onSuccess: (_data, variables) => {
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Role saved',
        message: `"${typeName}" now counts as ${variables.admits ? 'seating one attendee' : 'an add-on that seats nobody'}.`,
      })
    },
    onError: (error) => {
      setDeclared(declaredAdmits)
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save the ticket type role.',
      })
    },
  })

  const save = (admits: boolean) => {
    if (mutation.isPending) return
    setDeclared(admits)
    mutation.mutate({ typeName, admits })
  }

  // A proposal that says nothing about seating (a 100%-off code proves how a
  // ticket was PAID for, not whether it seats anyone) is not a suggestion here.
  const suggested =
    proposal && proposal.admits !== 'unknown' ? proposal.admits : undefined

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Seats an attendee?
        </span>
        {declared !== undefined ? (
          <StatusBadge label="Declared" color="green" />
        ) : suggested !== undefined ? (
          <StatusBadge label="Suggested — not confirmed" color="yellow" />
        ) : (
          <StatusBadge label="Not set" color="gray" />
        )}
      </div>

      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {declared !== undefined ? (
          <>
            An organizer declared this type{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {declared ? 'seats one attendee' : 'an add-on that seats nobody'}
            </span>
            . Change it below if that is wrong.
          </>
        ) : suggested !== undefined ? (
          <>
            Nobody has declared this type. The evidence suggests it{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {suggested ? 'seats one attendee' : 'seats nobody'}
            </span>
            , but until you confirm it, every ticket of this type is counted as
            seating one attendee.
          </>
        ) : (
          <>
            Nobody has declared this type and nothing in the data hints either
            way, so every ticket of this type is counted as seating one
            attendee.
          </>
        )}
      </p>

      {/* EVIDENCE WITHOUT A CLICK. A proposal an organizer cannot check is
          worse than no proposal: confirming it would bless a number nobody
          verified. The sample size rides along because "all of them" means
          nothing without a denominator. */}
      {proposal && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Evidence: {proposal.evidence}.{' '}
          {proposal.sampleSize > 0 ? (
            <span
              className={
                proposal.confidence === 'low'
                  ? 'text-amber-700 dark:text-amber-400'
                  : undefined
              }
            >
              Based on {proposal.sampleSize}{' '}
              {proposal.sampleSize === 1 ? 'holder' : 'holders'}
              {proposal.confidence === 'low'
                ? ' — too few to be sure on their own.'
                : '.'}
            </span>
          ) : (
            <span>Nobody holds this type yet.</span>
          )}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <RoleButton
          onClick={() => save(true)}
          selected={declared === true}
          suggested={declared === undefined && suggested === true}
          disabled={mutation.isPending}
          label="Seats an attendee"
          typeName={typeName}
        />
        <RoleButton
          onClick={() => save(false)}
          selected={declared === false}
          suggested={declared === undefined && suggested === false}
          disabled={mutation.isPending}
          label="Add-on — seats nobody"
          typeName={typeName}
        />
      </div>

      {/* THE CONSEQUENCE, said before the click rather than after it. */}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Saving this writes the type&apos;s role to this conference and changes
        the participant count and seats-used figure on the Tickets page.
      </p>
    </div>
  )
}

function RoleButton({
  onClick,
  selected,
  suggested,
  disabled,
  label,
  typeName,
}: {
  onClick: () => void
  selected: boolean
  suggested: boolean
  disabled: boolean
  label: string
  typeName: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${label} — "${typeName}"`}
      // Equal halves, left-aligned: at phone width "Add-on — seats nobody"
      // wraps, and a centred wrap next to a one-line neighbour reads as two
      // unrelated controls rather than as one either/or.
      className={`min-h-11 flex-1 basis-40 rounded-md px-3 py-2 text-left text-sm font-medium ring-1 transition-colors disabled:opacity-50 sm:max-w-60 ${
        selected
          ? 'bg-blue-600 text-white ring-blue-600'
          : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'
      }`}
    >
      <span className="block">{label}</span>
      {suggested && (
        <span className="block text-xs font-normal text-amber-700 dark:text-amber-400">
          Suggested
        </span>
      )}
    </button>
  )
}
