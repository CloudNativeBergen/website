import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

/**
 * Multi-tenant (CaaS T1-1, #613) organization resolution + stamping helpers.
 *
 * These are the ONLY plumbing the creation paths need to be born with the tenant
 * key. Every helper is BEST-EFFORT and non-throwing: if the organization cannot
 * be resolved (a legacy conference lacking `organization` before the 044
 * backfill, a context without a request domain, or any transient error) it
 * returns `null` and the caller simply stamps nothing. Server code MUST tolerate
 * an absent key until the backfill has run.
 */

/** A Sanity reference object suitable for `create`/`patch`. */
interface OrganizationRef {
  _type: 'reference'
  _ref: string
}

/**
 * Build the `organization` reference field for a document being created, or an
 * EMPTY OBJECT when there is no organization to stamp — so callers can always
 * spread the result and an absent org contributes no key:
 *
 *   ...organizationField(orgId)
 */
export function organizationField(
  orgId: string | null | undefined,
): { organization: OrganizationRef } | Record<string, never> {
  if (!orgId) return {}
  return { organization: { _type: 'reference', _ref: orgId } }
}

/** Build a bare organization reference, or `undefined`. */
export function organizationReference(
  orgId: string | null | undefined,
): OrganizationRef | undefined {
  return orgId ? { _type: 'reference', _ref: orgId } : undefined
}

/**
 * The organization ref of the CURRENT-domain conference (its tenant). Used by
 * creation paths for the GLOBAL tenant-scoped types (speaker membership, topic,
 * staff, sponsor, sponsorEmailTemplate) that have no parent document to derive a
 * tenant from and instead take the tenant of the conference they are created in.
 */
export async function getOrganizationRefForCurrentConference(): Promise<
  string | null
> {
  try {
    const { conference, error } = await getConferenceForCurrentDomain()
    if (error) return null
    return conference?.organization?._ref ?? null
  } catch {
    return null
  }
}

/**
 * The organization ref reached transitively through a PARENT document that
 * carries a `conference` reference (a conversation, a sponsorForConference, a
 * travelSupport, …). Used by the denormalized-key TRANSITIVE types (message,
 * conversationPreference, travelExpense, sponsorActivity) so a new child is born
 * carrying the same tenant as the conference two hops up — document-level
 * security (#614) can't traverse references at read time, so the key is copied
 * down at write time.
 */
export async function getOrganizationRefViaParentConference(
  parentId: string | null | undefined,
): Promise<string | null> {
  if (!parentId) return null
  try {
    const ref = await clientReadUncached.fetch<string | null>(
      `*[_id == $parentId][0].conference->organization._ref`,
      { parentId },
    )
    return ref ?? null
  } catch {
    return null
  }
}
