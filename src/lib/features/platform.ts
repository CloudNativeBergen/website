import 'server-only'
import { getPlatformOrgId, resolvePlatformOrgSlug } from '@/lib/authz/platform'
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
 * ── ONE RESOLVER, UNCACHED (RunKonf/platform#36) ────────────────────────────
 *
 * The slug→org resolution happens EXACTLY ONCE, in `getPlatformOrgId()`
 * (`@/lib/authz/platform`), which reads Sanity uncached. Everything here
 * compares ids against that one answer.
 *
 * It used to be derived twice. This module read the org document through the
 * CACHED `getOrganizationById` and compared `org.slug` to the env var, while
 * `getPlatformOrgId()` resolved the same relationship UNCACHED — so the same
 * question got different answers depending on which code path asked, for up to
 * the 24-hour expiry of the cached read. Production has one organization that
 * is both the platform org and a tenant: an admin renaming its slug lost
 * operator standing instantly on one path while the workshops gate — which
 * decides whether attendees get emailed a sign-in link — kept serving on the
 * revoked grant for a day.
 *
 * A cache is not an acceptable input to an authorization decision when a second
 * application can change the underlying document without being able to
 * invalidate it. `POST /api/provisioning/cache/invalidate` now closes that gap
 * for content, but a grant must not depend on a caller remembering to call it,
 * so the identity check reads through.
 *
 * WHAT IT COSTS: one extra `_id`-only Sanity fetch per gate evaluation, not
 * deduplicated within a request (an admin page render that both hides the
 * management card and resolves entitlements pays it twice). That is an indexed
 * point lookup against a document the deployment has exactly one of. If it ever
 * shows up in latency the fix is REQUEST-SCOPED memoization (React `cache()`),
 * which removes the duplicate fetch without reintroducing cross-request
 * staleness — never a `'use cache'` entry.
 *
 * Server-side enforcement lives in the platform router's middleware — the
 * settings page merely also hides the card, which is presentation, not
 * security.
 */

/**
 * Whether the organization with this id IS the platform org. `false` for a
 * missing/unknown org or an unset contract (fail closed, at every step).
 *
 * An ID comparison, not a slug comparison: the id is what `getPlatformOrgId()`
 * already resolves the configured slug to, and routing every caller through it
 * is what makes a second, staler derivation impossible to write by accident.
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
  // Short-circuits before either read when the contract is unset — the common
  // case for deploys that never opt into a platform org.
  if (resolvePlatformOrgSlug() === null) return false
  return isPlatformOrganization(await resolveCurrentOrgId())
}
