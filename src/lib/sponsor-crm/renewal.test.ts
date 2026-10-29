import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  buildRenewalDoc,
  copyToNextEdition,
  getPreviousEditionRenewals,
  getRenewalContext,
  hasEnded,
  isRenewalWindowOpen,
  shapeRenewals,
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
  conference: {
    _id: 'conf-2025',
    title: 'CNB 2025',
    startDate: '2025-10-27',
    endDate: '2025-10-28',
  },
}
const next: NextEdition = {
  _id: 'conf-2026',
  title: 'CNB 2026',
  domains: ['2026.example.test'],
  organizers: ['org-kari'],
  tierId: 'tier-gold-2026',
}

beforeEach(() => vi.clearAllMocks())

describe('buildRenewalDoc', () => {
  it('copies sponsor, owner, contacts, billing and the same-title tier as a prospect', () => {
    expect(buildRenewalDoc(source, next)).toEqual({
      _id: 'sfc-renewal-conf-2026-s-1',
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

  it('does not read the next edition before the event has ended', async () => {
    fetchMock
      .mockResolvedValueOnce(source.conference)
      .mockResolvedValueOnce(source)
    const result = await getRenewalContext(
      'org-a',
      'conf-2025',
      'sfc-old',
      new Date('2025-10-28T12:00:00Z'),
    )
    expect(result.next).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('hasEnded', () => {
  it('flips on the next Oslo day, not the next UTC day', () => {
    // 23:30 UTC on the 28th is already the 29th in Oslo.
    expect(hasEnded('2025-10-28', new Date('2025-10-28T21:00:00Z'))).toBe(false)
    expect(hasEnded('2025-10-28', new Date('2025-10-28T23:30:00Z'))).toBe(true)
  })
})

describe('copyToNextEdition', () => {
  it('creates under the deterministic id and logs on both records', async () => {
    vi.mocked(clientWrite.create).mockResolvedValue({} as never)
    const result = await copyToNextEdition(source, next, 'user-1')
    expect(result).toEqual({ id: 'sfc-renewal-conf-2026-s-1', created: true })
    expect(clientWrite.create).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'sfc-renewal-conf-2026-s-1' }),
    )
    expect(createSponsorActivity).toHaveBeenCalledWith(
      'sfc-renewal-conf-2026-s-1',
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

  it('returns the record a racing organizer created, without logging again', async () => {
    vi.mocked(clientWrite.create).mockRejectedValue(
      Object.assign(new Error('Document already exists'), { statusCode: 409 }),
    )
    const result = await copyToNextEdition(source, next, 'user-2')
    expect(result).toEqual({ id: 'sfc-renewal-conf-2026-s-1', created: false })
    expect(createSponsorActivity).not.toHaveBeenCalled()
  })

  it('rethrows any other write error', async () => {
    vi.mocked(clientWrite.create).mockRejectedValue(new Error('boom'))
    await expect(copyToNextEdition(source, next, 'u')).rejects.toThrow('boom')
  })
})

describe('renewal reminders (R2)', () => {
  it('opens at Oslo midnight 6 months before the start date', () => {
    // 00:00 Oslo is 22:00Z the day before in summer, 23:00Z in winter.
    expect(
      isRenewalWindowOpen('2026-10-27', new Date('2026-04-26T21:59:59Z')),
    ).toBe(false)
    expect(
      isRenewalWindowOpen('2026-10-27', new Date('2026-04-26T22:00:00Z')),
    ).toBe(true)
  })

  it('clamps to the last day of the target month', () => {
    // 31 Aug - 6 months = 28 Feb (2026 is not a leap year), not 3 March.
    expect(
      isRenewalWindowOpen('2026-08-31', new Date('2026-02-27T22:59:59Z')),
    ).toBe(false)
    expect(
      isRenewalWindowOpen('2026-08-31', new Date('2026-02-27T23:00:00Z')),
    ).toBe(true)
  })

  const current = { _id: 'conf-2026', startDate: '2026-10-27' }
  const row = {
    _id: 'conf-2025',
    title: 'CNB 2025',
    domains: ['*.example.test', '2025.example.test'],
    candidates: [{ _id: 'sfc-old', name: 'Acme' }],
  }

  it('issues no query before the window opens', async () => {
    expect(
      await getPreviousEditionRenewals(
        'org-a',
        current,
        new Date('2026-01-01'),
      ),
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is one org-scoped query bound to the current start date', async () => {
    fetchMock.mockResolvedValueOnce(row)
    const result = await getPreviousEditionRenewals(
      'org-a',
      current,
      new Date('2026-06-01'),
    )
    // The wildcard entry is skipped for the first usable origin.
    expect(result?.edition.origin).toBe('https://2025.example.test')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('organization._ref == $orgId')
    expect(params).toEqual({
      orgId: 'org-a',
      conferenceId: 'conf-2026',
      currentStartDate: '2026-10-27',
    })
  })

  it('maps candidates to items linking to the old record', () => {
    const renewals = shapeRenewals(row)
    expect(generateRenewalItems(renewals)).toEqual([
      expect.objectContaining({
        id: 'sfc-old-renewal',
        title: 'Renew Acme',
        description: 'Acme sponsored CNB 2025, not contacted for this year',
        link: 'https://2025.example.test/admin/sponsors/sfc-old',
      }),
    ])
    expect(generateRenewalItems(null)).toEqual([])
  })

  it('leaves the link empty when no domain gives a usable origin', () => {
    const renewals = shapeRenewals({ ...row, domains: ['*.example.test'] })
    expect(renewals?.edition.origin).toBeNull()
    expect(generateRenewalItems(renewals)[0].link).toBe('')
  })
})
