import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * The organization that owns an edition — which decides whose PostHog project
 * the reading comes from. The cron sweeps every tenant in one request, so it
 * cannot resolve the org from the request domain; it asks per conference.
 */
export async function conferenceOrgId(
  conferenceId: string,
): Promise<string | null> {
  const orgId = await clientReadUncached.fetch<string | null>(
    // groq-global-scoped: the tenant predicate IS `_id == $conferenceId` — this
    // reads the conference document itself, which carries no `conference` ref.
    `*[_type == "conference" && _id == $conferenceId][0].organization._ref`,
    { conferenceId },
    { cache: 'no-store' },
  )
  return orgId ?? null
}
