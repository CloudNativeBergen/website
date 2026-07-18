import { describe, it, expect } from 'vitest'
import {
  isValidPushEndpoint,
  PushEndpointSchema,
  MAX_PUSH_ENDPOINT_LENGTH,
} from '@/lib/push/validate'

/**
 * SSRF hardening for push endpoints (#444, S2): only a plain public HTTPS URL is
 * an acceptable request target for the push sender.
 */
describe('isValidPushEndpoint', () => {
  it('accepts a real push-service HTTPS endpoint', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
      'https://wns2-par02p.notify.windows.com/w/?token=xyz',
    ]) {
      expect(isValidPushEndpoint(ok)).toBe(true)
    }
  })

  it('rejects a non-https scheme', () => {
    expect(isValidPushEndpoint('http://push.example/x')).toBe(false)
    expect(isValidPushEndpoint('ftp://push.example/x')).toBe(false)
    expect(isValidPushEndpoint('file:///etc/passwd')).toBe(false)
  })

  it('rejects an IPv4 literal host', () => {
    expect(isValidPushEndpoint('https://127.0.0.1/x')).toBe(false)
    expect(
      isValidPushEndpoint('https://169.254.169.254/latest/meta-data'),
    ).toBe(false)
  })

  it('rejects an IPv6 literal host', () => {
    expect(isValidPushEndpoint('https://[::1]/x')).toBe(false)
    expect(isValidPushEndpoint('https://[fe80::1]/x')).toBe(false)
  })

  it('rejects an integer / hex host that coerces to an IP', () => {
    expect(isValidPushEndpoint('https://2130706433/x')).toBe(false)
    expect(isValidPushEndpoint('https://0x7f000001/x')).toBe(false)
  })

  it('rejects localhost and internal TLDs', () => {
    for (const host of [
      'https://localhost/x',
      'https://api.localhost/x',
      'https://service.local/x',
      'https://db.internal/x',
    ]) {
      expect(isValidPushEndpoint(host)).toBe(false)
    }
  })

  it('rejects an oversize endpoint', () => {
    const oversize =
      'https://push.example/' + 'a'.repeat(MAX_PUSH_ENDPOINT_LENGTH)
    expect(oversize.length).toBeGreaterThan(MAX_PUSH_ENDPOINT_LENGTH)
    expect(isValidPushEndpoint(oversize)).toBe(false)
  })

  it('rejects non-strings and unparseable input', () => {
    expect(isValidPushEndpoint(undefined)).toBe(false)
    expect(isValidPushEndpoint(123)).toBe(false)
    expect(isValidPushEndpoint('not-a-url')).toBe(false)
    expect(isValidPushEndpoint('')).toBe(false)
  })
})

describe('PushEndpointSchema', () => {
  it('parses a valid endpoint and rejects an invalid one', () => {
    expect(
      PushEndpointSchema.safeParse('https://push.example/ok').success,
    ).toBe(true)
    expect(PushEndpointSchema.safeParse('http://127.0.0.1/x').success).toBe(
      false,
    )
  })
})
