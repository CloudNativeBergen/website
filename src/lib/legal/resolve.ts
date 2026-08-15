import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'
import {
  buildLegalConfig,
  type LegalConfig,
  type OrganizationLegalFields,
} from './config'

/**
 * How the organization's legal-identity read resolved — the seam that makes
 * "we could not find out" REPRESENTABLE (#848, same shape as
 * `ConferenceResolutionStatus`).
 *
 *  - `ok`          — the document was read.
 *  - `absent`      — no `organization` ref, or the read SUCCEEDED and matched
 *                    nothing. A statement about the world.
 *  - `unavailable` — the read FAILED. Nothing about the controller's identity
 *                    may be asserted from it.
 */
export type OrganizationLegalRead =
  | { status: 'ok'; org: OrganizationLegalFields }
  | { status: 'absent' }
  | { status: 'unavailable' }

/**
 * Fetch the legal-identity fields from the tenant's organization document.
 *
 * NON-THROWING but no longer LOSSY. It used to answer a rejected read with the
 * same `null` as a legacy conference that has no organization at all, and
 * `buildLegalConfig` then fell through to `PLATFORM_NAME` — publishing the
 * PLATFORM as the data controller of a customer's event for the length of an
 * outage. The status distinguishes the two so the pages can say "could not be
 * confirmed" instead of naming the wrong entity.
 *
 * This read is UNCACHED and therefore carries no tag of its own: it reaches the
 * organization by a second fetch on `organization._ref` rather than a GROQ
 * `organization->` deref, so nothing about it is visible to a tag audit of the
 * conference query. Every `'use cache'` scope that calls `resolveLegalConfig`
 * must therefore tag `organizationTag(conference.organization._ref)` itself, or
 * an organization rename never reaches the page. That is asserted at every call
 * site by `organization-tag-coverage.test.ts`.
 */
async function fetchOrganizationLegal(
  orgRef: string | null | undefined,
): Promise<OrganizationLegalRead> {
  if (!orgRef) return { status: 'absent' }
  try {
    const org = await clientReadUncached.fetch<OrganizationLegalFields | null>(
      // groq-global-scoped: `orgRef` is the request conference's OWN
      // `organization._ref` (see `resolveLegalConfig`, whose only input is the
      // conference already resolved for the request host). The id read here IS
      // the tenant, so the read cannot reach another one.
      // EVERY KEY OF `OrganizationLegalFields` MUST APPEAR HERE. A field left
      // out of a GROQ projection is `undefined`, not an error, so dropping one
      // degrades the controller identity in silence — `legalEntityName` in
      // particular would simply fall back to the display name and publish the
      // wrong legal person. `organization-legal-projection.test.ts` asserts
      // this list against the interface.
      `*[_id == $id][0]{
        name,
        legalEntityName,
        contactEmail,
        legalJurisdiction,
        supervisoryAuthority
      }`,
      { id: orgRef },
    )
    return org ? { status: 'ok', org } : { status: 'absent' }
  } catch (error) {
    console.error(
      `[legal] organization read failed for ${orgRef}; the controller identity is UNCONFIRMED and must not be filled in with a default`,
      error,
    )
    return { status: 'unavailable' }
  }
}

/**
 * Resolve the tenant-driven {@link LegalConfig} for a conference: dereference
 * its organization for the legal-identity overrides, then merge with the
 * conference/Norway defaults.
 */
export async function resolveLegalConfig(
  conference: Conference | null | undefined,
): Promise<LegalConfig> {
  const read = await fetchOrganizationLegal(conference?.organization?._ref)
  return buildLegalConfig(conference, read.status === 'ok' ? read.org : null, {
    organizationReadFailed: read.status === 'unavailable',
  })
}
