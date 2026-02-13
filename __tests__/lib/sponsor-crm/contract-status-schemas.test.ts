import { describe, it, expect } from '@jest/globals'
import {
  UpdateContractStatusSchema,
  UpdateSignatureStatusSchema,
  SponsorForConferenceInputSchema,
  SponsorForConferenceUpdateSchema,
} from '@/server/schemas/sponsorForConference'

describe('UpdateContractStatusSchema', () => {
  it('passes with valid id and contract status', () => {
    const result = UpdateContractStatusSchema.safeParse({
      id: 'sfc-1',
      newStatus: 'contract-sent',
    })
    expect(result.success).toBe(true)
  })

  it('accepts all valid contract statuses', () => {
    const statuses = [
      'none',
      'verbal-agreement',
      'contract-sent',
      'contract-signed',
    ]
    for (const status of statuses) {
      const result = UpdateContractStatusSchema.safeParse({
        id: 'sfc-1',
        newStatus: status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('fails with invalid contract status', () => {
    const result = UpdateContractStatusSchema.safeParse({
      id: 'sfc-1',
      newStatus: 'invalid-status',
    })
    expect(result.success).toBe(false)
  })

  it('fails without id', () => {
    const result = UpdateContractStatusSchema.safeParse({
      newStatus: 'contract-sent',
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty id', () => {
    const result = UpdateContractStatusSchema.safeParse({
      id: '',
      newStatus: 'contract-sent',
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateSignatureStatusSchema', () => {
  it('passes with valid id and signature status', () => {
    const result = UpdateSignatureStatusSchema.safeParse({
      id: 'sfc-1',
      newStatus: 'pending',
    })
    expect(result.success).toBe(true)
  })

  it('accepts all valid signature statuses', () => {
    const statuses = ['not-started', 'pending', 'signed', 'rejected', 'expired']
    for (const status of statuses) {
      const result = UpdateSignatureStatusSchema.safeParse({
        id: 'sfc-1',
        newStatus: status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('fails with invalid signature status', () => {
    const result = UpdateSignatureStatusSchema.safeParse({
      id: 'sfc-1',
      newStatus: 'cancelled',
    })
    expect(result.success).toBe(false)
  })

  it('fails without id', () => {
    const result = UpdateSignatureStatusSchema.safeParse({
      newStatus: 'signed',
    })
    expect(result.success).toBe(false)
  })
})

describe('SponsorForConference - Phase 2 signature fields', () => {
  const validInput = {
    sponsor: 'sponsor-123',
    conference: 'conf-456',
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
  }

  it('accepts signatureStatus in input schema', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      signatureStatus: 'pending',
    })
    expect(result.success).toBe(true)
  })

  it('accepts all valid signature statuses in input', () => {
    for (const status of [
      'not-started',
      'pending',
      'signed',
      'rejected',
      'expired',
    ]) {
      const result = SponsorForConferenceInputSchema.safeParse({
        ...validInput,
        signatureStatus: status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts signerEmail in input schema', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      signerEmail: 'signer@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid signerEmail in input', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      signerEmail: 'not-email',
    })
    expect(result.success).toBe(false)
  })

  it('accepts contractTemplate reference in input', () => {
    const result = SponsorForConferenceInputSchema.safeParse({
      ...validInput,
      contractTemplate: 'tmpl-123',
    })
    expect(result.success).toBe(true)
  })

  it('accepts signature fields in update schema', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-1',
      signatureStatus: 'signed',
      signerEmail: 'signer@example.com',
      contractTemplate: 'tmpl-123',
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable signerEmail in update to clear it', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-1',
      signerEmail: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable contractTemplate in update to clear it', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-1',
      contractTemplate: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts all contract statuses in update schema', () => {
    for (const status of [
      'none',
      'verbal-agreement',
      'contract-sent',
      'contract-signed',
    ]) {
      const result = SponsorForConferenceUpdateSchema.safeParse({
        id: 'sfc-1',
        contractStatus: status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts contractSignedAt in update schema', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-1',
      contractSignedAt: '2026-02-01T12:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts nullable contractSignedAt to clear it', () => {
    const result = SponsorForConferenceUpdateSchema.safeParse({
      id: 'sfc-1',
      contractSignedAt: null,
    })
    expect(result.success).toBe(true)
  })
})
