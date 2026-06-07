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
/**
 * GROQ to test whether a sponsor tier reference resolves to a real tier the
 * public site can see. Published-only: a draft-only tier is invisible to the
 * front-end (which reads the published perspective), so it must NOT count as
 * existing — otherwise a closed-won sponsor pointing at it stays silently
 * hidden. The drafts prefix on the incoming ref is normalised away. Shared by
 * the Studio warning and the tRPC create/update guards so all paths agree on
 * one definition of "resolvable tier".
 */
export function tierExistenceQuery(ref: string): {
  query: string
  params: { id: string }
} {
  return {
    query: 'count(*[_type == "sponsorTier" && _id == $id]) > 0',
    params: { id: ref.replace(/^drafts\./, '') },
  }
}

export async function closedWonTierError(
  status: string | undefined,
  tierRef: string | undefined,
  tierExists: (ref: string) => Promise<boolean>,
): Promise<true | string> {
  if (status !== 'closed-won') return true
  if (!tierRef) return MISSING_TIER_WARNING
  return (await tierExists(tierRef)) ? true : DANGLING_TIER_WARNING
}
