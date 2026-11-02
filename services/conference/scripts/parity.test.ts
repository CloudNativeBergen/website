import { describe, expect, it } from 'vitest'
import { mapBackfill } from './backfill'
import { diffConference, expected, pickHosts } from './parity'

describe('pickHosts', () => {
  const d = (
    hostname: string,
    conferenceId: string,
    kind: 'platform-edition' | 'platform-alias' | 'custom',
    verification = 'verified',
  ) => ({ hostname, conferenceId, kind, verification })

  it('prefers the edition host and falls back to an alias after a collision', () => {
    const hosts = pickHosts([
      d('a.konf.run', 'c-a', 'platform-alias'),
      d('2026.a.konf.run', 'c-a', 'platform-edition'),
      // c-foo lost its edition host; only the alias routes to it.
      d('foo.konf.run', 'c-foo', 'platform-alias'),
      d('bad.example', 'c-bad', 'custom', 'pending'),
    ])
    expect(hosts.map((h) => h.hostname)).toEqual([
      '2026.a.konf.run',
      'foo.konf.run',
    ])
  })
})

const row = mapBackfill(
  [
    {
      _id: 'c1',
      orgId: 'o1',
      title: 'Konf',
      city: 'Bergen',
      socialLinks: ['https://x.test'],
    },
  ],
  new Set(['c1']),
).rows[0]
const api = () => ({ ...expected(row)! })

describe('diffConference', () => {
  it('finds nothing when equal', () => {
    expect(diffConference(expected(row), api())).toEqual([])
  })

  it('reports a field missing from the API', () => {
    const got = api()
    delete got.city
    expect(diffConference(expected(row), got)).toEqual([
      { field: 'city', sanity: '"Bergen"', api: 'null' },
    ])
  })

  it('reports a changed value', () => {
    expect(diffConference(expected(row), { ...api(), title: 'Other' })).toEqual(
      [{ field: 'title', sanity: '"Konf"', api: '"Other"' }],
    )
  })

  it('treats whitespace, empty and null as equal', () => {
    expect(
      diffConference(expected(row), {
        ...api(),
        title: '  Konf ',
        tagline: '',
        country: undefined,
      }),
    ).toEqual([])
  })

  it('expects a null title for a blank Sanity title', () => {
    const blank = mapBackfill(
      [{ _id: 'c1', orgId: 'o1', title: ' ' }],
      new Set(['c1']),
    ).rows[0]
    expect(expected(blank)!.title).toBeNull()
    expect(diffConference(expected(blank), { ...expected(blank)! })).toEqual([])
  })

  it('leaves editorial fields to content', () => {
    expect(
      diffConference(expected(row), { ...api(), description: 'Sanity copy' }),
    ).toEqual([])
  })

  it('expects null for an unpublished conference', () => {
    expect(expected({ ...row, published: 0 })).toBeNull()
    expect(diffConference(null, api())).toEqual([
      { field: '(conference)', sanity: 'null', api: 'present' },
    ])
  })
})
