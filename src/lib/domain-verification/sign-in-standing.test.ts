/** The organizer standing uses the real central sign-in proof policy. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { verifiedHost } from '../../../__tests__/helpers/workshopSignIn'
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
})
