/**
 * @vitest-environment node
 *
 * THE decision behind every WorkOS entry point of the workshop portal (#1296):
 * may a sign-in round-trip run on this host, and if so, what is its callback?
 *
 * The real allowlist and its eligibility policy run. Only the Sanity
 * persistence boundary (`listAllowlistCandidates`) is supplied, so "allowlisted"
 * here means exactly what `isVerifiedRedirectOrigin` means in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'
import { verifiedHost } from '../../../__tests__/helpers/workshopSignIn'

const listAllowlistCandidates =
  vi.fn<() => Promise<DomainVerificationRecord[]>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllowlistCandidates: () => listAllowlistCandidates(),
}))

import { resolveWorkshopSignInHost } from './sign-in'

/** A record for `conf.example.org`, proven yesterday unless overridden. */
function record(
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  return verifiedHost(overrides.hostname ?? 'conf.example.org', overrides)
}

beforeEach(() => {
  listAllowlistCandidates.mockReset()
  listAllowlistCandidates.mockResolvedValue([record()])
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('WORKOS_COOKIE_DOMAIN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('resolveWorkshopSignInHost — an allowlisted host', () => {
  it('yields that host’s own origin and callback', async () => {
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toEqual({
      origin: 'https://conf.example.org',
      redirectUri: 'https://conf.example.org/api/auth/callback',
    })
  })

  it('compares case-insensitively and answers in canonical form', async () => {
    await expect(
      resolveWorkshopSignInHost('Conf.Example.ORG'),
    ).resolves.toEqual({
      origin: 'https://conf.example.org',
      redirectUri: 'https://conf.example.org/api/auth/callback',
    })
  })

  it('treats the default https port as the bare host', async () => {
    await expect(
      resolveWorkshopSignInHost('conf.example.org:443'),
    ).resolves.toMatchObject({ origin: 'https://conf.example.org' })
  })

  it('serves a second verified host independently, each with its own callback', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record(),
      record({ _id: 'domainVerification.y', hostname: 'other.example.org' }),
    ])
    await expect(
      resolveWorkshopSignInHost('other.example.org'),
    ).resolves.toMatchObject({
      redirectUri: 'https://other.example.org/api/auth/callback',
    })
  })
})

describe('resolveWorkshopSignInHost — everything else is refused', () => {
  it('refuses a host nobody has verified', async () => {
    await expect(
      resolveWorkshopSignInHost('evil.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a host that is claimed but not proven', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record({ status: 'pending', lastSuccessAt: null }),
    ])
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a host whose proof has stopped resolving', async () => {
    listAllowlistCandidates.mockResolvedValue([record({ status: 'failing' })])
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a subdomain of a verified host and a host under a verified wildcard', async () => {
    listAllowlistCandidates.mockResolvedValue([
      record(),
      record({ _id: 'domainVerification.w', hostname: '*.wild.example.org' }),
    ])
    await expect(
      resolveWorkshopSignInHost('sub.conf.example.org'),
    ).resolves.toBeNull()
    await expect(
      resolveWorkshopSignInHost('a.wild.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a verified host on a non-default port', async () => {
    await expect(
      resolveWorkshopSignInHost('conf.example.org:8443'),
    ).resolves.toBeNull()
  })

  it('refuses — without throwing — when the allowlist cannot be read', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    listAllowlistCandidates.mockRejectedValue(new Error('sanity unavailable'))

    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
    expect(logged).toHaveBeenCalled()
  })
})

/**
 * THE HOST HEADER IS NEVER TRUSTED ON ITS OWN. A Host value is
 * `hostname[:port]` and nothing else; anything a URL parser would read as
 * userinfo, a path, a query or a fragment is refused BEFORE the allowlist is
 * asked. The userinfo case is the sharp one: `new URL('https://x@conf.example.org')`
 * has host `conf.example.org`, so a naive parse would match the allowlist and hand
 * back a callback for a string that is not that host.
 */
describe('resolveWorkshopSignInHost — a malformed Host is refused before any read', () => {
  it.each([
    ['absent', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['userinfo smuggling a verified host', 'attacker@conf.example.org'],
    ['a path', 'conf.example.org/api/auth/callback'],
    ['a query', 'conf.example.org?x=1'],
    ['a fragment', 'conf.example.org#x'],
    ['a scheme', 'https://conf.example.org'],
    ['a wildcard', '*.conf.example.org'],
    ['a comma-joined chain', 'conf.example.org, evil.example.org'],
    ['a backslash', 'conf.example.org\\evil.example.org'],
    ['an IPv6 literal', '[::1]:3000'],
  ])('%s', async (_label, host) => {
    await expect(resolveWorkshopSignInHost(host)).resolves.toBeNull()
    expect(listAllowlistCandidates).not.toHaveBeenCalled()
  })
})

/**
 * The development-only `localhost` exception (parent #1293, decision 8): a
 * local server against a WorkOS staging environment. It is keyed on
 * `NODE_ENV === 'development'`, which no deployed build can be.
 */
describe('resolveWorkshopSignInHost — localhost', () => {
  it('is allowed in development, over http, without consulting the allowlist', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await expect(resolveWorkshopSignInHost('localhost:3000')).resolves.toEqual({
      origin: 'http://localhost:3000',
      redirectUri: 'http://localhost:3000/api/auth/callback',
    })
    expect(listAllowlistCandidates).not.toHaveBeenCalled()
  })

  it.each(['production', 'test', ''])(
    'is refused when NODE_ENV is "%s" — even with a "verified" localhost record',
    async (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv)
      // Production really carries such a record (a dev entry in `domains[]`);
      // the allowlist policy excludes it, and the exception does not apply.
      listAllowlistCandidates.mockResolvedValue([
        record({ hostname: 'localhost:3000', method: 'grandfathered' }),
        record({ _id: 'domainVerification.l', hostname: 'localhost' }),
      ])
      await expect(
        resolveWorkshopSignInHost('localhost:3000'),
      ).resolves.toBeNull()
      await expect(resolveWorkshopSignInHost('localhost')).resolves.toBeNull()
    },
  )

  it('does not widen to other hosts in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    listAllowlistCandidates.mockResolvedValue([])
    for (const host of [
      'evil.example.org',
      'localhost.evil.example.org',
      'app.localhost:3000',
      '127.0.0.1:3000',
    ]) {
      await expect(resolveWorkshopSignInHost(host)).resolves.toBeNull()
    }
  })

  it('still asks the allowlist for a real host in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toMatchObject({
      redirectUri: 'https://conf.example.org/api/auth/callback',
    })
  })
})

/**
 * THE SESSION COOKIE STAYS HOST-ONLY. The SDK adds a `Domain` attribute to
 * every cookie it sets when `WORKOS_COOKIE_DOMAIN` is configured, which would
 * present one host's session to its sibling hosts. That variable is the only
 * way the cookie stops being host-only, so with it set no host may sign in.
 */
describe('resolveWorkshopSignInHost — WORKOS_COOKIE_DOMAIN', () => {
  it('refuses every host, verified or not, and reads nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', '.example.org')

    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
    expect(listAllowlistCandidates).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
  })

  it('refuses localhost in development too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', 'localhost')
    await expect(
      resolveWorkshopSignInHost('localhost:3000'),
    ).resolves.toBeNull()
  })
})
