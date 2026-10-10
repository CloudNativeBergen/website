/**
 * @vitest-environment node
 *
 * THE decision behind every WorkOS entry point of the workshop portal (#1296):
 * may a sign-in round-trip run on this host, and if so, what is its callback?
 *
 * The real allowlist policy and sign-in standing run. Only the Sanity
 * persistence boundary (`getRedirectUriSyncRow`, the host's own record read by
 * id) is supplied, so "can sign in" here means exactly what it means in
 * production: verified AND registered in WorkOS (#1298).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  DomainVerificationRecord,
  RedirectUriState,
  RedirectUriSyncRow,
} from '@/lib/domain-verification/types'
import {
  signInHost,
  signInHostsById,
} from '../../../__tests__/helpers/workshopSignIn'

const getRedirectUriSyncRow =
  vi.fn<(id: string) => Promise<RedirectUriSyncRow | null>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  getRedirectUriSyncRow: (id: string) => getRedirectUriSyncRow(id),
}))

/** Make exactly these hosts known to the read. */
function hosts(...rows: RedirectUriSyncRow[]) {
  getRedirectUriSyncRow.mockImplementation(signInHostsById(rows))
}

import {
  resolveWorkshopSignInHost,
  workshopPortalUrl,
  workshopRequestHost,
} from './sign-in'

/**
 * `conf.example.org` as read: proven yesterday and registered in WorkOS unless
 * overridden.
 */
function record(
  overrides: Partial<DomainVerificationRecord> = {},
  redirectUri: Partial<RedirectUriState> = {},
): RedirectUriSyncRow {
  return signInHost(
    overrides.hostname ?? 'conf.example.org',
    overrides,
    redirectUri,
  )
}

beforeEach(() => {
  getRedirectUriSyncRow.mockReset()
  hosts(record())
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('WORKOS_COOKIE_DOMAIN', '')
  // The fixtures' owner is the platform, so a host short of `ready` is
  // pending or failed — the states the cases are named after — and not
  // `not-offered`.
  vi.stubEnv('PLATFORM_ORG_ID', 'org-1')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('resolveWorkshopSignInHost — a host that can sign in', () => {
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

  it('accepts a callback WorkOS holds without an id of ours (external)', async () => {
    hosts(record({}, { status: 'external', id: null }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toMatchObject({ origin: 'https://conf.example.org' })
  })

  it('reads only that host’s own record', async () => {
    await resolveWorkshopSignInHost('Conf.Example.ORG')
    expect(getRedirectUriSyncRow).toHaveBeenCalledTimes(1)
    expect(getRedirectUriSyncRow).toHaveBeenCalledWith(
      'domainVerification.conf.example.org',
    )
  })

  it('serves a second verified host independently, each with its own callback', async () => {
    hosts(
      record(),
      record({ _id: 'domainVerification.y', hostname: 'other.example.org' }),
    )
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
    hosts(record({ status: 'pending', lastSuccessAt: null }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a host whose proof has stopped resolving', async () => {
    hosts(record({ status: 'failing' }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a registered host whose last proof is older than 30 days', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000).toISOString()
    hosts(record({ lastSuccessAt: fortyDaysAgo, verifiedAt: fortyDaysAgo }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a registered grandfathered host once its grace has ended', async () => {
    hosts(
      record({
        method: 'grandfathered',
        status: 'pending',
        lastSuccessAt: null,
        graceUntil: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    )
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('CONTROL: admits that grandfathered host while its grace lasts', async () => {
    hosts(
      record({
        method: 'grandfathered',
        status: 'pending',
        lastSuccessAt: null,
        graceUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    )
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toMatchObject({ origin: 'https://conf.example.org' })
  })

  it('refuses a verified host whose callback WorkOS does not have yet', async () => {
    hosts(record({}, { status: null, id: null }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a verified host whose registration WorkOS rejected', async () => {
    hosts(record({}, { status: null, id: null, error: 'WorkOS 422' }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a registered host whose recreation WorkOS rejected', async () => {
    hosts(record({}, { status: 'registered', error: 'WorkOS POST 500' }))
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a host its record’s conference no longer claims — a release whose revoke never landed', async () => {
    hosts({
      ...record(),
      conference: {
        organization: { _ref: 'org-1' },
        domains: ['other.example.org'],
      },
    })
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses when the record’s conference is gone', async () => {
    hosts({ ...record(), conference: null })
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('CONTROL: admits it while the conference claims it, in any spelling', async () => {
    hosts({
      ...record(),
      conference: {
        organization: { _ref: 'org-1' },
        domains: [' Conf.Example.ORG '],
      },
    })
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toMatchObject({ origin: 'https://conf.example.org' })
  })

  it('refuses when the record found under the id names a host that merely ends in it', async () => {
    getRedirectUriSyncRow.mockResolvedValue(
      record({ hostname: 'sub.conf.example.org' }),
    )
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses when the record found under the id names another host', async () => {
    getRedirectUriSyncRow.mockResolvedValue(
      record({ hostname: 'other.example.org' }),
    )
    await expect(
      resolveWorkshopSignInHost('conf.example.org'),
    ).resolves.toBeNull()
  })

  it('refuses a subdomain of a verified host and a host under a verified wildcard', async () => {
    hosts(
      record(),
      record({ _id: 'domainVerification.w', hostname: '*.wild.example.org' }),
    )
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
    getRedirectUriSyncRow.mockRejectedValue(new Error('sanity unavailable'))

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
    ['a trailing dot on a verified host', 'conf.example.org.'],
    ['an out-of-range port', 'conf.example.org:65536'],
  ])('%s', async (_label, host) => {
    await expect(resolveWorkshopSignInHost(host)).resolves.toBeNull()
    expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
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
    expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
  })

  it.each([['production'], ['test'], [''], [undefined]])(
    'is refused when NODE_ENV is %j — even with a "verified" localhost record',
    async (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv)
      expect(process.env.NODE_ENV).toBe(nodeEnv)
      // Production really carries such a record (a dev entry in `domains[]`);
      // the allowlist policy excludes it, and the exception does not apply.
      hosts(
        record({ hostname: 'localhost:3000', method: 'grandfathered' }),
        record({ _id: 'domainVerification.l', hostname: 'localhost' }),
      )
      await expect(
        resolveWorkshopSignInHost('localhost:3000'),
      ).resolves.toBeNull()
      await expect(resolveWorkshopSignInHost('localhost')).resolves.toBeNull()
    },
  )

  it('does not widen to other hosts in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    hosts()
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
    expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
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

/**
 * WHICH header is "the host". One source, the `Host` header — the same one that
 * resolves the conference for the page. A forwarding header is client-supplied
 * wherever the edge does not overwrite it, and must never pick the host.
 */
describe('workshopRequestHost', () => {
  it('is the Host header', () => {
    expect(workshopRequestHost(new Headers({ host: 'conf.example.org' }))).toBe(
      'conf.example.org',
    )
  })

  it('ignores x-forwarded-host, forwarded and origin entirely', () => {
    const headers = new Headers({
      host: 'conf.example.org',
      'x-forwarded-host': 'evil.example.org',
      forwarded: 'host=evil.example.org',
      origin: 'https://evil.example.org',
    })
    expect(workshopRequestHost(headers)).toBe('conf.example.org')
  })

  it('is null without a Host header, whatever else is sent', () => {
    expect(
      workshopRequestHost(
        new Headers({ 'x-forwarded-host': 'conf.example.org' }),
      ),
    ).toBeNull()
  })
})

/**
 * The link an attendee is mailed (#1298): the portal on the conference's main
 * host, only while that host can sign in.
 */
describe('workshopPortalUrl', () => {
  it('is the portal on the main host when it can sign in', async () => {
    await expect(
      workshopPortalUrl({ domains: ['conf.example.org', 'other.example.org'] }),
    ).resolves.toBe('https://conf.example.org/workshop')
  })

  it('is null when the main host cannot sign in, even if another can', async () => {
    hosts(record({ hostname: 'other.example.org' }))
    await expect(
      workshopPortalUrl({ domains: ['conf.example.org', 'other.example.org'] }),
    ).resolves.toBeNull()
  })

  it('is null for a conference with no domain — never the platform fallback host — and reads nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Even if the platform's own base host could sign in.
    getRedirectUriSyncRow.mockImplementation(async () =>
      record({ hostname: 'localhost' }),
    )
    for (const domains of [[], undefined, null, ['']]) {
      await expect(
        workshopPortalUrl({ title: 'No Domain', domains }),
      ).resolves.toBeNull()
    }
    expect(getRedirectUriSyncRow).not.toHaveBeenCalled()
  })
})
