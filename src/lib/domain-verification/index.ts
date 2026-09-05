/**
 * DNS-based domain ownership verification (#683).
 *
 * `conference.domains[]` is a CLAIM, not a proof. It is globally unique and
 * routing-overlap checked (#666/#679/#681), but until this feature nothing
 * established that the claiming tenant actually controls the hostname. That
 * matters twice over: an unclaimed hostname could be squatted, and — far worse —
 * under the central-auth-origin design (#688) `domains[]` becomes the OAuth
 * redirect allowlist, so an unproven claim is an authorization-redirect grant.
 *
 * Verification is CONTINUOUS, not one-shot: see `sweep.ts` for why (dangling
 * DNS on a lapsed conference domain is silent by construction) and `policy.ts`
 * for the deliberately different tolerances of routing vs the allowlist.
 */

export { getDomainVerification } from './sanity'
export {
  derivePlatformHosts,
  PLATFORM_DOMAIN_NOT_ALLOCATED,
  shouldTakeLatestHost,
} from './platform'
export type { PlatformHostRefusal } from './platform'
export {
  findUnallocatedPlatformDomains,
  listDomainVerificationViews,
  syncDomainVerifications,
} from './sync'
export { recheckDomainRecord, runDomainVerificationSweep } from './sweep'
export { toDomainVerificationView } from './view'
export type { DomainVerificationView } from './view'
