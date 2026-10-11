/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'
import { expectedTxtValue } from '@/lib/domain-verification/challenge'
import type {
  DomainVerificationPatch,
  DomainVerificationRecord,
} from '@/lib/domain-verification/types'

const { store, zone, resolveTxt, listRecords, patchRecord, workos, fetchTrap } =
  vi.hoisted(() => {
    const store = new Map<string, DomainVerificationRecord>()
    const zone = new Map<string, string[][]>()
    return {
      store,
      zone,
      resolveTxt: vi.fn(async (name: string) => {
        const answer = zone.get(name)
        if (!answer)
          throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
        return answer
      }),
      listRecords: vi.fn(async () =>
        [...store.values()].map((r) => ({ ...r })),
      ),
      patchRecord: vi.fn(async (id: string, patch: DomainVerificationPatch) => {
        const current = store.get(id)
        if (current) store.set(id, { ...current, ...patch })
      }),
      workos: vi.fn(function () {
        throw new Error('The domain verification cron must not reach WorkOS')
      }),
      fetchTrap: vi.fn<typeof fetch>(async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        )
        throw new Error(`Unexpected cron fetch to ${url.hostname}`)
      }),
    }
  })

// Exercise the real sweep, DNS classification and delisting policy. Only DNS
// resolution and persistence are replaced; any WorkOS access must fail loudly.
vi.mock('@/lib/domain-verification', async () => ({
  runDomainVerificationSweep: (await import('@/lib/domain-verification/sweep'))
    .runDomainVerificationSweep,
}))
vi.mock('@/lib/domain-verification/dns', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/domain-verification/dns')
  >('@/lib/domain-verification/dns')
  return {
    checkDomainChallenge: (hostname: string, token: string) =>
      actual.checkDomainChallenge(hostname, token, resolveTxt),
  }
})
vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllDomainVerifications: listRecords,
  patchDomainVerification: patchRecord,
  getConferenceAlertTargets: async () => [],
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(),
}))
vi.mock('@workos-inc/node', () => ({ WorkOS: workos }))
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))

const { GET } = await import('@/app/api/cron/domain-verification/route')
const NOW = new Date('2026-07-01T12:00:00.000Z')

function seed(
  hostname: string,
  overrides: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord {
  const record: DomainVerificationRecord = {
    _id: `domainVerification.${hostname}`,
    hostname,
    conferenceId: 'conference-1',
    token: `token-${hostname}`,
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: '2026-01-01T00:00:00.000Z',
    lastSuccessAt: '2026-06-30T00:00:00.000Z',
    lastCheckedAt: '2026-06-30T00:00:00.000Z',
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  }
  store.set(record._id, record)
  zone.set(`_konf-challenge.${hostname}`, [[expectedTxtValue(record.token)]])
  return record
}

function request(auth?: string) {
  return new NextRequest('http://localhost/api/cron/domain-verification', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('api/cron/domain-verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
    zone.clear()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
    vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
    // Credentials are present so missing configuration cannot hide a call to
    // WorkOS. Call counts also catch a refusal swallowed by the sweep.
    vi.stubEnv('WORKOS_API_KEY', 'sk-test')
    vi.stubEnv('WORKOS_CLIENT_ID', 'client-test')
    vi.stubGlobal('fetch', fetchTrap)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rechecks every claimed domain and stores fresh proof without calling WorkOS', async () => {
    const records = [
      seed('verified-conf.no'),
      seed('pending-conf.no', { status: 'pending', verifiedAt: null }),
      seed('failing-conf.no', {
        status: 'failing',
        firstFailureAt: '2026-06-29T00:00:00.000Z',
        consecutiveFailures: 2,
        lastError: 'No TXT record',
      }),
      seed('grandfathered-conf.no', {
        method: 'grandfathered',
        graceUntil: '2026-07-15T00:00:00.000Z',
      }),
      seed('allocated.konf.run', {
        method: 'platform-owned',
        status: 'failing',
      }),
    ]

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      checked: 5,
      verified: 4,
      platformOwned: 1,
      hardFailures: 0,
      softFailures: 0,
      unverifiable: 0,
      delisted: [],
      errored: [],
    })
    expect(listRecords.mock.calls.length).toBe(1)
    expect(resolveTxt.mock.calls.map(([name]) => name).sort()).toEqual(
      records
        .slice(0, 4)
        .map(({ hostname }) => `_konf-challenge.${hostname}`)
        .sort(),
    )
    expect(patchRecord.mock.calls.map(([id]) => id).sort()).toEqual(
      records.map(({ _id }) => _id).sort(),
    )
    for (const record of records) {
      expect(store.get(record._id)).toMatchObject({
        status: 'verified',
        method:
          record.method === 'platform-owned' ? 'platform-owned' : 'dns-txt',
        lastCheckedAt: NOW.toISOString(),
        lastSuccessAt: NOW.toISOString(),
        firstFailureAt: null,
        consecutiveFailures: 0,
        lastError: null,
      })
    }
    expect(store.get(records[1]._id)?.verifiedAt).toBe(NOW.toISOString())
    expect(workos.mock.calls.length).toBe(0)
    expect(fetchTrap.mock.calls.length).toBe(0)
  })

  it('reports a withdrawn proof and persists the failed standing', async () => {
    const record = seed('lapsed-conf.no')
    zone.delete('_konf-challenge.lapsed-conf.no')

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      checked: 1,
      hardFailures: 1,
      delisted: ['lapsed-conf.no'],
      errored: [],
    })
    expect(store.get(record._id)).toMatchObject({
      status: 'failing',
      lastCheckedAt: NOW.toISOString(),
      consecutiveFailures: 1,
      lastError: 'No TXT record at _konf-challenge.lapsed-conf.no (ENOTFOUND)',
    })
    expect(vi.mocked(console.log).mock.calls[0][0]).toBe(
      'Domain verification sweep: checked=1 verified=0 platformOwned=0 hardFailures=1 softFailures=0 unverifiable=0 delisted=1 errored=0',
    )
    expect(workos.mock.calls.length).toBe(0)
    expect(fetchTrap.mock.calls.length).toBe(0)
  })

  it('continues checking other claims when one write fails', async () => {
    seed('broken-conf.no')
    const healthy = seed('healthy-conf.no')
    patchRecord.mockRejectedValueOnce(new Error('Sanity write refused'))

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      checked: 1,
      verified: 1,
      errored: ['broken-conf.no'],
    })
    expect(resolveTxt.mock.calls.length).toBe(2)
    expect(store.get(healthy._id)?.lastSuccessAt).toBe(NOW.toISOString())
  })

  it.each([undefined, 'Bearer wrong'])(
    'refuses authorization %s before reading any domains',
    async (auth) => {
      seed('claimed-conf.no')
      const response = await GET(request(auth))
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
      expect(listRecords.mock.calls.length).toBe(0)
    },
  )

  it('fails loudly when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', undefined)
    seed('claimed-conf.no')
    // This would pass the auth comparison if the missing-secret guard went.
    const response = await GET(request('Bearer undefined'))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Server configuration error',
    })
    expect(listRecords.mock.calls.length).toBe(0)
  })

  it('reports a failed read instead of claiming the sweep succeeded', async () => {
    listRecords.mockRejectedValueOnce(new Error('Sanity read refused'))

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
      details: 'Sanity read refused',
    })
    expect(listRecords.mock.calls.length).toBe(1)
  })
})
