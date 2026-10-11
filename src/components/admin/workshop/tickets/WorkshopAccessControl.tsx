'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { StatusBadge } from '@/components/StatusBadge'
import type { WorkshopAccess } from '@/lib/tickets/classification'
import { BuiltInListConfirm } from './BuiltInListConfirm'
import { WorkshopAccessBadge } from './WorkshopAccessBadge'
import { quoteNames } from './names'

/**
 * Whether one ticket type lets its holder into the workshops: the organizer's
 * answer, saved to `conference.ticketTypeRoles[].grantsWorkshop`.
 *
 * It renders in two places. The "Workshop tickets" section on
 * `/admin/workshops` lists every type as one compact row (`row`), and says the
 * things that are true of the whole list once, above the rows. A conference
 * WITHOUT the workshops feature has no such page, so its ticket-type cards on
 * `/admin/tickets/types` keep the control, with the explanation on each card.
 *
 * THE TWO CLIFFS THIS CONTROL EXISTS TO MAKE VISIBLE. `workshopAccessOf`
 * treats a conference as CONFIGURED the moment ANY type is marked as granting;
 * from then on the marked set is the whole answer and the built-in list of
 * type names is ignored outright (deliberately, and not unioned: a union would
 * keep a renamed type working through the literal, which is the silent
 * breakage the field replaces).
 *
 *  1. THE FIRST MARK switches the built-in list off for every OTHER type: an
 *     organizer marking "Speaker ticket" would, with no further warning, revoke
 *     /workshop for everyone holding the two-day pass. So the click is
 *     CONFIRMED, the confirm names the exact types that would lose access, and
 *     the safe option is the first one: carrying those types over in the same
 *     write. The write is a single Sanity patch, so it cannot half-apply.
 *  2. LOSING THE LAST MARK switches the built-in list back ON: the same change
 *     for every type at once, in the other direction. That click is confirmed
 *     too, and names the types the built-in list will grant. The server refuses
 *     the save unless it carries the confirmation, so a stale page cannot skip
 *     the question.
 *
 * Recovery needs no Studio either: every type stays toggleable afterwards.
 */
export interface WorkshopAccessControlProps {
  /** The vendor's own type name — what gets written to `ticketTypeRoles`. */
  typeName: string
  /** The stored answer, when a human has already given one. */
  declaredGrantsWorkshop?: boolean
  /** Has ANY type at this conference been marked as granting? */
  workshopConfigured: boolean
  /** While nothing is marked: does the built-in list grant access to THIS type? */
  bridgeGrantsThisType?: boolean
  /**
   * While nothing is marked: the OTHER types the built-in list currently
   * grants — exactly the ones that stop granting when this conference marks
   * anything. Resolved on the server, so the list itself never reaches the
   * browser.
   */
  bridgeGrantedOtherTypes?: readonly string[]
  /**
   * This type's answer is the only one that grants: answering no for it leaves
   * nothing marked. Resolved on the server.
   */
  lastGranting?: boolean
  /**
   * Every type the built-in list grants, this one included: who gets in again
   * if the last mark goes. Resolved on the server.
   */
  builtInGranted?: readonly string[]
  /**
   * Render as one row of the "Workshop tickets" list: the type's name, the
   * rule's answer for its holders, and the two buttons. The surrounding
   * section carries the explanation.
   */
  row?: { access: WorkshopAccess }
}

export function WorkshopAccessControl({
  typeName,
  declaredGrantsWorkshop,
  workshopConfigured,
  bridgeGrantsThisType = false,
  bridgeGrantedOtherTypes = [],
  lastGranting = false,
  builtInGranted = [],
  row,
}: WorkshopAccessControlProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [declared, setDeclared] = useState(declaredGrantsWorkshop)
  /** The pending answer while a cliff is being confirmed. */
  const [confirming, setConfirming] = useState<boolean | null>(null)
  /** The last prop value this card has adopted, so a CHANGE can be spotted. */
  const [syncedProp, setSyncedProp] = useState(declaredGrantsWorkshop)
  /** True until the page has re-rendered with what the save left stored. */
  const [refreshing, startRefresh] = useTransition()

  const mutation = api.tickets.admin.setWorkshopAccess.useMutation({
    onSuccess: (_data, variables) => {
      startRefresh(() => router.refresh())
      const carried = variables.updates.length - 1
      showNotification({
        type: 'success',
        title: 'Workshop access saved',
        message: `“${typeName}” ${variables.updates[0].grantsWorkshop ? 'now grants' : 'no longer grants'} workshop access.${
          carried > 0
            ? ` ${carried} other ticket ${carried === 1 ? 'type keeps' : 'types keep'} it.`
            : ''
        }`,
      })
    },
    onError: (error) => {
      setDeclared(declaredGrantsWorkshop)
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save workshop access.',
      })
    },
  })

  /**
   * THE CARRY-OVER WRITES OTHER CARDS. One save marks several types, so every
   * carried card's `declaredGrantsWorkshop` arrives changed after
   * `router.refresh()` while its own `declared` state still holds the
   * `undefined` it was mounted with — it would keep saying "Not set", with
   * neither button pressed, until a full navigation. That is the flow that
   * exists to stop an organizer stranding types; it must not look like it
   * failed.
   *
   * Keyed on the prop CHANGING, not on its value, so the card being saved keeps
   * its optimistic answer while its own stale prop is still in flight — and
   * skipped entirely while this card has a write outstanding, so somebody
   * else's refresh cannot overwrite an answer this organizer just clicked.
   */
  if (syncedProp !== declaredGrantsWorkshop && !mutation.isPending) {
    setSyncedProp(declaredGrantsWorkshop)
    setDeclared(declaredGrantsWorkshop)
  }

  /** A no for the last granting type hands the decision back to the built-in list. */
  const leavesNothingMarked = (grants: boolean) =>
    workshopConfigured && lastGranting && !grants

  /**
   * A click is safe unless it moves this conference off the built-in list, back
   * onto it, or is a no that the list would quietly overrule.
   */
  const needsConfirm = (grants: boolean) => {
    if (workshopConfigured) return leavesNothingMarked(grants)
    return grants ? bridgeGrantedOtherTypes.length > 0 : bridgeGrantsThisType
  }

  const write = (grants: boolean, carryOthers: boolean) => {
    if (mutation.isPending) return
    setConfirming(null)
    setDeclared(grants)
    mutation.mutate({
      // THIS type first: the success message reads the head of the list.
      updates: [
        { typeName, grantsWorkshop: grants },
        ...(carryOthers
          ? bridgeGrantedOtherTypes.map((name) => ({
              typeName: name,
              grantsWorkshop: true,
            }))
          : []),
      ],
      // Only ever sent from the confirmation that named the consequence.
      ...(leavesNothingMarked(grants) && { allowBuiltInList: true }),
    })
  }

  const click = (grants: boolean) => {
    if (mutation.isPending) return
    if (needsConfirm(grants)) {
      setConfirming(grants)
      return
    }
    write(grants, false)
  }

  const buttons = (
    <>
      <AccessButton
        onClick={() => click(true)}
        selected={declared === true}
        disabled={mutation.isPending}
        label="Grants workshop access"
        typeName={typeName}
      />
      <AccessButton
        onClick={() => click(false)}
        selected={declared === false}
        disabled={mutation.isPending}
        label="No workshop access"
        typeName={typeName}
      />
    </>
  )

  const confirmation =
    confirming === null ? null : leavesNothingMarked(confirming) ? (
      <BuiltInListConfirm
        builtInGranted={builtInGranted}
        confirmLabel="Save and use the built-in list"
        onConfirm={() => write(confirming, false)}
        onCancel={() => setConfirming(null)}
      />
    ) : (
      <div
        role="alert"
        className="mt-3 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900"
      >
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          This is the first ticket type marked at this conference.
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          {bridgeGrantedOtherTypes.length > 0 ? (
            <>
              Saving it switches the built-in list off.{' '}
              {quoteNames(bridgeGrantedOtherTypes)} currently{' '}
              {bridgeGrantedOtherTypes.length === 1 ? 'grants' : 'grant'}{' '}
              workshop access through that list and will stop unless marked in
              the same save.
            </>
          ) : (
            <>
              A no on its own marks nothing, so this conference keeps using the
              built-in list, on which “{typeName}” still grants access. To
              revoke it, first mark a type that should grant access.
            </>
          )}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {bridgeGrantedOtherTypes.length > 0 && (
            <button
              type="button"
              onClick={() => write(confirming, true)}
              className="min-h-11 flex-1 basis-40 rounded-md bg-blue-600 px-3 py-2 text-left text-sm font-medium text-white hover:bg-blue-500 sm:max-w-80"
            >
              {confirming
                ? `Mark this type and keep ${quoteNames(bridgeGrantedOtherTypes)}`
                : `Deny this type and keep ${quoteNames(bridgeGrantedOtherTypes)}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => write(confirming, false)}
            className="min-h-11 flex-1 basis-40 rounded-md bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 sm:max-w-80 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            {bridgeGrantedOtherTypes.length > 0
              ? `Only this type: ${quoteNames(bridgeGrantedOtherTypes)} ${bridgeGrantedOtherTypes.length === 1 ? 'loses' : 'lose'} workshop access`
              : 'Save anyway: nothing changes yet'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    )

  if (row) {
    return (
      <div className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-medium wrap-anywhere text-gray-900 dark:text-white">
              {typeName}
            </span>
            {/* The rule's answer, as the server resolved it. While a save is
                on its way to the page the old answer would be a lie. */}
            {mutation.isPending || refreshing ? (
              <StatusBadge label="Saving…" color="gray" />
            ) : (
              <WorkshopAccessBadge
                access={row.access}
                configured={workshopConfigured}
              />
            )}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">{buttons}</div>
        </div>
        {confirmation}
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Grants workshop access?
        </span>
        {declared !== undefined ? (
          <StatusBadge label="Set" color="green" />
        ) : workshopConfigured ? (
          <StatusBadge label="Not set" color="gray" />
        ) : (
          <StatusBadge label="Built-in list" color="yellow" />
        )}
      </div>

      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {workshopConfigured ? (
          declared === true ? (
            <>
              Holders of this type{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                may enter the workshop portal
              </span>{' '}
              and are emailed the sign-in instructions.
            </>
          ) : declared === false ? (
            <>
              An organizer said this type{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                does not grant workshop access
              </span>
              .
            </>
          ) : (
            <>
              This conference marks workshop access per ticket type, and nobody
              has answered for this one, so its holders are told to contact an
              organizer rather than being let in or turned away.
            </>
          )
        ) : (
          <>
            No ticket type is marked for workshop access here, so access still
            comes from the built-in list of type names. On that list, this type{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {bridgeGrantsThisType ? 'grants access' : 'grants no access'}
            </span>
            .
          </>
        )}
      </p>

      {/* THE CLIFF, named before any click can reach it. */}
      {!workshopConfigured && bridgeGrantedOtherTypes.length > 0 && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          The built-in list also grants access to{' '}
          {quoteNames(bridgeGrantedOtherTypes)}. Marking any type here switches
          that list off, and those types stop granting access unless they are
          marked too.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">{buttons}</div>

      {confirmation}

      {/* THE CONSEQUENCE, said before the click rather than after it. */}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Saving this decides who may open the workshop portal and who is emailed
        the sign-in instructions when a ticket is sold.
      </p>
    </div>
  )
}

function AccessButton({
  onClick,
  selected,
  disabled,
  label,
  typeName,
}: {
  onClick: () => void
  selected: boolean
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
      // Equal halves, left-aligned, same shape as the seating control next to
      // it: at phone width both labels wrap, and a centred wrap next to a
      // one-line neighbour reads as two unrelated controls.
      className={`min-h-11 flex-1 basis-40 rounded-md px-3 py-2 text-left text-sm font-medium ring-1 transition-colors disabled:opacity-50 sm:max-w-60 ${
        selected
          ? 'bg-blue-600 text-white ring-blue-600'
          : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'
      }`}
    >
      <span className="block">{label}</span>
    </button>
  )
}
