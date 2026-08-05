import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'
import {
  buildLegalConfig,
  type LegalConfig,
  type OrganizationLegalFields,
} from './config'

/**
 * Best-effort fetch of the legal-identity fields from the tenant's organization
 * document. Non-throwing: a legacy conference lacking an `organization` ref, or
 * any transient error, resolves to `null` so `buildLegalConfig` falls back to
 * the conference/Norway defaults.
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
): Promise<OrganizationLegalFields | null> {
  if (!orgRef) return null
  try {
    return await clientReadUncached.fetch<OrganizationLegalFields | null>(
      // groq-global-scoped: `orgRef` is the request conference's OWN
      // `organization._ref` (see `resolveLegalConfig`, whose only input is the
      // conference already resolved for the request host). The id read here IS
      // the tenant, so the read cannot reach another one.
      `*[_id == $id][0]{
        name,
        contactEmail,
        legalJurisdiction,
        supervisoryAuthority
      }`,
      { id: orgRef },
    )
  } catch {
    return null
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
  const org = await fetchOrganizationLegal(conference?.organization?._ref)
  return buildLegalConfig(conference, org)
}
