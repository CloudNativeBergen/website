/**
 * @vitest-environment node
 *
 * Which hosts may receive a hand-off (#1313, spec §4). The REAL policy and the
 * real allocation rule decide; only the two reads are supplied.
 *
 * Every refusal is the admitted case with ONE condition changed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DomainClaim, DomainVerificationRecord } from './types'

const getDomainClaim = vi.fn<(id: string) => Promise<DomainClaim | null>>()
const getConferenceForDomain = vi.fn()

vi.mock('./sanity', () => ({
  getDomainClaim: (id: string) => getDomainClaim(id),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (domain: string) => getConferenceForDomain(domain),
}))

import { resolveProvenDestination } from './destination'

const NOW = new Date('2026-10-10T12:00:00.000Z')
const HOST = 'conf.example.org'
const ALLOCATED = 'tenant.konf.run'

function claim(
  hostname: string,
  record: Partial<DomainVerificationRecord> = {},
  domains: string[] = [hostname],
): DomainClaim {
  return {
    record: {
      _id: `domainVerification.${hostname}`,
      hostname,
      conferenceId: 'conference-1',
      token: 'tok',
      status: 'verified',
      method: 'dns-txt',
      graceUntil: null,
      verifiedAt: '2026-09-01T00:00:00.000Z',
      lastSuccessAt: '2026-10-09T12:00:00.000Z',
      lastCheckedAt: '2026-10-09T12:00:00.000Z',
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
      ...record,
    },
    conference: {
      _id: 'conference-1',
      organization: { _ref: 'org-1' },
      ticketingProvider: 'tito',
      domains,
    },
  }
}

/** A store that knows exactly these claims, by the id of their hostname. */
function store(...claims: DomainClaim[]) {
  getDomainClaim.mockImplementation(
    async (id) => claims.find((c) => c.record._id === id) ?? null,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store(claim(HOST), claim(ALLOCATED, { method: 'platform-owned' }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveProvenDestination: admitted', () => {
  it('a host whose DNS proof resolved, with its origin and the conference that claims it', async () => {
    expect(await resolveProvenDestination(HOST, NOW)).toEqual({
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
    const destination = await resolveProvenDestination(ALLOCATED, NOW)

    expect(destination?.origin).toBe(`https://${ALLOCATED}`)
  })

  it('a host written in another case, as its canonical form', async () => {
    const destination = await resolveProvenDestination(
      ' Conf.Example.ORG ',
      NOW,
    )

    expect(destination?.host).toBe(HOST)
  })
})

describe('resolveProvenDestination: refused', () => {
  it('a host with no record', async () => {
    store()

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a grandfathered record inside its grace period', async () => {
    store(
      claim(HOST, {
        method: 'grandfathered',
        graceUntil: '2026-11-01T00:00:00.000Z',
      }),
    )

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a platform-owned record that is no longer an allocation', async () => {
    // Recorded as allocated, recently "successful", but outside the zone the
    // platform operates today.
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.app')

    expect(await resolveProvenDestination(ALLOCATED, NOW)).toBeNull()
  })

  it('a proof that stopped resolving', async () => {
    store(claim(HOST, { status: 'failing' }))

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a proof last confirmed more than 30 days ago', async () => {
    store(claim(HOST, { lastSuccessAt: '2026-09-01T00:00:00.000Z' }))

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a released claim, even for an allocated host', async () => {
    store(claim(ALLOCATED, { method: 'platform-owned', status: 'revoked' }))

    expect(await resolveProvenDestination(ALLOCATED, NOW)).toBeNull()
  })

  it('a record whose conference no longer claims the host', async () => {
    store(claim(HOST, {}, ['other.example.org']))

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a record whose conference is gone', async () => {
    store({ ...claim(HOST), conference: null })

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a host its conference claims only through a wildcard', async () => {
    store(claim(HOST, {}, ['*.example.org']))

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
  })

  it('a record that names another host than the one asked for', async () => {
    // Whatever is asked, the proven record of HOST comes back.
    getDomainClaim.mockResolvedValue(claim(HOST, {}, [HOST, 'sub.' + HOST]))

    expect(await resolveProvenDestination('sub.' + HOST, NOW)).toBeNull()
  })

  it.each([
    ['a subdomain of a proven host', `sub.${HOST}`],
    ['a proven host as a prefix', `${HOST}.evil.net`],
    ['a proven host as a suffix', `evil-${HOST}`],
    ['a proven host with a port', `${HOST}:8443`],
  ])('%s', async (_, host) => {
    expect(await resolveProvenDestination(host, NOW)).toBeNull()
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
    expect(await resolveProvenDestination(host, NOW)).toBeNull()
    expect(getDomainClaim).not.toHaveBeenCalled()
  })

  it('every host when the record cannot be read', async () => {
    getDomainClaim.mockRejectedValue(new Error('sanity unavailable'))

    expect(await resolveProvenDestination(HOST, NOW)).toBeNull()
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

    expect(await resolveProvenDestination('localhost:3000', NOW)).toEqual({
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
    expect(await resolveProvenDestination('localhost:3000', NOW)).toBeNull()
  })

  it.each(['localhost.example.org', 'evil-localhost', '127.0.0.1:3000'])(
    'is the only development host: %s does not qualify',
    async (host) => {
      vi.stubEnv('NODE_ENV', 'development')

      expect(await resolveProvenDestination(host, NOW)).toBeNull()
    },
  )

  it('does not qualify when no conference serves it', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    getConferenceForDomain.mockResolvedValue({
      conference: {},
      error: new Error('no conference'),
    })

    expect(await resolveProvenDestination('localhost:3000', NOW)).toBeNull()
  })
})
