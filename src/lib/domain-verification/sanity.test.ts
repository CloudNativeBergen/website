import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DomainVerificationRecord } from './types'

/**
 * What `ensureDomainVerification` actually WRITES. The assertions are on the
 * document handed to Sanity — created or not, with which `method` and `status` —
 * never on a message, because the document is the thing every downstream
 * consumer reads.
 */

type Doc = Record<string, unknown>

const fetchMock = vi.fn<() => Promise<unknown>>()
const createIfNotExists = vi.fn<(doc: Doc) => Promise<void>>()
const commit = vi.fn<() => Promise<void>>()
/** The fluent patch builder `sanity.ts` drives. */
interface PatchChain {
  set(fields: Doc): PatchChain
  unset(fields: string[]): PatchChain
  commit(): Promise<void>
}
const chain = (): PatchChain => ({ set, unset, commit })
const set = vi.fn<(fields: Doc) => PatchChain>(chain)
const unset = vi.fn<(fields: string[]) => PatchChain>(chain)
const patch = vi.fn<(id: string) => PatchChain>(chain)

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: () => fetchMock() },
  clientWrite: {
    createIfNotExists: (doc: Doc) => createIfNotExists(doc),
    patch: (id: string) => patch(id),
  },
}))

const { ensureDomainVerification } = await import('./sanity')

const CONFERENCE = 'conference-1'

/** The single document `createIfNotExists` was called with. */
function created(): Doc {
  expect(createIfNotExists).toHaveBeenCalledTimes(1)
  return createIfNotExists.mock.calls[0]![0]
}

function existing(
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  return {
    _id: 'domainVerification.kubeday.konf.run',
    hostname: 'kubeday.konf.run',
    conferenceId: CONFERENCE,
    token: 'tok',
    status: 'pending',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue(null)
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ensureDomainVerification', () => {
  it('ALLOCATES a platform subdomain as verified/platform-owned, with NO deadline', async () => {
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE, {
      allocatePlatformHost: true,
    })
    expect(created()).toMatchObject({
      hostname: 'kubeday.konf.run',
      status: 'verified',
      method: 'platform-owned',
    })
    // `graceUntil` is what makes `grandfathered` time-boxed; an allocation is
    // permanent and must never carry one.
    expect(created()).not.toHaveProperty('graceUntil')
  })

  it('writes NOTHING for an in-zone host when the caller may not allocate', async () => {
    // THE HIJACK, at the write path. `updateDomains`, `createEdition` and the
    // admin card's self-heal all land here without the flag. Minting anything
    // would either grant the standing outright or promise a DNS challenge the
    // tenant cannot answer — so no document is created at all, and the claim
    // fails closed downstream.
    await ensureDomainVerification('some-other-tenant.konf.run', CONFERENCE)
    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('will not let an explicit `method` smuggle an allocation in', async () => {
    await ensureDomainVerification('some-other-tenant.konf.run', CONFERENCE, {
      method: 'platform-owned',
    })
    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('will not re-allocate a host allocated to ANOTHER conference', async () => {
    fetchMock.mockResolvedValue(
      existing({ method: 'platform-owned', conferenceId: 'conference-other' }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('mints a CUSTOM domain pending/dns-txt — proof still required', async () => {
    await ensureDomainVerification('cloudnativedays.no', CONFERENCE)
    expect(created()).toMatchObject({
      hostname: 'cloudnativedays.no',
      status: 'pending',
      method: 'dns-txt',
    })
  })

  it('mints a label-boundary near-miss as an ORDINARY claim', async () => {
    // Not in the platform zone, so the allocation machinery never engages and
    // the entry is a plain unproven claim — even when allocation is requested.
    await ensureDomainVerification('evil-konf.run', CONFERENCE, {
      allocatePlatformHost: true,
    })
    expect(created()).toMatchObject({ status: 'pending', method: 'dns-txt' })
  })

  it('overrides an explicit `grandfathered` request when ALLOCATING', async () => {
    // The backfill must not hand an allocated subdomain a 30-day deadline it
    // can never satisfy.
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE, {
      method: 'grandfathered',
      allocatePlatformHost: true,
    })
    expect(created()).toMatchObject({ method: 'platform-owned' })
    expect(created()).not.toHaveProperty('graceUntil')
  })

  it('mints platform hosts as ordinary claims when the suffix is unset', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE, {
      allocatePlatformHost: true,
    })
    expect(created()).toMatchObject({ status: 'pending', method: 'dns-txt' })
  })

  it('upgrades an EXISTING dns-txt record when the platform allocates it', async () => {
    fetchMock.mockResolvedValue(
      existing({ status: 'failing', consecutiveFailures: 9 }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE, {
      allocatePlatformHost: true,
    })

    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(patch).toHaveBeenCalledWith('domainVerification.kubeday.konf.run')
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'verified',
        method: 'platform-owned',
        consecutiveFailures: 0,
      }),
    )
    expect(unset).toHaveBeenCalledWith(
      expect.arrayContaining(['graceUntil', 'firstFailureAt', 'lastError']),
    )
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('does NOT upgrade that same record without the allocation flag', async () => {
    fetchMock.mockResolvedValue(
      existing({ status: 'failing', consecutiveFailures: 9 }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(commit).not.toHaveBeenCalled()
  })

  it('writes NOTHING for an already-allocated record', async () => {
    fetchMock.mockResolvedValue(
      existing({ status: 'verified', method: 'platform-owned' }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('restores an allocation this conference RELEASED and re-added', async () => {
    // Releasing and re-adding your own platform subdomain must not need a
    // support ticket — but this is keyed on the STORED allocation, so it can
    // only ever restore a grant the platform actually made.
    fetchMock.mockResolvedValue(
      existing({ status: 'revoked', method: 'platform-owned' }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'verified',
        method: 'platform-owned',
      }),
    )
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('leaves an existing CUSTOM-domain record untouched', async () => {
    fetchMock.mockResolvedValue(
      existing({
        _id: 'domainVerification.cloudnativedays.no',
        hostname: 'cloudnativedays.no',
        status: 'failing',
        consecutiveFailures: 9,
      }),
    )
    await ensureDomainVerification('cloudnativedays.no', CONFERENCE)
    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })
})
