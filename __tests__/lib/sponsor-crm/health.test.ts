import { auditSponsorHealth } from '@/lib/sponsor-crm/health'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

function makeSfc(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-1',
    _createdAt: '',
    _updatedAt: '',
    sponsor: {
      _id: 's1',
      name: 'Acme',
      website: 'https://acme.test',
      logo: '',
    },
    conference: { _id: 'c1', title: 'Test Conf' },
    contractStatus: 'none',
    status: 'negotiating',
    contractCurrency: 'NOK',
    invoiceStatus: 'not-sent',
    ...overrides,
  }
}

const tier: SponsorForConferenceExpanded['tier'] = {
  _id: 'tier-gold',
  title: 'Gold',
  tagline: '',
  tierType: 'standard',
}

describe('auditSponsorHealth', () => {
  it('flags a closed-won sponsor without a tier as hiding it from the public site', () => {
    const violations = auditSponsorHealth([
      makeSfc({ status: 'closed-won', tier: undefined }),
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0].axis).toBe('pipeline')
    expect(violations[0].state).toBe('closed-won')
    expect(violations[0].hidesFromPublicSite).toBe(true)
    expect(violations[0].missing.some((m) => m.field === 'tier')).toBe(true)
  })

  it('returns no violations when every sponsor is healthy', () => {
    const violations = auditSponsorHealth([
      makeSfc({ status: 'negotiating' }),
      makeSfc({ status: 'closed-won', tier }),
    ])

    expect(violations).toEqual([])
  })

  it('flags a contract-sent sponsor missing tier and value on the contract axis (not a public-site hide)', () => {
    const violations = auditSponsorHealth([
      makeSfc({
        status: 'negotiating',
        contractStatus: 'contract-sent',
        tier: undefined,
        contractValue: 0,
      }),
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0].axis).toBe('contract')
    expect(violations[0].state).toBe('contract-sent')
    expect(violations[0].missing.map((m) => m.field)).toEqual(
      expect.arrayContaining(['tier', 'contractValue']),
    )
    expect(violations[0].hidesFromPublicSite).toBe(false)
  })

  it('flags a signature-pending sponsor whose contract was never sent, naming the sponsor', () => {
    const violations = auditSponsorHealth([
      makeSfc({
        _id: 'sfc-acme',
        sponsor: {
          _id: 's1',
          name: 'Acme Corp',
          website: 'https://acme.test',
          logo: '',
        },
        status: 'negotiating',
        contractStatus: 'none',
        signatureStatus: 'pending',
      }),
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0].axis).toBe('signature')
    expect(violations[0].state).toBe('pending')
    expect(violations[0].sponsorId).toBe('sfc-acme')
    expect(violations[0].sponsorName).toBe('Acme Corp')
    expect(
      violations[0].missing.some((m) => m.field === 'contractStatus'),
    ).toBe(true)
  })

  it('reports one violation per axis when a sponsor breaks several at once', () => {
    const violations = auditSponsorHealth([
      makeSfc({
        status: 'closed-won', // pipeline: missing tier
        tier: undefined,
        contractStatus: 'contract-sent', // contract: missing tier + value
        contractValue: 0,
      }),
    ])

    const axes = violations.map((v) => v.axis)
    expect(axes).toEqual(expect.arrayContaining(['pipeline', 'contract']))
    expect(violations).toHaveLength(2)
  })

  it('does not flag a dead deal (closed-lost) for its leftover signed contract', () => {
    // A won deal with a signed contract that later falls through is dragged to
    // Lost without resetting the contract (backward moves never auto-reset).
    // The not-closed-lost guard is a *transition* guard ("can't send/sign on a
    // dead deal"), not a resting invariant — so this is historical data, not a
    // fixable health problem, and must not appear in the panel.
    const violations = auditSponsorHealth([
      makeSfc({
        status: 'closed-lost',
        contractStatus: 'contract-signed',
        tier: undefined,
        contractValue: 0,
      }),
    ])

    expect(violations).toEqual([])
  })

  it('reuses the real pipeline guard message (closed-won hide explains the public-site impact)', () => {
    const violations = auditSponsorHealth([
      makeSfc({ status: 'closed-won', tier: undefined }),
    ])

    const tierMissing = violations[0].missing.find((m) => m.field === 'tier')
    expect(tierMissing?.message).toMatch(/hidden from the public site/i)
  })

  it('flags a contract-signed sponsor lacking a primary contact (a rule that lives only in the state machine)', () => {
    const violations = auditSponsorHealth([
      makeSfc({
        status: 'negotiating',
        contractStatus: 'contract-signed',
        tier,
        contractValue: 50000,
        contactPersons: [],
      }),
    ])

    expect(violations).toHaveLength(1)
    expect(violations[0].axis).toBe('contract')
    const contactMissing = violations[0].missing.find(
      (m) => m.field === 'contactPersons',
    )
    expect(contactMissing).toBeDefined()
    expect(contactMissing?.source).toBe('sponsor')
  })

  it('orders public-site-hiding violations first, regardless of input order', () => {
    const violations = auditSponsorHealth([
      makeSfc({
        _id: 'sfc-contract',
        status: 'negotiating',
        contractStatus: 'contract-sent', // not a public-site hide
        tier: undefined,
        contractValue: 0,
      }),
      makeSfc({
        _id: 'sfc-hidden',
        status: 'closed-won', // public-site hide
        tier: undefined,
      }),
    ])

    expect(violations).toHaveLength(2)
    expect(violations[0].sponsorId).toBe('sfc-hidden')
    expect(violations[0].hidesFromPublicSite).toBe(true)
  })
})
