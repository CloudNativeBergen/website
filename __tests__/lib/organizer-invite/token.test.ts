/**
 * @vitest-environment node
 *
 * The organizer-invitation token. Unlike the co-speaker token — which is signed
 * and then never verified — this one participates in a decision, so the
 * verifier is the thing under test.
 *
 * Nothing here is mocked: `node:crypto` is exercised for real, because a claim
 * about HMAC behaviour proved against a mock would be a claim about the mock.
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  mintOrganizerInviteToken,
  verifyOrganizerInviteToken,
  tokensMatch,
} from '@/lib/organizer-invite/token'

const payload = {
  docId: 'inv-1',
  invitedEmail: 'ada@example.com',
  expiresAt: 1893456000000,
}

describe('organizer invite token', () => {
  it('round-trips a payload', () => {
    const verified = verifyOrganizerInviteToken(
      mintOrganizerInviteToken(payload),
    )
    expect(verified).toEqual({ ok: true, payload })
  })

  it('rejects a payload tampered to name a DIFFERENT invitation', () => {
    // The whole point of signing: swapping `docId` must not let a holder of one
    // valid token redeem another invitation.
    const token = mintOrganizerInviteToken(payload)
    const [, signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...payload, docId: 'inv-victim' }),
    ).toString('base64url')

    expect(verifyOrganizerInviteToken(`${forgedPayload}.${signature}`)).toEqual(
      {
        ok: false,
        reason: 'signature',
      },
    )
  })

  it('rejects a payload tampered to name a different ADDRESS', () => {
    const token = mintOrganizerInviteToken(payload)
    const [, signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...payload, invitedEmail: 'attacker@example.com' }),
    ).toString('base64url')

    expect(verifyOrganizerInviteToken(`${forgedPayload}.${signature}`)).toEqual(
      {
        ok: false,
        reason: 'signature',
      },
    )
  })

  it('rejects a token signed with a different secret', () => {
    const data = JSON.stringify(payload)
    const foreign = crypto
      .createHmac('sha256', 'not-the-real-secret')
      .update(`konf.organizer-invite.v1.${data}`)
      .digest('base64url')
    const token = `${Buffer.from(data).toString('base64url')}.${foreign}`

    expect(verifyOrganizerInviteToken(token)).toEqual({
      ok: false,
      reason: 'signature',
    })
  })

  it('DOMAIN SEPARATION: a signature over the same payload without the label does not verify', () => {
    // The co-speaker minter signs the bare JSON with the SAME secret. Without a
    // domain label, a co-speaker token whose payload happened to parse here
    // would verify — cross-purpose replay under a shared secret.
    const data = JSON.stringify(payload)
    const unlabelled = crypto
      .createHmac('sha256', process.env.INVITATION_TOKEN_SECRET!)
      .update(data)
      .digest('base64url')
    const token = `${Buffer.from(data).toString('base64url')}.${unlabelled}`

    expect(verifyOrganizerInviteToken(token)).toEqual({
      ok: false,
      reason: 'signature',
    })
  })

  it.each([
    ['empty', ''],
    ['no separator', 'abcdef'],
    ['trailing separator', 'abcdef.'],
    ['leading separator', '.abcdef'],
    [
      'not base64url json',
      `${Buffer.from('nonsense').toString('base64url')}.x`,
    ],
  ])('rejects a %s token as malformed or unsigned', (_label, token) => {
    const result = verifyOrganizerInviteToken(token)
    expect(result.ok).toBe(false)
  })

  it.each([
    ['a missing docId', { invitedEmail: 'a@b.com', expiresAt: 1 }],
    ['an empty docId', { docId: '', invitedEmail: 'a@b.com', expiresAt: 1 }],
    ['a missing address', { docId: 'x', expiresAt: 1 }],
    [
      'a non-numeric expiry',
      { docId: 'x', invitedEmail: 'a@b.com', expiresAt: 'soon' },
    ],
  ])('rejects a correctly SIGNED token carrying %s', (_label, bad) => {
    // Signed by us, so it passes the HMAC — the shape check is what refuses it.
    const data = JSON.stringify(bad)
    const sig = crypto
      .createHmac('sha256', process.env.INVITATION_TOKEN_SECRET!)
      .update(`konf.organizer-invite.v1.${data}`)
      .digest('base64url')
    expect(
      verifyOrganizerInviteToken(
        `${Buffer.from(data).toString('base64url')}.${sig}`,
      ),
    ).toEqual({ ok: false, reason: 'malformed' })
  })

  it('does not check expiry — that decision belongs after the ownership check', () => {
    // If the verifier rejected an expired token, the router could not order
    // ownership BEFORE expiry, and a stranger would learn the invitation lapsed.
    const expired = mintOrganizerInviteToken({ ...payload, expiresAt: 1 })
    expect(verifyOrganizerInviteToken(expired).ok).toBe(true)
  })

  describe('tokensMatch', () => {
    it('matches identical strings and nothing else', () => {
      expect(tokensMatch('abc', 'abc')).toBe(true)
      expect(tokensMatch('abc', 'abd')).toBe(false)
      expect(tokensMatch('abc', 'abcd')).toBe(false)
    })

    it('fails closed on a missing side', () => {
      expect(tokensMatch('abc', undefined)).toBe(false)
      expect(tokensMatch(undefined, 'abc')).toBe(false)
      expect(tokensMatch('', '')).toBe(false)
    })
  })
})
