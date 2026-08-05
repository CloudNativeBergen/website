import 'server-only'
import type { Speaker } from '@/lib/speaker/types'

/**
 * PLATFORM-OPERATOR authorization (onboarding S1/S2, RunKonf/platform#4).
 *
 * Tenant creation is a CONCIERGE, platform-operator-only surface: there is no
 * public signup and no billing entity yet, so the operator creates tenants on
 * behalf of new organizations. Until a first-class platform-org concept lands
 * (with the entitlements work), the platform org is designated by ENV:
 * `PLATFORM_ORG_ID` is the stable document id of the organization whose
 * organizers ARE the platform operators.
 *
 * WHY THE ID, NOT THE SLUG (RunKonf/platform#43). Platform-operator standing is
 * the highest privilege in the system, so it must not hinge on a MUTABLE field.
 * A slug is customer-writable through kontroll: an org that renamed itself, or a
 * second org that grabbed the old slug, could silently gain or lose operator
 * standing. The document `_id` is immutable, so the contract binds to it and to
 * nothing a tenant can edit. This also removes the per-request Sanity read the
 * slug lookup needed — the id IS the answer, so the resolver is pure env.
 *
 * THE MODEL. A caller is a platform operator iff their session token's
 * `organizerOrgIds` contains `PLATFORM_ORG_ID`. Like the tenant-admin waist
 * (`isOrganizerForOrg`) it reads `organizerOrgIds` and nothing else — a pre-#635
 * token (no `organizerOrgIds`) is DENIED even when the deprecated global
 * `isOrganizer` flag is set, since that flag is true for an organizer of ANY org
 * and must never mint cross-tenant creation powers. Operators on legacy tokens
 * simply re-login once. It FAILS CLOSED on every unresolvable input: env unset or
 * blank → deny.
 */

/** The minimum shape the platform check reads off a session speaker. */
type PlatformSpeaker = Pick<Speaker, '_id' | 'organizerOrgIds'>

/**
 * The configured platform-org document id, or `null` when the surface is
 * disabled (env unset / blank). Pure env read — no Sanity access.
 */
export function resolvePlatformOrgId(): string | null {
  const id = process.env.PLATFORM_ORG_ID?.trim()
  return id ? id : null
}

/**
 * The platform organization's document id, or `null` (env unset / blank — deny
 * downstream). Kept `async` so its ~6 call sites need no churn; there is NO
 * Sanity read — the id is configuration, so this just wraps
 * {@link resolvePlatformOrgId}.
 */
export async function getPlatformOrgId(): Promise<string | null> {
  return resolvePlatformOrgId()
}

/**
 * PURE platform-operator decision for an already-resolved platform org id.
 * STRICT membership only — fail closed on `null`.
 */
export function isPlatformOperatorForOrg(
  speaker: PlatformSpeaker | null | undefined,
  platformOrgId: string | null,
): boolean {
  if (!speaker?._id || !platformOrgId) return false
  return (
    Array.isArray(speaker.organizerOrgIds) &&
    speaker.organizerOrgIds.includes(platformOrgId)
  )
}

/**
 * Async platform-operator check for the CURRENT request: resolves the platform
 * org from `PLATFORM_ORG_ID` and applies {@link isPlatformOperatorForOrg}.
 * Shared by the tRPC onboarding gate and the /admin/platform page gate.
 */
export async function isPlatformOperator(
  speaker: PlatformSpeaker | null | undefined,
): Promise<boolean> {
  if (!speaker?._id) return false
  const platformOrgId = await getPlatformOrgId()
  return isPlatformOperatorForOrg(speaker, platformOrgId)
}
