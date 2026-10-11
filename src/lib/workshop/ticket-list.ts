import {
  typeKey,
  workshopAccessOf,
  type TicketTypeRole,
  type WorkshopAccess,
} from '@/lib/tickets/classification'

/**
 * The workshop-ticket list as an organizer sees it (#1332): the provider's
 * ticket types, each with the answer `workshopAccessOf` gives its holders, and
 * the entries no ticket type matches any more.
 *
 * NO SECOND RULE. Every answer is `workshopAccessOf`'s and every name is
 * matched with `typeKey`, so the page shows what the portal decides. Built on
 * the server: the built-in list of names never reaches the browser, only the
 * provider types it grants.
 */
export interface WorkshopTicketType {
  /** The provider's own spelling: what is shown, and what a save writes. */
  typeName: string
  /** What the rule decides for a holder of this type right now. */
  access: WorkshopAccess
  /** The stored answer, when somebody gave one. Absent is "not set". */
  stored?: boolean
  /**
   * This type's entry is the only one that grants. Answering no for it leaves
   * no granting entry, which brings the built-in list back.
   */
  lastGranting: boolean
}

/** A stored workshop answer whose `typeName` matches no provider type. */
export interface OrphanedWorkshopEntry {
  typeName: string
  grantsWorkshop: boolean
  /** Removing it leaves no granting entry. */
  lastGranting: boolean
}

export interface WorkshopTicketList {
  /** Has any entry marked a type as granting? Otherwise the built-in list decides. */
  configured: boolean
  types: WorkshopTicketType[]
  /**
   * The provider types the built-in list grants: who gets in while nothing is
   * marked, and who gets in again if the last granting entry goes.
   */
  builtInGranted: string[]
  orphaned: OrphanedWorkshopEntry[]
}

export function buildWorkshopTicketList(
  typeNames: readonly string[],
  ticketTypeRoles?: readonly TicketTypeRole[] | null,
): WorkshopTicketList {
  const roles = ticketTypeRoles ?? []
  const granting = new Set(
    roles.filter((r) => r.grantsWorkshop === true).map((r) => typeKey(r.typeName)),
  )
  const lastGranting = (name: string) =>
    granting.size === 1 && granting.has(typeKey(name))

  // The first entry for a name is the one the rule reads.
  const answers = new Map<string, TicketTypeRole>()
  for (const role of roles) {
    const key = typeKey(role.typeName)
    if (key && !answers.has(key)) answers.set(key, role)
  }
  const listed = new Set(typeNames.map(typeKey))

  return {
    configured: granting.size > 0,
    types: typeNames.map((typeName) => {
      const stored = answers.get(typeKey(typeName))?.grantsWorkshop
      return {
        typeName,
        access: workshopAccessOf(typeName, roles),
        ...(typeof stored === 'boolean' && { stored }),
        lastGranting: lastGranting(typeName),
      }
    }),
    // With no roles the rule answers from the built-in list alone.
    builtInGranted: typeNames.filter(
      (name) => workshopAccessOf(name, []) === 'granted',
    ),
    // An entry that only answers the seating question is not a workshop
    // answer: there is nothing here to remove from it.
    orphaned: [...answers.entries()].flatMap(([key, role]) =>
      !listed.has(key) && typeof role.grantsWorkshop === 'boolean'
        ? [
            {
              typeName: role.typeName,
              grantsWorkshop: role.grantsWorkshop,
              lastGranting: lastGranting(role.typeName),
            },
          ]
        : [],
    ),
  }
}
