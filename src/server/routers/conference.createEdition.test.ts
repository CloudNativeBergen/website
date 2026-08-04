import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { DEFAULT_CLONE_FLAGS } from '@/lib/conference/edition'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => 'cloudnativebergen.no' }),
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

const SOURCE_ID = 'source-conf'
/** The org the domain-resolved source conference belongs to. */
const ORG_ID = 'org-test'

const SOURCE_DOC = {
  _id: SOURCE_ID,
  title: 'Cloud Native Days Bergen 2025',
  // The tenant the edition belongs to — platform hosts are minted from its slug.
  organization: { _type: 'reference', _ref: ORG_ID },
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  topics: [{ _type: 'reference', _ref: 'topic-a', _key: 'k1' }],
  organizers: [{ _type: 'reference', _ref: 'sp-1', _key: 'o1' }],
  contactEmail: 'hi@cnb.no',
}
const SOURCE_TIERS = [{ _id: 'tier-gold', title: 'Gold', tierType: 'standard' }]
const SOURCE_TEMPLATES = [
  {
    _id: 'tpl-gold',
    title: 'Gold contract',
    tier: { _type: 'reference', _ref: 'tier-gold' },
  },
]

// Claimed domains across ALL conferences (global uniqueness source of truth).
let claimedDomains: string[] = ['cloudnativebergen.no', '2025.cnb.no']

const createSpy = vi.fn()
const commitMock = vi.fn().mockResolvedValue({})
const patchSpy = vi.fn()
/** Patches STAGED IN THE TRANSACTION: `[conferenceId, unset-selectors]`. */
const txPatchSpy = vi.fn()

function makeTransaction() {
  const tx = {
    create: (doc: unknown) => {
      createSpy(doc)
      return tx
    },
    patch: (id: string, fn: (p: unknown) => unknown) => {
      const unsets: string[] = []
      const builder = {
        unset: (fields: string[]) => {
          unsets.push(...fields)
          return builder
        },
      }
      fn(builder)
      txPatchSpy(id, unsets)
      return tx
    },
    commit: () => commitMock(),
  }
  return tx
}

/** Conferences holding a platform host, for the transfer planner's read. */
let platformHostHolders: Array<{
  _id: string
  organizationId: string | null
  startDate: string | null
  domains: string[]
}> = []
/** The source conference's organization slug, minted hosts derive from it. */
let sourceOrgSlug: string | null = null

const fetchMock = vi.fn(async (query: string) => {
  if (query.includes('_type == "sponsorTier"')) return SOURCE_TIERS
  if (query.includes('_type == "contractTemplate"')) return SOURCE_TEMPLATES
  if (query.includes('organization->slug.current')) return sourceOrgSlug
  if (query.includes('count(domains[@ in $hosts])')) return platformHostHolders
  if (query.includes('.domains[]')) return claimedDomains
  if (query.includes('_id == $id')) return SOURCE_DOC
  return null
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    transaction: () => makeTransaction(),
    patch: (id: string) => {
      patchSpy(id)
      return { set: () => ({ commit: () => Promise.resolve({}) }) }
    },
  },
  clientReadUncached: {
    fetch: (...args: unknown[]) => fetchMock(args[0] as string),
  },
}))

// The new edition CLAIMS domains, so it mints their ownership-verification
// records (#683). Mocked at the boundary; the sidecar has its own suite.
const syncDomainVerificationsMock = vi.fn(async () => {})
/**
 * The PLATFORM-ZONE entitlement guard. A new edition is a NEW conference and so
 * holds no allocation of its own; `[]` — nothing withheld — is the default here
 * because these tests use ordinary custom domains.
 */
const findUnallocatedPlatformDomainsMock = vi.fn(
  async (): Promise<string[]> => [],
)
// The MINTING rules are the real thing — what host an edition gets and where
// the short address points are properties under test, not stubs.
vi.mock('@/lib/domain-verification', async () => {
  const platform = await vi.importActual<
    typeof import('@/lib/domain-verification/platform')
  >('@/lib/domain-verification/platform')
  return {
    syncDomainVerifications: (...args: unknown[]) =>
      syncDomainVerificationsMock(...(args as [])),
    findUnallocatedPlatformDomains: () => findUnallocatedPlatformDomainsMock(),
    derivePlatformHosts: platform.derivePlatformHosts,
    shouldTakeLatestHost: platform.shouldTakeLatestHost,
    PLATFORM_DOMAIN_NOT_ALLOCATED: platform.PLATFORM_DOMAIN_NOT_ALLOCATED,
  }
})

import { conferenceRouter } from './conference'
import { DOMAIN_ALREADY_CLAIMED } from '@/lib/conference/domains'

/**
 * Org-scoped authz keys on `organizerOrgIds` ALONE (the global `isOrganizer`
 * bridge is gone), so an "organizer" caller must carry the SAME org the
 * request's domain conference resolves to — hence `ORG_ID` on both sides.
 */
function makeCaller(opts: { isOrganizer?: boolean } | null) {
  const speaker = opts
    ? {
        _id: 'sp-1',
        name: 'Org',
        isOrganizer: opts.isOrganizer ?? false,
        organizerOrgIds: opts.isOrganizer ? [ORG_ID] : [],
      }
    : undefined
  const ctx = {
    session: speaker ? { speaker, user: { name: 'Org' } } : null,
    speaker,
  } as unknown as Context
  return conferenceRouter.createCaller(ctx)
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Cloud Native Days Bergen 2026',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    domains: ['2026.cnb.no'],
    clone: { ...DEFAULT_CLONE_FLAGS },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  claimedDomains = ['cloudnativebergen.no', '2025.cnb.no']
  platformHostHolders = []
  sourceOrgSlug = null
  commitMock.mockResolvedValue({})
  // The domain conference carries the org the authz waist gates on, so
  // `resolveOrganizationId()` yields ORG_ID for every request in this file.
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: SOURCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    domain: 'cloudnativebergen.no',
    error: null,
  })
})

describe('createEdition — authorization', () => {
  it('rejects a non-organizer (FORBIDDEN)', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).createEdition(input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createSpy).not.toHaveBeenCalled()
  })
})

describe('createEdition — domain global uniqueness', () => {
  it('rejects a domain already claimed by another conference (BAD_REQUEST, named)', async () => {
    const err = await makeCaller({ isOrganizer: true })
      .createEdition(input({ domains: ['2025.cnb.no'] }))
      .catch((e) => e)
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toContain(DOMAIN_ALREADY_CLAIMED)
    expect(err.message).toContain('2025.cnb.no')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('rejects a domain an existing WILDCARD entry already routes (overlap, not equality)', async () => {
    claimedDomains = ['*.cnb.no']
    const err = await makeCaller({ isOrganizer: true })
      .createEdition(input({ domains: ['2026.cnb.no'] }))
      .catch((e) => e)
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toContain(DOMAIN_ALREADY_CLAIMED)
    expect(err.message).toContain('2026.cnb.no')
    expect(createSpy).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a WILDCARD that would capture an existing exact host (reverse overlap)', async () => {
    claimedDomains = ['2025.cnb.no']
    const err = await makeCaller({ isOrganizer: true })
      .createEdition(input({ domains: ['*.cnb.no'] }))
      .catch((e) => e)
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toContain(DOMAIN_ALREADY_CLAIMED)
    expect(err.message).toContain('*.cnb.no')
    expect(createSpy).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('accepts a domain not claimed by anyone', async () => {
    const res = await makeCaller({ isOrganizer: true }).createEdition(input())
    expect(res.conferenceId).toBeTruthy()
  })

  it('accepts a host under a DIFFERENT apex than an existing wildcard (no overlap)', async () => {
    claimedDomains = ['*.cnb.no']
    const res = await makeCaller({ isOrganizer: true }).createEdition(
      input({ domains: ['2026.cndn.no'] }),
    )
    expect(res.conferenceId).toBeTruthy()
    expect(commitMock).toHaveBeenCalledTimes(1)
  })
})

describe('createEdition — writes', () => {
  it('creates the conference + cloned tiers + templates in one transaction', async () => {
    await makeCaller({ isOrganizer: true }).createEdition(input())
    const created = createSpy.mock.calls.map((c) => c[0] as { _type: string })
    const types = created.map((d) => d._type)
    expect(types).toContain('conference')
    expect(types).toContain('sponsorTier')
    expect(types).toContain('contractTemplate')
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('NEVER touches the current conference (no patch, no create with source id)', async () => {
    await makeCaller({ isOrganizer: true }).createEdition(input())
    expect(patchSpy).not.toHaveBeenCalled()
    const created = createSpy.mock.calls.map((c) => c[0] as { _id: string })
    for (const doc of created) {
      expect(doc._id).not.toBe(SOURCE_ID)
      expect(doc._id).not.toBe('tier-gold')
      expect(doc._id).not.toBe('tpl-gold')
    }
  })

  it('mints PENDING verification records for the new edition\u2019s domains (#683)', async () => {
    const res = await makeCaller({ isOrganizer: true }).createEdition(input())
    expect(syncDomainVerificationsMock).toHaveBeenCalledWith(res.conferenceId, [
      '2026.cnb.no',
    ])
  })

  it('cloned tiers/templates point at the NEW conference id', async () => {
    const res = await makeCaller({ isOrganizer: true }).createEdition(input())
    const created = createSpy.mock.calls.map(
      (c) => c[0] as { _type: string; conference?: { _ref: string } },
    )
    const nonConf = created.filter((d) => d._type !== 'conference')
    for (const doc of nonConf) {
      expect(doc.conference?._ref).toBe(res.conferenceId)
    }
  })

  it('returns the new id and a per-family summary including the conference', async () => {
    const res = await makeCaller({ isOrganizer: true }).createEdition(input())
    expect(res.summary.conference).toBe(1)
    expect(res.summary.sponsorTiers).toBe(1)
    expect(res.summary.topics).toBe(1)
  })

  it('with sponsorTiers OFF, clones no tier docs', async () => {
    await makeCaller({ isOrganizer: true }).createEdition(
      input({ clone: { ...DEFAULT_CLONE_FLAGS, sponsorTiers: false } }),
    )
    const types = createSpy.mock.calls.map(
      (c) => (c[0] as { _type: string })._type,
    )
    expect(types).not.toContain('sponsorTier')
  })
})

describe('validateNewDomains', () => {
  it('reports which domains are already claimed', async () => {
    const res = await makeCaller({ isOrganizer: true }).validateNewDomains({
      domains: ['2025.cnb.no', 'fresh.example.com'],
    })
    expect(res.taken).toEqual(['2025.cnb.no'])
  })

  it('reports a host an existing wildcard routes, and a wildcard capturing an existing host', async () => {
    claimedDomains = ['*.cnb.no', '2025.cndn.no']
    const res = await makeCaller({ isOrganizer: true }).validateNewDomains({
      domains: ['2026.cnb.no', '*.cndn.no', 'fresh.example.com'],
    })
    expect(res.taken).toEqual(['2026.cnb.no', '*.cndn.no'])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// PLATFORM HOSTS: the permanent dated address, and the SHORT address that MOVES
//
// `domains[]` is a globally unique routing claim, so the short address cannot
// sit on two editions and must not sit on none. Every assertion below is on the
// documents that came out of the ONE transaction.
// ───────────────────────────────────────────────────────────────────────────

/** The conference document the transaction was asked to create. */
function createdConference() {
  return createSpy.mock.calls
    .map((c) => c[0])
    .find((d: { _type?: string }) => d._type === 'conference') as {
    domains?: string[]
  }
}

describe('createEdition — platform hosts', () => {
  beforeEach(() => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
    sourceOrgSlug = 'cnb'
  })

  it('claims the edition’s own permanent host and the short one', async () => {
    await makeCaller({ isOrganizer: true }).createEdition(input())
    expect(createdConference().domains).toEqual([
      'cnb.konf.run',
      'cnb-2026.konf.run',
      '2026.cnb.no',
    ])
  })

  it('TRANSFERS the short address off the previous edition, in the same transaction', async () => {
    platformHostHolders = [
      {
        _id: 'conference-2025',
        organizationId: ORG_ID,
        startDate: '2025-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]
    claimedDomains = ['cnb.konf.run', 'cnb-2025.konf.run']

    await makeCaller({ isOrganizer: true }).createEdition(input())

    // Exactly one of the two halves is not enough: the new edition claims it…
    expect(createdConference().domains).toContain('cnb.konf.run')
    // …and the previous holder is released, in the SAME all-or-nothing
    // transaction. Two separate writes could leave it on both (a routing
    // collision) or on neither (an address that resolves nowhere).
    expect(txPatchSpy).toHaveBeenCalledWith('conference-2025', [
      'domains[@ == "cnb.konf.run"]',
    ])
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('leaves the previous edition’s PERMANENT host alone', async () => {
    platformHostHolders = [
      {
        _id: 'conference-2025',
        organizationId: ORG_ID,
        startDate: '2025-06-01',
        domains: ['cnb.konf.run', 'cnb-2025.konf.run'],
      },
    ]
    claimedDomains = ['cnb.konf.run', 'cnb-2025.konf.run']

    await makeCaller({ isOrganizer: true }).createEdition(input())

    // Retirement depends on this: the dated host is what archive links use, and
    // only the bare host is ever unset.
    const unsets = txPatchSpy.mock.calls.flatMap(([, fields]) => fields)
    expect(unsets).toEqual(['domains[@ == "cnb.konf.run"]'])
    expect(createdConference().domains).not.toContain('cnb-2025.konf.run')
  })

  it('does NOT let a PAST-year edition steal the short address', async () => {
    platformHostHolders = [
      {
        _id: 'conference-2026',
        organizationId: ORG_ID,
        startDate: '2026-06-01',
        domains: ['cnb.konf.run', 'cnb-2026.konf.run'],
      },
    ]
    claimedDomains = ['cnb.konf.run', 'cnb-2026.konf.run']

    // Back-filling 2024 after 2026 exists.
    await makeCaller({ isOrganizer: true }).createEdition(
      input({
        title: 'CNB 2024',
        startDate: '2024-06-01',
        endDate: '2024-06-02',
        domains: ['2024.cnb.no'],
      }),
    )

    // It gets its own permanent host and nothing else…
    expect(createdConference().domains).toEqual([
      'cnb-2024.konf.run',
      '2024.cnb.no',
    ])
    // …and the 2026 edition is never patched, so the short address stays put.
    expect(txPatchSpy).not.toHaveBeenCalled()
  })

  it('allocates every minted host to the NEW edition (#778 write-time grant)', async () => {
    await makeCaller({ isOrganizer: true }).createEdition(input())
    expect(syncDomainVerificationsMock).toHaveBeenCalledWith(
      expect.any(String),
      ['cnb.konf.run', 'cnb-2026.konf.run'],
      [],
      { allocatePlatformHosts: true },
    )
    // The organizer's OWN domains never ride the allocating call — a tenant
    // must not be able to self-serve a grant on a typed hostname.
    expect(syncDomainVerificationsMock).toHaveBeenCalledWith(
      expect.any(String),
      ['2026.cnb.no'],
    )
  })

  it('REFUSES rather than stealing a host another organization holds', async () => {
    platformHostHolders = [
      {
        _id: 'conference-foreign',
        organizationId: 'org-someone-else',
        startDate: '2020-01-01',
        domains: ['cnb.konf.run'],
      },
    ]
    claimedDomains = ['cnb.konf.run']

    await expect(
      makeCaller({ isOrganizer: true }).createEdition(input()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(createSpy).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('REFUSES when the edition’s permanent host is already held', async () => {
    // The dated host is permanent; a holder means it is not ours to take, and
    // there is no transfer that could make it so.
    platformHostHolders = [
      {
        _id: 'conference-other',
        organizationId: ORG_ID,
        startDate: '2026-06-01',
        domains: ['cnb-2026.konf.run'],
      },
    ]
    claimedDomains = ['cnb-2026.konf.run']

    await expect(
      makeCaller({ isOrganizer: true }).createEdition(input()),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('mints nothing, and still creates the edition, with no platform zone', async () => {
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', '')
    await makeCaller({ isOrganizer: true }).createEdition(input())
    // A platform misconfiguration must not block an organizer from creating
    // next year's conference — the edition always carries a domain of its own.
    expect(createdConference().domains).toEqual(['2026.cnb.no'])
    expect(commitMock).toHaveBeenCalledTimes(1)
  })
})
