/**
 * Bounded, uncached DNS TXT resolution for the domain challenge.
 *
 * SAFETY PROPERTIES (all deliberate):
 * - A dedicated `node:dns` `Resolver` with an explicit per-attempt `timeout` and
 *   a fixed, small `tries`. No unbounded retry loop anywhere, and an outer
 *   wall-clock race so a wedged socket can never hold a cron worker open.
 * - `Resolver.resolveTxt` talks c-ares directly, so it does NOT consult the OS
 *   stub-resolver cache. That matters: any caching layer between us and
 *   authoritative DNS would keep answering with a proof that has already been
 *   withdrawn, which is precisely the masking #683 exists to prevent. We add no
 *   caching of our own either — every sweep resolves live.
 * - Failures are classified HARD (DNS answered; the proof is gone) vs SOFT (we
 *   could not get an answer), because only the former may cost a domain its
 *   standing. See `policy.ts`.
 */

import { Resolver } from 'node:dns/promises'
import { challengeRecordName, expectedTxtValue } from './challenge'
import type { DomainCheckOutcome } from './types'

/** Per-attempt DNS timeout. */
export const DNS_TIMEOUT_MS = 5_000

/** Attempts per query. Two, not "until it works". */
export const DNS_TRIES = 2

/** Hard ceiling on one lookup regardless of what the resolver does. */
const OVERALL_TIMEOUT_MS = DNS_TIMEOUT_MS * DNS_TRIES + 1_000

/**
 * c-ares codes that mean "DNS answered, and there is nothing here". Everything
 * else (timeout, SERVFAIL, refused, connection problems) is a soft failure.
 */
const HARD_FAILURE_CODES = new Set(['ENOTFOUND', 'ENODATA'])

/** Resolve the TXT strings at a name. Injected in tests; never mocked in prod. */
export type TxtResolver = (name: string) => Promise<string[][]>

function defaultResolver(name: string): Promise<string[][]> {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES })
  let timer: NodeJS.Timeout | undefined
  const wall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resolver.cancel()
      reject(
        Object.assign(new Error('DNS lookup timed out'), { code: 'ETIMEOUT' }),
      )
    }, OVERALL_TIMEOUT_MS)
  })
  return Promise.race([resolver.resolveTxt(name), wall]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' ? code : 'EUNKNOWN'
}

/**
 * Live-check one `domains[]` entry against its stored token.
 *
 * A TXT RRset is delivered as an array of character-string chunks per record
 * (RFC 1035 §3.3.14); the chunks of ONE record are joined before comparison, and
 * every record at the name is considered — tenants routinely have unrelated TXT
 * records (SPF, other vendors' proofs) at the same name, and a shared
 * `_konf-challenge` name may legitimately carry several tokens while a domain is
 * being migrated.
 */
export async function checkDomainChallenge(
  entry: string,
  token: string,
  resolveTxt: TxtResolver = defaultResolver,
): Promise<DomainCheckOutcome> {
  const name = challengeRecordName(entry)
  if (!name) {
    return {
      kind: 'unverifiable',
      reason: 'Not a public DNS name (loopback, IP literal or dev port)',
    }
  }

  let records: string[][]
  try {
    records = await resolveTxt(name)
  } catch (error) {
    const code = errorCode(error)
    if (HARD_FAILURE_CODES.has(code)) {
      return {
        kind: 'hard-failure',
        reason: `No TXT record at ${name} (${code})`,
      }
    }
    return { kind: 'soft-failure', reason: `DNS lookup failed (${code})` }
  }

  const expected = expectedTxtValue(token)
  const found = records.some((chunks) => chunks.join('').trim() === expected)
  if (found) return { kind: 'verified' }

  return {
    kind: 'hard-failure',
    reason:
      records.length === 0
        ? `No TXT record at ${name}`
        : `TXT records at ${name} do not contain the expected token`,
  }
}
