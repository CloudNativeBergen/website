/**
 * @vitest-environment node
 *
 * Which hosts may receive a hand-off (#1313, spec §4). The REAL policy and the
 * real allocation rule decide; only the two reads are supplied.
 *
 * Every refusal is the admitted case with ONE condition changed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  claimsById,
  provenClaim,
} from '../../../__tests__/helpers/domainClaims'
import type { DomainClaim } from './types'

const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
const getConferenceForDomain = vi.fn()

vi.mock('./sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (domain: string) => getConferenceForDomain(domain),
}))

import { resolveProvenDestination } from './destination'

const DAY_MS = 86_400_000
const HOST = 'conf.example.org'
const ALLOCATED = 'tenant.konf.run'

/** A store that knows exactly these claims, by the id of their hostname. */
function store(...claims: DomainClaim[]) {
  getDomainClaim.mockImplementation(claimsById(...claims))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store(provenClaim(HOST), provenClaim(ALLOCATED, { method: 'platform-owned' }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveProvenDestination: admitted', () => {
  it('a host whose DNS proof resolved, with its origin and the conference that claims it', async () => {
    expect(await resolveProvenDestination(HOST)).toEqual({
      host: HOST,
      origin: `https://${HOST}`,
      conference: {
        _id: 'conference-1',
        organization: { _ref: 'org-1' },
        ticketingProvider: 'tito',
        domains: [HOST],
      },
    })
  })

  it('a host the platform allocated', async () => {
    const destination = await resolveProvenDestination(ALLOCATED)

    expect(destination?.origin).toBe(`https://${ALLOCATED}`)
  })

  it('a host written in another case, as its canonical form', async () => {
    const destination = await resolveProvenDestination(' Conf.Example.ORG ')

    expect(destination?.host).toBe(HOST)
  })
})

describe('resolveProvenDestination: refused', () => {
  it('a host with no record', async () => {
    store()

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a grandfathered record inside its grace period', async () => {
    store(
      provenClaim(HOST, {
        method: 'grandfathered',
        graceUntil: new Date(Date.now() + DAY_MS).toISOString(),
      }),
    )

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a platform-owned record that is no longer an allocation', async () => {
    // Recorded as allocated, recently "successful", but outside the zone the
    // platform operates today.
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.app')

    expect(await resolveProvenDestination(ALLOCATED)).toBeNull()
  })

  it('a proof that stopped resolving', async () => {
    store(provenClaim(HOST, { status: 'failing' }))

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a proof last confirmed 29 days ago is still admitted', async () => {
    store(
      provenClaim(HOST, {
        lastSuccessAt: new Date(Date.now() - 29 * DAY_MS).toISOString(),
      }),
    )

    expect((await resolveProvenDestination(HOST))?.host).toBe(HOST)
  })

  it('a proof last confirmed more than 30 days ago', async () => {
    store(
      provenClaim(HOST, {
        lastSuccessAt: new Date(Date.now() - 31 * DAY_MS).toISOString(),
      }),
    )

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a released claim, even for an allocated host', async () => {
    store(
      provenClaim(ALLOCATED, { method: 'platform-owned', status: 'revoked' }),
    )

    expect(await resolveProvenDestination(ALLOCATED)).toBeNull()
  })

  it('a record whose conference no longer claims the host', async () => {
    store(provenClaim(HOST, {}, { domains: ['other.example.org'] }))

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a record whose conference is gone', async () => {
    store({ ...provenClaim(HOST), conference: null })

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a host its conference claims only through a wildcard', async () => {
    store(provenClaim(HOST, {}, { domains: ['*.example.org'] }))

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })

  it('a record that names another host than the one asked for', async () => {
    // Whatever is asked, the proven record of HOST comes back.
    getDomainClaim.mockResolvedValue(
      provenClaim(HOST, {}, { domains: [HOST, 'sub.' + HOST] }),
    )

    expect(await resolveProvenDestination('sub.' + HOST)).toBeNull()
  })

  it.each([
    ['a subdomain of a proven host', `sub.${HOST}`],
    ['a proven host as a prefix', `${HOST}.evil.net`],
    ['a proven host as a suffix', `evil-${HOST}`],
    ['a proven host with a port', `${HOST}:8443`],
  ])('%s', async (_, host) => {
    expect(await resolveProvenDestination(host)).toBeNull()
  })

  it.each([
    ['a wildcard', '*.example.org'],
    ['userinfo', `attacker@${HOST}`],
    ['a path', `${HOST}/workshop`],
    ['a scheme', `https://${HOST}`],
    ['a query', `${HOST}?x=1`],
    ['whitespace inside', 'conf .example.org'],
    ['an empty value', ''],
    ['no value', null],
  ])('%s, without reading anything', async (_, host) => {
    expect(await resolveProvenDestination(host)).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('every host when the record cannot be read', async () => {
    getDomainClaim.mockRejectedValue(new Error('sanity unavailable'))

    expect(await resolveProvenDestination(HOST)).toBeNull()
  })
})

describe('resolveProvenDestination: localhost', () => {
  const LOCAL = {
    _id: 'conference-local',
    organization: { _ref: 'org-1' },
    ticketingProvider: 'checkin',
    domains: ['localhost:3000'],
    title: 'A whole conference document',
  }

  beforeEach(() => {
    getConferenceForDomain.mockResolvedValue({ conference: LOCAL, error: null })
  })

  it('qualifies in development, over http, with the conference that serves it', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(await resolveProvenDestination('localhost:3000')).toEqual({
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      conference: {
        _id: 'conference-local',
        organization: { _ref: 'org-1' },
        ticketingProvider: 'checkin',
        domains: ['localhost:3000'],
      },
    })
    expect(getConferenceForDomain).toHaveBeenCalledWith('localhost:3000')
  })

  it('does not qualify in a deployed build', async () => {
    expect(await resolveProvenDestination('localhost:3000')).toBeNull()
  })

  it.each(['localhost.example.org', 'evil-localhost', '127.0.0.1:3000'])(
    'is the only development host: %s does not qualify',
    async (host) => {
      vi.stubEnv('NODE_ENV', 'development')

      expect(await resolveProvenDestination(host)).toBeNull()
    },
  )

  it('does not qualify when no conference serves it', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    getConferenceForDomain.mockResolvedValue({
      conference: {},
      error: new Error('no conference'),
    })

    expect(await resolveProvenDestination('localhost:3000')).toBeNull()
  })
})
