import { describe, expect, it } from 'vitest'
import { mapBackfill } from './backfill'
import { diffConference, expected } from './parity'

const row = mapBackfill(
  [
    {
      _id: 'c1',
      orgId: 'o1',
      title: 'Konf',
      city: 'Bergen',
      socialLinks: ['https://x.test'],
      homepageSections: [{ _type: 'hero', b: 1, a: 2 }],
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
        homepageSections: '[{"a":2,"b":1,"_type":"hero"}]',
      }),
    ).toEqual([])
  })

  it('expects null for an unpublished conference', () => {
    expect(expected({ ...row, published: 0 })).toBeNull()
    expect(diffConference(null, api())).toEqual([
      { field: '(conference)', sanity: 'null', api: 'present' },
    ])
  })
})
