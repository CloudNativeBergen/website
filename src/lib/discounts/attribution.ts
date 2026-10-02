/**
 * Which sponsor a discount code belongs to.
 *
 * The ticketing provider stores no link between a code and a sponsor, so the
 * admin panel infers one from the STRING: a code is a sponsor's when it
 * contains that sponsor's name with spaces removed, case-insensitively. That is
 * how `generateDiscountCode` mints them (`Acme Cloud` → `ACMECLOUD1234`).
 *
 * The rule is a heuristic and it is load-bearing in both directions, which is
 * why it lives in ONE function that the panel, the create form and the server
 * all call. A sponsor row uses it to find its code, its entitlement usage, its
 * "send email" target and its delete target — so a code that matches a sponsor
 * by accident does not merely display oddly, it TAKES OVER that sponsor's row:
 * the row reports the wrong redemptions, stops offering to create the real
 * comp, and aims the email and delete actions at the wrong code. Short sponsor
 * names ("NDC", "AI") make that easy to hit with an organizer-typed code.
 *
 * Standalone codes are therefore REFUSED when this returns a sponsor — in
 * `tickets.createDiscountCode`, with the form warning first as an affordance.
 *
 * THE STORED LINK OUTRANKS THE GUESS (#1262). Codes an organizer sends or
 * assigns are recorded on `sponsorForConference.discountCodes`, and a sponsor
 * that stores any code is matched ONLY by what it stores — never by its name.
 * The heuristic survives as the fallback for sponsors with nothing stored, so
 * codes minted before the link existed keep their rows. Every consumer passes
 * claimants (name AND stored codes) through this one function, so the panel,
 * the create guard, the entitlement count and ticket classification agree.
 */
export interface SponsorCodeClaimant {
  name: string
  /** The sponsor's stored codes. Non-empty ⇒ the name heuristic is off for it. */
  linkedCodes?: readonly string[]
}

/** The comparison form of a code: provider codes are case-insensitive. */
export function normalizeDiscountCode(code: string): string {
  return code.trim().toUpperCase()
}

export function sponsorOwningCode<T extends SponsorCodeClaimant>(
  discountCode: string | null | undefined,
  sponsors: readonly T[],
): T | undefined {
  if (!discountCode) return undefined
  const wanted = normalizeDiscountCode(discountCode)
  const stored = sponsors.find((s) =>
    s.linkedCodes?.some((c) => normalizeDiscountCode(c) === wanted),
  )
  if (stored) return stored
  return nameClaimants(discountCode, sponsors)[0]
}

/**
 * Every sponsor the NAME heuristic would give this code to — only sponsors
 * that store nothing, in list order. More than one means the heuristic's
 * answer is an accident of order (`AI` inside `AICORP1234`): fine to display,
 * never a fact to store (see `codesToAdopt`).
 */
export function nameClaimants<T extends SponsorCodeClaimant>(
  discountCode: string,
  sponsors: readonly T[],
): T[] {
  const haystack = discountCode.toLowerCase()
  return sponsors.filter((s) => {
    if (s.linkedCodes && s.linkedCodes.length > 0) return false
    const needle = s.name.toLowerCase().replace(/\s+/g, '')
    // An empty or whitespace-only sponsor name would match EVERY code.
    return needle.length > 0 && haystack.includes(needle)
  })
}

/**
 * Why a standalone code is refused, for the create form and the server alike:
 * the code is a sponsor's STORED code, or it contains a sponsor's name.
 */
export function claimRefusal(
  discountCode: string,
  claimant: SponsorCodeClaimant,
): string {
  const wanted = normalizeDiscountCode(discountCode)
  return claimant.linkedCodes?.some((c) => normalizeDiscountCode(c) === wanted)
    ? `"${discountCode}" is already linked to ${claimant.name}. Choose another code.`
    : `"${discountCode}" contains the sponsor name "${claimant.name}", so it would be counted against that sponsor's tickets. Choose a code that does not contain a sponsor's name.`
}
