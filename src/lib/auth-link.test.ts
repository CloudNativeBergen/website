import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  LINK_INTENT_TTL_SECONDS,
  signLinkIntent,
  verifyLinkIntent,
} from './auth-link'

const SECRET = 'test-secret-value'
const OTHER_SECRET = 'a-different-secret'

describe('link-intent token', () => {
  it('round-trips a valid token bound to the speaker + provider + session', () => {
    const token = signLinkIntent(
      { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
      SECRET,
    )
    expect(verifyLinkIntent(token, 'github', SECRET)).toEqual({
      speakerId: 'spk-1',
      provider: 'github',
      initiatorSub: 'sess-1',
    })
  })

  it('rejects a token verified against a different provider', () => {
    // The cookie is bound to github; a linkedin callback must not honour it.
    const token = signLinkIntent(
      { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
      SECRET,
    )
    expect(verifyLinkIntent(token, 'linkedin', SECRET)).toBeNull()
  })

  it('rejects a forged token signed with the wrong secret', () => {
    const forged = signLinkIntent(
      { speakerId: 'attacker', provider: 'github', initiatorSub: 'sess-1' },
      OTHER_SECRET,
    )
    expect(verifyLinkIntent(forged, 'github', SECRET)).toBeNull()
  })

  it('rejects a token whose payload was tampered with', () => {
    const token = signLinkIntent(
      { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
      SECRET,
    )
    const [, sig] = token.split('.')
    // Swap the payload for one that claims a different speaker, keep the MAC.
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        speakerId: 'victim',
        provider: 'github',
        initiatorSub: 'sess-1',
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce: 'x',
      }),
    ).toString('base64url')
    expect(
      verifyLinkIntent(`${tamperedPayload}.${sig}`, 'github', SECRET),
    ).toBeNull()
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = signLinkIntent(
      { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
      SECRET,
    )
    const [payload] = token.split('.')
    expect(verifyLinkIntent(`${payload}.deadbeef`, 'github', SECRET)).toBeNull()
  })

  it('rejects an authentic token that is missing the initiator binding', () => {
    // A well-signed token without `initiatorSub` (e.g. a pre-fix token) must be
    // rejected so the session binding cannot be bypassed by omission.
    const payloadB64 = Buffer.from(
      JSON.stringify({
        speakerId: 'spk-1',
        provider: 'github',
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce: 'x',
      }),
    ).toString('base64url')
    const sig = createHmac('sha256', SECRET)
      .update(payloadB64)
      .digest('base64url')
    expect(
      verifyLinkIntent(`${payloadB64}.${sig}`, 'github', SECRET),
    ).toBeNull()
  })

  it('rejects an expired token (no replay after the TTL window)', () => {
    const mintedAt = 1_000_000_000_000 // fixed epoch ms
    const token = signLinkIntent(
      { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
      SECRET,
      mintedAt,
    )
    const afterExpiry = mintedAt + (LINK_INTENT_TTL_SECONDS + 1) * 1000
    expect(verifyLinkIntent(token, 'github', SECRET, afterExpiry)).toBeNull()
    // still valid just inside the window
    expect(
      verifyLinkIntent(token, 'github', SECRET, mintedAt + 1000),
    ).not.toBeNull()
  })

  it('uses a short TTL (<= 2 minutes) to shrink the shared-browser race', () => {
    expect(LINK_INTENT_TTL_SECONDS).toBeLessThanOrEqual(120)
  })

  it('rejects empty / malformed tokens and a missing secret', () => {
    expect(verifyLinkIntent(undefined, 'github', SECRET)).toBeNull()
    expect(verifyLinkIntent('', 'github', SECRET)).toBeNull()
    expect(verifyLinkIntent('no-dot-here', 'github', SECRET)).toBeNull()
    expect(verifyLinkIntent('.', 'github', SECRET)).toBeNull()
    const token = signLinkIntent(
      { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
      SECRET,
    )
    expect(verifyLinkIntent(token, 'github', undefined)).toBeNull()
  })

  it('throws when minting without a configured secret (fail closed)', () => {
    expect(() =>
      signLinkIntent(
        { speakerId: 'spk-1', provider: 'github', initiatorSub: 'sess-1' },
        undefined,
      ),
    ).toThrow(/AUTH_SECRET/)
  })

  it('throws when minting without an initiating session (fail closed)', () => {
    expect(() =>
      signLinkIntent(
        { speakerId: 'spk-1', provider: 'github', initiatorSub: '' },
        SECRET,
      ),
    ).toThrow(/initiating session/)
  })
})
