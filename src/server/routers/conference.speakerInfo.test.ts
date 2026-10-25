/**
 * `conference.updateSpeakerInfo` (#1592): a whole-object replace of
 * `speakerInfo`, with route `_key`s and `updatedAt` stamped server-side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

// --- next/cache -------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// --- next/headers: the domains current-host guard reads this ----------------
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'cloudnativebergen.no' : null),
  }),
}))

// --- Conference resolution (drives resolveConferenceId) ---------------------
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

// --- Sanity write client: capture exactly what would be written -------------
const commitMock = vi.fn()
let lastSet: Record<string, unknown> | undefined
let lastUnset: string[] | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: () => {
      const builder = {
        setIfMissing: () => builder,
        set: (obj: Record<string, unknown>) => {
          lastSet = obj
          return builder
        },
        unset: (keys: string[]) => {
          lastUnset = keys
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/teams', () => ({ clearConferenceTeamsCache: vi.fn() }))

import { conferenceRouter } from './conference'

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-test'

function organizerCaller() {
  const speaker = {
    _id: 'sp-1',
    name: 'Org',
    isOrganizer: true,
    organizerOrgIds: [ORG_ID],
  }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return conferenceRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  lastSet = undefined
  lastUnset = undefined
  commitMock.mockResolvedValue({ _id: CONFERENCE_ID })
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    domain: 'cloudnativebergen.no',
    error: null,
  })
})

describe('conference.updateSpeakerInfo', () => {
  it('replaces the whole object and stamps route keys and updatedAt', async () => {
    const before = Date.now()
    await organizerCaller().updateSpeakerInfo({
      dinner: {
        venueName: 'Harbour Hall',
        routes: [{ label: 'Walk' }, { _key: 'kept', label: 'Bus' }],
      },
    })
    const info = lastSet?.speakerInfo as {
      dinner: { venueName: string; routes: { _key: string; label: string }[] }
      updatedAt: string
    }
    expect(Object.keys(lastSet ?? {})).toEqual(['speakerInfo'])
    expect(Object.keys(info).sort()).toEqual(['dinner', 'updatedAt'])
    expect(info.dinner.routes[0]._key).toMatch(/^route-/)
    expect(info.dinner.routes[1]._key).toBe('kept')
    expect(Date.parse(info.updatedAt)).toBeGreaterThanOrEqual(before)
    expect(lastUnset ?? []).toEqual([])
  })

  it('ignores a client-supplied updatedAt', async () => {
    await organizerCaller().updateSpeakerInfo({
      updatedAt: '2000-01-01T00:00:00.000Z',
    } as never)
    const info = lastSet?.speakerInfo as { updatedAt: string }
    expect(info.updatedAt).not.toBe('2000-01-01T00:00:00.000Z')
  })
})
