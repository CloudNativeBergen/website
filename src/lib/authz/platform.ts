import 'server-only'
import type { Speaker } from '@/lib/speaker/types'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * PLATFORM-OPERATOR authorization (onboarding S1/S2, RunKonf/platform#4).
 *
 * Tenant creation is a CONCIERGE, platform-operator-only surface: there is no
 * public signup and no billing entity yet, so the operator creates tenants on
 * behalf of new organizations. Until a first-class platform-org concept lands
 * (with the entitlements work), the platform org is designated by ENV:
 * `PLATFORM_ORG_SLUG` names the organization whose organizers ARE the platform
 * operators.
 *
 * THE MODEL. A caller is a platform operator iff their session token's
 * `organizerOrgIds` contains the id of the org whose `slug.current` equals
 * `PLATFORM_ORG_SLUG`. Like the tenant-admin waist (`isOrganizerForOrg`) it reads
 * `organizerOrgIds` and nothing else — a pre-#635 token (no `organizerOrgIds`) is
 * DENIED even when the deprecated global `isOrganizer` flag is set, since that
 * flag is true for an organizer of ANY org and must never mint cross-tenant
 * creation powers. Operators on legacy tokens simply re-login once. It FAILS
 * CLOSED on every unresolvable input: env unset, org slug not found, transient
 * read failure → deny.
 */

/** The minimum shape the platform check reads off a session speaker. */
type PlatformSpeaker = Pick<Speaker, '_id' | 'organizerOrgIds'>

/** The configured platform-org slug, or `null` when the surface is disabled. */
export function resolvePlatformOrgSlug(): string | null {
  const slug = process.env.PLATFORM_ORG_SLUG?.trim()
  return slug ? slug : null
}

/**
 * Resolve the platform organization's document id from `PLATFORM_ORG_SLUG`, or
 * `null` (env unset / unknown slug / transient failure — all deny downstream).
 * Uncached read: this guards a rare, high-privilege surface, so staleness is a
 * worse trade than a fetch per call.
 */
export async function getPlatformOrgId(): Promise<string | null> {
  const slug = resolvePlatformOrgSlug()
  if (!slug) return null
  try {
    const id = await clientReadUncached.fetch<string | null>(
      // groq-global: the platform org is resolved by its configured slug, not from the request domain — the operator may be on any admin host.
      `*[_type == "organization" && slug.current == $slug][0]._id`,
      { slug },
    )
    return id ?? null
  } catch {
    return null
  }
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
 * org from `PLATFORM_ORG_SLUG` and applies {@link isPlatformOperatorForOrg}.
 * Shared by the tRPC onboarding gate and the /admin/platform page gate.
 */
export async function isPlatformOperator(
  speaker: PlatformSpeaker | null | undefined,
): Promise<boolean> {
  if (!speaker?._id) return false
  const platformOrgId = await getPlatformOrgId()
  return isPlatformOperatorForOrg(speaker, platformOrgId)
}
