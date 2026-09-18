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

  it('blocks marking contract-signed on a closed-lost deal, even with tier, value and contact', () => {
    const result = canTransition(
      'contract',
      'none',
      'contract-signed',
      makeSfc({
        tier,
        contractValue: 50000,
        contactPersons: primaryContact,
        status: 'closed-lost',
      }),
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

describe('canTransition — invoice axis', () => {
  it('blocks moving to sent if missing contractValue', () => {
    const result = canTransition('invoice', 'not-sent', 'sent', {
      contractCurrency: 'NOK',
      billing: { email: 'bill@test.com' },
      contractStatus: 'contract-signed',
    })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.missing.some((m) => m.field === 'contractValue')).toBe(true)
  })

  it('blocks moving to sent if missing billing email', () => {
    const result = canTransition('invoice', 'not-sent', 'sent', {
      contractValue: 100,
      contractCurrency: 'NOK',
      contractStatus: 'contract-signed',
    })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.missing.some((m) => m.field === 'billing.email')).toBe(true)
  })

  it('blocks moving to sent if contract is not signed', () => {
    const result = canTransition('invoice', 'not-sent', 'sent', {
      contractValue: 100,
      contractCurrency: 'NOK',
      billing: { email: 'bill@test.com' },
      contractStatus: 'contract-sent',
    })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.missing.some((m) => m.field === 'contractStatus')).toBe(
        true,
      )
  })

  it('allows moving to sent if all conditions are met', () => {
    const result = canTransition('invoice', 'not-sent', 'sent', {
      contractValue: 100,
      contractCurrency: 'NOK',
      billing: { email: 'bill@test.com' },
      contractStatus: 'contract-signed',
    })
    expect(result.ok).toBe(true)
  })

  it('blocks moving to paid from not-sent (must be sent first)', () => {
    const result = canTransition('invoice', 'not-sent', 'paid', {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.missing[0].field).toBe('invoiceStatus')
  })

  it('blocks moving to overdue from not-sent', () => {
    const result = canTransition('invoice', 'not-sent', 'overdue', {})
    expect(result.ok).toBe(false)
  })

  it('allows moving to paid from sent', () => {
    const result = canTransition('invoice', 'sent', 'paid', {})
    expect(result.ok).toBe(true)
  })

  it('allows moving to paid from overdue', () => {
    const result = canTransition('invoice', 'overdue', 'paid', {})
    expect(result.ok).toBe(true)
  })

  it('allows moving to cancelled from anywhere without requirements', () => {
    const result = canTransition('invoice', 'not-sent', 'cancelled', {})
    expect(result.ok).toBe(true)
  })
})

/**
 * A move that is legal on its own axis can still strand another one: the
 * invoice and signature guards both read `contractStatus`, so walking the
 * contract axis backwards can leave a paid invoice or a signed signature
 * resting on a contract that was never signed.
 */
describe('canTransition — cross-axis coherence', () => {
  const signedAndPaid = makeSfc({
    tier,
    contractValue: 50000,
    contractCurrency: 'NOK',
    contactPersons: primaryContact,
    contractStatus: 'contract-signed',
    billing: { email: 'bill@acme.test', invoiceFormat: 'pdf' },
    invoiceStatus: 'paid',
    status: 'closed-won',
  })

  it('blocks unsigning the contract under a paid invoice, naming the invoice', () => {
    const result = canTransition(
      'contract',
      'contract-signed',
      'none',
      signedAndPaid,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'contractStatus')).toBe(
        true,
      )
      expect(result.missing[0].message).toMatch(/paid invoice/i)
    }
  })

  it('blocks every backward contract state under a paid invoice', () => {
    for (const to of ['none', 'verbal-agreement', 'registration-sent']) {
      expect(
        canTransition('contract', 'contract-signed', to, signedAndPaid).ok,
      ).toBe(false)
    }
  })

  it('blocks unsigning the contract under a sent or overdue invoice', () => {
    for (const invoiceStatus of ['sent', 'overdue'] as const) {
      const result = canTransition(
        'contract',
        'contract-signed',
        'none',
        makeSfc({ ...signedAndPaid, invoiceStatus }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.missing[0].message).toMatch(
          new RegExp(`${invoiceStatus} invoice`, 'i'),
        )
      }
    }
  })

  it('blocks clearing the contract under a signed signature, naming the signature', () => {
    const result = canTransition(
      'contract',
      'contract-signed',
      'none',
      makeSfc({
        tier,
        contractValue: 50000,
        contactPersons: primaryContact,
        contractStatus: 'contract-signed',
        signatureStatus: 'signed',
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing.some((m) => m.field === 'contractStatus')).toBe(
        true,
      )
      expect(result.missing[0].message).toMatch(/signature is marked signed/i)
    }
  })

  it('blocks clearing the contract under a pending signature', () => {
    const result = canTransition(
      'contract',
      'contract-sent',
      'none',
      makeSfc({ contractStatus: 'contract-sent', signatureStatus: 'pending' }),
    )
    expect(result.ok).toBe(false)
  })

  it('still allows downgrading signed → sent while a signature is tracked (the guard accepts either)', () => {
    expect(
      canTransition(
        'contract',
        'contract-signed',
        'contract-sent',
        makeSfc({
          tier,
          contractValue: 50000,
          contactPersons: primaryContact,
          contractStatus: 'contract-signed',
          signatureStatus: 'signed',
        }),
      ).ok,
    ).toBe(true)
  })

  it('allows clearing the contract when no other axis depends on it', () => {
    expect(
      canTransition(
        'contract',
        'contract-signed',
        'none',
        makeSfc({
          tier,
          contractValue: 50000,
          contractStatus: 'contract-signed',
          invoiceStatus: 'not-sent',
        }),
      ).ok,
    ).toBe(true)
  })

  it('allows clearing the contract when the invoice was cancelled', () => {
    expect(
      canTransition(
        'contract',
        'contract-signed',
        'none',
        makeSfc({ ...signedAndPaid, invoiceStatus: 'cancelled' }),
      ).ok,
    ).toBe(true)
  })

  it('does not trap a record whose other axis was already broken before the move', () => {
    // Invoice sent on an unsigned contract (back-catalog data): the invoice
    // axis is already violated, so a contract move is not what broke it.
    expect(
      canTransition(
        'contract',
        'verbal-agreement',
        'none',
        makeSfc({ contractStatus: 'verbal-agreement', invoiceStatus: 'sent' }),
      ).ok,
    ).toBe(true)
  })

  it('still allows losing a deal that has a signed contract and a paid invoice', () => {
    expect(
      canTransition('pipeline', 'closed-won', 'closed-lost', signedAndPaid).ok,
    ).toBe(true)
  })

  it('leaves legitimate forward moves on every axis alone', () => {
    const ready = makeSfc({
      tier,
      contractValue: 50000,
      contractCurrency: 'NOK',
      contactPersons: primaryContact,
      billing: { email: 'bill@acme.test', invoiceFormat: 'pdf' },
    })
    expect(canTransition('contract', 'none', 'contract-sent', ready).ok).toBe(
      true,
    )
    expect(
      canTransition(
        'contract',
        'contract-sent',
        'contract-signed',
        makeSfc({ ...ready, contractStatus: 'contract-sent' }),
      ).ok,
    ).toBe(true)
    expect(
      canTransition(
        'signature',
        'not-started',
        'signed',
        makeSfc({ ...ready, contractStatus: 'contract-sent' }),
      ).ok,
    ).toBe(true)
    expect(
      canTransition(
        'invoice',
        'not-sent',
        'sent',
        makeSfc({ ...ready, contractStatus: 'contract-signed' }),
      ).ok,
    ).toBe(true)
    expect(
      canTransition(
        'invoice',
        'sent',
        'paid',
        makeSfc({
          ...ready,
          contractStatus: 'contract-signed',
          invoiceStatus: 'sent',
        }),
      ).ok,
    ).toBe(true)
    expect(
      canTransition('pipeline', 'negotiating', 'closed-won', ready).ok,
    ).toBe(true)
  })

  it('keeps a same-state move a no-op even when another axis depends on it', () => {
    expect(
      canTransition('contract', 'none', 'none', {
        ...signedAndPaid,
        contractStatus: 'none',
      }).ok,
    ).toBe(true)
  })
})
