import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DomainVerificationRecord } from './types'

/**
 * The ENTITLEMENT GUARD the tenant-facing mutations run before they write.
 *
 * `domains[]` is a globally unique routing claim, so an organizer who manages to
 * save `some-other-tenant.<platform suffix>` does not merely fail to verify it —
 * they lock the rightful tenant out of that hostname permanently. The refusal
 * therefore has to happen at the claim, which is what this returns.
 */

const records = new Map<string, DomainVerificationRecord>()

vi.mock('./sanity', () => ({
  ensureDomainVerification: vi.fn(),
  getDomainVerification: async (hostname: string) =>
    records.get(hostname) ?? null,
  listDomainVerificationsForConference: vi.fn(async () => []),
  revokeDomainVerification: vi.fn(),
}))

const { findUnallocatedPlatformDomains } = await import('./sync')

const OURS = 'conference-1'
const THEIRS = 'conference-2'

function seed(
  hostname: string,
  overrides: Partial<DomainVerificationRecord> = {},
) {
  records.set(hostname, {
    _id: `domainVerification.${hostname}`,
    hostname,
    conferenceId: OURS,
    token: 'tok',
    status: 'verified',
    method: 'platform-owned',
    graceUntil: null,
    verifiedAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  })
}

beforeEach(() => {
  records.clear()
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('findUnallocatedPlatformDomains', () => {
  it('accepts a host the platform allocated to THIS conference', async () => {
    seed('kubeday.konf.run')
    expect(
      await findUnallocatedPlatformDomains(OURS, ['kubeday.konf.run']),
    ).toEqual([])
  })

  it('REFUSES an in-zone host with no record — the unissued-label grab', async () => {
    expect(
      await findUnallocatedPlatformDomains(OURS, [
        'some-other-tenant.konf.run',
      ]),
    ).toEqual(['some-other-tenant.konf.run'])
  })

  it('REFUSES a host allocated to ANOTHER conference', async () => {
    seed('rival.konf.run', { conferenceId: THEIRS })
    expect(
      await findUnallocatedPlatformDomains(OURS, ['rival.konf.run']),
    ).toEqual(['rival.konf.run'])
  })

  it('REFUSES an in-zone host that only has an ordinary dns-txt record', async () => {
    // Even a fully `verified` DNS proof is not an allocation. (It cannot happen
    // for a real platform host anyway — the tenant cannot publish in our zone —
    // but the guard must not depend on that.)
    seed('sneaky.konf.run', { method: 'dns-txt', status: 'verified' })
    expect(
      await findUnallocatedPlatformDomains(OURS, ['sneaky.konf.run']),
    ).toEqual(['sneaky.konf.run'])
  })

  it('IGNORES custom domains entirely — they prove themselves by DNS', async () => {
    expect(
      await findUnallocatedPlatformDomains(OURS, [
        'cloudnativedays.no',
        'oslo.cloudnativedays.no',
        '*.cloudnativedays.no',
      ]),
    ).toEqual([])
  })

  it('IGNORES label-boundary near-misses of the platform zone', async () => {
    // Not in our zone, so not ours to allocate — they take the ordinary
    // DNS-TXT path rather than being refused outright.
    expect(
      await findUnallocatedPlatformDomains(OURS, [
        'evil-konf.run',
        'konf.run.attacker.com',
        'a.konf.runner',
      ]),
    ).toEqual([])
  })

  it('REFUSES a `*.konf.run` wildcard over the whole platform zone', async () => {
    // A wildcard can never be allocated (`isPlatformZoneHost` excludes it), so
    // it is simply outside this guard — and the ordinary DNS-TXT path it falls
    // back to is unsatisfiable in our zone, which is the intended dead end.
    expect(await findUnallocatedPlatformDomains(OURS, ['*.konf.run'])).toEqual(
      [],
    )
  })

  it('returns every offending host, keeping the good ones', async () => {
    seed('kubeday.konf.run')
    expect(
      await findUnallocatedPlatformDomains(OURS, [
        'kubeday.konf.run',
        'cloudnativedays.no',
        'grabbed.konf.run',
        'also-grabbed.konf.run',
      ]),
    ).toEqual(['grabbed.konf.run', 'also-grabbed.konf.run'])
  })

  it('accepts everything when no platform suffix is configured', async () => {
    // Nothing is in "our zone", so nothing is ours to withhold. Claims are
    // governed entirely by DNS-TXT proof, exactly as before this feature.
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
    expect(
      await findUnallocatedPlatformDomains(OURS, ['anything.konf.run']),
    ).toEqual([])
  })
})
