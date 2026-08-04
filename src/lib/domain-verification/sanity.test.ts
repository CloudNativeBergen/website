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
  it('mints a platform subdomain as verified/platform-owned, with NO deadline', async () => {
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(created()).toMatchObject({
      hostname: 'kubeday.konf.run',
      status: 'verified',
      method: 'platform-owned',
    })
    // `graceUntil` is what makes `grandfathered` time-boxed; platform-owned is
    // permanent and must never carry one.
    expect(created()).not.toHaveProperty('graceUntil')
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
    await ensureDomainVerification('evil-konf.run', CONFERENCE)
    expect(created()).toMatchObject({ status: 'pending', method: 'dns-txt' })
  })

  it('overrides an explicit `grandfathered` request for a platform host', async () => {
    // The hostname decides, not the caller — the backfill must not hand a
    // platform subdomain a 30-day deadline it can never satisfy.
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE, {
      method: 'grandfathered',
    })
    expect(created()).toMatchObject({ method: 'platform-owned' })
    expect(created()).not.toHaveProperty('graceUntil')
  })

  it('mints platform hosts as ordinary claims when the suffix is unset', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(created()).toMatchObject({ status: 'pending', method: 'dns-txt' })
  })

  it('reconciles an EXISTING dns-txt record for a now-platform host', async () => {
    fetchMock.mockResolvedValue(
      existing({ status: 'failing', consecutiveFailures: 9 }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)

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

  it('writes NOTHING for an already-reconciled platform record', async () => {
    fetchMock.mockResolvedValue(
      existing({ status: 'verified', method: 'platform-owned' }),
    )
    await ensureDomainVerification('kubeday.konf.run', CONFERENCE)
    expect(createIfNotExists).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
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
