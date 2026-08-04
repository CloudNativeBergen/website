/**
 * @vitest-environment node
 *
 * CROSS-TENANT WRITE ISOLATION for the `sponsor` router (#730, #731 F10).
 *
 * The adversarial review of #730 mutation-tested every guard call site — delete
 * the guard, run the whole suite — and found that 9 of the sponsor router's 11
 * guards could be removed with CI green. Only `crm.bulkUpdate` was held in place
 * by a test. `sponsor.update`'s guard was ALREADY bypassable (it sat inside
 * `if (Object.keys(data).length > 0)`, so `data: {}` skipped it and returned any
 * tenant's sponsor) and nothing failed.
 *
 * Each test below asserts a NOT_FOUND refusal AND that no write or unscoped read
 * reached the data layer, so deleting any one guard fails this suite.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  /** What the ownership probe reports for the id under test. */
  tenant: null as Record<string, unknown> | null,
  /** How many of a bulk request's ids the scoped count reports as ours. */
  ownedCount: 0,
  writes: [] as string[],
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string) => {
    if (query.includes('"memberOrgIds"')) return h.tenant
    if (query.startsWith('count(')) return h.ownedCount
    return null
  }
  const patchChain = (id: string) => {
    h.writes.push(`patch:${id}`)
    const chain = {
      set: () => chain,
      unset: () => chain,
      setIfMissing: () => chain,
      commit: async () => ({ _id: id }),
    }
    return chain
  }
  const client = {
    fetch,
    patch: patchChain,
    delete: async (id: string) => {
      h.writes.push(`delete:${id}`)
      return { results: [] }
    },
    create: async () => ({ _id: 'new' }),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

const lib = vi.hoisted(() => ({
  getSponsor: vi.fn(),
  updateSponsor: vi.fn(),
  deleteSponsor: vi.fn(),
  getSponsorTier: vi.fn(),
  updateSponsorTier: vi.fn(),
  deleteSponsorTier: vi.fn(),
  bulkUpdateSponsors: vi.fn(),
  bulkDeleteSponsors: vi.fn(),
  deleteSponsorForConference: vi.fn(),
  createSponsorActivity: vi.fn(),
  getContractTemplate: vi.fn(),
  updateContractTemplate: vi.fn(),
  deleteContractTemplate: vi.fn(),
}))

vi.mock('@/lib/sponsor/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getSponsor: lib.getSponsor,
  updateSponsor: lib.updateSponsor,
  deleteSponsor: lib.deleteSponsor,
  getSponsorTier: lib.getSponsorTier,
  updateSponsorTier: lib.updateSponsorTier,
  deleteSponsorTier: lib.deleteSponsorTier,
}))
vi.mock('@/lib/sponsor-crm/bulk', () => ({
  bulkUpdateSponsors: lib.bulkUpdateSponsors,
  bulkDeleteSponsors: lib.bulkDeleteSponsors,
}))
vi.mock('@/lib/sponsor-crm/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  deleteSponsorForConference: lib.deleteSponsorForConference,
}))
vi.mock('@/lib/sponsor-crm/activity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createSponsorActivity: lib.createSponsorActivity,
}))
vi.mock('@/lib/sponsor-crm/contract-templates', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getContractTemplate: lib.getContractTemplate,
  updateContractTemplate: lib.updateContractTemplate,
  deleteContractTemplate: lib.deleteContractTemplate,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const sponsor = () => t.createCallerFactory(sponsorRouter)(ctx())

/** The probe reports the target as belonging to ANOTHER tenant. */
function foreign(type: string) {
  h.tenant = {
    _type: type,
    orgId: 'org-B',
    conferenceId: 'conf-OTHER',
    conferenceOrgId: 'org-B',
    memberOrgIds: [],
  }
}
/** The probe reports the target as ours. */
function owned(type: string) {
  h.tenant = {
    _type: type,
    orgId: ORG_A,
    conferenceId: CONF_A,
    conferenceOrgId: ORG_A,
    memberOrgIds: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.writes.length = 0
  h.tenant = null
  h.ownedCount = 0
  h.getConference.mockResolvedValue({
    conference: { _id: CONF_A, organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
  lib.getSponsor.mockResolvedValue({
    sponsor: { _id: 'sp-B', name: 'Foreign AS' },
    error: null,
  })
  lib.updateSponsor.mockResolvedValue({
    sponsor: { _id: 'sp-B' },
    error: null,
  })
  lib.deleteSponsor.mockResolvedValue({ error: null })
  lib.getSponsorTier.mockResolvedValue({
    sponsorTier: { _id: 'tier-B', title: 'Gold' },
    error: null,
  })
  lib.updateSponsorTier.mockResolvedValue({
    sponsorTier: { _id: 'tier-B' },
    error: null,
  })
  lib.deleteSponsorTier.mockResolvedValue({ error: null })
  lib.bulkUpdateSponsors.mockResolvedValue({ updated: 0, error: null })
  lib.bulkDeleteSponsors.mockResolvedValue({ deleted: 0, error: null })
  lib.deleteSponsorForConference.mockResolvedValue({ error: null })
  lib.createSponsorActivity.mockResolvedValue({
    activityId: 'act-1',
    error: null,
  })
  lib.getContractTemplate.mockResolvedValue({
    template: { _id: 'tpl-B', title: 'Foreign' },
    error: null,
  })
  lib.updateContractTemplate.mockResolvedValue({
    template: { _id: 'tpl-B' },
    error: null,
  })
  lib.deleteContractTemplate.mockResolvedValue({ error: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sponsor (org-owned) mutations refuse a foreign id (#730)', () => {
  it('update refuses another tenant’s sponsor', async () => {
    foreign('sponsor')
    await expect(
      sponsor().update({ id: 'sp-B', data: { name: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.updateSponsor).not.toHaveBeenCalled()
  })

  /**
   * #731 F6. The guard used to sit INSIDE `if (Object.keys(data).length > 0)`,
   * so an empty patch skipped it entirely and the `else` arm returned any
   * tenant's sponsor record — a cross-tenant read and an existence oracle in a
   * procedure the PR listed as guarded.
   */
  it('update with an EMPTY data object still runs the guard', async () => {
    foreign('sponsor')
    await expect(
      sponsor().update({ id: 'sp-B', data: {} }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.getSponsor).not.toHaveBeenCalled()
  })

  it('getById refuses another tenant’s sponsor', async () => {
    foreign('sponsor')
    await expect(sponsor().getById({ id: 'sp-B' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(lib.getSponsor).not.toHaveBeenCalled()
  })

  it('delete refuses another tenant’s sponsor', async () => {
    foreign('sponsor')
    await expect(sponsor().delete({ id: 'sp-B' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(lib.deleteSponsor).not.toHaveBeenCalled()
  })

  it('our OWN sponsor still reads, updates and deletes', async () => {
    owned('sponsor')
    await expect(sponsor().getById({ id: 'sp-A' })).resolves.toBeTruthy()
    await expect(
      sponsor().update({ id: 'sp-A', data: {} }),
    ).resolves.toBeTruthy()
    await expect(sponsor().delete({ id: 'sp-A' })).resolves.toBeTruthy()
    // Both layers: the router guard proved ownership and constrained _type,
    // and the org id is still passed down so deleteSponsor re-proves it before
    // cascading. Asserting the single-argument form would pin the pre-merge
    // shape and quietly drop the data-layer half.
    expect(lib.deleteSponsor).toHaveBeenCalledWith('sp-A', 'org-A')
  })
})

describe('sponsorTier (conference-owned) mutations refuse a foreign id (#730)', () => {
  it('getById refuses another conference’s tier', async () => {
    foreign('sponsorTier')
    await expect(
      sponsor().tiers.getById({ id: 'tier-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.getSponsorTier).not.toHaveBeenCalled()
  })

  it('update refuses another conference’s tier', async () => {
    foreign('sponsorTier')
    await expect(
      sponsor().tiers.update({ id: 'tier-B', data: { title: 'pwned' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.updateSponsorTier).not.toHaveBeenCalled()
  })

  it('update with an EMPTY data object still runs the guard (#731 F6)', async () => {
    foreign('sponsorTier')
    await expect(
      sponsor().tiers.update({ id: 'tier-B', data: {} }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.getSponsorTier).not.toHaveBeenCalled()
  })

  it('delete refuses another conference’s tier', async () => {
    foreign('sponsorTier')
    await expect(
      sponsor().tiers.delete({ id: 'tier-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.deleteSponsorTier).not.toHaveBeenCalled()
  })

  it('a sponsor id is refused through the TIER endpoint — wrong `_type`', async () => {
    h.tenant = {
      _type: 'sponsor',
      orgId: ORG_A,
      conferenceId: CONF_A,
      conferenceOrgId: ORG_A,
      memberOrgIds: [],
    }
    await expect(sponsor().tiers.delete({ id: 'sp-A' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(lib.deleteSponsorTier).not.toHaveBeenCalled()
  })

  it('our OWN tier still reads, updates and deletes', async () => {
    owned('sponsorTier')
    await expect(
      sponsor().tiers.getById({ id: 'tier-A' }),
    ).resolves.toBeTruthy()
    await expect(
      sponsor().tiers.update({ id: 'tier-A', data: {} }),
    ).resolves.toBeTruthy()
    await expect(sponsor().tiers.delete({ id: 'tier-A' })).resolves.toBeTruthy()
    // Both layers — see the sponsor case above.
    expect(lib.deleteSponsorTier).toHaveBeenCalledWith(
      'tier-A',
      expect.any(String),
    )
  })
})

describe('sponsor CRM bulk and single mutations are conference-scoped (#730)', () => {
  it('crm.bulkUpdate refuses the WHOLE batch when one id is not ours', async () => {
    h.ownedCount = 1
    await expect(
      sponsor().crm.bulkUpdate({ ids: ['sfc-A', 'sfc-B'], status: 'prospect' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.bulkUpdateSponsors).not.toHaveBeenCalled()
  })

  /** The review's named gap: no bulk-refusal test existed for bulkDelete. */
  it('crm.bulkDelete refuses the WHOLE batch when one id is not ours', async () => {
    h.ownedCount = 1
    await expect(
      sponsor().crm.bulkDelete({ ids: ['sfc-A', 'sfc-B'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.bulkDeleteSponsors).not.toHaveBeenCalled()
  })

  it('crm.bulkDelete deletes when EVERY id is ours', async () => {
    h.ownedCount = 2
    await sponsor().crm.bulkDelete({ ids: ['sfc-A', 'sfc-A2'] })
    expect(lib.bulkDeleteSponsors).toHaveBeenCalled()
  })

  it('crm.bulkUpdate updates when EVERY id is ours', async () => {
    h.ownedCount = 2
    await sponsor().crm.bulkUpdate({
      ids: ['sfc-A', 'sfc-A2'],
      status: 'prospect',
    })
    expect(lib.bulkUpdateSponsors).toHaveBeenCalled()
  })

  it('crm.delete refuses another conference’s sponsor relationship', async () => {
    foreign('sponsorForConference')
    await expect(sponsor().crm.delete({ id: 'sfc-B' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(lib.deleteSponsorForConference).not.toHaveBeenCalled()
  })

  it('crm.delete deletes our own sponsor relationship', async () => {
    owned('sponsorForConference')
    await expect(sponsor().crm.delete({ id: 'sfc-A' })).resolves.toBeTruthy()
    expect(lib.deleteSponsorForConference).toHaveBeenCalled()
  })

  it('crm.activities.create refuses another conference’s sponsor relationship', async () => {
    foreign('sponsorForConference')
    await expect(
      sponsor().crm.activities.create({
        sponsorForConferenceId: 'sfc-B',
        activityType: 'note',
        description: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.createSponsorActivity).not.toHaveBeenCalled()
  })

  it('crm.activities.create still works for our own sponsor relationship', async () => {
    owned('sponsorForConference')
    await expect(
      sponsor().crm.activities.create({
        sponsorForConferenceId: 'sfc-A',
        activityType: 'note',
        description: 'x',
      }),
    ).resolves.toBeTruthy()
    expect(lib.createSponsorActivity).toHaveBeenCalled()
  })
})

describe('contract templates are conference-scoped (#730)', () => {
  it('get refuses another conference’s template', async () => {
    foreign('contractTemplate')
    await expect(
      sponsor().contractTemplates.get({ id: 'tpl-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.getContractTemplate).not.toHaveBeenCalled()
  })

  it('update refuses another conference’s template', async () => {
    foreign('contractTemplate')
    await expect(
      sponsor().contractTemplates.update({ id: 'tpl-B', title: 'pwned' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.updateContractTemplate).not.toHaveBeenCalled()
  })

  it('delete refuses another conference’s template', async () => {
    foreign('contractTemplate')
    await expect(
      sponsor().contractTemplates.delete({ id: 'tpl-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.deleteContractTemplate).not.toHaveBeenCalled()
  })

  it('our OWN template still reads, updates and deletes', async () => {
    owned('contractTemplate')
    await expect(
      sponsor().contractTemplates.get({ id: 'tpl-A' }),
    ).resolves.toBeTruthy()
    await expect(
      sponsor().contractTemplates.update({ id: 'tpl-A', title: 'Renamed' }),
    ).resolves.toBeTruthy()
    await expect(
      sponsor().contractTemplates.delete({ id: 'tpl-A' }),
    ).resolves.toBeTruthy()
    expect(lib.deleteContractTemplate).toHaveBeenCalledWith('tpl-A')
  })
})

/**
 * SURFACE TRIPWIRE, matching `tenancy.writes.test.ts`. Pins the sponsor router's
 * mutation set so adding one is a deliberate act that forces the author to
 * decide whether its id comes from client input.
 */
describe('the sponsor mutation surface is pinned (#731 F10)', () => {
  function mutationPaths(router: unknown) {
    const procedures = (
      router as {
        _def: { procedures: Record<string, { _def?: { type?: string } }> }
      }
    )._def.procedures
    return Object.entries(procedures)
      .filter(([, p]) => p._def?.type === 'mutation')
      .map(([path]) => path)
      .sort()
  }

  it('sponsor', () => {
    expect(mutationPaths(sponsorRouter)).toMatchSnapshot()
  })
})
