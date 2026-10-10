import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'
import { Patch } from '@sanity/client'

/**
 * The redirect-URI reads and writes against the real things they depend on:
 * the query is EXECUTED (groq-js) over a dataset, and the patch is built by the
 * real `@sanity/client` `Patch`, so what is asserted is the mutation Sanity
 * would be sent. Only the network is absent.
 */

type Doc = Record<string, unknown>

let dataset: Doc[] = []
/** The mutation the last patch committed. */
let committed: unknown
/** A stand-in for the client a `Patch` commits through. */
const transport = {
  mutate: async (mutation: unknown) => {
    committed = mutation
    return { _id: 'x', _rev: 'rev-after' }
  },
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown> = {}) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  },
  clientWrite: {
    patch: (id: string) =>
      new Patch(
        id,
        {},
        transport as unknown as ConstructorParameters<typeof Patch>[2],
      ),
  },
}))

const {
  getRedirectUriSyncRow,
  listRedirectUriSyncRows,
  listRedirectUriSyncRowsForConference,
  patchRedirectUriState,
} = await import('./sanity')

function verification(hostname: string, fields: Doc = {}): Doc {
  return {
    _id: `domainVerification.${hostname}`,
    _rev: `rev-${hostname}`,
    _type: 'domainVerification',
    hostname,
    conference: { _type: 'reference', _ref: 'conference-1' },
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    ...fields,
  }
}

beforeEach(() => {
  committed = undefined
  dataset = [
    {
      _id: 'conference-1',
      _type: 'conference',
      organization: { _type: 'reference', _ref: 'org-platform' },
      ticketingProvider: 'tito',
      // Every claimed domain, not only the main one: a secondary host must
      // still find itself claimed.
      domains: ['a.example.org', 'b.example.org'],
      title: 'Not read',
    },
  ]
})

/**
 * The organizer's read (#1298): ONE conference's records, with their
 * redirect-URI state. TENANT-SCOPED — another conference's record for a host
 * (its token, its status, its WorkOS error) must never come back.
 */
describe('listRedirectUriSyncRowsForConference', () => {
  it('reads only the records the given conference holds, with their state', async () => {
    dataset.push(
      verification('ours.example.org', {
        redirectUriStatus: 'registered',
        redirectUriId: 'redir_1',
      }),
      verification('pending.example.org', { status: 'pending' }),
      verification('theirs.example.org', {
        conference: { _type: 'reference', _ref: 'conference-2' },
        token: 'their-token',
        redirectUriError: 'their WorkOS error',
      }),
    )

    const rows = await listRedirectUriSyncRowsForConference('conference-1')

    expect(rows.map((row) => row.record.hostname)).toEqual([
      'ours.example.org',
      'pending.example.org',
    ])
    expect(rows[0].redirectUri).toEqual({
      status: 'registered',
      id: 'redir_1',
      error: null,
    })
    expect(rows[0].conference).toEqual({
      organization: { _type: 'reference', _ref: 'org-platform' },
      ticketingProvider: 'tito',
      domains: ['a.example.org', 'b.example.org'],
    })
  })

  it('reads nothing for an empty or unknown conference id', async () => {
    dataset.push(verification('ours.example.org'))
    await expect(listRedirectUriSyncRowsForConference('')).resolves.toEqual([])
    await expect(
      listRedirectUriSyncRowsForConference('conference-9'),
    ).resolves.toEqual([])
  })
})

describe('listRedirectUriSyncRows', () => {
  it('reads a host that could be allowlisted, with its revision, owner and vendor', async () => {
    dataset.push(verification('a.example.org'))

    const [row] = await listRedirectUriSyncRows()

    expect(row.record.hostname).toBe('a.example.org')
    expect(row.record.conferenceId).toBe('conference-1')
    expect(row.rev).toBe('rev-a.example.org')
    expect(row.conference).toEqual({
      organization: { _type: 'reference', _ref: 'org-platform' },
      ticketingProvider: 'tito',
      domains: ['a.example.org', 'b.example.org'],
    })
    expect(row.redirectUri).toEqual({ status: null, id: null, error: null })
  })

  it('reads the stored redirect-URI state', async () => {
    dataset.push(
      verification('a.example.org', {
        redirectUriStatus: 'registered',
        redirectUriId: 'redir_1',
        redirectUriError: 'HTTP 500',
      }),
    )

    const [row] = await listRedirectUriSyncRows()

    expect(row.redirectUri).toEqual({
      status: 'registered',
      id: 'redir_1',
      error: 'HTTP 500',
    })
  })

  it.each([
    ['a status', { redirectUriStatus: 'external' }],
    ['an id', { redirectUriId: 'redir_1' }],
    ['an error', { redirectUriError: 'HTTP 500' }],
  ])(
    'includes a released host that still has %s on record',
    async (_, state) => {
      dataset.push(
        verification('gone.example.org', { status: 'revoked', ...state }),
      )

      const rows = await listRedirectUriSyncRows()

      expect(rows.map((r) => r.record.hostname)).toEqual(['gone.example.org'])
      expect(rows[0].record.status).toBe('revoked')
    },
  )

  it('leaves out a host that was never proven and has nothing on record', async () => {
    dataset.push(verification('pending.example.org', { status: 'pending' }))
    dataset.push(verification('released.example.org', { status: 'revoked' }))

    expect(await listRedirectUriSyncRows()).toEqual([])
  })

  it('answers a missing conference with null, not an error', async () => {
    dataset.push(
      verification('a.example.org', {
        conference: { _type: 'reference', _ref: 'conference-deleted' },
      }),
    )

    const [row] = await listRedirectUriSyncRows()

    expect(row.conference).toBeNull()
  })
})

describe('getRedirectUriSyncRow', () => {
  it('reads a record the listing leaves out: released, with nothing on it', async () => {
    dataset.push(verification('released.example.org', { status: 'revoked' }))
    expect(await listRedirectUriSyncRows()).toEqual([])

    const row = await getRedirectUriSyncRow(
      'domainVerification.released.example.org',
    )

    expect(row).toMatchObject({
      record: { hostname: 'released.example.org', status: 'revoked' },
      rev: 'rev-released.example.org',
      redirectUri: { status: null, id: null, error: null },
      conference: { organization: { _ref: 'org-platform' } },
    })
  })

  it('reads only the record asked for', async () => {
    dataset.push(verification('a.example.org'))
    dataset.push(verification('b.example.org'))

    const row = await getRedirectUriSyncRow('domainVerification.b.example.org')

    expect(row?.record.hostname).toBe('b.example.org')
  })

  it('answers null for a record that does not exist', async () => {
    expect(await getRedirectUriSyncRow('domainVerification.nope')).toBeNull()
  })
})

describe('patchRedirectUriState', () => {
  it('sends one mutation: set, unset and the revision condition together', async () => {
    const rev = await patchRedirectUriState('domainVerification.a', 'rev-1', {
      status: 'registered',
      id: 'redir_1',
      error: null,
    })

    expect(committed).toEqual({
      patch: {
        id: 'domainVerification.a',
        ifRevisionID: 'rev-1',
        set: { redirectUriStatus: 'registered', redirectUriId: 'redir_1' },
        unset: ['redirectUriError'],
      },
    })
    expect(rev).toBe('rev-after')
  })

  it('touches only the fields it is given', async () => {
    await patchRedirectUriState('domainVerification.a', 'rev-1', {
      error: 'HTTP 503',
    })

    expect(committed).toEqual({
      patch: {
        id: 'domainVerification.a',
        ifRevisionID: 'rev-1',
        set: { redirectUriError: 'HTTP 503' },
      },
    })
  })
})

/**
 * Guards a mutation pass found unpinned (#1297 review). The record's fields are
 * ONE list shared by every reader of a verification record, so a field lost
 * from it is lost to the sweep and the allowlist as well as to the reconcile.
 */
describe('the record fields every reader shares', () => {
  const stored = {
    method: 'grandfathered',
    graceUntil: '2026-11-01T00:00:00.000Z',
    verifiedAt: '2026-09-01T00:00:00.000Z',
    lastSuccessAt: '2026-10-08T05:00:00.000Z',
    lastCheckedAt: '2026-10-09T05:00:00.000Z',
    firstFailureAt: '2026-10-09T05:00:00.000Z',
    consecutiveFailures: 2,
    consecutiveSoftFailures: 3,
    lastError: 'NXDOMAIN',
  }
  const whole = {
    _id: 'domainVerification.a.example.org',
    hostname: 'a.example.org',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    ...stored,
  }
  /** A record written before `status`, `method` and the counters existed. */
  const legacy = {
    _id: 'domainVerification.old.example.org',
    _rev: 'rev-old',
    _type: 'domainVerification',
    hostname: 'old.example.org',
    conference: { _type: 'reference', _ref: 'conference-1' },
    token: 'tok',
  }
  const legacyRead = {
    _id: 'domainVerification.old.example.org',
    hostname: 'old.example.org',
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'pending',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
  }

  it('hands the reconcile the whole record, not only its hostname', async () => {
    dataset.push(verification('a.example.org', stored))

    const [row] = await listRedirectUriSyncRows()

    expect(row.record).toEqual(whole)
  })

  it('gives the reconcile the same defaults for a record that predates them', async () => {
    dataset.push({ ...legacy, redirectUriId: 'redir_1' })

    const [row] = await listRedirectUriSyncRows()

    expect(row.record).toEqual(legacyRead)
  })

  it('still reads the whole record for everything else that reads one', async () => {
    const { getDomainVerification } = await import('./sanity')
    dataset.push(verification('a.example.org', stored))
    dataset.push(legacy)

    expect(await getDomainVerification('a.example.org')).toEqual(whole)
    expect(await getDomainVerification('old.example.org')).toEqual(legacyRead)
  })
})

describe('which records the reconcile is shown', () => {
  it('includes a platform-allocated host whatever its stored status: the allowlist admits it', async () => {
    dataset.push(
      verification('tenant.konf.run', {
        method: 'platform-owned',
        status: 'failing',
      }),
    )

    const rows = await listRedirectUriSyncRows()

    expect(rows.map((r) => r.record.hostname)).toEqual(['tenant.konf.run'])
  })

  it('never lists a document of another type, whatever fields it carries', async () => {
    dataset.push({
      _id: 'sponsor-1',
      _rev: 'rev-sponsor',
      _type: 'sponsor',
      hostname: 'sponsor.example.org',
      status: 'verified',
      method: 'platform-owned',
      redirectUriStatus: 'registered',
      redirectUriId: 'redir_1',
      redirectUriError: 'HTTP 500',
    })

    expect(await listRedirectUriSyncRows()).toEqual([])
  })
})

describe('patchRedirectUriState and a field that is present but undefined', () => {
  it('leaves it alone: only null clears', async () => {
    await patchRedirectUriState('domainVerification.a', 'rev-1', {
      id: undefined,
      status: 'external',
      error: undefined,
    })

    expect(committed).toEqual({
      patch: {
        id: 'domainVerification.a',
        ifRevisionID: 'rev-1',
        set: { redirectUriStatus: 'external' },
      },
    })
  })
})
