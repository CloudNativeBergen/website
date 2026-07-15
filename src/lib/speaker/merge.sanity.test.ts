import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MergeSpeakerDoc } from './merge'

// --- Sanity client mock (transaction boundary) -----------------------------

const fetchMock = vi.fn()
const commitMock = vi.fn().mockResolvedValue({ transactionId: 'tx-1' })
const deleteMock = vi.fn()

// Each `.patch(id, fn)` invokes `fn` with a fake patch builder whose `.set()`
// records the argument, so tests can assert the exact ops in the transaction.
const patchOps: Array<{ id: string; set: Record<string, unknown> }> = []
const patchMock = vi.fn(
  (
    id: string,
    fn: (p: { set: (o: Record<string, unknown>) => unknown }) => unknown,
  ) => {
    const op = { id, set: {} as Record<string, unknown> }
    fn({
      set: (o: Record<string, unknown>) => {
        op.set = o
        return {}
      },
    })
    patchOps.push(op)
    return transactionApi
  },
)

const deletedIds: string[] = []
const transactionApi = {
  patch: patchMock,
  delete: (id: string) => {
    deletedIds.push(id)
    deleteMock(id)
    return transactionApi
  },
  commit: commitMock,
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    transaction: () => transactionApi,
  },
}))

import { mergeSpeakers } from './merge'

const SURVIVOR = 'speaker-survivor'
const LOSER = 'speaker-loser'

function ref(id: string, key?: string) {
  return key
    ? { _type: 'reference', _ref: id, _key: key }
    : { _type: 'reference', _ref: id }
}

const survivorDoc: MergeSpeakerDoc = {
  _id: SURVIVOR,
  _type: 'speaker',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  providers: ['github:1'],
  knownEmails: ['ada@example.com'],
}

const loserDoc: MergeSpeakerDoc = {
  _id: LOSER,
  _type: 'speaker',
  name: 'Ada L',
  email: 'ada.l@work.io',
  providers: ['linkedin:2'],
  knownEmails: ['ada.l@work.io'],
}

const referencingDocs = [
  {
    _id: 'talk-1',
    _type: 'talk',
    speakers: [ref('other', 'k0'), ref(LOSER, 'k1')],
  },
  { _id: 'conf-1', _type: 'conference', organizers: [ref(LOSER, 'k2')] },
]

function routeFetch(query: string, params: Record<string, unknown> = {}) {
  if (query.includes('_id == $id')) {
    if (params.id === SURVIVOR) return Promise.resolve(survivorDoc)
    if (params.id === LOSER) return Promise.resolve(loserDoc)
    return Promise.resolve(null)
  }
  if (query.includes('references($loserId)')) {
    return Promise.resolve(referencingDocs)
  }
  return Promise.resolve(null)
}

beforeEach(() => {
  vi.clearAllMocks()
  patchOps.length = 0
  deletedIds.length = 0
  fetchMock.mockImplementation(routeFetch)
})

describe('mergeSpeakers (transaction wrapper)', () => {
  it('dry-run writes nothing and returns a preview', async () => {
    const { preview, committed, err } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
      dryRun: true,
    })

    expect(err).toBeNull()
    expect(committed).toBe(false)
    expect(patchMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
    expect(deletedIds).toEqual([])
    expect(preview?.referenceRepointsByType).toEqual({ talk: 1, conference: 1 })
  })

  it('commits repoint patches, the survivor patch, and deletes the loser LAST', async () => {
    const { committed, err } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1', name: 'Admin' },
      dryRun: false,
    })

    expect(err).toBeNull()
    expect(committed).toBe(true)
    expect(commitMock).toHaveBeenCalledTimes(1)

    // Referencing docs repointed to the survivor.
    const talkPatch = patchOps.find((p) => p.id === 'talk-1')!
    expect(talkPatch.set.speakers).toEqual([
      ref('other', 'k0'),
      { _type: 'reference', _ref: SURVIVOR, _key: 'k1' },
    ])
    const confPatch = patchOps.find((p) => p.id === 'conf-1')!
    expect(confPatch.set.organizers).toEqual([
      { _type: 'reference', _ref: SURVIVOR, _key: 'k2' },
    ])

    // Survivor identity union patch.
    const survivorPatch = patchOps.find((p) => p.id === SURVIVOR)!
    expect(survivorPatch.set.providers).toEqual(['github:1', 'linkedin:2'])
    expect(survivorPatch.set.knownEmails).toEqual([
      'ada@example.com',
      'ada.l@work.io',
    ])

    // Loser deleted, and deletion happens after all patches were staged.
    expect(deletedIds).toEqual([LOSER])
    expect(deleteMock).toHaveBeenCalledWith(LOSER)
  })

  it('rejects a self-merge without any read/write', async () => {
    const { err, committed } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: SURVIVOR,
      actor: { _id: 'admin-1' },
    })
    expect(committed).toBe(false)
    expect(err?.message).toMatch(/into itself/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('returns a validation error when the loser is missing', async () => {
    fetchMock.mockImplementation(
      (query: string, params: Record<string, unknown>) => {
        if (query.includes('_id == $id')) {
          return params.id === SURVIVOR
            ? Promise.resolve(survivorDoc)
            : Promise.resolve(null)
        }
        if (query.includes('references($loserId)')) return Promise.resolve([])
        return Promise.resolve(null)
      },
    )

    const { err, committed } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: 'missing',
      actor: { _id: 'admin-1' },
    })
    expect(committed).toBe(false)
    expect(err?.message).toMatch(/Loser speaker not found/)
    expect(commitMock).not.toHaveBeenCalled()
  })
})
