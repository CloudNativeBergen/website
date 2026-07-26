/**
 * @vitest-environment node
 *
 * Standing auth-abuse suite for the provider-link-intent tokens
 * (src/lib/auth-link.ts `signLinkIntent` / `verifyLinkIntent`) — part of #451.
 * These HMAC-signed, short-lived tokens bind an already-authenticated speaker to
 * a provider they are about to link; a forged/replayed/mis-bound one is the
 * "link-cookie takeover" class this suite guards against permanently.
 *
 * Both functions take injectable `secret` and `now`, so every case is pure — no
 * env or timer mocking. `forge()` mints tokens with an arbitrary payload but a
 * VALID signature (using the known secret) to prove the SEMANTIC checks reject
 * bad payloads even past the integrity layer (defence in depth).
 */
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import {
  signLinkIntent,
  verifyLinkIntent,
  LINK_INTENT_TTL_SECONDS,
} from '@/lib/auth-link'

const SECRET = 'test-auth-secret-long-enough-abcdefghijklmnop'
const OTHER_SECRET = 'a-different-secret-of-similar-length-qrstuvwx'
const NOW = 1_700_000_000_000 // fixed epoch ms

const validInput = {
  speakerId: 'speaker-1',
  provider: 'github' as const,
  initiatorSub: 'sub-initiator-1',
}

/** Build `<payloadB64>.<hmac>` with a VALID signature over an arbitrary body. */
function forge(payload: Record<string, unknown>, secret = SECRET): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url')
  return `${payloadB64}.${sig}`
}

describe('signLinkIntent', () => {
  it('mints a token that round-trips through verifyLinkIntent', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    const result = verifyLinkIntent(token, 'github', SECRET, NOW)
    expect(result).toEqual({
      speakerId: 'speaker-1',
      provider: 'github',
      initiatorSub: 'sub-initiator-1',
    })
  })

  it('fails closed when AUTH_SECRET is missing', () => {
    const orig = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET
    try {
      expect(() => signLinkIntent(validInput, undefined, NOW)).toThrow(
        /AUTH_SECRET/,
      )
    } finally {
      process.env.AUTH_SECRET = orig
    }
  })

  it('refuses to mint without a speaker id', () => {
    expect(() =>
      signLinkIntent({ ...validInput, speakerId: '' }, SECRET, NOW),
    ).toThrow(/speaker id/)
  })

  it('refuses to mint without an initiating session', () => {
    expect(() =>
      signLinkIntent({ ...validInput, initiatorSub: '' }, SECRET, NOW),
    ).toThrow(/initiating session/)
  })

  it('is non-deterministic (per-mint nonce) so tokens are not reusable structurally', () => {
    const a = signLinkIntent(validInput, SECRET, NOW)
    const b = signLinkIntent(validInput, SECRET, NOW)
    expect(a).not.toBe(b)
  })
})

describe('verifyLinkIntent — happy path & expiry boundary', () => {
  it('accepts a token exactly at its expiry instant', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    const expMs = (Math.floor(NOW / 1000) + LINK_INTENT_TTL_SECONDS) * 1000
    // Reject is `exp*1000 < now`, so now === exp*1000 is still valid.
    expect(verifyLinkIntent(token, 'github', SECRET, expMs)).not.toBeNull()
    expect(verifyLinkIntent(token, 'github', SECRET, expMs + 1)).toBeNull()
  })
})

describe('verifyLinkIntent — abuse cases (all reject to null)', () => {
  it('rejects a missing / empty token', () => {
    expect(verifyLinkIntent(undefined, 'github', SECRET, NOW)).toBeNull()
    expect(verifyLinkIntent(null, 'github', SECRET, NOW)).toBeNull()
    expect(verifyLinkIntent('', 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects when no secret is configured', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    expect(verifyLinkIntent(token, 'github', undefined, NOW)).toBeNull()
  })

  it('rejects malformed tokens (no dot, empty payload, empty sig)', () => {
    expect(verifyLinkIntent('not-a-token', 'github', SECRET, NOW)).toBeNull()
    expect(verifyLinkIntent('.sig', 'github', SECRET, NOW)).toBeNull()
    expect(verifyLinkIntent('payload.', 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects a tampered payload (HMAC no longer matches)', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    const [payloadB64, sig] = token.split('.')
    const flipped = (payloadB64[0] === 'A' ? 'B' : 'A') + payloadB64.slice(1)
    expect(
      verifyLinkIntent(`${flipped}.${sig}`, 'github', SECRET, NOW),
    ).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    const [payloadB64, sig] = token.split('.')
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(
      verifyLinkIntent(`${payloadB64}.${flipped}`, 'github', SECRET, NOW),
    ).toBeNull()
  })

  it('rejects a token forged with the wrong secret', () => {
    const token = signLinkIntent(validInput, OTHER_SECRET, NOW)
    expect(verifyLinkIntent(token, 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    const wayLater = NOW + (LINK_INTENT_TTL_SECONDS + 60) * 1000
    expect(verifyLinkIntent(token, 'github', SECRET, wayLater)).toBeNull()
  })

  it('rejects a token bound to a DIFFERENT provider than expected', () => {
    const token = signLinkIntent(validInput, SECRET, NOW) // github
    expect(verifyLinkIntent(token, 'linkedin', SECRET, NOW)).toBeNull()
  })

  it('rejects a validly-signed token carrying a non-linkable provider', () => {
    const token = forge({
      speakerId: 'speaker-1',
      provider: 'evil',
      initiatorSub: 'sub-1',
      exp: Math.floor(NOW / 1000) + 60,
      nonce: 'x',
    })
    expect(verifyLinkIntent(token, 'evil', SECRET, NOW)).toBeNull()
  })

  it('rejects a validly-signed token with an empty speakerId', () => {
    const token = forge({
      speakerId: '',
      provider: 'github',
      initiatorSub: 'sub-1',
      exp: Math.floor(NOW / 1000) + 60,
      nonce: 'x',
    })
    expect(verifyLinkIntent(token, 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects a validly-signed token missing the initiating session', () => {
    const token = forge({
      speakerId: 'speaker-1',
      provider: 'github',
      exp: Math.floor(NOW / 1000) + 60,
      nonce: 'x',
    })
    expect(verifyLinkIntent(token, 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects a validly-signed token with a non-numeric exp', () => {
    const token = forge({
      speakerId: 'speaker-1',
      provider: 'github',
      initiatorSub: 'sub-1',
      exp: 'not-a-number',
      nonce: 'x',
    })
    expect(verifyLinkIntent(token, 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects a signature that is valid for a DIFFERENT payload (swap)', () => {
    const good = forge({
      speakerId: 'speaker-1',
      provider: 'github',
      initiatorSub: 'sub-1',
      exp: Math.floor(NOW / 1000) + 60,
      nonce: 'x',
    })
    const evil = forge({
      speakerId: 'attacker',
      provider: 'github',
      initiatorSub: 'sub-attacker',
      exp: Math.floor(NOW / 1000) + 60,
      nonce: 'y',
    })
    const swapped = `${evil.split('.')[0]}.${good.split('.')[1]}`
    expect(verifyLinkIntent(swapped, 'github', SECRET, NOW)).toBeNull()
  })

  it('rejects a length-mismatched signature without throwing', () => {
    const token = signLinkIntent(validInput, SECRET, NOW)
    const payloadB64 = token.split('.')[0]
    expect(
      verifyLinkIntent(`${payloadB64}.short`, 'github', SECRET, NOW),
    ).toBeNull()
  })

  it('rejects payload that is not valid base64url JSON', () => {
    // Valid signature over a payload that does not JSON-parse.
    const payloadB64 = Buffer.from('}{not json', 'utf8').toString('base64url')
    const sig = createHmac('sha256', SECRET)
      .update(payloadB64)
      .digest('base64url')
    expect(
      verifyLinkIntent(`${payloadB64}.${sig}`, 'github', SECRET, NOW),
    ).toBeNull()
  })
})
