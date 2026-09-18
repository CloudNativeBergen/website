'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { StatusBadge } from '@/components/StatusBadge'

/**
 * Whether this ticket type lets its holder into the workshops — declared where
 * the organizer can see the type, instead of only in Sanity Studio.
 *
 * THE CLIFF THIS CONTROL EXISTS TO MAKE VISIBLE. `@/lib/workshop/eligibility`
 * treats a conference as CONFIGURED the moment ANY type declares
 * `grantsWorkshop: true`; from then on the declared set is the whole answer and
 * the historical list of type names is ignored outright (deliberately, and not
 * unioned — a union would keep a renamed type working through the literal,
 * which is the silent breakage the field replaces).
 *
 * So the first-ever toggle-on is a one-way door for every OTHER type: an
 * organizer declaring "Speaker ticket" would, with no further warning, revoke
 * /workshop for everyone holding the two-day pass. Three things answer that,
 * and all three are in this component:
 *
 *  - the current source of truth is named BEFORE the click ("this conference
 *    still uses the historical list"), with the types that list grants;
 *  - the click that would switch the list off is CONFIRMED, and the confirm
 *    names the exact types that would lose access;
 *  - the safe option is the DEFAULT one: carrying those types over in the same
 *    write, so the common path declares one type without stranding the rest.
 *    The write is a single Sanity patch, so the carry-over cannot half-apply.
 *
 * Recovery needs no Studio either: every type is toggleable afterwards, so a
 * type that did lose access is one click from getting it back.
 */
export interface WorkshopAccessControlProps {
  /** The vendor's own type name — what gets written to `ticketTypeRoles`. */
  typeName: string
  /** The declared answer, when a human has already given one. */
  declaredGrantsWorkshop?: boolean
  /** Has ANY type at this conference declared `grantsWorkshop: true`? */
  workshopConfigured: boolean
  /** On the bridge: does the historical list grant access to THIS type? */
  bridgeGrantsThisType?: boolean
  /**
   * On the bridge: the OTHER types the historical list currently grants —
   * exactly the ones that stop granting when this conference declares anything.
   * Resolved on the server, so the legacy list never reaches the browser.
   */
  bridgeGrantedOtherTypes?: readonly string[]
}

const list = (names: readonly string[]) =>
  names.map((name) => `“${name}”`).join(', ')

export function WorkshopAccessControl({
  typeName,
  declaredGrantsWorkshop,
  workshopConfigured,
  bridgeGrantsThisType = false,
  bridgeGrantedOtherTypes = [],
}: WorkshopAccessControlProps) {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [declared, setDeclared] = useState(declaredGrantsWorkshop)
  /** The pending answer while the cliff is being confirmed. */
  const [confirming, setConfirming] = useState<boolean | null>(null)

  const mutation = api.tickets.admin.setWorkshopAccess.useMutation({
    onSuccess: (_data, variables) => {
      router.refresh()
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
   * A click is safe unless it moves this conference off the historical list, or
   * is a denial that the list would quietly overrule.
   */
  const needsConfirm = (grants: boolean) => {
    if (workshopConfigured) return false
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

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Grants workshop access?
        </span>
        {declared !== undefined ? (
          <StatusBadge label="Declared" color="green" />
        ) : workshopConfigured ? (
          <StatusBadge label="Not set" color="gray" />
        ) : (
          <StatusBadge label="Historical list" color="yellow" />
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
              An organizer declared that this type{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                does not grant workshop access
              </span>
              .
            </>
          ) : (
            <>
              This conference declares workshop access per ticket type, and
              nobody has declared this one — so its holders are told to contact
              an organizer rather than being let in or turned away.
            </>
          )
        ) : (
          <>
            Nobody has declared workshop access for any ticket type here, so
            access still comes from the historical list of type names. On that
            list, this type{' '}
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
          The historical list also grants access to{' '}
          {list(bridgeGrantedOtherTypes)}. Declaring ANY type here switches that
          list off, and those types stop granting access unless they are
          declared too.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
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
      </div>

      {confirming !== null && (
        <div className="mt-3 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            This is the first workshop declaration at this conference.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {bridgeGrantedOtherTypes.length > 0 ? (
              <>
                Saving it switches the historical list off.{' '}
                {list(bridgeGrantedOtherTypes)} currently{' '}
                {bridgeGrantedOtherTypes.length === 1 ? 'grants' : 'grant'}{' '}
                workshop access through that list and will stop unless declared
                in the same save.
              </>
            ) : (
              <>
                Saving a denial on its own declares nothing, so this conference
                keeps using the historical list — on which “{typeName}” still
                grants access. To actually revoke it, declare a type that should
                grant access first.
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
                  ? `Declare this type and keep ${list(bridgeGrantedOtherTypes)}`
                  : `Deny this type and keep ${list(bridgeGrantedOtherTypes)}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => write(confirming, false)}
              className="min-h-11 flex-1 basis-40 rounded-md bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 sm:max-w-80 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
            >
              {bridgeGrantedOtherTypes.length > 0
                ? `Only this type — ${list(bridgeGrantedOtherTypes)} lose workshop access`
                : 'Save anyway — nothing changes yet'}
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
      )}

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
