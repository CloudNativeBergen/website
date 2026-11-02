import { describe, expect, it } from 'vitest'
import { signClientIp, verifyClientIp } from './client-ip'

const SECRET = 'test-secret'
const NOW = 1_800_000_000_000

describe('signed client IP header', () => {
  it('accepts a fresh valid signature, IPv4 and IPv6', async () => {
    for (const ip of ['203.0.113.7', '2001:db8::1']) {
      const h = await signClientIp(ip, SECRET, NOW)
      expect(await verifyClientIp(h, SECRET, NOW + 60_000)).toBe(ip)
    }
  })

  it('rejects stale, tampered or wrongly keyed headers', async () => {
    const h = await signClientIp('203.0.113.7', SECRET, NOW)
    expect(await verifyClientIp(h, SECRET, NOW + 600_000)).toBeNull()
    expect(await verifyClientIp(h, 'other', NOW)).toBeNull()
    expect(
      await verifyClientIp(
        h.replace('203.0.113.7', '203.0.113.8'),
        SECRET,
        NOW,
      ),
    ).toBeNull()
    expect(await verifyClientIp(h, undefined, NOW)).toBeNull()
    expect(await verifyClientIp('garbage', SECRET, NOW)).toBeNull()
  })
})
