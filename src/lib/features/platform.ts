import 'server-only'
import { getOrganizationById } from '@/lib/organization/sanity'
import { resolveCurrentOrgId } from '@/lib/authz/organizer'

/**
 * PLATFORM-organization identification for cross-tenant management surfaces
 * (the entitlements management card + `platform` tRPC router).
 *
 * There is no superadmin role in the codebase — the only "platform" concept is
 * the brand-fallback `PLATFORM_NAME` label (`src/lib/branding/platform.ts`),
 * which identifies no tenant. So the CONTRACT is env-based:
 *
 * - `PLATFORM_ORG_SLUG` names the slug of the ONE organization whose
 *   organizers may manage other organizations' plans and feature overrides.
 * - UNSET (the default) means NO org is the platform org: every platform
 *   surface stays hidden and every platform procedure fails closed. Deploys
 *   that never set the variable are therefore unaffected by this module.
 * - The check compares the REQUEST-resolved org (domain conference → its
 *   `organization` ref, never client input) against that slug, so it composes
 *   with the org-scoped organizer waist: platform access = organizer of the
 *   platform org, on the platform org's own domain.
 *
 * Server-side enforcement lives in the platform router's middleware — the
 * settings page merely also hides the card, which is presentation, not
 * security.
 */

/** The configured platform org slug, or `null` when the contract is unset. */
export function platformOrgSlug(): string | null {
  const slug = process.env.PLATFORM_ORG_SLUG?.trim()
  return slug ? slug : null
}

/** PURE slug comparison against the `PLATFORM_ORG_SLUG` contract. */
export function isPlatformOrgSlug(slug: string | null | undefined): boolean {
  const configured = platformOrgSlug()
  return configured !== null && !!slug && slug === configured
}

/**
 * Whether the organization with this id IS the platform org. Uses the cached,
 * `organizationTag`-tagged org read; `false` for a missing/unknown org or an
 * unset contract.
 */
export async function isPlatformOrganization(
  orgId: string | null | undefined,
): Promise<boolean> {
  if (!orgId || platformOrgSlug() === null) return false
  const org = await getOrganizationById(orgId)
  return isPlatformOrgSlug(org?.slug)
}

/**
 * Whether the CURRENT request's domain-resolved org is the platform org (the
 * settings page uses this to decide whether to render the management card).
 */
export async function isPlatformOrgRequest(): Promise<boolean> {
  if (platformOrgSlug() === null) return false
  const orgId = await resolveCurrentOrgId()
  return isPlatformOrganization(orgId)
}
