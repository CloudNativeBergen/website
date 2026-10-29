import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  buildRenewalDoc,
  copyToNextEdition,
  getPreviousEditionRenewals,
  getRenewalContext,
  isRenewalWindowOpen,
  type NextEdition,
  type RenewalSource,
} from './renewal'
import { generateRenewalItems } from './action-items'
import { createSponsorActivity } from './activity'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { create: vi.fn() },
}))
vi.mock('./activity', () => ({ createSponsorActivity: vi.fn() }))

const fetchMock = vi.mocked(clientReadUncached.fetch) as unknown as ReturnType<
  typeof vi.fn
>

const source: RenewalSource = {
  _id: 'sfc-old',
  sponsor: { _ref: 's-1' },
  sponsorName: 'Acme',
  assignedTo: { _ref: 'org-kari' },
  contactPersons: [{ _key: 'c1', name: 'Ada', email: 'ada@acme.test' }],
  billing: { email: 'billing@acme.test', reference: 'PO-1' },
  tierTitle: 'Gold',
  conference: { _id: 'conf-2025', title: 'CNB 2025', startDate: '2025-10-27' },
}
const next: NextEdition = {
  _id: 'conf-2026',
  title: 'CNB 2026',
  domain: '2026.example.test',
  organizers: ['org-kari'],
  tierId: 'tier-gold-2026',
}

beforeEach(() => vi.clearAllMocks())

describe('buildRenewalDoc', () => {
  it('copies sponsor, owner, contacts, billing and the same-title tier as a prospect', () => {
    expect(buildRenewalDoc(source, next)).toEqual({
      _type: 'sponsorForConference',
      sponsor: { _type: 'reference', _ref: 's-1' },
      conference: { _type: 'reference', _ref: 'conf-2026' },
      status: 'prospect',
      invoiceStatus: 'not-sent',
      assignedTo: { _type: 'reference', _ref: 'org-kari' },
      tier: { _type: 'reference', _ref: 'tier-gold-2026' },
      contactPersons: source.contactPersons,
      billing: source.billing,
    })
  })

  it('never copies contract, signature, invoice, codes, tokens or tags', () => {
    const dirty = {
      ...source,
      contractStatus: 'contract-signed',
      signatureStatus: 'signed',
      invoiceStatus: 'paid',
      discountCodes: ['X'],
      registrationToken: 'tok',
      tags: ['returning-sponsor'],
    } as RenewalSource
    const doc = buildRenewalDoc(dirty, next) as Record<string, unknown>
    for (const key of [
      'contractStatus',
      'contractValue',
      'signatureStatus',
      'discountCodes',
      'registrationToken',
      'tags',
    ]) {
      expect(doc).not.toHaveProperty(key)
    }
    expect(doc.invoiceStatus).toBe('not-sent')
  })

  it('leaves the tier unset when no tier has the same title', () => {
    const doc = buildRenewalDoc(source, { ...next, tierId: undefined })
    expect(doc).not.toHaveProperty('tier')
  })

  it('drops the owner when they do not organize the next edition', () => {
    const doc = buildRenewalDoc(source, { ...next, organizers: [] })
    expect(doc).not.toHaveProperty('assignedTo')
  })
})

describe('getRenewalContext', () => {
  it('reads the conference org-scoped and stops on a foreign one', async () => {
    fetchMock.mockResolvedValueOnce(null)
    const result = await getRenewalContext('org-a', 'conf-other', 'sfc-old')
    expect(result).toEqual({ source: null, next: null })
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('organization._ref == $orgId')
    expect(params).toMatchObject({ orgId: 'org-a' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('scopes the next edition to the same org and matches the tier by title', async () => {
    fetchMock
      .mockResolvedValueOnce(source.conference)
      .mockResolvedValueOnce({ ...source, conference: undefined })
      .mockResolvedValueOnce(next)
    const result = await getRenewalContext('org-a', 'conf-2025', 'sfc-old')
    expect(result.next).toEqual(next)
    const [, sourceParams] = fetchMock.mock.calls[1]
    expect(sourceParams).toEqual({ id: 'sfc-old', conferenceId: 'conf-2025' })
    const [query, params] = fetchMock.mock.calls[2]
    expect(query).toContain('organization._ref == $orgId')
    expect(query).toContain('title == $tierTitle')
    expect(params).toMatchObject({
      orgId: 'org-a',
      startDate: '2025-10-27',
      sponsorId: 's-1',
      tierTitle: 'Gold',
    })
  })

  it('returns no next edition when none exists', async () => {
    fetchMock
      .mockResolvedValueOnce(source.conference)
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(null)
    const result = await getRenewalContext('org-a', 'conf-2025', 'sfc-old')
    expect(result.next).toBeNull()
  })
})

describe('copyToNextEdition', () => {
  it('logs an activity on both records', async () => {
    vi.mocked(clientWrite.create).mockResolvedValue({ _id: 'sfc-new' } as never)
    const id = await copyToNextEdition(source, next, 'user-1')
    expect(id).toBe('sfc-new')
    expect(createSponsorActivity).toHaveBeenCalledWith(
      'sfc-new',
      'note',
      'Copied from CNB 2025',
      'user-1',
    )
    expect(createSponsorActivity).toHaveBeenCalledWith(
      'sfc-old',
      'note',
      'Copied to CNB 2026',
      'user-1',
    )
  })
})

describe('renewal reminders (R2)', () => {
  it('opens exactly 6 months before the start date', () => {
    expect(
      isRenewalWindowOpen('2026-10-27', new Date('2026-04-26T23:59:59Z')),
    ).toBe(false)
    expect(
      isRenewalWindowOpen('2026-10-27', new Date('2026-04-27T00:00:00Z')),
    ).toBe(true)
  })

  const row = {
    currentStartDate: '2026-10-27',
    edition: {
      _id: 'conf-2025',
      title: 'CNB 2025',
      domain: '2025.example.test',
    },
    candidates: [{ _id: 'sfc-old', name: 'Acme' }],
  }

  it('returns nothing before the window opens', async () => {
    fetchMock.mockResolvedValueOnce(row)
    expect(
      await getPreviousEditionRenewals(
        'org-a',
        'conf-2026',
        new Date('2026-01-01'),
      ),
    ).toBeNull()
  })

  it('is one org-scoped query that excludes sponsors with a deal this year', async () => {
    fetchMock.mockResolvedValueOnce(row)
    const result = await getPreviousEditionRenewals(
      'org-a',
      'conf-2026',
      new Date('2026-06-01'),
    )
    expect(result?.candidates).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('organization._ref == $orgId')
    expect(query).toContain(
      '!(sponsor._ref in *[_type == "sponsorForConference" && conference._ref == $conferenceId].sponsor._ref)',
    )
    expect(params).toMatchObject({ orgId: 'org-a', conferenceId: 'conf-2026' })
  })

  it('returns nothing when another organization owns the conference', async () => {
    // The org predicate filters the foreign previous edition out: null row.
    fetchMock.mockResolvedValueOnce(null)
    expect(
      await getPreviousEditionRenewals(
        'org-b',
        'conf-2026',
        new Date('2026-06-01'),
      ),
    ).toBeNull()
  })

  it('maps candidates to items linking to the old record on its domain', () => {
    const items = generateRenewalItems(row)
    expect(items).toEqual([
      expect.objectContaining({
        id: 'sfc-old-renewal',
        description: 'Sponsored CNB 2025, not contacted for this year',
        link: 'https://2025.example.test/admin/sponsors/sfc-old',
      }),
    ])
    expect(generateRenewalItems(null)).toEqual([])
  })
})
