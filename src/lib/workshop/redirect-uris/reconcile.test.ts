import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FAKE_WORKOS_API_KEY,
  installFakeWorkOSRedirectUris,
  type FakeRedirectUri,
  type FakeWorkOSRedirectUris,
} from '../../../../__tests__/helpers/fakeWorkOSRedirectUris'
import type {
  DomainVerificationRecord,
  RedirectUriState,
  RedirectUriSyncRow,
} from '@/lib/domain-verification/types'

/**
 * The reconcile end to end: the REAL host rule, the REAL allowlist policy and
 * the REAL WorkOS client, with the boundaries faked — WorkOS behind `fetch`
 * (see the fake's header for what that does and does not prove), the
 * `domainVerification` store, which enforces the revision condition as Sanity
 * does, and the two reads the workshops gate rests on.
 */

const rows = new Map<string, RedirectUriSyncRow>()
/** Every state write that was accepted, in order. */
const stateWrites: { id: string; patch: Partial<RedirectUriState> }[] = []
let storeReadFails = false
/** The next state write lands, but its answer never arrives. */
let loseNextWriteAnswer = false

vi.mock('@/lib/domain-verification/sanity', () => ({
  listRedirectUriSyncRows: async () => {
    if (storeReadFails) throw new Error('sanity is down')
    return [...rows.values()].map((row) => structuredClone(row))
  },
  getRedirectUriSyncRow: async (id: string) => {
    if (storeReadFails) throw new Error('sanity is down')
    const row = rows.get(id)
    return row ? structuredClone(row) : null
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
    if (loseNextWriteAnswer) {
      loseNextWriteAnswer = false
      throw new Error('socket hang up')
    }
    return row.rev
  },
}))

/** The workshops gate's answer per owning organization; absent means ON. */
const workshops = new Map<string, boolean | null>()
/** Organizations whose document cannot be read right now. */
const unreadableOrgs = new Set<string>()

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async (orgId: string) => {
    if (unreadableOrgs.has(orgId)) throw new Error('organization read failed')
    return { _id: orgId }
  },
}))

vi.mock('@/lib/features/workshops', () => ({
  // As the real gate: no owner is OFF, and so is an organization it cannot
  // read — it swallows that failure rather than report it.
  resolveWorkshopsForConference: async (
    conference: RedirectUriSyncRow['conference'],
  ) => {
    const orgId = conference?.organization?._ref
    if (!orgId || unreadableOrgs.has(orgId)) return false
    return workshops.has(orgId) ? workshops.get(orgId) : true
  },
}))

const { reconcileWorkshopRedirectUris } = await import('./reconcile')

const NOW = new Date('2026-10-09T12:00:00.000Z')
const PLATFORM_ORG = 'org-platform'
const TENANT_ORG = 'org-tenant'
const OTHER_TENANT_ORG = 'org-other-tenant'
/** A host that always qualifies, so "registers nothing for X" can be asserted on a value. */
const CONTROL = 'control.konf.run'

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

/** Another writer touched the record: its revision is no longer the one read. */
function moveOn(id: string, change?: (row: RedirectUriSyncRow) => void): void {
  const row = rows.get(id)!
  change?.(row)
  row.rev = `${row.rev}~`
}

beforeEach(() => {
  rows.clear()
  workshops.clear()
  unreadableOrgs.clear()
  stateWrites.length = 0
  storeReadFails = false
  loseNextWriteAnswer = false
  vi.stubEnv('WORKOS_API_KEY', FAKE_WORKOS_API_KEY)
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  workos = installFakeWorkOSRedirectUris()
  workos.now = () => NOW
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
      error: null,
    })
    expect(summary).toMatchObject({
      skipped: null,
      wanted: 1,
      registered: ['kontainerkonf.konf.run'],
    })
  })

  it('registers a verified custom domain of the platform organization', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      callback('2026.cloudnativedays.no'),
    ])
    expect(stateOf(id).status).toBe('registered')
  })

  it.each<[string, () => void]>([
    [
      "a tenant's own verified domain",
      () => seedHost('conf.tenant.example.org', { org: TENANT_ORG }),
    ],
    [
      'a wildcard claim',
      () => seedHost('*.cloudnativedays.no', { org: PLATFORM_ORG }),
    ],
    [
      'a host whose proof stopped resolving',
      () =>
        seedHost('2026.cloudnativedays.no', {
          org: PLATFORM_ORG,
          record: { status: 'failing' },
        }),
    ],
    [
      'a conference without workshops',
      () => {
        workshops.set(OTHER_TENANT_ORG, false)
        seedAllocated('quiet.konf.run', { org: OTHER_TENANT_ORG })
      },
    ],
    [
      'a hostname that names a different host as a URL',
      () => seedHost('127.1', { org: PLATFORM_ORG }),
    ],
  ])('registers nothing for %s', async (_, seedIt) => {
    seedAllocated(CONTROL)
    seedIt()

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([callback(CONTROL)])
    expect(summary.wanted).toBe(1)
  })

  it('does not call WorkOS when no host qualifies and nothing is on record', async () => {
    seedHost('conf.tenant.example.org', { org: TENANT_ORG })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary).toMatchObject({ skipped: null, wanted: 0 })
    expect(workos.requests).toEqual([])
  })

  it.each([
    ['without WORKOS_API_KEY', 'WORKOS_API_KEY', '', 'no-api-key'],
    ['on a preview deployment', 'VERCEL_ENV', 'preview', 'not-production'],
    ['in local development', 'VERCEL_ENV', '', 'not-production'],
  ])('does not run %s', async (_, name, value, skipped) => {
    vi.stubEnv(name, value)
    storeReadFails = true
    seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    // `error: null` with a failing store shows the records were never read.
    expect(summary).toMatchObject({ skipped, error: null })
    expect(workos.requests).toEqual([])
  })
})

describe('when WorkOS spells a URI its own way', () => {
  it.each<[string, (uri: string) => string, boolean]>([
    ['a trailing slash, duplicates refused', (uri) => `${uri}/`, false],
    ['a trailing slash, duplicates accepted', (uri) => `${uri}/`, true],
    ['an upper-cased path', (uri) => uri.replace('/api/', '/API/'), false],
  ])(
    'still knows its own URI by its id: %s',
    async (_, respell, allowDuplicates) => {
      workos.respell = respell
      workos.allowDuplicates = allowDuplicates
      const id = seedAllocated('kontainerkonf.konf.run')

      await reconcileWorkshopRedirectUris(NOW)
      const registered = stateOf(id).id
      await reconcileWorkshopRedirectUris(NOW)
      const third = await reconcileWorkshopRedirectUris(NOW)

      expect(workos.uris).toHaveLength(1)
      expect(stateOf(id)).toEqual({
        status: 'registered',
        id: registered,
        error: null,
      })
      expect(third).toMatchObject({
        registered: [],
        errored: [],
        unaccounted: [],
      })

      rows.get(id)!.record.status = 'revoked'
      const released = await reconcileWorkshopRedirectUris(NOW)

      expect(released.removed).toEqual(['kontainerkonf.konf.run'])
      expect(workos.uris).toEqual([])
    },
  )

  it('does not take for its own an entry WorkOS hands back for a create it did not need', async () => {
    // Added by hand, stored re-spelled, so the listing does not match it; and
    // WorkOS answers the create with that same entry instead of refusing.
    workos.respell = (uri) => `${uri}/`
    workos.duplicateReturnsExisting = true
    const byHand = workos.seed(`${callback('kontainerkonf.konf.run')}/`)
    const id = seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
    expect(summary).toMatchObject({ registered: [], unaccounted: [] })

    // The documented exception to "a second run writes nothing": the listing
    // never shows the exact URI, so the create is asked again. It makes
    // nothing, and nothing is written to the record.
    workos.requests.length = 0
    stateWrites.length = 0
    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes().map((r) => r.method)).toEqual(['POST'])
    expect(workos.uris).toEqual([byHand])
    expect(stateWrites).toEqual([])
    rows.get(id)!.record.status = 'revoked'

    const released = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
    expect(released.unaccounted).toEqual([byHand.uri])
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
    for (let i = 0; i < 120; i++) {
      workos.seed(`https://other${i}.example.org/cb`)
    }
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    expect(workos.uris).toHaveLength(121)
    workos.requests.length = 0

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(121)
    expect(stateOf(id)).toMatchObject({ status: 'registered', error: null })
    expect(workos.requests.map((r) => r.method)).toEqual(['GET', 'GET'])
  })
})

describe('URIs this system did not create', () => {
  it('survive a reconcile that registers and removes others', async () => {
    const byDefault = workos.seed(callback('2025.cloudnativebergen.dev'))
    const byHand = workos.seed(callback('staging.example.org'))
    seedAllocated('kontainerkonf.konf.run')
    const gone = seedAllocated('old.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(gone)!.record.status = 'revoked'

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.removed).toEqual(['old.konf.run'])
    expect(workos.uris.map((u) => u.uri)).toEqual([
      byDefault.uri,
      byHand.uri,
      callback('kontainerkonf.konf.run'),
    ])
  })

  it('are recorded as external, not registered again', async () => {
    workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run')

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
  })

  it('replace a dead id on the record: external, the id dropped, nothing reported', async () => {
    const byHand = workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run', {
      redirectUri: { status: 'registered', id: 'redir_gone' },
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
    expect(summary.unaccounted).toEqual([])
  })

  it('do not stand in for the exact callback when they only resemble it', async () => {
    // A trailing slash is a different redirect URI: WorkOS would not accept a
    // sign-in's exact callback on the strength of it.
    const lookalike = workos.seed(`${callback('kontainerkonf.konf.run')}/`)
    const id = seedAllocated('kontainerkonf.konf.run')

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      lookalike.uri,
      callback('kontainerkonf.konf.run'),
    ])
    expect(stateOf(id)).toMatchObject({
      status: 'registered',
      id: workos.uris[1].id,
    })
  })

  it.each([
    ['WorkOS would refuse the duplicate', false],
    ['WorkOS would hand the existing entry back', true],
  ])(
    'are not created again, nor taken for its own, when added after the run listed WorkOS and %s',
    async (_, duplicateReturnsExisting) => {
      // The run lists once, before any host. By the time this host is handled
      // someone has added its callback by hand.
      workos.duplicateReturnsExisting = duplicateReturnsExisting
      const id = seedAllocated('kontainerkonf.konf.run')
      let byHand: FakeRedirectUri | undefined
      workos.beforeAnswer = (method) => {
        if (method !== 'GET' || byHand) return
        byHand = workos.seed(callback('kontainerkonf.konf.run'))
      }

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(workos.writes()).toEqual([])
      expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
      expect(summary.registered).toEqual([])

      rows.get(id)!.record.status = 'revoked'
      await reconcileWorkshopRedirectUris(NOW)

      expect(workos.uris).toEqual([byHand])
    },
  )

  it('KNOWN LIMIT: one added between the last listing and the create is taken for its own, if WorkOS hands it back', async () => {
    // Nothing WorkOS returns tells an entry it just made from one that was
    // there. The listing made right before the create keeps this moment
    // short; it cannot close it. Stated in the module doc of reconcile.ts.
    workos.duplicateReturnsExisting = true
    const id = seedAllocated('kontainerkonf.konf.run')
    let listings = 0
    let byHand: FakeRedirectUri | undefined
    workos.beforeAnswer = (method) => {
      if (method !== 'GET' || ++listings !== 2) return
      byHand = workos.seed(callback('kontainerkonf.konf.run'))
    }

    await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: byHand!.id,
      error: null,
    })
  })

  it('are recognised however WorkOS spells them', async () => {
    workos.seed('https://KontainerKonf.konf.run:443/api/auth/callback')
    const id = seedAllocated('kontainerkonf.konf.run')

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
    // Seen in the run's one listing: no second look, which is only for a
    // create about to be sent.
    expect(workos.requests.map((r) => r.method)).toEqual(['GET'])
  })

  it.each<[string, Partial<DomainVerificationRecord>, string[]]>([
    ['a released host', { status: 'revoked' }, []],
    ['a wanted host', {}, [callback('kontainerkonf.konf.run')]],
  ])(
    'are not touched when their id has been put on the record of %s',
    async (_, record, ownUris) => {
      // The record is the ledger, and whoever can write the dataset can write
      // it. An id that names some other host's URI is never acted on.
      const byDefault = workos.seed(callback('2025.cloudnativebergen.dev'))
      const id = seedAllocated('kontainerkonf.konf.run', {
        record,
        redirectUri: { status: 'registered', id: byDefault.id },
      })

      await reconcileWorkshopRedirectUris(NOW)

      expect(workos.uris.map((u) => u.uri)).toEqual([byDefault.uri, ...ownUris])
      expect(stateOf(id).id).not.toBe(byDefault.id)
    },
  )

  it('are left in WorkOS when their host is released, and reported', async () => {
    const byHand = workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(id)!.record.status = 'revoked'

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
    expect(summary.unaccounted).toEqual([byHand.uri])
  })

  it('include one added by hand after a create that got no answer', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.failNext('POST', 'network')
    await reconcileWorkshopRedirectUris(NOW)
    expect(workos.uris).toEqual([])
    const byHand = workos.seed(callback('kontainerkonf.konf.run'))

    await reconcileWorkshopRedirectUris(NOW)
    expect(stateOf(id)).toMatchObject({ status: 'external', id: null })
    rows.get(id)!.record.status = 'revoked'
    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
  })

  it('include its own create when the answer was lost: never claimed without an id', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.loseNextCreateResponse()
    await reconcileWorkshopRedirectUris(NOW)
    expect(workos.uris).toHaveLength(1)

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
  })

  it('are reported as unaccounted when they duplicate a URI this system registered', async () => {
    seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    workos.allowDuplicates = true
    const duplicate = workos.seed(callback('kontainerkonf.konf.run'))

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(2)
    expect(summary.unaccounted).toEqual([duplicate.uri])
  })

  it('are not reported for a host the workshops gate cannot decide on', async () => {
    workshops.set(OTHER_TENANT_ORG, null)
    workos.seed(callback('undecided.konf.run'))
    seedAllocated('undecided.konf.run', { org: OTHER_TENANT_ORG })
    seedAllocated(CONTROL)

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.unaccounted).toEqual([])
    expect(summary.registered).toEqual([CONTROL])
  })

  it("are reported as unaccounted even when their id sits on another host's record", async () => {
    // The same host check that decides what may be deleted decides what a
    // host answers for.
    const stray = workos.seed(callback('left-behind.example.org'))
    const own = workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run', {
      redirectUri: { status: 'registered', id: stray.id },
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.unaccounted).toEqual([stray.uri])
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
    expect(workos.uris).toEqual([stray, own])
  })

  it('are reported as unaccounted only when they are callbacks nobody answers for', async () => {
    const stray = workos.seed(callback('left-behind.example.org'))
    workos.seed('https://app.example.org/some/other/redirect')
    workos.seed(callback('external.konf.run'))
    seedAllocated('external.konf.run')
    seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.unaccounted).toEqual([stray.uri])
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
    workos.requests.length = 0
    return id
  }

  it('deletes the URI of a host that was released', async () => {
    const id = await registered('kontainerkonf.konf.run')
    rows.get(id)!.record.status = 'revoked'

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
    expect(summary.removed).toEqual(['kontainerkonf.konf.run'])
    // It is ours and is being removed: not something for a person to decide.
    expect(summary.unaccounted).toEqual([])
  })

  it.each<[string, (id: string) => void]>([
    [
      'whose proof stopped resolving',
      (id) => {
        rows.get(id)!.record.status = 'failing'
      },
    ],
    [
      'whose conference lost workshops',
      () => {
        workshops.set(PLATFORM_ORG, false)
      },
    ],
    [
      'that left the platform organization',
      (id) => {
        rows.get(id)!.conference = { organization: { _ref: TENANT_ORG } }
      },
    ],
  ])('deletes the URI of a host %s', async (_, change) => {
    const id = await registered('2026.cloudnativedays.no', PLATFORM_ORG)
    change(id)

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.removed).toEqual(['2026.cloudnativedays.no'])
    expect(workos.uris).toEqual([])
  })

  it.each<[string, () => void]>([
    ['the workshops gate could not say', () => workshops.set(TENANT_ORG, null)],
    [
      'the organization could not be read',
      () => unreadableOrgs.add(TENANT_ORG),
    ],
  ])('keeps the URI when %s', async (_, breakIt) => {
    const id = await registered('kontainerkonf.konf.run')
    const before = structuredClone(workos.uris)
    breakIt()

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual(before)
    expect(stateOf(id)).toMatchObject({
      status: 'registered',
      id: before[0].id,
    })
    expect(summary).toMatchObject({
      removed: [],
      errored: ['kontainerkonf.konf.run'],
    })
  })

  it('clears an error left on the record of a host that is no longer wanted', async () => {
    seedAllocated(CONTROL)
    const id = seedAllocated('old.konf.run', {
      record: { status: 'revoked' },
      redirectUri: { error: 'POST was refused by WorkOS with HTTP 500' },
    })

    await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
  })

  it('does not register a host while the workshops gate cannot say', async () => {
    workshops.set(OTHER_TENANT_ORG, null)
    seedAllocated(CONTROL)
    const id = seedAllocated('undecided.konf.run', { org: OTHER_TENANT_ORG })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([callback(CONTROL)])
    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
    expect(summary).toMatchObject({
      wanted: 1,
      errored: ['undecided.konf.run'],
    })
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

  it('forgets a URI that is already gone without a delete', async () => {
    const id = await registered('kontainerkonf.konf.run')
    workos.uris.length = 0
    rows.get(id)!.record.status = 'revoked'

    await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
    expect(workos.requests.map((r) => r.method)).toEqual(['GET'])
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
  })

  it('records a refused list only on the hosts it leaves out of step', async () => {
    const settled = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    const pending = seedAllocated('new.konf.run')
    const leaving = seedAllocated('old.konf.run', {
      record: { status: 'revoked' },
      redirectUri: { status: 'registered', id: 'redir_old' },
    })
    stateWrites.length = 0
    workos.failAll('GET', { status: 503 })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.errored).toEqual(['new.konf.run', 'old.konf.run'])
    expect(stateOf(settled).error).toBeNull()
    expect(stateOf(pending).error).toContain('503')
    expect(stateOf(leaving).error).toContain('503')
    expect(stateWrites.map((w) => w.id).sort()).toEqual(
      [leaving, pending].sort(),
    )
  })

  it('clears the error once the host is in step again', async () => {
    const registered = workos.seed(callback('kontainerkonf.konf.run'))
    const id = seedAllocated('kontainerkonf.konf.run', {
      redirectUri: {
        status: 'registered',
        id: registered.id,
        error: 'GET was refused by WorkOS with HTTP 503',
      },
    })

    await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: registered.id,
      error: null,
    })
    expect(workos.writes()).toEqual([])
  })

  it('creates nothing when it cannot look again just before the create', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    let listings = 0
    workos.beforeAnswer = (method) => {
      if (method === 'GET' && ++listings === 1) {
        workos.failNext('GET', { status: 503 })
      }
    }

    const first = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(first.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toEqual({
      status: null,
      id: null,
      error: expect.stringContaining('503'),
    })

    const second = await reconcileWorkshopRedirectUris(NOW)

    expect(second.registered).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toMatchObject({ status: 'registered', error: null })
  })

  it('records a refused create and registers on the next run', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.failNext('POST', { status: 500, message: 'Internal error' })

    const first = await reconcileWorkshopRedirectUris(NOW)

    expect(first.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toEqual({
      status: null,
      id: null,
      error: expect.stringContaining('500'),
    })

    const second = await reconcileWorkshopRedirectUris(NOW)

    expect(second.registered).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toMatchObject({ status: 'registered', error: null })
  })

  it('keeps the id on record when a create is refused for a host it had registered', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    const registeredId = stateOf(id).id
    // The listing does not show the URI, and the create that follows fails.
    const [hidden] = workos.uris.splice(0, 1)
    workos.failNext('POST', { status: 422, message: 'already exists' })

    await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toMatchObject({
      id: registeredId,
      error: expect.stringContaining('422'),
    })

    // Once the listing shows it again it is still ours, and still removable.
    workos.uris.push(hidden)
    rows.get(id)!.record.status = 'revoked'
    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
  })

  it('records a refused delete, keeps the id and deletes on the next run', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    const registeredId = stateOf(id).id
    rows.get(id)!.record.status = 'revoked'
    workos.failNext('DELETE', { status: 500 })

    const first = await reconcileWorkshopRedirectUris(NOW)

    expect(first.errored).toEqual(['kontainerkonf.konf.run'])
    expect(first.removed).toEqual([])
    expect(stateOf(id)).toMatchObject({
      id: registeredId,
      error: expect.stringContaining('500'),
    })

    const second = await reconcileWorkshopRedirectUris(NOW)

    expect(second.removed).toEqual(['kontainerkonf.konf.run'])
    expect(workos.uris).toEqual([])
    expect(stateOf(id).id).toBeNull()
  })
})

describe('when the records cannot be read or move on under the run', () => {
  it('does not throw when the read fails', async () => {
    storeReadFails = true

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.error).toContain('sanity is down')
  })

  it('records the new id over one whose URI is gone, when the record was only re-checked meanwhile', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    const gone = stateOf(id).id
    // Deleted in the dashboard: the record still names it, the listing does not.
    workos.uris.length = 0
    workos.beforeAnswer = (method) => {
      if (method === 'POST') moveOn(id)
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[0].id,
      error: null,
    })
    expect(stateOf(id).id).not.toBe(gone)
    expect(summary.errored).toEqual([])
  })

  it('removes the URI again when the record moved on and it can no longer tell that the host is wanted', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      moveOn(id)
      workshops.set(TENANT_ORG, null)
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
    expect(stateOf(id).id).toBeNull()
    expect(summary).toMatchObject({
      registered: [],
      errored: ['kontainerkonf.konf.run'],
    })
  })

  it.each<[string, (id: string) => void]>([
    [
      'the record cannot be read again',
      (id) => {
        moveOn(id)
        storeReadFails = true
      },
    ],
    ['the record is gone', (id) => rows.delete(id)],
  ])(
    'removes the URI again when its id cannot be recorded and %s',
    async (_, afterCreate) => {
      // A Sanity outage right after WorkOS created the URI: nothing can hold
      // its id, so it must not be left behind.
      const id = seedAllocated('kontainerkonf.konf.run')
      let created = 0
      workos.beforeAnswer = (method) => {
        if (method !== 'POST') return
        created = workos.uris.length
        afterCreate(id)
      }

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(created).toBe(1)
      expect(workos.uris).toEqual([])
      expect(rows.get(id)?.redirectUri.id ?? null).toBeNull()
      expect(summary).toMatchObject({
        registered: [],
        errored: ['kontainerkonf.konf.run'],
      })
    },
  )

  it('removes the URI again when the host was released while it was being created', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    let created = 0
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      created = workos.uris.length
      moveOn(id, (row) => {
        row.record.status = 'revoked'
      })
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(created).toBe(1)
    expect(workos.uris).toEqual([])
    expect(stateOf(id).id).toBeNull()
    expect(summary).toMatchObject({
      registered: [],
      errored: ['kontainerkonf.konf.run'],
    })
  })

  it('records the id when the record was only re-checked while the URI was being created', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.beforeAnswer = (method) => {
      if (method === 'POST') moveOn(id)
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[0].id,
      error: null,
    })
    expect(summary.registered).toEqual(['kontainerkonf.konf.run'])
  })

  /** Another run registers the host: its URI exists in WorkOS and its id is on the record. */
  function anotherRunRegisters(id: string, hostname: string): string {
    const theirs = workos.seed(callback(hostname))
    moveOn(id, (row) => {
      row.record.status = 'verified'
      row.redirectUri = { status: 'registered', id: theirs.id, error: null }
    })
    return theirs.id
  }

  /**
   * Do `act` once, as the run makes its Nth listing of WorkOS. It lists at the
   * start (1), and again just before each create (2).
   */
  function atListing(n: number, act: () => void): void {
    const others = workos.beforeAnswer
    let listings = 0
    workos.beforeAnswer = (method) => {
      others?.(method)
      if (method === 'GET' && ++listings === n) act()
    }
  }

  it('creates nothing when an overlapping run registered the host after this run listed WorkOS', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    let theirs = ''
    atListing(1, () => {
      theirs = anotherRunRegisters(id, 'kontainerkonf.konf.run')
    })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.writes()).toEqual([])
    expect(workos.uris.map((u) => u.id)).toEqual([theirs])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: theirs,
      error: null,
    })
  })

  it.each([
    ['WorkOS refuses the duplicate', false],
    ['WorkOS accepts the duplicate', true],
  ])(
    'leaves an overlapping run in charge of the host it registered first, when %s',
    async (_, allowDuplicates) => {
      const id = seedAllocated('kontainerkonf.konf.run')
      workos.allowDuplicates = allowDuplicates
      let theirs = ''
      // The other run acts after this one has looked for the last time and
      // found nothing, so this one goes on to ask for the create.
      atListing(2, () => {
        theirs = anotherRunRegisters(id, 'kontainerkonf.konf.run')
      })

      await reconcileWorkshopRedirectUris(NOW)

      expect(workos.writes().map((r) => r.method)).toContain('POST')
      expect(workos.uris.map((u) => u.id)).toEqual([theirs])
      expect(stateOf(id)).toEqual({
        status: 'registered',
        id: theirs,
        error: null,
      })
    },
  )

  it("does not replace an overlapping run's id with its own when the undo fails", async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    workos.allowDuplicates = true
    let theirs = ''
    workos.beforeAnswer = (method) => {
      if (method === 'POST') workos.failNext('DELETE', { status: 500 })
    }
    atListing(2, () => {
      theirs = anotherRunRegisters(id, 'kontainerkonf.konf.run')
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    // Theirs, and the duplicate this run made and could not remove again.
    expect(workos.uris).toHaveLength(2)
    expect(workos.writes().map((r) => r.method)).toEqual(['POST', 'DELETE'])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: theirs,
      error: null,
    })
    expect(summary.errored).toEqual(['kontainerkonf.konf.run'])
  })

  it('keeps the id of a URI it could not remove after another run cleared the record', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    // Its URI is deleted in the dashboard; the record still names the old id.
    workos.uris.length = 0
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      // The host is released and the reconcile that release queued has
      // already cleared the record.
      moveOn(id, (row) => {
        row.record.status = 'revoked'
        row.redirectUri = { status: null, id: null, error: null }
      })
      workos.failNext('DELETE', { status: 500 })
    }

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id).id).toBe(workos.uris[0].id)
    workos.beforeAnswer = undefined

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
  })

  it('keeps the URI it put back when an overlapping run saw it first and called it external', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(id)!.record.status = 'failing'
    workos.beforeAnswer = (method) => {
      // Re-checked to verified while the old URI is being deleted…
      if (method === 'DELETE') {
        moveOn(id, (row) => {
          row.record.status = 'verified'
        })
      }
      // …and the reconcile that re-check queued lists the new URI before this
      // run has recorded its id.
      if (method === 'POST') {
        moveOn(id, (row) => {
          row.redirectUri = { status: 'external', id: null, error: null }
        })
      }
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[0].id,
      error: null,
    })
    expect(summary.errored).toEqual([])
  })

  it('logs the id of a URI it could neither record, remove, nor leave on the record', async () => {
    // Released during the create, the delete refused, and the record moved
    // again before the id could be left on it: the log is all that is left.
    const id = seedAllocated('kontainerkonf.konf.run')
    const logged = vi.mocked(console.error)
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      moveOn(id, (row) => {
        row.record.status = 'revoked'
      })
      workos.failNext('DELETE', { status: 500 })
    }
    const served = globalThis.fetch
    vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => {
      if (args[1]?.method === 'DELETE') moveOn(id)
      return served(...args)
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    const leftover = workos.uris[0].id
    expect(summary.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id).id).toBeNull()
    expect(
      logged.mock.calls.some((call) => String(call[1]).includes(leftover)),
    ).toBe(true)
  })

  it('keeps the id of a URI it could neither record nor remove, and removes it on the next run', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    const logged = vi.mocked(console.error)
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      moveOn(id, (row) => {
        row.record.status = 'revoked'
      })
      workos.failNext('DELETE', { status: 500 })
    }

    const first = await reconcileWorkshopRedirectUris(NOW)

    const leftover = workos.uris[0].id
    expect(first.errored).toEqual(['kontainerkonf.konf.run'])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: leftover,
      error: expect.stringContaining('could not be removed again'),
    })
    expect(
      logged.mock.calls.some((call) => String(call[1]).includes(leftover)),
    ).toBe(true)
    workos.beforeAnswer = undefined

    const second = await reconcileWorkshopRedirectUris(NOW)

    expect(second.removed).toEqual(['kontainerkonf.konf.run'])
    expect(workos.uris).toEqual([])
    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
  })

  it.each([
    ['on the first write', false],
    ['on the write that follows a re-check of the record', true],
  ])(
    'keeps the URI when recording its id succeeded and only the answer was lost, %s',
    async (_, recordMoves) => {
      const id = seedAllocated('kontainerkonf.konf.run')
      workos.beforeAnswer = (method) => {
        if (method !== 'POST') return
        if (recordMoves) moveOn(id)
        loseNextWriteAnswer = true
      }

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(workos.uris).toHaveLength(1)
      expect(stateOf(id)).toMatchObject({
        status: 'registered',
        id: workos.uris[0].id,
      })
      expect(summary).toMatchObject({
        registered: ['kontainerkonf.konf.run'],
        errored: [],
      })
    },
  )

  it('puts the URI back when the host was wanted again while it was being deleted', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    const first = stateOf(id).id
    rows.get(id)!.record.status = 'failing'
    workos.beforeAnswer = (method) => {
      if (method !== 'DELETE') return
      moveOn(id, (row) => {
        row.record.status = 'verified'
      })
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([
      callback('2026.cloudnativedays.no'),
    ])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[0].id,
      error: null,
    })
    expect(stateOf(id).id).not.toBe(first)
    expect(summary.errored).toEqual([])
  })

  it('does not put the URI back while it cannot tell that the host is wanted again', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(id)!.record.status = 'failing'
    workos.beforeAnswer = (method) => {
      if (method !== 'DELETE') return
      moveOn(id, (row) => {
        row.record.status = 'verified'
      })
      unreadableOrgs.add(PLATFORM_ORG)
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([])
    expect(summary.errored).toEqual(['2026.cloudnativedays.no'])
  })

  it('does not put the URI back over one an overlapping run registered meanwhile', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    rows.get(id)!.record.status = 'failing'
    let theirs = ''
    workos.beforeAnswer = (method) => {
      if (method !== 'DELETE') return
      workos.beforeAnswer = undefined
      theirs = anotherRunRegisters(id, '2026.cloudnativedays.no')
    }

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.id)).toEqual([theirs])
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: theirs,
      error: null,
    })
  })
})

/**
 * Guards an exhaustive mutation pass over `reconcile.ts` found unpinned: with
 * the guard named in each test removed or inverted, every other test still
 * passed.
 */
describe('guards a mutation pass found unpinned', () => {
  it('does not run with a WORKOS_API_KEY that is only whitespace', async () => {
    vi.stubEnv('WORKOS_API_KEY', '   ')
    storeReadFails = true
    seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    // `error: null` with a failing store shows the records were never read.
    expect(summary).toMatchObject({ skipped: 'no-api-key', error: null })
    expect(workos.requests).toEqual([])
  })

  it('carries on past a record whose hostname no URL can carry', async () => {
    // Passes the stored-hostname pattern (`:\d{1,5}`), but no URL has that port.
    seedHost('conf.tenant.example.org:99999')
    const id = seedAllocated(CONTROL)

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id).status).toBe('registered')
    expect(summary).toMatchObject({
      error: null,
      wanted: 1,
      registered: [CONTROL],
      errored: [],
    })
  })

  it('registers nothing for an allocated host whose name no URL can carry', async () => {
    seedAllocated(CONTROL)
    seedAllocated('bad host.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([callback(CONTROL)])
    expect(summary).toMatchObject({ error: null, wanted: 1, errored: [] })
  })

  it('works around an entry in WorkOS that is not a URL, and reports it when it reads as a callback', async () => {
    // A wildcard port: WorkOS can hold it, `new URL` refuses it.
    const odd = workos.seed('http://localhost:*/api/auth/callback')
    const id = seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id).status).toBe('registered')
    expect(summary).toMatchObject({
      error: null,
      registered: ['kontainerkonf.konf.run'],
      errored: [],
      unaccounted: [odd.uri],
    })
  })

  it('reports stray callbacks whatever the case or trailing slashes of their path, and on another scheme or port of a wanted host', async () => {
    const hostname = 'kontainerkonf.konf.run'
    const strays = [
      workos.seed('https://left-behind.example.org/API/Auth/Callback'),
      workos.seed('https://left-behind.example.org/api/auth/callback//'),
      workos.seed(`http://${hostname}/api/auth/callback`),
      workos.seed(`https://${hostname}:8443/api/auth/callback`),
    ]
    seedAllocated(hostname)

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.registered).toEqual([hostname])
    expect(summary.unaccounted).toEqual(strays.map((stray) => stray.uri))
  })

  it.each<[string, (hostname: string) => string]>([
    [
      'on another port of the same hostname',
      (hostname) => `https://${hostname}:8443/api/auth/callback`,
    ],
    ['that is not a URL', () => 'http://localhost:*/api/auth/callback'],
  ])(
    'never deletes a URI %s because its id is on a released record',
    async (_, uriFor) => {
      const foreign = workos.seed(uriFor('kontainerkonf.konf.run'))
      const id = seedAllocated('kontainerkonf.konf.run', {
        record: { status: 'revoked' },
        redirectUri: { status: 'registered', id: foreign.id },
      })

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(workos.uris).toEqual([foreign])
      expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
      expect(summary).toMatchObject({ removed: [], errored: [] })
    },
  )

  it('does not throw when a read rejects with something that is not an Error', async () => {
    const store = await import('@/lib/domain-verification/sanity')
    vi.spyOn(store, 'listRedirectUriSyncRows').mockRejectedValueOnce(
      'sanity is down',
    )

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.error).toBe('sanity is down')
  })

  it('registers nothing for a platform-organization host whose proof is too old at the time of the run', async () => {
    seedAllocated(CONTROL)
    seedHost('2026.cloudnativedays.no', {
      org: PLATFORM_ORG,
      // Verified, but not re-proven inside the allowlist's 30 days before NOW.
      record: {
        lastSuccessAt: '2026-08-01T05:00:00.000Z',
        lastCheckedAt: '2026-08-01T05:00:00.000Z',
      },
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([callback(CONTROL)])
    expect(summary.wanted).toBe(1)
  })

  it('decides against a hostname that names a different host as a URL, rather than leaving it undecided', async () => {
    seedAllocated(CONTROL)
    const id = seedHost('127.1', {
      org: PLATFORM_ORG,
      redirectUri: { error: 'POST was refused by WorkOS with HTTP 500' },
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
    expect(summary).toMatchObject({ wanted: 1, errored: [] })
  })

  it('leaves a host as it is when the workshops gate throws, and still brings the others into step', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    const kept = structuredClone(workos.uris[0])
    seedAllocated(CONTROL, { org: OTHER_TENANT_ORG })
    const gate = await import('@/lib/features/workshops')
    vi.spyOn(gate, 'resolveWorkshopsForConference').mockImplementation(
      async (conference) => {
        if (conference?.organization?._ref === TENANT_ORG) {
          throw new Error('the ticketing credentials could not be read')
        }
        return true
      },
    )

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([kept.uri, callback(CONTROL)])
    expect(stateOf(id)).toMatchObject({ status: 'registered', id: kept.id })
    expect(summary).toMatchObject({
      error: null,
      registered: [CONTROL],
      removed: [],
      errored: ['kontainerkonf.konf.run'],
    })
  })

  it('reads no organization for a host whose conference is gone, and decides against it', async () => {
    const organizations = await import('@/lib/organization/sanity')
    const read = vi.spyOn(organizations, 'getOrganizationById')
    seedAllocated(CONTROL)
    const id = seedAllocated('ownerless.konf.run', {
      redirectUri: { error: 'POST was refused by WorkOS with HTTP 500' },
    })
    rows.get(id)!.conference = null

    const summary = await reconcileWorkshopRedirectUris(NOW)

    // One read, for the host that has an owner; never one for `undefined`.
    expect(read.mock.calls).toEqual([[TENANT_ORG]])
    expect(stateOf(id)).toEqual({ status: null, id: null, error: null })
    expect(summary).toMatchObject({ wanted: 1, errored: [] })
  })
  it('takes a duplicate WorkOS made of a re-spelled entry for its own, by its id and not by its text', async () => {
    // Added by hand and stored re-spelled, so the listing does not match the
    // exact callback; WorkOS then ACCEPTS the create and stores a second entry
    // with the very same text. The id it answered with is new: it is ours.
    workos.respell = (uri) => `${uri}/`
    workos.allowDuplicates = true
    const byHand = workos.seed(`${callback('kontainerkonf.konf.run')}/`)
    const id = seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(2)
    expect(workos.uris[1].uri).toBe(byHand.uri)
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: workos.uris[1].id,
      error: null,
    })
    expect(summary.registered).toEqual(['kontainerkonf.konf.run'])

    // Recorded, so it does not create a third on the next run, and it is the
    // one removed when the host is released.
    await reconcileWorkshopRedirectUris(NOW)
    expect(workos.uris).toHaveLength(2)
    rows.get(id)!.record.status = 'revoked'
    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
  })

  it('drops a dead id and an old error when WorkOS answers a create with an entry that was already there', async () => {
    workos.respell = (uri) => `${uri}/`
    workos.duplicateReturnsExisting = true
    const byHand = workos.seed(`${callback('kontainerkonf.konf.run')}/`)
    const id = seedAllocated('kontainerkonf.konf.run', {
      redirectUri: {
        status: 'registered',
        id: 'redir_gone',
        error: 'POST was refused by WorkOS with HTTP 500',
      },
    })

    await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
  })

  it('does not record a refused list on a wanted host whose URI is external', async () => {
    workos.seed(callback('external.konf.run'))
    const external = seedAllocated('external.konf.run')
    await reconcileWorkshopRedirectUris(NOW)
    expect(stateOf(external).status).toBe('external')
    const pending = seedAllocated('new.konf.run')
    stateWrites.length = 0
    workos.failAll('GET', { status: 503 })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.errored).toEqual(['new.konf.run'])
    expect(stateWrites.map((w) => w.id)).toEqual([pending])
    expect(stateOf(external)).toEqual({
      status: 'external',
      id: null,
      error: null,
    })
  })
  it('still knows its own URI by its id when WorkOS spells the path in a way no comparison would match', async () => {
    workos.respell = (uri) => `${uri}/index`
    const id = seedAllocated('kontainerkonf.konf.run')

    await reconcileWorkshopRedirectUris(NOW)
    const registered = stateOf(id).id
    const second = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toHaveLength(1)
    expect(stateOf(id)).toEqual({
      status: 'registered',
      id: registered,
      error: null,
    })
    expect(second).toMatchObject({ registered: [], errored: [] })

    rows.get(id)!.record.status = 'revoked'
    const released = await reconcileWorkshopRedirectUris(NOW)

    expect(released.removed).toEqual(['kontainerkonf.konf.run'])
    expect(workos.uris).toEqual([])
  })

  it('reports no error when there is nothing to do', async () => {
    seedHost('conf.tenant.example.org', { org: TENANT_ORG })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary).toEqual({
      skipped: null,
      wanted: 0,
      registered: [],
      removed: [],
      errored: [],
      unaccounted: [],
      error: null,
    })
  })

  it('reports a refused list on every host it leaves out of step, also when one of their records has moved on', async () => {
    const moved = seedAllocated('moved.konf.run')
    const pending = seedAllocated('new.konf.run')
    workos.failAll('GET', { status: 503 })
    const served = globalThis.fetch
    vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => {
      moveOn(moved)
      return served(...args)
    })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.error).toContain('503')
    expect(summary.errored).toEqual(['moved.konf.run', 'new.konf.run'])
    expect(stateOf(moved).error).toBeNull()
    expect(stateOf(pending).error).toContain('503')
  })

  it('keeps the id on record when the list is refused', async () => {
    // Forgetting it here would leave the URI in WorkOS with nothing to say it
    // is ours.
    const leaving = seedAllocated('old.konf.run', {
      record: { status: 'revoked' },
      redirectUri: { status: 'registered', id: 'redir_old' },
    })
    workos.failAll('GET', { status: 503 })

    await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(leaving)).toEqual({
      status: 'registered',
      id: 'redir_old',
      error: expect.stringContaining('503'),
    })
  })

  it('writes nothing for a host it could not decide on when the list is refused, and names it once', async () => {
    workshops.set(OTHER_TENANT_ORG, null)
    const undecided = seedAllocated('undecided.konf.run', {
      org: OTHER_TENANT_ORG,
    })
    const pending = seedAllocated('new.konf.run')
    workos.failAll('GET', { status: 503 })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.errored).toEqual(['undecided.konf.run', 'new.konf.run'])
    expect(stateWrites.map((w) => w.id)).toEqual([pending])
    expect(stateOf(undecided)).toEqual({ status: null, id: null, error: null })
  })

  it('does not report a URI whose path only starts with the callback path', async () => {
    const stray = workos.seed(callback('left-behind.example.org'))
    workos.seed('https://app.example.org/api/auth/callback/other')
    seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary.unaccounted).toEqual([stray.uri])
  })
  it('undoes its own create, never the URI whose id the record held going in', async () => {
    // The record names a URI on another host, so it is not ours and a create
    // follows; the host is released while that create is being answered.
    const byDefault = workos.seed(callback('2025.cloudnativebergen.dev'))
    const id = seedAllocated('kontainerkonf.konf.run', {
      redirectUri: { status: 'registered', id: byDefault.id },
    })
    let created = 0
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      created = workos.uris.length
      moveOn(id, (row) => {
        row.record.status = 'revoked'
      })
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(created).toBe(2)
    expect(workos.uris).toEqual([byDefault])
    expect(summary).toMatchObject({
      registered: [],
      errored: ['kontainerkonf.konf.run'],
    })
  })

  it('logs the id of a URI it could neither record nor remove when the record cannot be read again', async () => {
    const id = seedAllocated('kontainerkonf.konf.run')
    const logged = vi.mocked(console.error)
    workos.beforeAnswer = (method) => {
      if (method !== 'POST') return
      moveOn(id)
      storeReadFails = true
      workos.failNext('DELETE', { status: 500 })
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    const leftover = workos.uris[0].id
    expect(summary.errored).toEqual(['kontainerkonf.konf.run'])
    expect(
      logged.mock.calls.some((call) => String(call[1]).includes(leftover)),
    ).toBe(true)
  })

  it('does not put the URI back beside one someone added by hand, and says so on the record it read again', async () => {
    const id = seedHost('2026.cloudnativedays.no', { org: PLATFORM_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    workos.allowDuplicates = true
    const byHand = workos.seed(callback('2026.cloudnativedays.no'))
    rows.get(id)!.record.status = 'failing'
    workos.beforeAnswer = (method) => {
      if (method !== 'DELETE') return
      moveOn(id, (row) => {
        row.record.status = 'verified'
      })
    }

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris).toEqual([byHand])
    expect(stateOf(id)).toEqual({ status: 'external', id: null, error: null })
    expect(summary).toMatchObject({
      removed: ['2026.cloudnativedays.no'],
      registered: [],
      errored: [],
    })
  })

  it('brings the remaining hosts into step after one of them fails', async () => {
    const failing = seedAllocated('first.konf.run')
    const next = seedAllocated('second.konf.run')
    workos.failNext('POST', { status: 500 })

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(stateOf(failing).error).toContain('500')
    expect(stateOf(next).status).toBe('registered')
    expect(summary).toMatchObject({
      error: null,
      errored: ['first.konf.run'],
      registered: ['second.konf.run'],
    })
  })

  it('keeps the URI of a host it cannot decide on while it brings another host into step', async () => {
    const id = seedAllocated('undecided.konf.run', { org: OTHER_TENANT_ORG })
    await reconcileWorkshopRedirectUris(NOW)
    const [kept] = structuredClone(workos.uris)
    workshops.set(OTHER_TENANT_ORG, null)
    seedAllocated(CONTROL)

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(workos.uris.map((u) => u.uri)).toEqual([kept.uri, callback(CONTROL)])
    expect(stateOf(id)).toMatchObject({ status: 'registered', id: kept.id })
    expect(summary).toMatchObject({
      registered: [CONTROL],
      removed: [],
      errored: ['undecided.konf.run'],
    })
  })

  it('reads the clock itself when it is not handed one', async () => {
    seedAllocated(CONTROL)
    seedHost('2026.cloudnativedays.no', {
      org: PLATFORM_ORG,
      // Too old on any day this test can run.
      record: { lastSuccessAt: '2020-01-01T00:00:00.000Z' },
    })

    const summary = await reconcileWorkshopRedirectUris()

    expect(workos.uris.map((u) => u.uri)).toEqual([callback(CONTROL)])
    expect(summary.wanted).toBe(1)
  })

  describe('a proof that is too old at the time of the run, found when a record is read again', () => {
    const HOST = '2026.cloudnativedays.no'
    const goStale = (row: RedirectUriSyncRow) => {
      row.record.status = 'verified'
      row.record.lastSuccessAt = '2026-08-01T05:00:00.000Z'
    }

    it('removes the URI again when the record moved on to one while it was being created', async () => {
      const id = seedHost(HOST, { org: PLATFORM_ORG })
      let created = 0
      workos.beforeAnswer = (method) => {
        if (method !== 'POST') return
        created = workos.uris.length
        moveOn(id, goStale)
      }

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(created).toBe(1)
      expect(workos.uris).toEqual([])
      expect(stateOf(id).id).toBeNull()
      expect(summary).toMatchObject({ registered: [], errored: [HOST] })
    })

    it('does not put the URI back for one', async () => {
      const id = seedHost(HOST, { org: PLATFORM_ORG })
      await reconcileWorkshopRedirectUris(NOW)
      rows.get(id)!.record.status = 'failing'
      workos.beforeAnswer = (method) => {
        if (method === 'DELETE') moveOn(id, goStale)
      }

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(workos.uris).toEqual([])
      expect(summary).toMatchObject({
        removed: [HOST],
        registered: [],
        errored: [HOST],
      })
    })

    it('removes the URI it was putting back when the record moved on to one meanwhile', async () => {
      const id = seedHost(HOST, { org: PLATFORM_ORG })
      await reconcileWorkshopRedirectUris(NOW)
      rows.get(id)!.record.status = 'failing'
      let created = 0
      workos.beforeAnswer = (method) => {
        if (method === 'DELETE') {
          moveOn(id, (row) => {
            row.record.status = 'verified'
          })
        }
        if (method === 'POST') {
          created = workos.uris.length
          moveOn(id, goStale)
        }
      }

      const summary = await reconcileWorkshopRedirectUris(NOW)

      expect(created).toBe(1)
      expect(workos.uris).toEqual([])
      expect(summary).toMatchObject({ registered: [], errored: [HOST] })
    })
  })
  it('logs why a host could not be decided on, which the summary does not carry', async () => {
    const logged = vi.mocked(console.error)
    unreadableOrgs.add(TENANT_ORG)
    seedAllocated('kontainerkonf.konf.run')

    const summary = await reconcileWorkshopRedirectUris(NOW)

    expect(summary).toMatchObject({
      errored: ['kontainerkonf.konf.run'],
      error: null,
    })
    expect(
      logged.mock.calls.some(
        (call) =>
          String(call[0]).includes('kontainerkonf.konf.run') &&
          String(call[1]).includes('organization read failed'),
      ),
    ).toBe(true)
  })
})
