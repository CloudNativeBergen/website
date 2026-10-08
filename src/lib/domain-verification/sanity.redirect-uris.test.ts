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

const { listRedirectUriSyncRows, patchRedirectUriState } =
  await import('./sanity')

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
      title: 'Not read',
    },
  ]
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
