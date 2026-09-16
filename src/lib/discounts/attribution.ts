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
 * ponytail: substring matching, not a stored relationship. Replacing it means
 * persisting the sponsor→code link on our side (the provider cannot hold it),
 * which is the real fix if collisions ever need to be ALLOWED rather than
 * refused.
 */
export function sponsorOwningCode(
  discountCode: string | null | undefined,
  sponsorNames: readonly string[],
): string | undefined {
  if (!discountCode) return undefined
  const haystack = discountCode.toLowerCase()
  return sponsorNames.find((name) => {
    const needle = name.toLowerCase().replace(/\s+/g, '')
    // An empty or whitespace-only sponsor name would match EVERY code.
    return needle.length > 0 && haystack.includes(needle)
  })
}
