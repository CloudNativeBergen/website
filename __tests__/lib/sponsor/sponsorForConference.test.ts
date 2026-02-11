import { describe, it, expect } from '@jest/globals'
import {
  SponsorForConferenceInputSchema,
  SponsorForConferenceUpdateSchema,
  SponsorTagSchema,
  ImportAllHistoricSponsorsSchema,
  BulkUpdateSponsorCRMSchema,
  BulkDeleteSponsorCRMSchema,
} from '@/server/schemas/sponsorForConference'
import {
  ContactPersonSchema,
  BillingInfoSchema,
} from '@/server/schemas/sponsor'

describe('SponsorForConferenceInputSchema', () => {
  const validInput = {
    sponsor: 'sponsor-123',
    conference: 'conf-456',
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
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
    const input = { ...validInput, contractValue: 50000 }
    const result = SponsorForConferenceInputSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('fails with negative contract_value', () => {
    const input = { ...validInput, contractValue: -100 }
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
      assignedTo: null,
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

  it('passes with addTags', () => {
    const result = BulkUpdateSponsorCRMSchema.safeParse({
      ids: ['id-1'],
      addTags: ['high-priority', 'returning-sponsor'],
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

describe('ContactPersonSchema', () => {
  const validContact = {
    _key: 'contact-1',
    name: 'Jane Doe',
    email: 'jane@example.com',
  }

  it('passes with minimal valid data', () => {
    const result = ContactPersonSchema.safeParse(validContact)
    expect(result.success).toBe(true)
  })

  it('passes with all fields', () => {
    const result = ContactPersonSchema.safeParse({
      ...validContact,
      phone: '+47 123 45 678',
      role: 'Partnership Manager',
    })
    expect(result.success).toBe(true)
  })

  it('transforms null phone to undefined', () => {
    const result = ContactPersonSchema.safeParse({
      ...validContact,
      phone: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBeUndefined()
    }
  })

  it('transforms null role to undefined', () => {
    const result = ContactPersonSchema.safeParse({
      ...validContact,
      role: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBeUndefined()
    }
  })

  it('fails without _key', () => {
    const { _key: _, ...input } = validContact
    const result = ContactPersonSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('fails without name', () => {
    const result = ContactPersonSchema.safeParse({
      ...validContact,
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid email', () => {
    const result = ContactPersonSchema.safeParse({
      ...validContact,
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('fails without email', () => {
    const { email: _, ...input } = validContact
    const result = ContactPersonSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('BillingInfoSchema', () => {
  it('passes with only email', () => {
    const result = BillingInfoSchema.safeParse({ email: 'billing@example.com' })
    expect(result.success).toBe(true)
  })

  it('passes with all fields', () => {
    const result = BillingInfoSchema.safeParse({
      email: 'billing@example.com',
      reference: 'PO-12345',
      comments: 'Net 30 days',
    })
    expect(result.success).toBe(true)
  })

  it('transforms null reference to undefined', () => {
    const result = BillingInfoSchema.safeParse({
      email: 'billing@example.com',
      reference: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reference).toBeUndefined()
    }
  })

  it('transforms null comments to undefined', () => {
    const result = BillingInfoSchema.safeParse({
      email: 'billing@example.com',
      comments: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.comments).toBeUndefined()
    }
  })

  it('fails with invalid email', () => {
    const result = BillingInfoSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('fails without email', () => {
    const result = BillingInfoSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('SponsorForConferenceInputSchema - contact_persons', () => {
  const validInput = {
    sponsor: 'sponsor-123',
    conference: 'conf-456',
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
  }

  it('passes with contact_persons array', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [
        {
          _key: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isPrimary: true,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('passes with multiple contacts and one primary', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [
        {
          _key: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isPrimary: true,
        },
        {
          _key: 'c2',
          name: 'John Smith',
          email: 'john@example.com',
          isPrimary: false,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('passes without contact_persons (optional)', () => {
    const result = SponsorForConferenceInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('passes with empty contact_persons array', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [],
    })
    expect(result.success).toBe(true)
  })

  it('passes with contact without is_primary (optional)', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [
        { _key: 'c1', name: 'Jane Doe', email: 'jane@example.com' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid contact email', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [{ _key: 'c1', name: 'Jane Doe', email: 'not-an-email' }],
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty contact name', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [{ _key: 'c1', name: '', email: 'jane@example.com' }],
    })
    expect(result.success).toBe(false)
  })

  it('fails with multiple primary contacts', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contactPersons: [
        {
          _key: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isPrimary: true,
        },
        {
          _key: 'c2',
          name: 'John Smith',
          email: 'john@example.com',
          isPrimary: true,
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('SponsorForConferenceInputSchema - billing', () => {
  const validInput = {
    sponsor: 'sponsor-123',
    conference: 'conf-456',
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
  }

  it('passes with billing info', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      billing: {
        email: 'billing@example.com',
        reference: 'PO-12345',
        comments: 'Net 30',
      },
    })
    expect(result.success).toBe(true)
  })

  it('passes without billing (optional)', () => {
    const result = SponsorForConferenceInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('fails with invalid billing email', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      billing: { email: 'not-valid' },
    })
    expect(result.success).toBe(false)
  })
})

describe('SponsorForConferenceUpdateSchema - contact_persons and billing', () => {
  it('passes with contact_persons update', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      contactPersons: [
        {
          _key: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isPrimary: true,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('passes with empty contact_persons to clear them', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      contactPersons: [],
    })
    expect(result.success).toBe(true)
  })

  it('passes with billing update', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      billing: {
        email: 'billing@example.com',
        reference: 'REF-001',
      },
    })
    expect(result.success).toBe(true)
  })

  it('passes with null billing to clear it', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      billing: null,
    })
    expect(result.success).toBe(true)
  })

  it('passes with contacts and billing together', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      contactPersons: [
        {
          _key: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isPrimary: true,
        },
      ],
      billing: {
        email: 'billing@example.com',
      },
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid contact in update', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      contactPersons: [{ _key: 'c1', name: '', email: 'bad' }],
    })
    expect(result.success).toBe(false)
  })

  it('fails with multiple primary contacts in update', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-123',
      contactPersons: [
        {
          _key: 'c1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isPrimary: true,
        },
        {
          _key: 'c2',
          name: 'John Smith',
          email: 'john@example.com',
          isPrimary: true,
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
