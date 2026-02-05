import { describe, it, expect } from '@jest/globals'
import {
  SponsorForConferenceInputSchema,
  SponsorForConferenceUpdateSchema,
  SponsorTagSchema,
  ImportAllHistoricSponsorsSchema,
  BulkUpdateSponsorCRMSchema,
  BulkDeleteSponsorCRMSchema,
} from '@/server/schemas/sponsorForConference'

describe('SponsorForConferenceInputSchema', () => {
  const validInput = {
    sponsor: 'sponsor-123',
    conference: 'conf-456',
    contract_status: 'none',
    status: 'prospect',
    invoice_status: 'not-sent',
  }

  it('passes with minimal valid data', () => {
    const result = SponsorForConferenceInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('passes with tier and addons', () => {
    const input = {
      ...validInput,
      tier: 'tier-123',
      addons: ['addon-1', 'addon-2'],
    }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('passes with empty addons array', () => {
    const input = {
      ...validInput,
      addons: [],
    }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('fails without sponsor', () => {
    const { sponsor: _, ...input } = validInput
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('fails without conference', () => {
    const { conference: _, ...input } = validInput
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('fails with invalid status', () => {
    const input = { ...validInput, status: 'invalid-status' }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts all valid tags including previously-declined', () => {
    const input = {
      ...validInput,
      tags: [
        'warm-lead',
        'returning-sponsor',
        'cold-outreach',
        'referral',
        'high-priority',
        'needs-follow-up',
        'multi-year-potential',
        'previously-declined',
      ],
    }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('fails with invalid tag', () => {
    const input = { ...validInput, tags: ['invalid-tag'] }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts contract_value as number', () => {
    const input = { ...validInput, contract_value: 50000 }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('fails with negative contract_value', () => {
    const input = { ...validInput, contract_value: -100 }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('SponsorForConferenceUpdateSchema', () => {
  it('passes with only id', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
    })
    expect(result.success).toBe(true)
  })

  it('passes with addons update', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      addons: ['addon-1', 'addon-2'],
    })
    expect(result.success).toBe(true)
  })

  it('passes with empty addons to clear them', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      addons: [],
    })
    expect(result.success).toBe(true)
  })

  it('passes with tier and addons together', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      tier: 'gold-tier',
      addons: ['booth-upgrade', 'speakers-dinner'],
    })
    expect(result.success).toBe(true)
  })

  it('fails without id', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      tier: 'gold-tier',
    })
    expect(result.success).toBe(false)
  })

  it('accepts nullable assigned_to', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      assigned_to: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('SponsorTagSchema', () => {
  it('accepts previously-declined tag', () => {
    const result = SponsorTagSchema.safeParse('previously-declined')
    expect(result.success).toBe(true)
  })

  it('accepts returning-sponsor tag', () => {
    const result = SponsorTagSchema.safeParse('returning-sponsor')
    expect(result.success).toBe(true)
  })

  it('rejects invalid tag', () => {
    const result = SponsorTagSchema.safeParse('not-a-valid-tag')
    expect(result.success).toBe(false)
  })
})

describe('ImportAllHistoricSponsorsSchema', () => {
  it('passes with valid target conference ID', () => {
    const result = ImportAllHistoricSponsorsSchema.safeParse({
      targetConferenceId: 'conf-2026',
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty target conference ID', () => {
    const result = ImportAllHistoricSponsorsSchema.safeParse({
      targetConferenceId: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails without target conference ID', () => {
    const result = ImportAllHistoricSponsorsSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('BulkUpdateSponsorCRMSchema', () => {
  it('passes with valid ids and status', () => {
    const result = BulkUpdateSponsorCRMSchema.safeParse({
      ids: ['id-1', 'id-2'],
      status: 'negotiating',
    })
    expect(result.success).toBe(true)
  })

  it('passes with add_tags', () => {
    const result = BulkUpdateSponsorCRMSchema.safeParse({
      ids: ['id-1'],
      add_tags: ['high-priority', 'returning-sponsor'],
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty ids array', () => {
    const result = BulkUpdateSponsorCRMSchema.safeParse({
      ids: [],
      status: 'closed-won',
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid status', () => {
    const result = BulkUpdateSponsorCRMSchema.safeParse({
      ids: ['id-1'],
      status: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})

describe('BulkDeleteSponsorCRMSchema', () => {
  it('passes with valid ids', () => {
    const result = BulkDeleteSponsorCRMSchema.safeParse({
      ids: ['id-1', 'id-2'],
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty ids', () => {
    const result = BulkDeleteSponsorCRMSchema.safeParse({
      ids: [],
    })
    expect(result.success).toBe(false)
  })
})
