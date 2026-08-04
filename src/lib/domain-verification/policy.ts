/**
 * The DELISTING POLICY — pure, so it is exhaustively testable without DNS or
 * Sanity. Everything about "when does a domain lose its standing" lives here.
 *
 * Two consumers with DELIBERATELY DIFFERENT tolerances:
 *
 * - **Redirect allowlist** ({@link isAllowlistEligible}) — strict. The failure
 *   mode it guards is an authorization code delivered to a host someone else now
 *   controls, which the victim experiences as a completely normal, successful
 *   login (Secureworks/Sophos dangling-DNS research). There is no error to
 *   notice and nothing to report, so the only safe posture is fail-closed: the
 *   FIRST hard failure drops the host, and even an unbroken `verified` status
 *   expires if we have not actually re-proven it inside
 *   {@link ALLOWLIST_MAX_STALENESS_DAYS} (otherwise a checker that has been
 *   silently broken for a month would keep the allowlist "fresh" forever, which
 *   is exactly the masking this issue is about). The cost of being wrong is one
 *   refused login bounce.
 *
 * - **Routing** ({@link isRoutingEligible}) — forgiving. The failure mode here
 *   is the tenant's public website going dark. A transient resolver problem must
 *   NEVER do that, so routing is only withdrawn after the proof has hard-failed
 *   {@link ROUTING_GRACE_FAILURES} times running AND the streak has lasted at
 *   least {@link ROUTING_GRACE_DAYS} — both, not either. A stale-but-verified
 *   record keeps routing indefinitely, because "our checker has not run" is our
 *   problem and taking a customer's site down over it is strictly worse than
 *   serving it.
 *
 * Withdrawal is never destructive: nothing here mutates `domains[]`. We stop
 * *honouring* a claim; republishing the TXT record restores it on the next
 * sweep.
 *
 * PLATFORM-ALLOCATED HOSTS are the one standing that is not earned from a check
 * result at all — see `platform.ts`. Both consumers honour {@link
 * isPlatformAllocated}, which requires the platform to have RECORDED the
 * allocation (`method: 'platform-owned'`, written only by tenant provisioning)
 * AND the hostname to still be under the configured suffix. Being in our zone is
 * never sufficient on its own: an organizer can type any hostname, so inferring
 * the grant from the suffix alone would let them claim another tenant's — or an
 * unissued — subdomain. `revoked` is refused BEFORE the allocation check in both
 * functions, so releasing a claim withdraws the grant instantly.
 *
 * The module stays otherwise pure; the suffix is the only thing it reads from
 * the environment.
 */

import { isDevOnlyHost, isWildcardEntry } from './challenge'
import { isPlatformAllocated } from './platform'
import type {
  DomainCheckOutcome,
  DomainVerificationPatch,
  DomainVerificationRecord,
} from './types'

/** A successful proof older than this stops counting for the redirect allowlist. */
export const ALLOWLIST_MAX_STALENESS_DAYS = 30

/** Hard failures needed before routing may be withdrawn. */
export const ROUTING_GRACE_FAILURES = 3

/** …and how long the failure streak must have lasted as well. */
export const ROUTING_GRACE_DAYS = 7

/**
 * Consecutive resolver outages before a soft failure is escalated to a hard one.
 * Bounds the "our DNS has been broken for weeks" case without punishing a blip.
 */
export const SOFT_FAILURE_ESCALATION = 5

/** How long a backfilled (grandfathered) claim is honoured without proof. */
export const GRANDFATHER_GRACE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(fromIso: string, now: Date): number {
  const from = Date.parse(fromIso)
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY
  return (now.getTime() - from) / DAY_MS
}

/** True while a grandfathered record is still inside its migration window. */
function inGrandfatherGrace(
  record: DomainVerificationRecord,
  now: Date,
): boolean {
  if (record.method !== 'grandfathered') return false
  if (record.status === 'revoked') return false
  if (!record.graceUntil) return false
  const until = Date.parse(record.graceUntil)
  return !Number.isNaN(until) && now.getTime() < until
}

/**
 * The write-back for one check result. Returns ONLY changed fields so the caller
 * can issue a narrow patch.
 *
 * A `revoked` record is inert — the claim is gone, so a check result must not
 * resurrect it.
 */
export function applyCheckOutcome(
  record: DomainVerificationRecord,
  outcome: DomainCheckOutcome,
  now: Date,
): DomainVerificationPatch {
  const nowIso = now.toISOString()
  if (record.status === 'revoked') return {}

  if (outcome.kind === 'platform-owned') {
    // No lookup happened and none ever will. The write-back exists so the
    // stored record TELLS THE TRUTH — verified, by the platform, with no
    // failure history — which is what the admin card and the allowlist's GROQ
    // prefilter read.
    return {
      status: 'verified',
      method: 'platform-owned',
      // CLEARED, not left alone: a record that was grandfathered before it was
      // allocated still carries that 30-day deadline, and a platform allocation
      // has no deadline. Leaving it would expire a permanent grant.
      graceUntil: null,
      verifiedAt: record.verifiedAt ?? nowIso,
      lastSuccessAt: nowIso,
      lastCheckedAt: nowIso,
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    }
  }

  if (outcome.kind === 'verified') {
    return {
      status: 'verified',
      // A real proof retires the grandfathered exemption for good.
      method: 'dns-txt',
      verifiedAt: record.verifiedAt ?? nowIso,
      lastSuccessAt: nowIso,
      lastCheckedAt: nowIso,
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
    }
  }

  if (outcome.kind === 'unverifiable') {
    // Nothing to prove and nothing to punish: a dev-only entry simply never
    // reaches `verified`. Recorded so the admin surface can explain itself.
    return { lastCheckedAt: nowIso, lastError: outcome.reason }
  }

  if (outcome.kind === 'soft-failure') {
    const soft = record.consecutiveSoftFailures + 1
    if (soft < SOFT_FAILURE_ESCALATION) {
      // Deliberately does NOT touch status, firstFailureAt or the hard counter:
      // our resolver being unhappy is not evidence about the tenant's zone.
      return {
        lastCheckedAt: nowIso,
        consecutiveSoftFailures: soft,
        lastError: outcome.reason,
      }
    }
    return {
      status: 'failing',
      lastCheckedAt: nowIso,
      firstFailureAt: record.firstFailureAt ?? nowIso,
      consecutiveFailures: record.consecutiveFailures + 1,
      consecutiveSoftFailures: soft,
      lastError: `${outcome.reason} (escalated after ${soft} consecutive resolver failures)`,
    }
  }

  return {
    status: 'failing',
    lastCheckedAt: nowIso,
    firstFailureAt: record.firstFailureAt ?? nowIso,
    consecutiveFailures: record.consecutiveFailures + 1,
    consecutiveSoftFailures: 0,
    lastError: outcome.reason,
  }
}

/**
 * May this hostname appear on the OAuth redirect allowlist?
 *
 * EXACT HOSTS ONLY. A `*.example.com` claim is never allowlisted even when its
 * base zone is fully proven: the routing matcher's wildcard semantics are
 * deliberately NOT inherited here (#688, RFC 9700 §4.1.3). Whoever wants
 * `sub.example.com` on the allowlist must claim and prove that exact host.
 *
 * Dev-only hosts are excluded too — an allowlist entry is a security grant, and
 * `localhost:3000` must never be one in a deployed environment.
 *
 * PLATFORM-ALLOCATED HOSTS ARE ELIGIBLE, and deliberately so. The threat this
 * function exists to stop is a DANGLING destination: a third party's zone lapses
 * and the host silently starts resolving to somebody else, which the victim
 * experiences as a normal login. That cannot happen inside a zone we operate —
 * its delegation cannot change without our own registrar/DNS account changing
 * hands, and it could not do so quietly, because every tenant site would go down
 * at the same moment. The staleness rule below exists to catch a checker that
 * has silently broken; for our own zone there is no checker to break. Refusing
 * these instead would mean nobody hosted on the platform's default subdomain
 * could complete a sign-in round-trip at all.
 *
 * The grant follows the ALLOCATION, not the suffix. A host merely sitting in our
 * zone gets nothing: it has to be a subdomain the platform issued to THIS
 * conference, which is what stops an organizer from typing another tenant's (or
 * an unissued) label into their own `domains[]` and being handed a redirect
 * destination for it. Wildcards and revoked claims remain excluded, so releasing
 * the claim removes the grant immediately.
 */
export function isAllowlistEligible(
  record: DomainVerificationRecord,
  now: Date,
): boolean {
  if (isWildcardEntry(record.hostname)) return false
  if (isDevOnlyHost(record.hostname)) return false
  // Explicit, because the allocation check below bypasses the `verified` status
  // test that otherwise excludes a released claim.
  if (record.status === 'revoked') return false
  if (isPlatformAllocated(record)) return true
  if (inGrandfatherGrace(record, now)) return true
  if (record.status !== 'verified') return false
  if (!record.lastSuccessAt) return false
  return daysBetween(record.lastSuccessAt, now) <= ALLOWLIST_MAX_STALENESS_DAYS
}

/**
 * May this hostname still be served by domain→conference routing?
 *
 * Only consulted when routing enforcement is switched on (`routing.ts`); with
 * the flag off every claim routes exactly as it does today.
 */
export function isRoutingEligible(
  record: DomainVerificationRecord,
  now: Date,
): boolean {
  // Local dev entries are unprovable by construction; refusing them would break
  // `pnpm dev` for no security gain (they cannot receive public traffic).
  if (isDevOnlyHost(record.hostname)) return true
  if (record.status === 'revoked') return false
  // A subdomain the platform ALLOCATED to this conference. PERMANENT — unlike
  // the grandfather window below, this never expires, because there is no proof
  // the tenant could publish in a zone only we can write to. An unallocated host
  // that merely sits in our zone falls through to the ordinary rules and stays
  // unrouted.
  if (isPlatformAllocated(record)) return true
  if (inGrandfatherGrace(record, now)) return true
  if (record.status === 'verified') return true
  if (record.status !== 'failing') return false
  // Grace: BOTH thresholds must be exceeded before a site goes dark.
  const streakLongEnough =
    record.firstFailureAt !== null &&
    daysBetween(record.firstFailureAt, now) >= ROUTING_GRACE_DAYS
  return !(
    record.consecutiveFailures >= ROUTING_GRACE_FAILURES && streakLongEnough
  )
}
