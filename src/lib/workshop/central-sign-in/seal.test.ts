/**
 * @vitest-environment node
 *
 * The seal behind the central workshop sign-in (#1313), against the REAL
 * `jose`: the suite-wide alias is defeated below, and the first test fails if
 * it ever is not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

vi.mock('jose', async () =>
  (await import('../../../../__tests__/helpers/realJose')).realJose(),
)

import * as jose from 'jose'
import { seal, unseal } from './seal'

const PASSWORD = 'correct horse battery staple, forty-eight chars!'
const payload = z.object({ host: z.string() })
const NOW = new Date('2026-10-10T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  vi.stubEnv('WORKOS_COOKIE_PASSWORD', PASSWORD)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('seal', () => {
  it('is held to the real jose: the content is encrypted, not encoded', async () => {
    const sealed = await seal('handoff', { host: 'a.example.org' }, 60)

    // A compact JWE: five segments, direct key, and no claim readable outside.
    expect(sealed.split('.')).toHaveLength(5)
    expect(jose.decodeProtectedHeader(sealed)).toEqual({
      alg: 'dir',
      enc: 'A256GCM',
    })
    expect(Buffer.from(sealed, 'base64url').toString()).not.toContain(
      'a.example.org',
    )
  })

  it('unseals what it sealed, for the same purpose', async () => {
    const sealed = await seal('handoff', { host: 'a.example.org' }, 60)

    expect(await unseal('handoff', sealed, payload)).toEqual({
      host: 'a.example.org',
    })
  })

  it.each(['session', 'auth-state', 'auth-start'] as const)(
    'refuses a hand-off token presented as %s',
    async (purpose) => {
      const sealed = await seal('handoff', { host: 'a.example.org' }, 60)

      expect(await unseal(purpose, sealed, payload)).toBeNull()
    },
  )

  it('expires: accepted one second before its lifetime ends, refused one second after', async () => {
    const sealed = await seal('handoff', { host: 'a.example.org' }, 60)

    vi.setSystemTime(NOW.getTime() + 59_000)
    expect(await unseal('handoff', sealed, payload)).toEqual({
      host: 'a.example.org',
    })
    vi.setSystemTime(NOW.getTime() + 61_000)
    expect(await unseal('handoff', sealed, payload)).toBeNull()
  })

  it('refuses a seal made with another password', async () => {
    const sealed = await seal('handoff', { host: 'a.example.org' }, 60)

    vi.stubEnv('WORKOS_COOKIE_PASSWORD', PASSWORD.replace('correct', 'another'))
    expect(await unseal('handoff', sealed, payload)).toBeNull()
  })

  it('refuses a seal with one character changed', async () => {
    const sealed = await seal('handoff', { host: 'a.example.org' }, 60)
    const parts = sealed.split('.')
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1)

    expect(await unseal('handoff', parts.join('.'), payload)).toBeNull()
  })

  it('refuses a payload that is not the expected shape', async () => {
    const sealed = await seal('handoff', { host: 42 }, 60)

    expect(await unseal('handoff', sealed, payload)).toBeNull()
  })

  it.each([null, undefined, '', 'not-a-seal'])('refuses %j', async (value) => {
    expect(await unseal('handoff', value, payload)).toBeNull()
  })

  it('does not seal without a password of at least 32 characters', async () => {
    vi.stubEnv('WORKOS_COOKIE_PASSWORD', 'too short')

    await expect(
      seal('handoff', { host: 'a.example.org' }, 60),
    ).rejects.toThrow(/WORKOS_COOKIE_PASSWORD/)
  })
})
