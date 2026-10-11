/**
 * CONTINUOUS RE-VERIFICATION (#683). Re-resolves every live claim's DNS proof
 * and writes the result back through the delisting policy.
 *
 * First-time verification is not enough. A conference ends, the organiser stops
 * renewing, the domain lapses and is re-registered by someone else — while our
 * `domains[]` entry, and therefore the redirect allowlist grant, stays exactly
 * where it was. Secureworks/Sophos documented full account impersonation
 * (access AND refresh tokens) through precisely that stale-destination path,
 * with the victim seeing a completely normal successful login. There is no error
 * to notice, so the only thing that can catch it is a machine re-asking the
 * question on a schedule.
 *
 * Every failure is also ALERTED to the conference's organisers, because the
 * attack is otherwise silent by construction.
 */

import { createNotifications } from '@/lib/notification/sanity'
import { checkDomainChallenge } from './dns'
import { isPlatformAllocated } from './platform'
import { applyCheckOutcome, isAllowlistEligible } from './policy'
import {
  getConferenceAlertTargets,
  listAllDomainVerifications,
  patchDomainVerification,
} from './sanity'
import type { DomainCheckOutcome, DomainVerificationRecord } from './types'

/** How many DNS lookups run at once. Bounded so a sweep cannot fan out wildly. */
const CONCURRENCY = 5

export interface DomainVerificationSweepSummary {
  checked: number
  verified: number
  /** Hosts the platform ALLOCATED — reconciled, never resolved. */
  platformOwned: number
  hardFailures: number
  softFailures: number
  unverifiable: number
  /** Hostnames that were on the redirect allowlist before this sweep and are not after. */
  delisted: string[]
  /** Records whose write-back or alert threw. The sweep continues regardless. */
  errored: string[]
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        results[index] = await fn(items[index])
      }
    })(),
  )
  await Promise.all(workers)
  return results
}

/**
 * Notify the claiming conference's organisers that a domain's proof stopped
 * resolving. Best-effort: `createNotifications` never throws into us, and a
 * missing conference simply produces no recipients.
 */
async function alertDelisting(
  record: DomainVerificationRecord,
  reason: string,
): Promise<void> {
  if (!record.conferenceId) return
  const organizerIds = await getConferenceAlertTargets(record.conferenceId)
  if (organizerIds.length === 0) return
  await createNotifications(
    organizerIds.map((recipientId) => ({
      recipientId,
      conferenceId: record.conferenceId as string,
      notificationType: 'system' as const,
      title: `Domain verification failing: ${record.hostname}`,
      message: `${reason} The domain has been removed from the sign-in redirect allowlist and will stop routing if the record is not restored.`,
      link: '/admin/settings#domain-verification',
      tag: `domain-verification:${record.hostname}`,
    })),
  )
}

/**
 * Re-check ONE record: resolve, run the policy, persist, and alert if the
 * hostname just fell off the redirect allowlist. Shared verbatim by the cron
 * sweep and the admin "check now" action, so a manual re-check can never apply
 * a softer rule than the scheduled one.
 */
export async function recheckDomainRecord(
  record: DomainVerificationRecord,
  now: Date = new Date(),
): Promise<{
  record: DomainVerificationRecord
  outcome: DomainCheckOutcome
  delisted: boolean
}> {
  const wasAllowlisted = isAllowlistEligible(record, now)
  // NO LOOKUP for a host the platform ALLOCATED. There is no tenant TXT record
  // to find, so resolving would hard-fail the whole platform-hosted estate and
  // alert its organisers about a record they cannot publish. The verdict is
  // reconciled instead.
  //
  // Keyed on the ALLOCATION, not on the suffix: an unallocated claim that merely
  // sits in our zone is checked like any other, hard-fails, and stays unrouted —
  // exactly the fail-closed outcome a hijack attempt should get.
  const outcome: DomainCheckOutcome = isPlatformAllocated(record)
    ? { kind: 'platform-owned' }
    : await checkDomainChallenge(record.hostname, record.token)
  const patch = applyCheckOutcome(record, outcome, now)
  await patchDomainVerification(record._id, patch)

  const next = { ...record, ...patch }
  const delisted = wasAllowlisted && !isAllowlistEligible(next, now)
  if (delisted) {
    console.error(
      `[domain-verification] DELISTED ${record.hostname} from the redirect allowlist: ` +
        (patch.lastError ?? 'proof no longer resolves'),
    )
    await alertDelisting(
      record,
      patch.lastError ?? 'The DNS proof no longer resolves.',
    )
  }
  return { record: next, outcome, delisted }
}

/**
 * Re-check every non-revoked claim. Never throws: a single record's failure is
 * recorded in the summary and the sweep moves on, so one broken tenant cannot
 * stop the platform-wide re-verification.
 */
export async function runDomainVerificationSweep(
  now: Date = new Date(),
): Promise<DomainVerificationSweepSummary> {
  const records = await listAllDomainVerifications()
  const summary: DomainVerificationSweepSummary = {
    checked: 0,
    verified: 0,
    platformOwned: 0,
    hardFailures: 0,
    softFailures: 0,
    unverifiable: 0,
    delisted: [],
    errored: [],
  }

  await mapWithConcurrency(records, CONCURRENCY, async (record) => {
    try {
      const { outcome, delisted } = await recheckDomainRecord(record, now)
      summary.checked += 1
      if (outcome.kind === 'verified') summary.verified += 1
      else if (outcome.kind === 'platform-owned') summary.platformOwned += 1
      else if (outcome.kind === 'hard-failure') summary.hardFailures += 1
      else if (outcome.kind === 'soft-failure') summary.softFailures += 1
      else summary.unverifiable += 1
      if (delisted) summary.delisted.push(record.hostname)
    } catch (error) {
      summary.errored.push(record.hostname)
      console.error(
        `[domain-verification] sweep failed for ${record.hostname}:`,
        error,
      )
    }
  })

  return summary
}
