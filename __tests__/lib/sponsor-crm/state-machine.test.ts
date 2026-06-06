import {
  canTransition,
  checkPipelineState,
  checkState,
} from '@/lib/sponsor-crm/state-machine'
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

describe('canTransition — pipeline axis', () => {
  it('blocks moving to closed-won without a tier and reports the missing field', () => {
    const result = canTransition(
      'pipeline',
      'negotiating',
      'closed-won',
      makeSfc({ tier: undefined }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toHaveLength(1)
      expect(result.missing[0].field).toBe('tier')
      expect(result.missing[0].message).toMatch(/tier/i)
    }
  })

  it('allows moving to closed-won when a tier is set', () => {
    const result = canTransition(
      'pipeline',
      'negotiating',
      'closed-won',
      makeSfc({ tier }),
    )
    expect(result.ok).toBe(true)
  })

  it('never blocks moving to closed-lost, even without a tier', () => {
    const result = canTransition(
      'pipeline',
      'negotiating',
      'closed-lost',
      makeSfc({ tier: undefined }),
    )
    expect(result.ok).toBe(true)
  })

  it('allows backward moves out of closed-won without any field guard', () => {
    const result = canTransition(
      'pipeline',
      'closed-won',
      'negotiating',
      makeSfc({ tier: undefined, status: 'closed-won' }),
    )
    expect(result.ok).toBe(true)
  })

  it('allows ordinary forward moves between early stages', () => {
    expect(
      canTransition('pipeline', 'prospect', 'contacted', makeSfc()).ok,
    ).toBe(true)
    expect(
      canTransition('pipeline', 'contacted', 'negotiating', makeSfc()).ok,
    ).toBe(true)
  })

  it('treats a same-status move as an allowed no-op even when guards are unmet', () => {
    const result = canTransition(
      'pipeline',
      'closed-won',
      'closed-won',
      makeSfc({ tier: undefined, status: 'closed-won' }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('canTransition — contract axis', () => {
  it('blocks moving to contract-sent without a tier', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-sent',
      makeSfc({ tier: undefined, contractValue: 50000 }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'tier')).toBe(true)
    }
  })

  it('blocks moving to contract-sent without a positive contract value', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-sent',
      makeSfc({ tier, contractValue: 0 }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'contractValue')).toBe(true)
    }
  })

  it('allows moving to contract-sent with tier and contract value set', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-sent',
      makeSfc({ tier, contractValue: 50000 }),
    )
    expect(result.ok).toBe(true)
  })

  it('blocks moving to contract-sent on a closed-lost deal even with tier and value', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-sent',
      makeSfc({ tier, contractValue: 50000, status: 'closed-lost' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'status')).toBe(true)
      expect(result.missing.find((m) => m.field === 'status')?.message).toMatch(
        /closed-lost|lost|dead/i,
      )
    }
  })
})

const primaryContact = [
  {
    _key: 'c1',
    name: 'Jane Doe',
    email: 'jane@acme.test',
    isPrimary: true,
  },
]

describe('canTransition — contract axis: contract-signed (path-independent)', () => {
  it('blocks marking contract-signed without a primary contact', () => {
    const result = canTransition(
      'contract',
      'contract-sent',
      'contract-signed',
      makeSfc({ tier, contractValue: 50000 }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'contactPersons')).toBe(
        true,
      )
    }
  })

  it('blocks marking contract-signed on an empty record (tier, value, contact all missing)', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-signed',
      makeSfc({ tier: undefined, contractValue: undefined }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const fields = result.missing.map((m) => m.field)
      expect(fields).toEqual(
        expect.arrayContaining(['tier', 'contractValue', 'contactPersons']),
      )
    }
  })

  it('allows marking contract-signed with tier, value, and a primary contact (offline/manual path)', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-signed',
      makeSfc({ tier, contractValue: 50000, contactPersons: primaryContact }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('canTransition — signature axis', () => {
  it('blocks moving signature to pending when the contract has not been sent', () => {
    const result = canTransition(
      'signature',
      'not-started',
      'pending',
      makeSfc({ contractStatus: 'none' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'contractStatus')).toBe(
        true,
      )
    }
  })

  it('allows signature pending once the contract has been sent', () => {
    const result = canTransition(
      'signature',
      'not-started',
      'pending',
      makeSfc({ contractStatus: 'contract-sent' }),
    )
    expect(result.ok).toBe(true)
  })

  it('blocks a manual signature signed when the contract has not been sent', () => {
    const result = canTransition(
      'signature',
      'not-started',
      'signed',
      makeSfc({ contractStatus: 'none' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'contractStatus')).toBe(
        true,
      )
    }
  })

  it('allows a manual signature signed once the contract has been sent', () => {
    const result = canTransition(
      'signature',
      'pending',
      'signed',
      makeSfc({ contractStatus: 'contract-sent' }),
    )
    expect(result.ok).toBe(true)
  })

  it('never blocks resetting a signature backward (rejected, expired, not-started)', () => {
    expect(
      canTransition(
        'signature',
        'pending',
        'rejected',
        makeSfc({ contractStatus: 'contract-sent' }),
      ).ok,
    ).toBe(true)
    expect(
      canTransition(
        'signature',
        'pending',
        'not-started',
        makeSfc({ contractStatus: 'none' }),
      ).ok,
    ).toBe(true)
  })
})

describe('checkState — direct axis state invariant', () => {
  it('enforces contract-sent guards regardless of the current state (re-send path)', () => {
    const result = checkState(
      'contract',
      'contract-sent',
      makeSfc({
        tier: undefined,
        contractValue: 0,
        contractStatus: 'contract-sent',
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.map((m) => m.field)).toEqual(
        expect.arrayContaining(['tier', 'contractValue']),
      )
    }
  })

  it('passes when the contract-sent invariants are met', () => {
    expect(
      checkState(
        'contract',
        'contract-sent',
        makeSfc({ tier, contractValue: 50000 }),
      ).ok,
    ).toBe(true)
  })
})

describe('checkPipelineState — direct state invariant', () => {
  it('blocks a closed-won record without a tier', () => {
    const result = checkPipelineState('closed-won', { tier: undefined })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing[0].field).toBe('tier')
    }
  })

  it('emits the shared MissingField shape (reuses the readiness pattern)', () => {
    const result = checkPipelineState('closed-won', { tier: undefined })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing[0]).toMatchObject({
        field: 'tier',
        source: 'pipeline',
        severity: 'required',
      })
      expect(result.missing[0].message).toMatch(/tier/i)
    }
  })

  it('allows a closed-won record with a tier reference id', () => {
    expect(checkPipelineState('closed-won', { tier: 'tier-gold' }).ok).toBe(
      true,
    )
  })

  it('allows non-won states without a tier', () => {
    expect(checkPipelineState('negotiating', { tier: undefined }).ok).toBe(true)
  })

  it('treats an empty-string tier as no tier', () => {
    expect(checkPipelineState('closed-won', { tier: '' }).ok).toBe(false)
  })
})
