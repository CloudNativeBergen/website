/**
 * @vitest-environment node
 *
 * Router tests for onboarding S1 (`onboarding.createOrganization` +
 * `onboarding.validateSetup`). Pins the three contracts the concierge flow
 * lives by:
 *
 *   1. AUTHZ — platform-operator only: strict membership in the configured
 *      platform org; tenant organizers, legacy tokens and unconfigured envs
 *      are all DENIED before any read/write happens.
 *   2. ATOMICITY — org + conference + speaker(create/patch) ride ONE Sanity
 *      transaction; a commit failure surfaces INTERNAL_SERVER_ERROR and no
 *      document is written outside the transaction.
 *   3. GLOBAL uniqueness — org slug and domains are validated server-side
 *      (BAD_REQUEST, nothing written), and an ambiguous organizer email
 *      (duplicate accounts) is refused rather than silently picked from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Context } from '@/server/trpc'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const PLATFORM_ORG_ID = 'org-platform'

// Sanity read fan-out, routed by query shape.
let orgSlugCount = 0
let claimedDomains: string[] = ['cloudnativebergen.no']
let speakerMatches: Array<{ _id: string; name?: string }> = []
let platformOrgId: string | null = PLATFORM_ORG_ID

const fetchMock = vi.fn(async (query: string) => {
  if (query.includes('_type == "organization"') && query.includes('count('))
    return orgSlugCount
  if (query.includes('_type == "organization"')) return platformOrgId
  if (query.includes('.domains[]')) return claimedDomains
  if (query.includes('_type == "speaker"')) return speakerMatches
  throw new Error(`Unexpected query: ${query}`)
})

const createSpy = vi.fn()
const patchSpy = vi.fn()
const commitMock = vi.fn().mockResolvedValue({})

function makePatchRecorder(id: string) {
  const ops: Array<{ op: string; args: unknown[] }> = []
  const p = {
    setIfMissing: (...args: unknown[]) => {
      ops.push({ op: 'setIfMissing', args })
      return p
    },
    insert: (...args: unknown[]) => {
      ops.push({ op: 'insert', args })
      return p
    },
  }
  return { p, done: () => patchSpy(id, ops) }
}

function makeTransaction() {
  const tx = {
    create: (doc: unknown) => {
      createSpy(doc)
      return tx
    },
    patch: (id: string, fn: (p: unknown) => unknown) => {
      const rec = makePatchRecorder(id)
      fn(rec.p)
      rec.done()
      return tx
    },
    commit: () => commitMock(),
  }
  return tx
}

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: () => makeTransaction() },
  clientReadUncached: {
    fetch: (...args: unknown[]) => fetchMock(args[0] as string),
  },
}))

import {
  onboardingRouter,
  ORG_SLUG_ALREADY_TAKEN,
  AMBIGUOUS_ORGANIZER_EMAIL,
} from './onboarding'
import { DOMAIN_ALREADY_CLAIMED } from './conference'

type CallerSpeaker = {
  _id: string
  organizerOrgIds?: string[]
  isOrganizer?: boolean
} | null

function makeCaller(speaker: CallerSpeaker) {
  const ctx = {
    session: speaker ? { speaker, user: { name: 'U' } } : null,
    speaker: speaker ?? undefined,
  } as unknown as Context
  return onboardingRouter.createCaller(ctx)
}

const operator: CallerSpeaker = {
  _id: 'sp-op',
  organizerOrgIds: [PLATFORM_ORG_ID],
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    organization: {
      name: 'Cloud Native Oslo',
      slug: 'cloud-native-oslo',
      contactEmail: 'hello@cno.no',
    },
    conference: {
      title: 'Cloud Native Days Oslo 2027',
      city: 'Oslo',
      country: 'Norway',
      startDate: '2027-06-01',
      endDate: '2027-06-02',
    },
    organizer: { name: 'Kari Nordmann', email: 'Kari@CNO.no' },
    domains: ['oslo.cloudnativedays.no'],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PLATFORM_ORG_SLUG = 'runkonf'
  orgSlugCount = 0
  claimedDomains = ['cloudnativebergen.no']
  speakerMatches = []
  platformOrgId = PLATFORM_ORG_ID
  commitMock.mockResolvedValue({})
})

afterEach(() => {
  delete process.env.PLATFORM_ORG_SLUG
})

describe('createOrganization — authorization (platform waist)', () => {
  it('denies an unauthenticated caller (UNAUTHORIZED)', async () => {
    await expect(
      makeCaller(null).createOrganization(input()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(createSpy).not.toHaveBeenCalled()
  })

  it("denies another tenant's organizer (FORBIDDEN)", async () => {
    await expect(
      makeCaller({
        _id: 'sp-tenant',
        organizerOrgIds: ['org-other'],
      }).createOrganization(input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createSpy).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('denies a LEGACY token even with the deprecated global organizer flag', async () => {
    await expect(
      makeCaller({ _id: 'sp-legacy', isOrganizer: true }).createOrganization(
        input(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('denies everyone when PLATFORM_ORG_SLUG is not configured', async () => {
    delete process.env.PLATFORM_ORG_SLUG
    await expect(
      makeCaller(operator).createOrganization(input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('denies when the configured slug resolves to no organization', async () => {
    platformOrgId = null
    await expect(
      makeCaller(operator).createOrganization(input()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('gates validateSetup behind the same waist', async () => {
    await expect(
      makeCaller({
        _id: 'sp-tenant',
        organizerOrgIds: ['org-other'],
      }).validateSetup({ slug: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('createOrganization — server-side uniqueness authority', () => {
  it('rejects a taken org slug (BAD_REQUEST, named) and writes nothing', async () => {
    orgSlugCount = 1
    const err = await makeCaller(operator)
      .createOrganization(input())
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'BAD_REQUEST' })
    expect(err.message).toContain(ORG_SLUG_ALREADY_TAKEN)
    expect(err.message).toContain('cloud-native-oslo')
    expect(createSpy).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a domain claimed by ANY conference (BAD_REQUEST, named)', async () => {
    claimedDomains = ['oslo.cloudnativedays.no']
    const err = await makeCaller(operator)
      .createOrganization(input())
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'BAD_REQUEST' })
    expect(err.message).toContain(DOMAIN_ALREADY_CLAIMED)
    expect(err.message).toContain('oslo.cloudnativedays.no')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a domain that an existing WILDCARD entry would capture (routing overlap, not just equality)', async () => {
    claimedDomains = ['*.cloudnativedays.no']
    const err = await makeCaller(operator)
      .createOrganization(input({ domains: ['oslo.cloudnativedays.no'] }))
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'BAD_REQUEST' })
    expect(err.message).toContain(DOMAIN_ALREADY_CLAIMED)
    expect(err.message).toContain('oslo.cloudnativedays.no')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a WILDCARD that would capture an existing exact host (reverse overlap)', async () => {
    claimedDomains = ['oslo.cloudnativedays.no']
    const err = await makeCaller(operator)
      .createOrganization(input({ domains: ['*.cloudnativedays.no'] }))
      .catch((e) => e)
    expect(err).toMatchObject({ code: 'BAD_REQUEST' })
    expect(err.message).toContain(DOMAIN_ALREADY_CLAIMED)
    expect(err.message).toContain('*.cloudnativedays.no')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('skips the claimed-domains read entirely for a domainless tenant', async () => {
    await makeCaller(operator).createOrganization(input({ domains: [] }))
    expect(commitMock).toHaveBeenCalledTimes(1)
    const domainQueries = fetchMock.mock.calls.filter(([q]) =>
      (q as string).includes('.domains[]'),
    )
    expect(domainQueries).toEqual([])
  })

  it('refuses an organizer email matching SEVERAL accounts (duplicates first)', async () => {
    speakerMatches = [{ _id: 'sp-a' }, { _id: 'sp-b' }]
    const err = await makeCaller(operator)
      .createOrganization(input())
      .catch((e) => e)
    expect(err).toMatchObject({
      code: 'BAD_REQUEST',
      message: AMBIGUOUS_ORGANIZER_EMAIL,
    })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('createOrganization — atomic transaction', () => {
  it('creates org + conference + NEW speaker in one committed transaction', async () => {
    const result = await makeCaller(operator).createOrganization(input())

    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledTimes(3)
    expect(patchSpy).not.toHaveBeenCalled()

    const docs = createSpy.mock.calls.map((c) => c[0])
    const org = docs.find((d) => d._type === 'organization')
    const conf = docs.find((d) => d._type === 'conference')
    const speaker = docs.find((d) => d._type === 'speaker')

    expect(org).toMatchObject({
      name: 'Cloud Native Oslo',
      slug: { current: 'cloud-native-oslo' },
    })
    expect(org).not.toHaveProperty('plan')
    expect(conf).toMatchObject({
      visibility: 'unlisted',
      registrationEnabled: false,
      organization: { _ref: org._id },
      domains: ['oslo.cloudnativedays.no'],
    })
    // The normalized (lowercased) email is stored for verified-email linking.
    expect(speaker).toMatchObject({ email: 'kari@cno.no' })
    expect(conf.organizers).toEqual([
      expect.objectContaining({ _ref: speaker._id }),
    ])

    expect(result).toMatchObject({
      organizationId: org._id,
      conferenceId: conf._id,
      speakerId: speaker._id,
      speakerCreated: true,
      organizerMatchedName: null,
    })
  })

  it('PATCHES the matched existing speaker instead of creating one', async () => {
    speakerMatches = [{ _id: 'sp-existing', name: 'Kari Nordmann' }]
    const result = await makeCaller(operator).createOrganization(input())

    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledTimes(2) // org + conference only
    expect(patchSpy).toHaveBeenCalledTimes(1)

    const [patchedId, ops] = patchSpy.mock.calls[0]
    expect(patchedId).toBe('sp-existing')
    expect(ops).toEqual([
      { op: 'setIfMissing', args: [{ organizations: [] }] },
      {
        op: 'insert',
        args: [
          'after',
          'organizations[-1]',
          [expect.objectContaining({ _type: 'reference' })],
        ],
      },
    ])

    const conf = createSpy.mock.calls
      .map((c) => c[0])
      .find((d) => d._type === 'conference')
    expect(conf.organizers).toEqual([
      expect.objectContaining({ _ref: 'sp-existing' }),
    ])
    expect(result).toMatchObject({
      speakerId: 'sp-existing',
      speakerCreated: false,
      organizerMatchedName: 'Kari Nordmann',
    })
  })

  it('maps a commit failure to INTERNAL_SERVER_ERROR (all-or-nothing rollback)', async () => {
    commitMock.mockRejectedValueOnce(new Error('sanity down'))
    await expect(
      makeCaller(operator).createOrganization(input()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    // Everything rode the ONE transaction — no writes happen outside it, so a
    // failed commit means nothing was persisted.
    expect(commitMock).toHaveBeenCalledTimes(1)
  })

  it('accepts a tenant with NO domains and omits the field', async () => {
    await makeCaller(operator).createOrganization(input({ domains: [] }))
    const conf = createSpy.mock.calls
      .map((c) => c[0])
      .find((d) => d._type === 'conference')
    expect(conf).not.toHaveProperty('domains')
  })

  it('rejects a lone start date (dates travel as a pair) before any read', async () => {
    await expect(
      makeCaller(operator).createOrganization(
        input({
          conference: {
            title: 'T',
            city: 'C',
            country: 'N',
            startDate: '2027-06-01',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('validateSetup — preflight probe', () => {
  it('reports slug availability, taken domains and the organizer match', async () => {
    orgSlugCount = 1
    claimedDomains = ['taken.example.com']
    speakerMatches = [{ _id: 'sp-1', name: 'Kari' }]
    const result = await makeCaller(operator).validateSetup({
      slug: 'cloud-native-oslo',
      domains: ['taken.example.com', 'free.example.com'],
      organizerEmail: 'kari@cno.no',
    })
    expect(result).toEqual({
      slugTaken: true,
      takenDomains: ['taken.example.com'],
      organizer: { matchCount: 1, match: { name: 'Kari' } },
    })
  })

  it('flags wildcard-overlapping domains as taken (same matcher as routing)', async () => {
    claimedDomains = ['*.example.com', 'bergen.cloudnative.no']
    const result = await makeCaller(operator).validateSetup({
      domains: ['sub.example.com', '*.cloudnative.no', 'free.example.org'],
    })
    // sub.example.com is captured by the existing *.example.com; the requested
    // *.cloudnative.no would capture the existing bergen.cloudnative.no.
    expect(result.takenDomains).toEqual(['sub.example.com', '*.cloudnative.no'])
  })

  it('skips the claimed-domains read when no domains are probed', async () => {
    await makeCaller(operator).validateSetup({ slug: 'some-slug' })
    const domainQueries = fetchMock.mock.calls.filter(([q]) =>
      (q as string).includes('.domains[]'),
    )
    expect(domainQueries).toEqual([])
  })

  it('hides names on an ambiguous match', async () => {
    speakerMatches = [
      { _id: 'sp-1', name: 'A' },
      { _id: 'sp-2', name: 'B' },
    ]
    const result = await makeCaller(operator).validateSetup({
      organizerEmail: 'kari@cno.no',
    })
    expect(result.organizer).toEqual({ matchCount: 2, match: null })
  })
})
