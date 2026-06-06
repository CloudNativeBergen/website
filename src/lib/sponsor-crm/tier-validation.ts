export const MISSING_TIER_WARNING =
  'Closed-won sponsors should have a tier — they stay hidden from the public site until one is set.'

export const DANGLING_TIER_WARNING =
  'Selected tier no longer exists — choose a valid tier, or the sponsor stays hidden from the public site.'

/**
 * Decides the non-blocking Studio warning for a closed-won sponsor's tier.
 *
 * A closed-won sponsor is hidden from the public site unless it has a tier that
 * actually resolves. That means both a *missing* reference and a *dangling* one
 * (the tier document was deleted) must warn — a dangling ref is still a truthy
 * `{ _ref }` object, so a plain falsiness check would miss it. Existence is
 * injected so this stays pure and testable without the Studio client.
 */
export async function closedWonTierWarning(
  status: string | undefined,
  tierRef: string | undefined,
  tierExists: (ref: string) => Promise<boolean>,
): Promise<true | string> {
  if (status !== 'closed-won') return true
  if (!tierRef) return MISSING_TIER_WARNING
  return (await tierExists(tierRef)) ? true : DANGLING_TIER_WARNING
}
