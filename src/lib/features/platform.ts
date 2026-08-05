import 'server-only'
import { getPlatformOrgId, resolvePlatformOrgId } from '@/lib/authz/platform'
import { resolveCurrentOrgId } from '@/lib/authz/organizer'

/**
 * PLATFORM-organization identification for cross-tenant management surfaces
 * (the entitlements management card, the `platform` tRPC router, the workshops
 * gate).
 *
 * There is no superadmin role in the codebase — the only "platform" concept is
 * the brand-fallback `PLATFORM_NAME` label (`src/lib/branding/platform.ts`),
 * which identifies no tenant. So the CONTRACT is env-based:
 *
 * - `PLATFORM_ORG_ID` is the stable document id of the ONE organization whose
 *   organizers may manage other organizations' plans and feature overrides.
 * - UNSET (the default) means NO org is the platform org: every platform
 *   surface stays hidden and every platform procedure fails closed. Deploys
 *   that never set the variable are therefore unaffected by this module.
 * - The check compares the REQUEST-resolved org id (domain conference → its
 *   `organization` ref, never client input) against `PLATFORM_ORG_ID`, so it
 *   composes with the org-scoped organizer waist: platform access = organizer
 *   of the platform org, on the platform org's own domain.
 *
 * ── ONE RESOLVER, NO READ (RunKonf/platform#36, #43) ────────────────────────
 *
 * Platform standing resolves through `getPlatformOrgId()`
 * (`@/lib/authz/platform`) and NOTHING else; everything here compares ids
 * against that one answer. Since #43 the answer is the configured `_id` itself —
 * pure env, no Sanity read at all.
 *
 * It used to key on the SLUG. `PLATFORM_ORG_SLUG` was resolved to an id by an
 * uncached Sanity lookup on `slug.current`, and the slug is a customer-writable
 * field (edited through kontroll). An authorization grant must not hinge on a
 * mutable field: an org renaming itself, or a second org grabbing the old slug,
 * could silently move operator standing. Binding to the immutable `_id` removes
 * both that hazard and the per-request read the slug lookup needed — there is no
 * cache to go stale and no document to fetch, so no staleness window exists.
 *
 * Server-side enforcement lives in the platform router's middleware — the
 * settings page merely also hides the card, which is presentation, not
 * security.
 */

/**
 * Whether the organization with this id IS the platform org. `false` for a
 * missing/unknown org or an unset contract (fail closed, at every step).
 *
 * A pure id comparison against the configured `PLATFORM_ORG_ID`, routed through
 * `getPlatformOrgId()` so no second derivation can be written by accident.
 */
export async function isPlatformOrganization(
  orgId: string | null | undefined,
): Promise<boolean> {
  if (!orgId) return false
  const platformOrgId = await getPlatformOrgId()
  return platformOrgId !== null && orgId === platformOrgId
}

/**
 * Whether the CURRENT request's domain-resolved org is the platform org (the
 * settings page uses this to decide whether to render the management card).
 */
export async function isPlatformOrgRequest(): Promise<boolean> {
  // Short-circuits before resolving the request org when the contract is unset —
  // the common case for deploys that never opt into a platform org.
  if (resolvePlatformOrgId() === null) return false
  return isPlatformOrganization(await resolveCurrentOrgId())
}
