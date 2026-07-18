import { describe, it, expect } from 'vitest'
import { urlBase64ToUint8Array } from '@/lib/push/encoding'

describe('urlBase64ToUint8Array', () => {
  it('decodes a standard base64 string', () => {
    // "hello" => aGVsbG8=
    const result = urlBase64ToUint8Array('aGVsbG8=')
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111])
  })

  it('decodes a base64url string without padding', () => {
    // Bytes [251, 255] => standard "+/8=" => base64url "-_8" (no padding)
    const result = urlBase64ToUint8Array('-_8')
    expect(Array.from(result)).toEqual([251, 255])
  })

  it('translates the url-safe alphabet (- and _) back to + and /', () => {
    const urlSafe = urlBase64ToUint8Array('-_8=')
    const standard = urlBase64ToUint8Array('+/8=')
    expect(Array.from(urlSafe)).toEqual(Array.from(standard))
  })

  it('round-trips a realistic VAPID-length key to 65 bytes', () => {
    // A P-256 application server key is 65 bytes; build one and re-encode it.
    const bytes = new Uint8Array(65)
    for (let i = 0; i < 65; i += 1) bytes[i] = i
    const base64url = Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const decoded = urlBase64ToUint8Array(base64url)
    expect(decoded.length).toBe(65)
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })

  it('returns an empty array for an empty string', () => {
    expect(urlBase64ToUint8Array('').length).toBe(0)
  })
})
