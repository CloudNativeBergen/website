/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  copyToNextEdition,
  getPreviousEditionRenewals,
  getRenewalContext,
} from '@/lib/sponsor-crm/renewal'

vi.mock('@/lib/conference/sanity')
vi.mock('@/lib/sponsor-crm/renewal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  copyToNextEdition: vi.fn(),
  getPreviousEditionRenewals: vi.fn(),
  getRenewalContext: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const ORG = 'org-test'
const organizer = {
  _id: 'spk-1',
  name: 'Org',
  email: 'org@test.com',
  isOrganizer: true,
  organizerOrgIds: [ORG],
}
const caller = () =>
  appRouter.createCaller({
    session: { user: { email: organizer.email }, speaker: organizer },
    speaker: organizer,
    user: { email: organizer.email },
  } as any)

const source = {
  _id: 'sfc-old',
  sponsor: { _ref: 's-1' },
  conference: {
    _id: 'conf-1',
    title: 'CNB 2025',
    startDate: '2025-10-27',
    endDate: '2025-10-28',
  },
}
const next = { _id: 'conf-2', title: 'CNB 2026', domains: ['2026.test'] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: {
      _id: 'conf-1',
      organization: { _type: 'reference', _ref: ORG },
    } as any,
    domain: 'test.com',
    error: null,
    status: 'resolved' as const,
  })
})

describe('sponsor.crm.copyToNextYear', () => {
  it('passes the REQUEST org and conference, and creates the prospect', async () => {
    vi.mocked(getRenewalContext).mockResolvedValue({
      source,
      next,
    } as any)
    vi.mocked(copyToNextEdition).mockResolvedValue({
      id: 'sfc-new',
      created: true,
    })
    const result = await caller().sponsor.crm.copyToNextYear({ id: 'sfc-old' })
    expect(getRenewalContext).toHaveBeenCalledWith(ORG, 'conf-1', 'sfc-old')
    expect(result).toEqual({
      id: 'sfc-new',
      origin: 'https://2026.test',
      created: true,
    })
  })

  it('refuses a record outside this conference or org as NOT_FOUND', async () => {
    vi.mocked(getRenewalContext).mockResolvedValue({ source: null, next: null })
    await expect(
      caller().sponsor.crm.copyToNextYear({ id: 'sfc-foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(copyToNextEdition).not.toHaveBeenCalled()
  })

  it('links to the existing deal instead of copying', async () => {
    vi.mocked(getRenewalContext).mockResolvedValue({
      source,
      next: { ...next, existingId: 'sfc-2026' },
    } as any)
    const result = await caller().sponsor.crm.copyToNextYear({ id: 'sfc-old' })
    expect(result).toEqual({
      id: 'sfc-2026',
      origin: 'https://2026.test',
      created: false,
    })
    expect(copyToNextEdition).not.toHaveBeenCalled()
  })

  it('refuses without a next edition', async () => {
    vi.mocked(getRenewalContext).mockResolvedValue({
      source,
      next: null,
    } as any)
    await expect(
      caller().sponsor.crm.copyToNextYear({ id: 'sfc-old' }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: "Create next year's conference first",
    })
  })

  it('refuses before the event has ended', async () => {
    vi.mocked(getRenewalContext).mockResolvedValue({
      source: {
        ...source,
        conference: { ...source.conference, endDate: '2999-01-01' },
      },
      next,
    } as any)
    await expect(
      caller().sponsor.crm.copyToNextYear({ id: 'sfc-old' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })
})

describe('sponsor.crm.renewal', () => {
  it('reports the no-next-edition state', async () => {
    vi.mocked(getRenewalContext).mockResolvedValue({
      source,
      next: null,
    } as any)
    expect(await caller().sponsor.crm.renewal({ id: 'sfc-old' })).toEqual({
      eventEnded: true,
      nextEdition: null,
      existingId: null,
    })
  })
})

describe('sponsor.crm.renewalReminders', () => {
  it('queries with the REQUEST org and conference', async () => {
    vi.mocked(getPreviousEditionRenewals).mockResolvedValue(null)
    await caller().sponsor.crm.renewalReminders()
    expect(getPreviousEditionRenewals).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ _id: 'conf-1' }),
    )
  })
})
