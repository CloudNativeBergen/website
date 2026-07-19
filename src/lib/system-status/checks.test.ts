import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import type { SystemCheck } from './types'
import { groupSystemChecks, worstStatus } from './types'

// clientReadUncached is used by the live probes in buildSystemChecks. Mock it so
// the async probe paths are deterministic and never hit the network.
const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import { collectStaticChecks, buildSystemChecks } from './checks'

const CONFERENCE = {
  _id: 'conf-1',
  organizer: 'Test Org',
  cfpEmail: 'cfp@example.com',
  salesNotificationChannel: '#updates',
  cfpNotificationChannel: '#cfp',
  checkinCustomerId: 42,
  checkinEventId: 7,
}

function byId(checks: SystemCheck[], id: string): SystemCheck {
  const found = checks.find((c) => c.id === id)
  if (!found) throw new Error(`check ${id} not found`)
  return found
}

const FINGERPRINT_RE = /^[0-9a-f]{8} \(\d+ chars\)$/

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('collectStaticChecks — secrets are never echoed', () => {
  it('renders a secret as a sha256 fingerprint + length, never the value', () => {
    const secret = 'super-secret-resend-key-value'
    vi.stubEnv('RESEND_API_KEY', secret)
    const check = byId(collectStaticChecks(CONFERENCE), 'email.resendKey')

    expect(check.status).toBe('ok')
    expect(check.value).toMatch(FINGERPRINT_RE)
    expect(check.value).not.toContain(secret)

    const expected = createHash('sha256')
      .update(secret)
      .digest('hex')
      .slice(0, 8)
    expect(check.value).toBe(`${expected} (${secret.length} chars)`)
  })

  it('reports error status when a required secret is missing', () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const check = byId(collectStaticChecks(CONFERENCE), 'email.resendKey')
    expect(check.status).toBe('error')
    expect(check.value).toBe('not set')
  })
})

describe('collectStaticChecks — status semantics', () => {
  it('marks a deliberately-optional integration as off when unset', () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    const check = byId(collectStaticChecks(CONFERENCE), 'slack.botToken')
    expect(check.status).toBe('off')
  })

  it('warns (not errors) for the free-tier exchange-rate fallback', () => {
    vi.stubEnv('NEXT_PUBLIC_EXCHANGE_RATE_API_KEY', '')
    const check = byId(collectStaticChecks(CONFERENCE), 'misc.exchangeRate')
    expect(check.status).toBe('warn')
  })

  it('errors when CRON_SECRET is missing', () => {
    vi.stubEnv('CRON_SECRET', '')
    const check = byId(collectStaticChecks(CONFERENCE), 'ops.cronSecret')
    expect(check.status).toBe('error')
  })

  it('shows plain (non-secret) values verbatim', () => {
    vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
    const check = byId(collectStaticChecks(CONFERENCE), 'sanity.dataset')
    expect(check.status).toBe('ok')
    expect(check.value).toBe('production')
  })

  it('surfaces conference-derived non-secrets plainly', () => {
    const checks = collectStaticChecks(CONFERENCE)
    expect(byId(checks, 'email.from').value).toBe('cfp@example.com')
    expect(byId(checks, 'slack.weeklyChannel').value).toBe('#updates')
    expect(byId(checks, 'tickets.customerId').value).toBe('42')
  })
})

describe('collectStaticChecks — organizer teams', () => {
  it('is off with a helpful detail when no teams are configured', () => {
    const check = byId(collectStaticChecks(CONFERENCE), 'conference.teams')
    expect(check.group).toBe('conference')
    expect(check.status).toBe('off')
    expect(check.value).toBe('no teams')
  })

  it('is ok and counts the teams when configured', () => {
    const check = byId(
      collectStaticChecks({
        ...CONFERENCE,
        teams: [{ key: 'cfp' }, { key: 'sponsors' }],
      }),
      'conference.teams',
    )
    expect(check.status).toBe('ok')
    expect(check.value).toBe('2 teams configured')
  })

  it('singularizes a single team', () => {
    const check = byId(
      collectStaticChecks({ ...CONFERENCE, teams: [{ key: 'cfp' }] }),
      'conference.teams',
    )
    expect(check.value).toBe('1 team configured')
  })
})

describe('collectStaticChecks — paired OAuth provider', () => {
  it('is ok with both id and secret, warns on a partial pair, off when neither', () => {
    vi.stubEnv('AUTH_GITHUB_ID', 'id')
    vi.stubEnv('AUTH_GITHUB_SECRET', 'shhh')
    expect(byId(collectStaticChecks(CONFERENCE), 'auth.github').status).toBe(
      'ok',
    )

    vi.stubEnv('AUTH_GITHUB_SECRET', '')
    const partial = byId(collectStaticChecks(CONFERENCE), 'auth.github')
    expect(partial.status).toBe('warn')
    expect(partial.value).toBe('partial')

    vi.stubEnv('AUTH_GITHUB_ID', '')
    expect(byId(collectStaticChecks(CONFERENCE), 'auth.github').status).toBe(
      'off',
    )
  })
})

describe('collectStaticChecks — contract provider conditional', () => {
  it('omits Adobe checks unless the provider is adobe-sign', () => {
    vi.stubEnv('CONTRACT_SIGNING_PROVIDER', 'self-hosted')
    const selfHosted = collectStaticChecks(CONFERENCE)
    expect(byId(selfHosted, 'contracts.provider').value).toBe('self-hosted')
    expect(
      selfHosted.find((c) => c.id === 'contracts.adobeAppId'),
    ).toBeUndefined()

    vi.stubEnv('CONTRACT_SIGNING_PROVIDER', 'adobe-sign')
    vi.stubEnv('ADOBE_SIGN_APPLICATION_ID', '')
    const adobe = collectStaticChecks(CONFERENCE)
    expect(byId(adobe, 'contracts.adobeAppId').status).toBe('error')
  })
})

describe('buildSystemChecks — live probes', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'x')
  })

  it('reports an ok Sanity read probe with latency', async () => {
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('count(')) return Promise.resolve(5)
      return Promise.resolve('conf-1')
    })
    const checks = await buildSystemChecks(CONFERENCE)
    const probe = byId(checks, 'sanity.readProbe')
    expect(probe.status).toBe('ok')
    expect(probe.value).toMatch(/\d+ ms/)
    expect(byId(checks, 'push.subscriptions').value).toBe('5')
  })

  it('reports an error Sanity read probe when the fetch throws', async () => {
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('count(')) return Promise.resolve(0)
      return Promise.reject(new Error('network down'))
    })
    const checks = await buildSystemChecks(CONFERENCE)
    const probe = byId(checks, 'sanity.readProbe')
    expect(probe.status).toBe('error')
    expect(probe.detail).toBe('network down')
  })
})

describe('types helpers', () => {
  const sample: SystemCheck[] = [
    { id: 'a', group: 'sanity', label: 'A', status: 'ok' },
    { id: 'b', group: 'sanity', label: 'B', status: 'error' },
    { id: 'c', group: 'push', label: 'C', status: 'warn' },
  ]

  it('groups checks into ordered, non-empty cards', () => {
    const groups = groupSystemChecks(sample)
    expect(groups.map((g) => g.group)).toEqual(['sanity', 'push'])
    expect(groups[0].checks).toHaveLength(2)
  })

  it('rolls a group up to its worst status', () => {
    expect(worstStatus(sample)).toBe('error')
    expect(
      worstStatus([{ id: 'x', group: 'push', label: 'X', status: 'off' }]),
    ).toBe('off')
  })
})
