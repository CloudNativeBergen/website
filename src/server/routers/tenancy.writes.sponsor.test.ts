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
  /**
   * PER-ID answers, for the procedures that carry SEVERAL client-supplied ids at
   * once (#863 row 7: `sponsor`, `tier`, `addons[]`, `contractTemplate`). Falls
   * back to `tenant` for any id not listed.
   */
  tenantById: {} as Record<string, Record<string, unknown> | null>,
  /** How many of a bulk request's ids the scoped count reports as ours. */
  ownedCount: 0,
  writes: [] as string[],
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string, params?: Record<string, unknown>) => {
    if (query.includes('"memberOrgIds"')) {
      const id = params?.id as string | undefined
      if (id && id in h.tenantById) return h.tenantById[id]
      return h.tenant
    }
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
  listActivitiesForSponsor: vi.fn(),
  listActivitiesForConference: vi.fn(),
  getSponsorForConference: vi.fn(),
  createSponsorForConference: vi.fn(),
  updateSponsorForConference: vi.fn(),
  getContractTemplate: vi.fn(),
  updateContractTemplate: vi.fn(),
  deleteContractTemplate: vi.fn(),
  generateContractPdf: vi.fn(),
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
  getSponsorForConference: lib.getSponsorForConference,
  createSponsorForConference: lib.createSponsorForConference,
  updateSponsorForConference: lib.updateSponsorForConference,
}))
vi.mock('@/lib/sponsor-crm/activities', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  listActivitiesForSponsor: lib.listActivitiesForSponsor,
  listActivitiesForConference: lib.listActivitiesForConference,
}))
vi.mock('@/lib/sponsor-crm/activity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  createSponsorActivity: lib.createSponsorActivity,
}))
vi.mock('@/lib/sponsor-crm/contract-pdf', () => ({
  generateContractPdf: lib.generateContractPdf,
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

/**
 * What an unguarded `crm.activities.list` handed back: another tenant's
 * free-text negotiation notes, with the organizer who wrote them named.
 */
const FOREIGN_ACTIVITY = {
  _id: 'act-B',
  activityType: 'note',
  description: 'They will not go above 40k — push the gold tier at renewal.',
  createdBy: { _id: 'sp-B', name: 'Their Organizer' },
}

/** The title of the OTHER tenant's contract template, as it would render. */
const FOREIGN_TEMPLATE_TITLE = 'Their standard terms'

/**
 * Ours, and complete enough that every readiness guard in `sendContract` passes
 * — tier, positive value, a live deal, a primary contact and a titled
 * conference. So the only thing that can stop these procedures is the template.
 */
const CONTRACT_READY_SFC = {
  _id: 'sfc-A',
  sponsor: { _id: 'sp-A', name: 'Acme AS', orgNumber: '123456789' },
  conference: { _id: CONF_A, title: 'Our Conference' },
  tier: { _id: 'tier-A', title: 'Gold', tagline: '' },
  status: 'negotiating',
  contractStatus: 'verbal-agreement',
  contractValue: 50000,
  contractCurrency: 'NOK',
  invoiceStatus: 'not-sent',
  contactPersons: [
    { _key: 'c1', name: 'Jane Doe', email: 'jane@acme.test', isPrimary: true },
  ],
}

/** The titles of every template that actually reached the PDF renderer. */
const rendered = () =>
  lib.generateContractPdf.mock.calls.map(
    (call) => (call[0] as { title: string }).title,
  )

/** A tenancy answer for ONE id, for the multi-reference procedures. */
function tenantOf(kind: 'ours' | 'theirs', type: string) {
  return kind === 'ours'
    ? {
        _type: type,
        orgId: ORG_A,
        conferenceId: CONF_A,
        conferenceOrgId: ORG_A,
        memberOrgIds: [],
      }
    : {
        _type: type,
        orgId: 'org-B',
        conferenceId: 'conf-OTHER',
        conferenceOrgId: 'org-B',
        memberOrgIds: [],
      }
}

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
  h.tenantById = {}
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
  lib.getContractTemplate.mockImplementation(async (id: string) => ({
    template: {
      _id: id,
      title: id === 'tpl-A' ? 'Our terms' : FOREIGN_TEMPLATE_TITLE,
    },
    error: null,
  }))
  lib.generateContractPdf.mockResolvedValue(Buffer.from('%PDF-1.7'))
  lib.updateContractTemplate.mockResolvedValue({
    template: { _id: 'tpl-B' },
    error: null,
  })
  lib.deleteContractTemplate.mockResolvedValue({ error: null })
  lib.listActivitiesForSponsor.mockResolvedValue({
    activities: [FOREIGN_ACTIVITY],
    error: null,
  })
  lib.listActivitiesForConference.mockResolvedValue({
    activities: [],
    error: null,
  })
  // A COMPLETE, contract-ready relationship of OURS. Rows 5-6 are about the
  // second id in the payload (`templateId`), so the first one must not be what
  // stops the procedure — otherwise removing the template guard would still
  // refuse, for the wrong reason, and the test would pass while blind.
  lib.getSponsorForConference.mockResolvedValue({
    sponsorForConference: CONTRACT_READY_SFC,
    error: undefined,
  })
  lib.createSponsorForConference.mockResolvedValue({
    sponsorForConference: { _id: 'sfc-new' },
    error: undefined,
  })
  lib.updateSponsorForConference.mockResolvedValue({
    sponsorForConference: { _id: 'sfc-A' },
    error: undefined,
  })
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
 * #863 row 4. `crm.activities.list` has two branches: the conference one was
 * already scoped, the `sponsorForConferenceId` one filtered on
 * `sponsorForConference._ref == $sponsorId` and NOTHING else. The sibling
 * `activities.create` guards the same id — only the read did not.
 */
describe('crm.activities.list is conference-scoped (#863 row 4)', () => {
  async function settle<T>(p: Promise<T>) {
    try {
      return { value: await p, error: undefined as unknown }
    } catch (error) {
      return { value: undefined, error }
    }
  }

  it('does not return another conference’s CRM notes', async () => {
    foreign('sponsorForConference')

    const outcome = await settle(
      sponsor().crm.activities.list({ sponsorForConferenceId: 'sfc-B' }),
    )

    // Unguarded this RESOLVES with `[FOREIGN_ACTIVITY]`, so this fails on the
    // note text and the author name coming back, not on a moved message.
    expect(outcome.value).toBeUndefined()
    expect(JSON.stringify(outcome.value ?? '')).not.toContain('gold tier')
    expect(outcome.error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses BEFORE the read', async () => {
    foreign('sponsorForConference')

    await settle(
      sponsor().crm.activities.list({ sponsorForConferenceId: 'sfc-B' }),
    )

    expect(lib.listActivitiesForSponsor).not.toHaveBeenCalled()
  })

  it('still lists our OWN sponsor’s activities', async () => {
    owned('sponsorForConference')

    await expect(
      sponsor().crm.activities.list({ sponsorForConferenceId: 'sfc-A' }),
    ).resolves.toEqual([FOREIGN_ACTIVITY])
    expect(lib.listActivitiesForSponsor).toHaveBeenCalledWith(
      'sfc-A',
      undefined,
    )
  })

  it('the conference-wide branch is untouched', async () => {
    await expect(sponsor().crm.activities.list({})).resolves.toEqual([])
    expect(lib.listActivitiesForConference).toHaveBeenCalled()
  })
})

/**
 * #863 rows 5-6. Both procedures take a `templateId` straight from the client
 * and read it with the GLOBAL `getContractTemplate`. `sendContract` renders the
 * result into the PDF this conference signs and mails; `generatePdf` hands it
 * back to the caller as base64, so a foreign template's full terms were readable
 * without sending anything.
 */
describe('contract rendering refuses a foreign template (#863 rows 5-6)', () => {
  async function settle<T>(p: Promise<T>) {
    try {
      return { value: await p, error: undefined as unknown }
    } catch (error) {
      return { value: undefined, error }
    }
  }

  it('sendContract does not render another tenant’s terms', async () => {
    // The sponsor half is OURS and contract-ready, so nothing but the template
    // guard can stop this. Unguarded, `rendered()` holds the other tenant's
    // template — which is what would have been signed and mailed.
    h.tenantById = { 'tpl-B': tenantOf('theirs', 'contractTemplate') }

    const outcome = await settle(
      sponsor().crm.sendContract({
        sponsorForConferenceId: 'sfc-A',
        templateId: 'tpl-B',
      }),
    )

    expect(rendered()).toEqual([])
    expect(lib.getContractTemplate).not.toHaveBeenCalled()
    expect(outcome.error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('generatePdf does not return another tenant’s terms as a PDF', async () => {
    h.tenantById = { 'tpl-B': tenantOf('theirs', 'contractTemplate') }

    const outcome = await settle(
      sponsor().contractTemplates.generatePdf({
        sponsorForConferenceId: 'sfc-A',
        templateId: 'tpl-B',
      }),
    )

    // Unguarded this RESOLVES with `{ pdf: <base64>, filename }` built from the
    // foreign template, so the first two lines fail on what was rendered and
    // handed back, not on a message.
    expect(rendered()).toEqual([])
    expect(outcome.value).toBeUndefined()
    expect(lib.getContractTemplate).not.toHaveBeenCalled()
    expect(outcome.error).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('generatePdf still renders OUR OWN template', async () => {
    h.tenantById = { 'tpl-A': tenantOf('ours', 'contractTemplate') }

    await expect(
      sponsor().contractTemplates.generatePdf({
        sponsorForConferenceId: 'sfc-A',
        templateId: 'tpl-A',
      }),
    ).resolves.toMatchObject({ pdf: expect.any(String) })
    expect(rendered()).toEqual(['Our terms'])
  })

  it('sendContract still reaches OUR OWN template', async () => {
    // Delivery itself (asset upload, mail) is out of scope here; getting past
    // the guard to the template read is the positive result.
    h.tenantById = { 'tpl-A': tenantOf('ours', 'contractTemplate') }

    await settle(
      sponsor().crm.sendContract({
        sponsorForConferenceId: 'sfc-A',
        templateId: 'tpl-A',
      }),
    )

    expect(lib.getContractTemplate).toHaveBeenCalledWith('tpl-A')
    expect(rendered()).toEqual(['Our terms'])
  })

  it('a foreign template id refuses exactly as an unknown one does', async () => {
    h.tenantById = { 'tpl-B': tenantOf('theirs', 'contractTemplate') }
    const foreignOutcome = await settle(
      sponsor().contractTemplates.generatePdf({
        sponsorForConferenceId: 'sfc-A',
        templateId: 'tpl-B',
      }),
    )
    h.tenantById = {} // nothing knows this id at all
    const unknownOutcome = await settle(
      sponsor().contractTemplates.generatePdf({
        sponsorForConferenceId: 'sfc-A',
        templateId: 'tpl-nowhere',
      }),
    )

    expect(foreignOutcome.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'No contractTemplate with that id for this request',
    })
    expect(unknownOutcome.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'No contractTemplate with that id for this request',
    })
  })
})

/**
 * #863 row 7 — REFERENCE INJECTION, the #731 F1/F4 shape.
 *
 * `crm.create`/`crm.update` write four client-supplied ids into reference fields
 * of a record this org owns. No foreign document is patched, so the guards on
 * the record itself never saw them — but every scoped view DEREFERENCES them, so
 * another tenant's company, pricing and contract terms render inside this
 * tenant's pipeline. `tierExists` was the only check and it asked existence
 * only, dataset-wide.
 */
describe('CRM references must belong to this tenant (#863 row 7)', () => {
  const base = {
    sponsor: 'sp-A',
    status: 'prospect' as const,
    contractStatus: 'none' as const,
    invoiceStatus: 'not-sent' as const,
    // Explicit null: `undefined` would auto-assign the caller and drag the
    // organizer lookup into these cases, which are about REFERENCES.
    assignedTo: null,
  }

  it('create refuses a foreign SPONSOR ref', async () => {
    h.tenantById = { 'sp-B': tenantOf('theirs', 'sponsor') }

    await expect(
      sponsor().crm.create({ ...base, sponsor: 'sp-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.createSponsorForConference).not.toHaveBeenCalled()
  })

  it('create refuses a foreign TIER ref', async () => {
    h.tenantById = {
      'sp-A': tenantOf('ours', 'sponsor'),
      'tier-B': tenantOf('theirs', 'sponsorTier'),
    }

    await expect(
      sponsor().crm.create({ ...base, tier: 'tier-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.createSponsorForConference).not.toHaveBeenCalled()
  })

  it('create refuses a foreign CONTRACT TEMPLATE ref', async () => {
    h.tenantById = {
      'sp-A': tenantOf('ours', 'sponsor'),
      'tpl-B': tenantOf('theirs', 'contractTemplate'),
    }

    await expect(
      sponsor().crm.create({ ...base, contractTemplate: 'tpl-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.createSponsorForConference).not.toHaveBeenCalled()
  })

  it('create refuses the WHOLE addons array when one id is not ours', async () => {
    h.tenantById = { 'sp-A': tenantOf('ours', 'sponsor') }
    h.ownedCount = 1 // one of the two supplied add-ons is ours

    await expect(
      sponsor().crm.create({ ...base, addons: ['add-A', 'add-B'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.createSponsorForConference).not.toHaveBeenCalled()
  })

  it('create writes the record when every reference is ours', async () => {
    h.tenantById = {
      'sp-A': tenantOf('ours', 'sponsor'),
      'tier-A': tenantOf('ours', 'sponsorTier'),
      'tpl-A': tenantOf('ours', 'contractTemplate'),
    }
    h.ownedCount = 2

    await expect(
      sponsor().crm.create({
        ...base,
        tier: 'tier-A',
        addons: ['add-A', 'add-B'],
        contractTemplate: 'tpl-A',
      }),
    ).resolves.toMatchObject({ _id: 'sfc-new' })
    expect(lib.createSponsorForConference).toHaveBeenCalledWith(
      expect.objectContaining({ sponsor: 'sp-A', tier: 'tier-A' }),
    )
  })

  it('update refuses a foreign TIER ref', async () => {
    h.tenantById = { 'tier-B': tenantOf('theirs', 'sponsorTier') }

    await expect(
      sponsor().crm.update({ id: 'sfc-A', tier: 'tier-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('update refuses a foreign CONTRACT TEMPLATE ref', async () => {
    h.tenantById = { 'tpl-B': tenantOf('theirs', 'contractTemplate') }

    await expect(
      sponsor().crm.update({ id: 'sfc-A', contractTemplate: 'tpl-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.updateSponsorForConference).not.toHaveBeenCalled()
  })

  it('update refuses BEFORE the record is even read', async () => {
    h.tenantById = { 'tier-B': tenantOf('theirs', 'sponsorTier') }

    await expect(
      sponsor().crm.update({ id: 'sfc-A', tier: 'tier-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(lib.getSponsorForConference).not.toHaveBeenCalled()
  })

  it('update still applies our OWN tier', async () => {
    h.tenantById = { 'tier-A': tenantOf('ours', 'sponsorTier') }
    lib.getSponsorForConference.mockResolvedValue({
      sponsorForConference: {
        _id: 'sfc-A',
        conference: { _id: CONF_A },
        status: 'negotiating',
        invoiceStatus: 'not-sent',
      },
      error: undefined,
    })

    await expect(
      sponsor().crm.update({ id: 'sfc-A', tier: 'tier-A' }),
    ).resolves.toMatchObject({ _id: 'sfc-A' })
    expect(lib.updateSponsorForConference).toHaveBeenCalledWith(
      'sfc-A',
      expect.objectContaining({ tier: 'tier-A' }),
    )
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
