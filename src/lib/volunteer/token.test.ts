import { describe, it, expect } from 'vitest'
import { mintVolunteerConfirmToken, verifyVolunteerConfirmToken } from './token'
import { mintOrganizerInviteToken } from '@/lib/organizer-invite/token'

describe('volunteer confirmation token', () => {
  it('mints and verifies a valid token and normalizes email', () => {
    const token = mintVolunteerConfirmToken({
      volunteerId: 'vol-123',
      conferenceId: 'conf-456',
      email: '  Alice@Example.com ',
    })

    const verified = verifyVolunteerConfirmToken(token)
    expect(verified).toEqual({
      ok: true,
      payload: {
        volunteerId: 'vol-123',
        conferenceId: 'conf-456',
        email: 'alice@example.com',
      },
    })
  })

  it('rejects empty, missing, or malformed tokens', () => {
    expect(verifyVolunteerConfirmToken(null)).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyVolunteerConfirmToken('')).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyVolunteerConfirmToken('no-dot')).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyVolunteerConfirmToken('.leading-dot')).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyVolunteerConfirmToken('trailing-dot.')).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('rejects tampered payload or tampered signature', () => {
    const token = mintVolunteerConfirmToken({
      volunteerId: 'vol-123',
      conferenceId: 'conf-456',
      email: 'alice@example.com',
    })
    const [payloadB64, sig] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({
        volunteerId: 'vol-999',
        conferenceId: 'conf-456',
        email: 'alice@example.com',
      }),
    ).toString('base64url')

    expect(verifyVolunteerConfirmToken(`${forgedPayload}.${sig}`)).toEqual({
      ok: false,
      reason: 'signature',
    })
    expect(verifyVolunteerConfirmToken(`${payloadB64}.${sig}x`)).toEqual({
      ok: false,
      reason: 'signature',
    })
  })

  it('enforces domain separation against organizer-invite tokens', () => {
    const orgToken = mintOrganizerInviteToken({
      docId: 'inv-1',
      invitedEmail: 'alice@example.com',
      expiresAt: Date.now() + 60_000,
    })
    expect(verifyVolunteerConfirmToken(orgToken)).toEqual({
      ok: false,
      reason: 'signature',
    })
  })
})
