import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FAKE_WORKOS_API_KEY,
  installFakeWorkOSRedirectUris,
  type FakeWorkOSRedirectUris,
} from '../../../../__tests__/helpers/fakeWorkOSRedirectUris'
import type {
  DomainVerificationRecord,
  RedirectUriState,
  RedirectUriSyncRow,
} from '@/lib/domain-verification/types'

/**
 * The reconcile end to end: the REAL host rule, the REAL allowlist policy and
 * the REAL WorkOS client, with the two boundaries faked — WorkOS behind `fetch`
 * (see the fake's header for what that does and does not prove) and the
 * `domainVerification` store, which enforces the revision condition as Sanity
 * does.
 */

const rows = new Map<string, RedirectUriSyncRow>()
/** Every state write that was accepted, in order. */
const stateWrites: { id: string; patch: Partial<RedirectUriState> }[] = []
let listFails = false
/** Simulates another writer: the records move on right after they are read. */
let recordsMoveAfterRead = false

vi.mock('@/lib/domain-verification/sanity', () => ({
  listRedirectUriSyncRows: async () => {
    if (listFails) throw new Error('sanity is down')
    const read = [...rows.values()].map((row) => structuredClone(row))
    if (recordsMoveAfterRead) for (const row of rows.values()) row.rev += '+'
    return read
  },
  patchRedirectUriState: async (
    id: string,
    ifRevisionId: string,
    patch: Partial<RedirectUriState>,
  ) => {
    const row = rows.get(id)
    if (!row || row.rev !== ifRevisionId) {
      throw Object.assign(new Error('revision mismatch'), { statusCode: 409 })
    }
    row.redirectUri = { ...row.redirectUri, ...patch }
    row.rev = `${row.rev}+`
    stateWrites.push({ id, patch })
    return row.rev
  },
}))

/** The workshops gate's answer per owning organization; absent means ON. */
const workshops = new Map<string, boolean | null | Error>()

vi.mock('@/lib/features/workshops', () => ({
  resolveWorkshopsForConference: async (
    conference: RedirectUriSyncRow['conference'],
  ) => {
    if (!conference?.organization) return false
    const answer = workshops.get(conference.organization._ref) ?? true
    if (answer instanceof Error) throw answer
    return answer
  },
}))

const { reconcileWorkshopRedirectUris } = await import('./reconcile')

const NOW = new Date('2026-10-09T12:00:00.000Z')
const PLATFORM_ORG = 'org-platform'
const TENANT_ORG = 'org-tenant'

let workos: FakeWorkOSRedirectUris

function callback(hostname: string): string {
  return `https://${hostname}/api/auth/callback`
}

function seedHost(
  hostname: string,
  options: {
    org?: string
    record?: Partial<DomainVerificationRecord>
    redirectUri?: Partial<RedirectUriState>
  } = {},
): string {
  const _id = `domainVerification.${hostname}`
  rows.set(_id, {
    record: {
      _id,
      hostname,
      conferenceId: 'conference-1',
      token: 'tok',
      status: 'verified',
      method: 'dns-txt',
      graceUntil: null,
      verifiedAt: '2026-09-01T00:00:00.000Z',
      lastSuccessAt: '2026-10-09T05:00:00.000Z',
      lastCheckedAt: '2026-10-09T05:00:00.000Z',
      firstFailureAt: null,
      consecutiveFailures: 0,
      consecutiveSoftFailures: 0,
      lastError: null,
      ...options.record,
    },
    rev: 'rev-1',
    redirectUri: {
      status: null,
      id: null,
      requestedAt: null,
      error: null,
      ...options.redirectUri,
    },
    conference: { organization: { _ref: options.org ?? TENANT_ORG } },
  })
  return _id
}

/** A subdomain the platform allocated to a tenant. */
function seedAllocated(
  hostname: string,
  options: Parameters<typeof seedHost>[1] = {},
): string {
  return seedHost(hostname, {
    ...options,
    record: { method: 'platform-owned', ...options.record },
  })
}

function stateOf(id: string): RedirectUriState {
  return rows.get(id)!.redirectUri
}

beforeEach(() => {
  rows.clear()
  workshops.clear()
  stateWrites.length = 0
  listFails = false
  recordsMoveAfterRead = false
  vi.stubEnv('WORKOS_API_KEY', FAKE_WORKOS_API_KEY)
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  workos = installFakeWorkOSRedirectUris()
  workos.now = () => NOW
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('registering', () => {
  it('registers the callback of a platform-allocated host and records its id', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      callback('kontainerkonf.konf.run'),
    ])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[0].id,
      requestedAt: null,
      error: null,
    })
    expect(summary.registered).toEqual(['kontainerkonf.konf.run'])
  })

  it('registers a verified custom domain of the platform organization', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      callback('2026.cloudnativedays.no'),
    ])
    expect(stateOf(id).status).toBe('registered')
  })

  it("never registers a tenant's own verified domain", async () => {
    const id = seedHost('conf.tenant.example.org', { org: TENANT_ORG })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.requests).toEqual([])
    expect(stateOf(id).status).toBeNull()
    expect(summary.wanted).toBe(0)
  })

  it('registers nothing for a wildcard claim', async () => {
    seedHost('*.cloudnativedays.no', { org: PLATFORM_ORG })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.requests).toEqual([])
  })

  it('registers nothing for a host whose proof has not resolved', async () => {
    seedHost('2026.cloudnativedays.no', {
      org: PLATFORM_ORG,
      record: { status: 'failing', lastSuccessAt: null },
    })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.requests).toEqual([])
  })

  it('registers nothing for a conference without workshops', async () => {
    workshops.set(TENANT_ORG, false)
    seedAllocated('kontainerkonf.konf.run')

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.requests).toEqual([])
  })

  it('does nothing at all without WORKOS_API_KEY', async () => {
    vi.stubEnv('WORKOS_API_KEY', '')
    listFails = true
    seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary).toMatchObject({ configured: false, error: null })
    expect(workos.requests).toEqual([])
  })
})

describe('a second run with nothing changed', () => {
  it('writes nothing to WorkOS and nothing to the records', async () => {
    seedAllocated('kontainerkonf.konf.run')
    seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    expect(workos.writes()).toHaveLength(2)
    workos.requests.length = 0
    stateWrites.length = 0

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(stateWrites).toEqual([])
    expect(summary).toMatchObject({ wanted: 2, registered: [], removed: [] })
  })

  it('finds its own URI beyond the first page of the list', async () => {
    for (let i = 0; i < 120; i++)
      workos.seed(`https://other${i}.example.org/cb`)
    seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    expect(workos.uris).toHaveLength(121)
    workos.requests.length = 0

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(workos.requests.length).toBeGreaterThan(1)
  })
})

describe('URIs this system did not create', () => {
  it('survive a reconcile that registers and removes others', async () => {
    const byDefault = workos.seed(
      'https://2025.cloudnativebergen.dev/api/auth/callback',
    )
    const byHand = workos.seed('https://staging.example.org/api/auth/callback')
    seedAllocated('kontainerkonf.konf.run')
    const gone = seedAllocated('old.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(gone)!.record.status = 'revoked'

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toContainEqual(byDefault)
    expect(workos.uris).toContainEqual(byHand)
    expect(workos.uris.map((u) => u.uri)).not.toContain(
      callback('old.konf.run'),
    )
  })

  it('are recorded as external, not registered again', async () => {
    workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run')

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(stateOf(id)).toMatchObject({ status: 'external', id: null })
  })

  it('are left in WorkOS when their host is released', async () => {
    const byHand = workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(id)!.record.status = 'revoked'

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
    expect(workos.writes()).toEqual([])
    expect(stateOf(id).status).toBeNull()
  })
})

describe('removing', () => {
  async function registered(hostname: string, org?: string): Promise<string> {
    const id =
      org === PLATFORM_ORG
        ? seedHost(hostname, { org })
        : seedAllocated(hostname)
    await reconcileWorkshopRedirectUris(NOW)
    expect(stateOf(id).status).toBe('registered')
    return id
  }

  it('deletes the URI of a host that was released', async () => {
    const id = await registered('kontainerkonf.konf.run')
    rows.get(id)!.record.status = 'revoked'

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
    expect(stateOf(id)).toEqual({
      status: null,
      id: null,
      requestedAt: null,
      error: null,
    })
    expect(summary.removed).toEqual(['kontainerkonf.konf.run'])
  })

  it('deletes the URI of a host whose proof stopped resolving', async () => {
    const id = await registered('2026.cloudnativedays.no', PLATFORM_ORG)
    rows.get(id)!.record.status = 'failing'

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
  })

  it('deletes the URI when the conference loses workshops', async () => {
    await registered('kontainerkonf.konf.run')
    workshops.set(TENANT_ORG, false)

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
  })

  it('deletes the URI of a custom domain that left the platform organization', async () => {
    const id = await registered('2026.cloudnativedays.no', PLATFORM_ORG)
    rows.get(id)!.conference = { organization: { _ref: TENANT_ORG } }

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
  })

  it.each([
    ['could not say', null],
    ['failed', new Error('organization read failed')],
  ])('keeps the URI when the workshops gate %s', async (_, answer) => {
    const id = await registered('kontainerkonf.konf.run')
    workshops.set(TENANT_ORG, answer)
    workos.requests.length = 0

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(workos.writes()).toEqual([])
    expect(stateOf(id).status).toBe('registered')
  })

  it('registers again when its URI was deleted in the dashboard', async () => {
    const id = await registered('kontainerkonf.konf.run')
    const first = stateOf(id).id
    workos.uris.length = 0

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      callback('kontainerkonf.konf.run'),
    ])
    expect(stateOf(id).id).toBe(workos.uris[0].id)
    expect(stateOf(id).id).not.toBe(first)
  })

  it('forgets a URI that is already gone without calling WorkOS to delete it', async () => {
    const id = await registered('kontainerkonf.konf.run')
    workos.uris.length = 0
    rows.get(id)!.record.status = 'revoked'
    workos.requests.length = 0

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(stateOf(id).id).toBeNull()
  })
})

describe('when WorkOS fails', () => {
  it('does not throw when the list is refused, and records it on the host', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.failAll('GET', { status: 503, message: 'Service unavailable' })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.error).toContain('503')
    expect(summary.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id).error).toContain('503')
    expect(workos.writes()).toEqual([])
  })

  it('records a refused create and registers on the next run', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.failNext('POST', { status: 500, message: 'Internal error' })

    const first = await reconcileWorkshopRedirectUris(NOW)

    expect(first.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toMatchObject({
      status: null,
      requestedAt: null,
      error: expect.stringContaining('500'),
    })

    const second = await reconcileWorkshopRedirectUris(NOW)

    expect(second.registered).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toMatchObject({ status: 'registered', error: null })
  })

  it('recognises its own URI after a create whose answer was lost', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.loseNextCreateResponse()

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toMatchObject({ status: 'registering', id: null })
    workos.requests.length = 0

    await reconcileWorkshopRedirectUris(new Date(NOW.getTime() + 86_400_000))

    expect(workos.writes()).toEqual([])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[0].id,
      requestedAt: null,
      error: null,
    })
  })

  it('does not claim a URI added by hand after a refused create', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.failNext('POST', { status: 500 })
    await reconcileWorkshopRedirectUris(NOW)
    const byHand = workos.seed(callback('kontainerkonf.konf.run'))

    await reconcileWorkshopRedirectUris(NOW)
    expect(stateOf(id)).toMatchObject({ status: 'external', id: null })
    rows.get(id)!.record.status = 'revoked'
    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
  })

  it('does not claim a URI that is older than its own request', async () => {
    const byHand = workos.seed(
      callback('kontainerkonf.konf.run'),
      '2026-10-09T10:00:00.000Z',
    )
    const id = seedAllocated('kontainerkonf.konf.run', {
      redirectUri: {
        status: 'registering',
        requestedAt: '2026-10-09T11:00:00.000Z',
      },
    })

    await reconcileWorkshopRedirectUris(NOW)
    expect(stateOf(id)).toMatchObject({ status: 'external', id: null })
    rows.get(id)!.record.status = 'revoked'
    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
  })

  it('records a refused delete, keeps the id and deletes on the next run', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    const registeredId = stateOf(id).id
    rows.get(id)!.record.status = 'revoked'
    workos.failNext('DELETE', { status: 500 })

    const first = await reconcileWorkshopRedirectUris(NOW)

    expect(first.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toMatchObject({
      id: registeredId,
      error: expect.stringContaining('500'),
    })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
    expect(stateOf(id).id).toBeNull()
  })
})

describe('when the records cannot be read or have moved on', () => {
  it('does not throw when the read fails', async () => {
    listFails = true

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.error).toContain('sanity is down')
    expect(workos.requests).toEqual([])
  })

  it('does not call WorkOS for a record another writer changed first', async () => {
    seedAllocated('kontainerkonf.konf.run')
    recordsMoveAfterRead = true

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(summary.errored).toEqual(['kontainerkonf.konf.run'])
  })
})
