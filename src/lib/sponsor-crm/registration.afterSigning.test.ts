import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {},
  clientReadUncached: {},
}))

import { withAfterSigning, type RegistrationSponsorInfo } from './registration'

const base = {
  _id: 'sfc-1',
  signatureStatus: null,
  contractStatus: null,
} as unknown as RegistrationSponsorInfo

const raw = {
  invoiceStatus: 'sent',
  invoiceSentAt: '2026-09-01T10:00:00Z',
  invoicePaidAt: null,
  discountCodes: ['ACME26'],
  ticketUrl: null,
  earlyAccessToken: 'tok/1',
  workshopSponsorStart: '2026-09-01T08:00:00Z',
  workshopOpening: '2026-09-08T08:00:00Z',
  startDate: '2026-10-15',
  endDate: '2026-10-16',
  venueName: null,
  venueAddress: null,
  venueTravelInfo: null,
  onsiteContact: null,
  contactEmail: 'hello@example.com',
  sponsorEmail: null,
  hasPhotoWall: false,
  conferenceId: 'conf-1',
}

describe('withAfterSigning', () => {
  it('drops the block before the contract is signed', () => {
    const out = withAfterSigning({ ...base, afterSigning: raw })
    expect(out.afterSigning).toBeUndefined()
    expect(
      withAfterSigning({
        ...base,
        signatureStatus: 'pending',
        afterSigning: raw,
      }).afterSigning,
    ).toBeUndefined()
  })

  it('keeps it once signed, never passing the raw token on', () => {
    const out = withAfterSigning(
      { ...base, contractStatus: 'contract-signed', afterSigning: raw },
      new Date('2026-09-05T00:00:00Z'),
    )
    expect(out.afterSigning?.discountCodes).toEqual(['ACME26'])
    expect(out.afterSigning?.earlyAccessPath).toBe(
      '/workshop/early-access/tok%2F1',
    )
    expect(out.afterSigning).not.toHaveProperty('earlyAccessToken')
    expect(out.afterSigning).not.toHaveProperty('conferenceId')
  })

  it('hides the early-access link once registration is open to everyone', () => {
    const out = withAfterSigning(
      { ...base, signatureStatus: 'signed', afterSigning: raw },
      new Date('2026-09-08T08:00:00Z'),
    )
    expect(out.afterSigning?.earlyAccessPath).toBeNull()
  })

  const signedWith = (extra: Record<string, unknown>) =>
    withAfterSigning({
      ...base,
      contractStatus: 'contract-signed',
      afterSigning: { ...raw, ...extra } as typeof raw,
    }).afterSigning

  it('returns no ticket link without discount codes', () => {
    expect(
      signedWith({ discountCodes: [], ticketUrl: 'https://t.example.com/s' })
        ?.ticketUrl,
    ).toBeNull()
  })

  it('returns the ticket link with codes, only as http(s)', () => {
    expect(
      signedWith({ ticketUrl: 'https://t.example.com/s' })?.ticketUrl,
    ).toBe('https://t.example.com/s')
    expect(
      signedWith({ ticketUrl: 'javascript:alert(1)' as never })?.ticketUrl,
    ).toBeNull()
  })

  it('drops the block for a lost deal, never sending the status on', () => {
    expect(signedWith({ dealStatus: 'closed-lost' } as never)).toBeUndefined()
    expect(
      signedWith({ dealStatus: 'closed-won' } as never),
    ).not.toHaveProperty('dealStatus')
  })

  it('drops the block for a cancelled agreement', () => {
    expect(
      withAfterSigning({
        ...base,
        contractStatus: 'contract-signed',
        signatureStatus: 'rejected',
        afterSigning: raw,
      }).afterSigning,
    ).toBeUndefined()
  })

  it('never returns the on-site contact phone number', () => {
    const out = withAfterSigning({
      ...base,
      signatureStatus: 'signed',
      afterSigning: {
        ...raw,
        onsiteContact: {
          name: 'Kari',
          email: 'kari@example.com',
          phone: '+47 400 00 000',
        } as never,
      },
    })
    expect(out.afterSigning?.onsiteContact).toEqual({
      name: 'Kari',
      email: 'kari@example.com',
    })
  })

  it('does not ask Sanity for the on-site contact phone', () => {
    const src = readFileSync(
      new URL('./registration.ts', import.meta.url),
      'utf8',
    )
    expect(src).toContain('onsiteContact{ name, email }')
  })
})
