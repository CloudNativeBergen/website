/**
 * @vitest-environment node
 *
 * `getOrganizationById`'s projection, EXECUTED with groq-js: the settings
 * card and the /privacy OpenRouter signal read `contentJudgement` from it,
 * and a field missing from a projection is `undefined`, not an error.
 */
import { describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

let dataset: object[] = []
vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({ conference: null }),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  },
}))

const { getOrganizationById } = await import('./sanity')

describe('getOrganizationById projects content judgement', () => {
  it('carries enabled, changedAt and the changer’s name', async () => {
    dataset = [
      { _id: 'sp-kari', _type: 'speaker', name: 'Kari Nordmann' },
      {
        _id: 'org-a',
        _type: 'organization',
        name: 'A',
        contentJudgement: {
          enabled: true,
          changedAt: '2026-10-25T11:42:00Z',
          changedBy: { _type: 'reference', _ref: 'sp-kari', _weak: true },
        },
      },
    ]
    expect((await getOrganizationById('org-a'))?.contentJudgement).toEqual({
      enabled: true,
      changedAt: '2026-10-25T11:42:00Z',
      changedByName: 'Kari Nordmann',
    })
  })

  it('a changer who has been erased reads as null, not a failure', async () => {
    dataset = [
      {
        _id: 'org-a',
        _type: 'organization',
        name: 'A',
        contentJudgement: {
          enabled: false,
          changedAt: '2026-10-25T11:42:00Z',
          changedBy: { _type: 'reference', _ref: 'sp-gone', _weak: true },
        },
      },
    ]
    expect((await getOrganizationById('org-a'))?.contentJudgement).toEqual({
      enabled: false,
      changedAt: '2026-10-25T11:42:00Z',
      changedByName: null,
    })
  })
})
