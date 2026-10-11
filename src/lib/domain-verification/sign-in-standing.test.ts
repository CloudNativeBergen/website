/** The organizer standing uses the real central sign-in proof policy. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifiedHost } from '../../../__tests__/helpers/domainClaims'
import { workshopSignInStanding } from './sign-in-standing'

const now = new Date()
const HOST = 'tenant.example.org'

beforeEach(() => {
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshopSignInStanding', () => {
  it('is available for a tenant’s verified DNS proof', () => {
    expect(workshopSignInStanding(verifiedHost(HOST), now)).toEqual({
      state: 'available',
    })
  })

  it('is available for a platform-allocated host without a DNS proof', () => {
    expect(
      workshopSignInStanding(
        verifiedHost('tenant.konf.run', {
          method: 'platform-owned',
          lastSuccessAt: null,
        }),
        now,
      ),
    ).toEqual({ state: 'available' })
  })

  it('is unverified for a grandfathered record inside its grace period', () => {
    expect(
      workshopSignInStanding(
        verifiedHost(HOST, {
          method: 'grandfathered',
          status: 'pending',
          lastSuccessAt: null,
          graceUntil: new Date(now.getTime() + 86_400_000).toISOString(),
        }),
        now,
      ),
    ).toEqual({ state: 'unverified' })
  })

  it.each([
    ['no record', null],
    [
      'an unproven claim',
      verifiedHost(HOST, { status: 'pending', lastSuccessAt: null }),
    ],
    ['a failing proof', verifiedHost(HOST, { status: 'failing' })],
    ['a revoked claim', verifiedHost(HOST, { status: 'revoked' })],
    [
      'a stale proof',
      verifiedHost(HOST, {
        lastSuccessAt: new Date(now.getTime() - 31 * 86_400_000).toISOString(),
      }),
    ],
    [
      'a host inside the platform zone without an allocation',
      verifiedHost('tenant.konf.run', { method: 'grandfathered' }),
    ],
    [
      'a platform-owned record outside the configured zone',
      verifiedHost(HOST, { method: 'platform-owned' }),
    ],
    [
      'a revoked platform allocation',
      verifiedHost('tenant.konf.run', {
        method: 'platform-owned',
        status: 'revoked',
      }),
    ],
  ])('is unverified for %s', (_label, record) => {
    expect(workshopSignInStanding(record, now)).toEqual({
      state: 'unverified',
    })
  })

  describe('a proven host this deployment’s configuration refuses', () => {
    it('is blocked on every host while WORKSHOP_AUTH_ORIGIN cannot be used', () => {
      // The same record is available with the variable usable or unset.
      vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'https://auth.example.org')
      expect(workshopSignInStanding(verifiedHost(HOST), now)).toEqual({
        state: 'available',
      })

      vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'https://auth.example.org/path')

      expect(workshopSignInStanding(verifiedHost(HOST), now)).toEqual({
        state: 'blocked',
        by: 'origin-unusable',
      })
    })

    it('is blocked on the host WORKSHOP_AUTH_ORIGIN names, and on no other', () => {
      vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${HOST}`)

      expect(workshopSignInStanding(verifiedHost(HOST), now)).toEqual({
        state: 'blocked',
        by: 'auth-host',
      })
      expect(
        workshopSignInStanding(verifiedHost('other.example.org'), now),
      ).toEqual({ state: 'available' })
    })

    it('names the missing proof first: that is what the organizer can act on', () => {
      vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'not a url')

      expect(
        workshopSignInStanding(verifiedHost(HOST, { status: 'failing' }), now),
      ).toEqual({ state: 'unverified' })
      expect(workshopSignInStanding(null, now)).toEqual({ state: 'unverified' })
    })
  })
})
