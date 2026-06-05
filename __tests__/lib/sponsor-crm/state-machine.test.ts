import {
  canTransition,
  checkPipelineState,
} from '@/lib/sponsor-crm/state-machine'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

function makeSfc(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-1',
    _createdAt: '',
    _updatedAt: '',
    sponsor: { _id: 's1', name: 'Acme', website: 'https://acme.test', logo: '' },
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

describe('checkPipelineState — direct state invariant', () => {
  it('blocks a closed-won record without a tier', () => {
    const result = checkPipelineState('closed-won', { tier: undefined })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing[0].field).toBe('tier')
    }
  })

  it('allows a closed-won record with a tier reference id', () => {
    expect(checkPipelineState('closed-won', { tier: 'tier-gold' }).ok).toBe(true)
  })

  it('allows non-won states without a tier', () => {
    expect(checkPipelineState('negotiating', { tier: undefined }).ok).toBe(true)
  })

  it('treats an empty-string tier as no tier', () => {
    expect(checkPipelineState('closed-won', { tier: '' }).ok).toBe(false)
  })
})
