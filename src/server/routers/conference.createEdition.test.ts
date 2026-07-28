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

function makeTransaction() {
  const tx = {
    create: (doc: unknown) => {
      createSpy(doc)
      return tx
    },
    commit: () => commitMock(),
  }
  return tx
}

const fetchMock = vi.fn(async (query: string) => {
  if (query.includes('_type == "sponsorTier"')) return SOURCE_TIERS
  if (query.includes('_type == "contractTemplate"')) return SOURCE_TEMPLATES
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
