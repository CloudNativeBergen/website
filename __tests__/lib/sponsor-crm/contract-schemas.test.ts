import { describe, it, expect } from '@jest/globals'
import {
  ContractTemplateInputSchema,
  ContractTemplateUpdateSchema,
  ContractTemplateIdSchema,
  ContractTemplateListSchema,
  GenerateContractPdfSchema,
  FindBestContractTemplateSchema,
  SendContractSchema,
  ContractTemplateSectionSchema,
} from '@/server/schemas/contractTemplate'

describe('ContractTemplateSectionSchema', () => {
  it('passes with heading only', () => {
    const result = ContractTemplateSectionSchema.safeParse({
      heading: 'Introduction',
    })
    expect(result.success).toBe(true)
  })

  it('passes with heading and body', () => {
    const result = ContractTemplateSectionSchema.safeParse({
      heading: 'Terms',
      body: [{ _type: 'block', children: [{ text: 'content' }] }],
    })
    expect(result.success).toBe(true)
  })

  it('passes with optional _key', () => {
    const result = ContractTemplateSectionSchema.safeParse({
      _key: 'section-1',
      heading: 'Scope',
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty heading', () => {
    const result = ContractTemplateSectionSchema.safeParse({ heading: '' })
    expect(result.success).toBe(false)
  })
})

describe('ContractTemplateInputSchema', () => {
  const validInput = {
    title: 'Standard Contract',
    conference: 'conf-123',
    language: 'en' as const,
    sections: [{ heading: 'Introduction' }],
  }

  it('passes with minimal valid input', () => {
    const result = ContractTemplateInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('passes with all optional fields', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      tier: 'tier-gold',
      currency: 'NOK',
      headerText: 'Cloud Native Days',
      footerText: 'Page {PAGE}',
      terms: [{ _type: 'block', children: [{ text: 'Terms...' }] }],
      isDefault: true,
      isActive: true,
    })
    expect(result.success).toBe(true)
  })

  it('fails without title', () => {
    const { title: _, ...input } = validInput
    const result = ContractTemplateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('fails with empty title', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      title: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails without conference', () => {
    const { conference: _, ...input } = validInput
    const result = ContractTemplateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('fails with empty conference', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      conference: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid language', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      language: 'de',
    })
    expect(result.success).toBe(false)
  })

  it('accepts Norwegian language', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      language: 'nb',
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty sections array', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      sections: [],
    })
    expect(result.success).toBe(false)
  })

  it('fails without sections', () => {
    const { sections: _, ...input } = validInput
    const result = ContractTemplateInputSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('passes with multiple sections', () => {
    const result = ContractTemplateInputSchema.safeParse({
      ...validInput,
      sections: [
        { heading: 'Introduction' },
        { heading: 'Scope' },
        { heading: 'Payment' },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('ContractTemplateUpdateSchema', () => {
  it('passes with only id', () => {
    const result = ContractTemplateUpdateSchema.safeParse({ id: 'tmpl-1' })
    expect(result.success).toBe(true)
  })

  it('passes with title update', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      title: 'Updated Title',
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable tier to clear it', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      tier: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable currency to clear it', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      currency: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable headerText', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      headerText: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable footerText', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      footerText: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable terms', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      terms: null,
    })
    expect(result.success).toBe(true)
  })

  it('fails without id', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      title: 'New Title',
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty id', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: '',
      title: 'New Title',
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty sections array', () => {
    const result = ContractTemplateUpdateSchema.safeParse({
      id: 'tmpl-1',
      sections: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('ContractTemplateIdSchema', () => {
  it('passes with valid id', () => {
    const result = ContractTemplateIdSchema.safeParse({ id: 'tmpl-1' })
    expect(result.success).toBe(true)
  })

  it('fails with empty id', () => {
    const result = ContractTemplateIdSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('fails without id', () => {
    const result = ContractTemplateIdSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('ContractTemplateListSchema', () => {
  it('passes with valid conferenceId', () => {
    const result = ContractTemplateListSchema.safeParse({
      conferenceId: 'conf-1',
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty conferenceId', () => {
    const result = ContractTemplateListSchema.safeParse({ conferenceId: '' })
    expect(result.success).toBe(false)
  })

  it('fails without conferenceId', () => {
    const result = ContractTemplateListSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('GenerateContractPdfSchema', () => {
  it('passes with valid input', () => {
    const result = GenerateContractPdfSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
      templateId: 'tmpl-1',
    })
    expect(result.success).toBe(true)
  })

  it('fails without sponsorForConferenceId', () => {
    const result = GenerateContractPdfSchema.safeParse({ templateId: 'tmpl-1' })
    expect(result.success).toBe(false)
  })

  it('fails without templateId', () => {
    const result = GenerateContractPdfSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty sponsorForConferenceId', () => {
    const result = GenerateContractPdfSchema.safeParse({
      sponsorForConferenceId: '',
      templateId: 'tmpl-1',
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty templateId', () => {
    const result = GenerateContractPdfSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
      templateId: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('FindBestContractTemplateSchema', () => {
  it('passes with conferenceId only', () => {
    const result = FindBestContractTemplateSchema.safeParse({
      conferenceId: 'conf-1',
    })
    expect(result.success).toBe(true)
  })

  it('passes with all fields', () => {
    const result = FindBestContractTemplateSchema.safeParse({
      conferenceId: 'conf-1',
      tierId: 'tier-gold',
      language: 'nb',
    })
    expect(result.success).toBe(true)
  })

  it('passes without optional tierId', () => {
    const result = FindBestContractTemplateSchema.safeParse({
      conferenceId: 'conf-1',
      language: 'en',
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid language', () => {
    const result = FindBestContractTemplateSchema.safeParse({
      conferenceId: 'conf-1',
      language: 'fr',
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty conferenceId', () => {
    const result = FindBestContractTemplateSchema.safeParse({
      conferenceId: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('SendContractSchema', () => {
  it('passes with required fields', () => {
    const result = SendContractSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
      templateId: 'tmpl-1',
    })
    expect(result.success).toBe(true)
  })

  it('passes with optional signerEmail', () => {
    const result = SendContractSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
      templateId: 'tmpl-1',
      signerEmail: 'signer@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid signerEmail', () => {
    const result = SendContractSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
      templateId: 'tmpl-1',
      signerEmail: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('fails without sponsorForConferenceId', () => {
    const result = SendContractSchema.safeParse({ templateId: 'tmpl-1' })
    expect(result.success).toBe(false)
  })

  it('fails without templateId', () => {
    const result = SendContractSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
    })
    expect(result.success).toBe(false)
  })

  it('passes without signerEmail (skip digital signing)', () => {
    const result = SendContractSchema.safeParse({
      sponsorForConferenceId: 'sfc-1',
      templateId: 'tmpl-1',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.signerEmail).toBeUndefined()
    }
  })
})
