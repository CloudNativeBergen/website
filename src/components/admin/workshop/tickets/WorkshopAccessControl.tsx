'use client'

import { useId, useRef, useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import type { WorkshopTicketType } from '@/lib/workshop/ticket-list'
import { BuiltInListConfirm } from './BuiltInListConfirm'
import { WorkshopAccessBadge } from './WorkshopAccessBadge'
import { quoteNames } from './names'
import { useSaveWorkshopAccess } from './useSaveWorkshopAccess'

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
 * And one trap: A NO WHILE NOTHING IS SET TO GRANT BLOCKS NOBODY. Only a type
 * set to grant access takes a conference off the built-in list, so a No for a
 * type that list lets in leaves its holders signing up. That click is
 * confirmed as well, and says so. A carry-over never names a type that holds a
 * stored No: it would overwrite it.
 *
 * Recovery needs no Studio either: every type stays toggleable afterwards.
 *
 * Everything about the type and the list comes from the server
 * (`buildWorkshopTicketList`): the built-in list of names never reaches the
 * browser, and no name is matched here.
 */
export interface WorkshopAccessControlProps {
  /** This ticket type, as the server-built list describes it. */
  type: WorkshopTicketType
  /** Has ANY type at this conference been marked as granting? */
  configured: boolean
  /**
   * Every type the built-in list grants, this one included: who gets in again
   * if the last mark goes.
   */
  builtInGranted: readonly string[]
  /**
   * Render as one row of the "Workshop tickets" list: the type's name, the
   * rule's answer for its holders, and the two buttons. The surrounding
   * section carries the explanation.
   */
  row?: boolean
}

export function WorkshopAccessControl({
  type,
  configured,
  builtInGranted,
  row = false,
}: WorkshopAccessControlProps) {
  const {
    typeName,
    lastGranting,
    builtInGrantedOthers: others,
    builtInGrantedOthersSetToNo: setToNo,
  } = type
  /** While nothing is set to grant: the built-in list lets this type in. */
  const builtInGrantsThis = !configured && type.builtInGrants
  /**
   * Other types the built-in list lets in although they hold a stored No. A
   * carry-over never names them (it would overwrite the No), so the question
   * says what becomes of them.
   */
  const alsoBlocked =
    setToNo.length > 0
      ? ` ${quoteNames(setToNo)} ${setToNo.length === 1 ? 'is' : 'are'} already set to No: ${setToNo.length === 1 ? 'its' : 'their'} holders are blocked too when the built-in list goes off.`
      : ''

  const [answer, setAnswer] = useState(type.stored)
  /** The pending answer while a cliff is being confirmed. */
  const [confirming, setConfirming] = useState<boolean | null>(null)
  /** The last stored answer this control has adopted, so a CHANGE can be spotted. */
  const [synced, setSynced] = useState(type.stored)
  /** Ties the row to its answer, so the group reads "Student, Not set". */
  const answerId = useId()
  /** The button that opened the question: focus returns to it. */
  const opener = useRef<HTMLButtonElement | null>(null)

  const { busy, pending, save } = useSaveWorkshopAccess({
    failed: {
      title: 'Could not save',
      message: 'Failed to save workshop access.',
    },
    onError: () => setAnswer(type.stored),
  })

  /**
   * THE CARRY-OVER WRITES OTHER CARDS. One save marks several types, so every
   * carried card's stored answer arrives changed after the refresh while its
   * own `answer` state still holds the `undefined` it was mounted with — it
   * would keep saying "Not set", with neither button pressed, until a full
   * navigation. That is the flow that exists to stop an organizer stranding
   * types; it must not look like it failed.
   *
   * Keyed on the stored answer CHANGING, not on its value, so the card being
   * saved keeps its optimistic answer while its own stale prop is still in
   * flight — and skipped entirely while this card has a write outstanding, so
   * somebody else's refresh cannot overwrite an answer this organizer just
   * clicked.
   */
  if (synced !== type.stored && !pending) {
    setSynced(type.stored)
    setAnswer(type.stored)
  }

  /** A no for the last granting type hands the decision back to the built-in list. */
  const leavesNothingMarked = (grants: boolean) =>
    configured && lastGranting && !grants

  /**
   * A click is safe unless it moves this conference off the built-in list, back
   * onto it, or is a no that the list would quietly overrule.
   */
  const needsConfirm = (grants: boolean) => {
    if (configured) return leavesNothingMarked(grants)
    return grants ? others.length > 0 : builtInGrantsThis
  }

  const write = (grants: boolean, carryOthers: boolean) => {
    // The question (if one was open) closes: back to the button that asked.
    if (confirming !== null) opener.current?.focus()
    setConfirming(null)
    setAnswer(grants)

    const carried = carryOthers ? others.length : 0
    const keeps =
      carried > 0
        ? ` ${carried} other ticket ${carried === 1 ? 'type keeps' : 'types keep'} it.`
        : ''
    // WHAT THE SAVE DOES, not what was clicked. After a No that sets no type
    // to grant access, and with no other type granting, the built-in list
    // decides, whatever this type's stored answer says.
    const builtInListDecides =
      !grants && carried === 0 && (!configured || lastGranting)
    save(
      {
        // THIS type first: it is the answer the organizer gave.
        updates: [
          { typeName, grantsWorkshop: grants },
          ...(carryOthers
            ? others.map((name) => ({ typeName: name, grantsWorkshop: true }))
            : []),
        ],
        // Only ever sent from the confirmation that named the consequence.
        ...(leavesNothingMarked(grants) && { allowBuiltInList: true }),
      },
      {
        title: 'Workshop access saved',
        message: !builtInListDecides
          ? `“${typeName}” ${grants ? 'now grants' : 'no longer grants'} workshop access.${keeps}`
          : type.builtInGrants
            ? `Saved, but “${typeName}” holders can still sign up until a ticket type is set to grant access.`
            : 'Saved. No ticket type is set to grant access, so the built-in list decides who can sign up.',
      },
    )
  }

  const click = (grants: boolean, button: HTMLButtonElement) => {
    if (busy) return
    if (needsConfirm(grants)) {
      opener.current = button
      setConfirming(grants)
      return
    }
    write(grants, false)
  }

  const cancel = () => {
    setConfirming(null)
    opener.current?.focus()
  }

  const buttons = (
    <>
      <AccessButton
        onClick={(button) => click(true, button)}
        selected={answer === true}
        unavailable={busy}
        label="Grants workshop access"
        typeName={typeName}
        inRow={row}
      />
      <AccessButton
        onClick={(button) => click(false, button)}
        selected={answer === false}
        unavailable={busy}
        label="No workshop access"
        typeName={typeName}
        inRow={row}
      />
    </>
  )

  const confirmation =
    confirming === null ? null : leavesNothingMarked(confirming) ? (
      <BuiltInListConfirm
        builtInGranted={builtInGranted}
        confirmLabel="Save and use the built-in list"
        onConfirm={() => write(confirming, false)}
        onCancel={cancel}
      />
    ) : (
      <div
        role="alert"
        className="mt-3 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900"
      >
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          {confirming
            ? 'This is the first ticket type set to grant access.'
            : `This No won’t block “${typeName}” yet.`}
        </p>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          {confirming
            ? `Saving it switches the built-in list off. Holders of ${quoteNames(others)} sign up through that list today, and are blocked unless ${others.length === 1 ? 'that type is' : 'those types are'} set to grant access in the same save.`
            : `Until a ticket type is set to grant access, the built-in list decides, and it lets “${typeName}” holders sign up. ${
                others.length > 0
                  ? `Set ${quoteNames(others)} to grant access in the same save and the No takes effect.`
                  : 'The No takes effect once a ticket type is set to grant access.'
              }`}
          {alsoBlocked}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {others.length > 0 && (
            <button
              type="button"
              onClick={() => write(confirming, true)}
              className="min-h-11 flex-1 basis-40 rounded-md bg-blue-600 px-3 py-2 text-left text-sm font-medium text-white hover:bg-blue-500 sm:max-w-80"
            >
              {confirming
                ? `Grant “${typeName}”, keep ${quoteNames(others)}`
                : `Block “${typeName}”, keep ${quoteNames(others)}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => write(confirming, false)}
            className="min-h-11 flex-1 basis-40 rounded-md bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 sm:max-w-80 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            {confirming
              ? `Grant “${typeName}” only, block ${quoteNames(others)}`
              : 'Save the No, block nothing yet'}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    )

  if (row) {
    return (
      <div
        role="group"
        aria-label={typeName}
        aria-describedby={answerId}
        className="py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-medium wrap-anywhere text-gray-900 dark:text-white">
              {typeName}
            </span>
            {/* The rule's answer, as the server resolved it. While a save is
                on its way to the page the old answer would be a lie. */}
            <span id={answerId} className="inline-flex">
              {busy ? (
                <StatusBadge label="Saving…" color="gray" />
              ) : (
                <WorkshopAccessBadge
                  access={type.access}
                  configured={configured}
                />
              )}
            </span>
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
        {answer !== undefined ? (
          <StatusBadge label="Set" color="green" />
        ) : configured ? (
          <StatusBadge label="Not set" color="gray" />
        ) : (
          <StatusBadge label="Built-in list" color="yellow" />
        )}
      </div>

      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {configured ? (
          answer === true ? (
            <>
              Holders of this type{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                may enter the workshop portal
              </span>{' '}
              and are emailed the sign-in instructions.
            </>
          ) : answer === false ? (
            <>
              An organizer said this type{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                does not grant workshop access
              </span>
              .
            </>
          ) : (
            <>
              This conference sets workshop access per ticket type, and nobody
              has answered for this one, so its holders are told to contact an
              organizer rather than being let in or turned away.
            </>
          )
        ) : (
          <>
            No ticket type is set to grant access here, so the built-in list
            decides. On that list, this type{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {builtInGrantsThis ? 'grants access' : 'grants no access'}
            </span>
            .
          </>
        )}
      </p>

      {/* THE CLIFF, named before any click can reach it. */}
      {others.length > 0 && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          The built-in list also grants access to {quoteNames(others)}. Setting
          any type to grant access switches that list off, and those types stop
          granting access unless they are set to grant access too.
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
  unavailable,
  label,
  typeName,
  inRow,
}: {
  onClick: (button: HTMLButtonElement) => void
  selected: boolean
  /** A save is on its way: the button stays focusable and does nothing. */
  unavailable: boolean
  label: string
  typeName: string
  /** In a list row the pair sits beside the name and keeps to one line. */
  inRow: boolean
}) {
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      // NOT `disabled`: a disabled button drops the focus it holds, and focus
      // is returned here after a confirmation. The click handler ignores it.
      aria-disabled={unavailable}
      aria-pressed={selected}
      aria-label={`${label} — "${typeName}"`}
      // Equal halves, left-aligned, same shape as the seating control next to
      // it: at phone width both labels wrap, and a centred wrap next to a
      // one-line neighbour reads as two unrelated controls.
      className={`min-h-11 flex-1 basis-40 rounded-md px-3 py-2 text-left text-sm font-medium ring-1 transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:max-w-60 ${
        inRow ? 'sm:flex-none sm:basis-auto sm:whitespace-nowrap' : ''
      } ${
        selected
          ? 'bg-blue-600 text-white ring-blue-600'
          : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'
      }`}
    >
      <span className="block">{label}</span>
    </button>
  )
}
