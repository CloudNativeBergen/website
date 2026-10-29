/**
 * @vitest-environment node
 *
 * The `konf_wall` device cookie (Photo Wall spec §6.1). The `Set-Cookie`
 * line is serialized by Next's own `ResponseCookies` (a real `NextResponse`),
 * so the attributes asserted are the ones a browser would receive, not the
 * options object. The expected device key is a fixed literal of SHA-256 over
 * the token (`printf 'tok' | shasum -a 256`), not recomputed.
 */
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deletionDateEnd } from './deletion'
import {
  issueWallDevice,
  readWallDevice,
  wallDeviceCookie,
  wallDeviceKey,
} from './device'

/** The end of CNDN 2026's deletion date (§11.1), 23:59:59 Oslo. */
const EXPIRES = deletionDateEnd('2026-10-27')!

/** The `Set-Cookie` line a response carries after setting the cookie. */
function setCookieLine(value: string, expires = EXPIRES): string {
  const response = NextResponse.next()
  const { name, options } = wallDeviceCookie(expires)
  response.cookies.set(name, value, options)
  const lines = response.headers.getSetCookie()
  expect(lines).toHaveLength(1)
  return lines[0]
}

/** The `name=value` part of a `Set-Cookie` line, as a browser keeps it. */
const valueOf = (line: string) => {
  const [pair] = line.split(';')
  return pair.slice(pair.indexOf('=') + 1)
}

const flipBit = (signature: string) => {
  const bytes = Buffer.from(signature, 'base64url')
  bytes[0] ^= 1
  return bytes.toString('base64url')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('wallDeviceKey', () => {
  it('is the first 32 hex characters of SHA-256 over the token', () => {
    expect(wallDeviceKey('tok')).toBe('1a7674eb4ee78df7e1ac439a93c3fa8e')
  })
})

describe('the Set-Cookie line', () => {
  it('is konf_wall, HttpOnly, SameSite=Lax, Path=/wall, Secure, host-only, expiring at the end of the deletion date', () => {
    const { value } = issueWallDevice()
    const [pair, ...attributes] = setCookieLine(value).split('; ')
    expect(pair).toMatch(/^konf_wall=[\w-]+\.[\w-]+$/)
    // No `Domain`: host-only. No `Max-Age`: the browser keeps it to the day.
    expect(attributes.sort()).toEqual(
      [
        'Expires=Thu, 26 Nov 2026 22:59:59 GMT',
        'HttpOnly',
        'Path=/wall',
        'SameSite=lax',
        'Secure',
      ].sort(),
    )
  })

  it('drops Secure in development only, so a plain-http dev server can set it', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const dev = setCookieLine(issueWallDevice().value)
    expect(dev).not.toContain('Secure')
    expect(dev).toContain('HttpOnly')

    vi.stubEnv('NODE_ENV', 'test')
    expect(setCookieLine(issueWallDevice().value)).toContain('Secure')
  })
})

describe('reading the cookie back', () => {
  it('replays the Set-Cookie value into a second read as the same device', () => {
    const issued = issueWallDevice()
    const device = readWallDevice(valueOf(setCookieLine(issued.value)))
    expect(device).not.toBeNull()
    expect(device?.token).toBe(issued.token)
    expect(device?.key).toBe(issued.key)
    expect(device?.key).toBe(wallDeviceKey(issued.token))
  })

  it('mints a random 128-bit token per device', () => {
    const a = issueWallDevice()
    const b = issueWallDevice()
    expect(a.token).not.toBe(b.token)
    expect(a.key).not.toBe(b.key)
    expect(Buffer.from(a.token, 'base64url')).toHaveLength(16)
  })

  it('never carries the device key, only the token it is derived from', () => {
    const { value, key } = issueWallDevice()
    const payload = Buffer.from(value.split('.')[0], 'base64url').toString()
    expect(payload).not.toContain(key)
  })

  it('reads a forged, tampered, unsigned or malformed cookie as absent', () => {
    const { value } = issueWallDevice()
    const [payload, signature] = value.split('.')
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString())
    forged.t = Buffer.alloc(16, 7).toString('base64url')
    const reSigned = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`
    const unsigned = `${payload}.${Buffer.alloc(32).toString('base64url')}`
    for (const bad of [
      reSigned,
      unsigned,
      // One bit of the signature flipped: a changed last CHARACTER could
      // land on padding bits and still verify.
      `${payload}.${flipBit(signature)}`,
      payload,
      `${payload}.`,
      '',
      'a.b',
      null,
      undefined,
    ]) {
      expect(readWallDevice(bad)).toBeNull()
    }
  })

  it('reads a correctly signed cookie with the wrong payload shape as absent', () => {
    // Signed as the server signs, so only the shape check can refuse it.
    const signedAs = (data: string) =>
      `${Buffer.from(data).toString('base64url')}.${crypto
        .createHmac('sha256', process.env.INVITATION_TOKEN_SECRET!)
        .update(`konf.wall-device.v1.${data}`)
        .digest('base64url')}`
    for (const data of [
      '{"at":1}',
      '{"t":"","at":1}',
      '{"t":7,"at":1}',
      '{"t":"tok"}',
      '{"t":"tok","at":"1"}',
      '[]',
      'null',
      'not json',
    ]) {
      expect(readWallDevice(signedAs(data))).toBeNull()
    }
    expect(readWallDevice(signedAs('{"t":"tok","at":1}'))?.key).toBe(
      wallDeviceKey('tok'),
    )
  })

  it('does not accept a feedback device cookie, signed with the same secret under its own label', async () => {
    const { recordAnswer } = await import('@/lib/feedback/device')
    const feedback = recordAnswer(null, 'talk-1', new Date()).cookie.value
    expect(readWallDevice(feedback)).toBeNull()
  })
})
