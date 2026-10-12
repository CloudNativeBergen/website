import {
  marksWorkshopAccess,
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
  /** The built-in list grants this type, whatever is marked. */
  builtInGrants: boolean
  /**
   * While nothing is marked: the OTHER types the built-in list grants and
   * nobody has answered no for. They stop granting when this type is the first
   * one marked, and a carry-over marks them in the same save. One spelling per
   * type, and never this type's own. Empty once a type is marked.
   */
  builtInGrantedOthers: string[]
  /**
   * While nothing is marked: the OTHER types the built-in list grants although
   * somebody answered no for them (the list overrules a no until a type is
   * marked). The first mark makes that no take effect. Never carried over: a
   * carry-over must not overwrite a stored answer.
   */
  builtInGrantedOthersSetToNo: string[]
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
  const configured = marksWorkshopAccess(roles)
  // Taking this name's entries away leaves nothing marked: the question the
  // save asks of the stored document, asked here of the same roles.
  const lastGranting = (name: string) =>
    configured &&
    !marksWorkshopAccess(
      roles.filter((role) => typeKey(role.typeName) !== typeKey(name)),
    )

  // The first entry for a name is the one the rule reads.
  const answers = new Map<string, TicketTypeRole>()
  for (const role of roles) {
    const key = typeKey(role.typeName)
    if (key && !answers.has(key)) answers.set(key, role)
  }
  const listed = new Set(typeNames.map(typeKey))

  // With no roles the rule answers from the built-in list alone.
  const builtInGranted = typeNames.filter(
    (name) => workshopAccessOf(name, []) === 'granted',
  )
  // One spelling per type, the first: the carry-over is saved as one batch,
  // and the save refuses a batch that names a type twice.
  const builtInOnce = new Map<string, string>()
  for (const name of builtInGranted) {
    if (!builtInOnce.has(typeKey(name))) builtInOnce.set(typeKey(name), name)
  }
  /** The other built-in-granted types, with or without a stored no. */
  const builtInOthers = (key: string, setToNo: boolean) =>
    configured
      ? []
      : [...builtInOnce].flatMap(([other, name]) =>
          other !== key &&
          (answers.get(other)?.grantsWorkshop === false) === setToNo
            ? [name]
            : [],
        )

  return {
    configured,
    types: typeNames.map((typeName) => {
      const key = typeKey(typeName)
      const stored = answers.get(key)?.grantsWorkshop
      return {
        typeName,
        access: workshopAccessOf(typeName, roles),
        ...(typeof stored === 'boolean' && { stored }),
        lastGranting: lastGranting(typeName),
        builtInGrants: builtInOnce.has(key),
        builtInGrantedOthers: builtInOthers(key, false),
        builtInGrantedOthersSetToNo: builtInOthers(key, true),
      }
    }),
    builtInGranted,
    // AN ORPHAN IS LOOKED FOR ACROSS EVERY SPELLING of a name the provider
    // does not list, not only in the first entry: a later spelling's grant
    // still keeps the conference off the built-in list, and with no row for
    // the type there would be nothing to remove it with. It grants if any
    // spelling does, which is all the entries of an unlisted name still
    // decide. A name whose spellings only answer the seating question is not
    // a workshop answer: there is nothing here to remove from it. And a
    // provider that lists NO types says nothing about which entries are
    // orphaned: every one would look it, so none is called it.
    orphaned:
      typeNames.length === 0
        ? []
        : [...answers.entries()].flatMap(([key, first]) => {
            if (listed.has(key)) return []
            const answered = roles.filter(
              (role) =>
                typeKey(role.typeName) === key &&
                typeof role.grantsWorkshop === 'boolean',
            )
            return answered.length === 0
              ? []
              : [
                  {
                    typeName: first.typeName,
                    grantsWorkshop: marksWorkshopAccess(answered),
                    lastGranting: lastGranting(first.typeName),
                  },
                ]
          }),
  }
}
