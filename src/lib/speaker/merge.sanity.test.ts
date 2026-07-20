import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MergeSpeakerDoc } from './merge'

// --- Sanity client mock (transaction boundary) -----------------------------

const fetchMock = vi.fn()
const commitMock = vi.fn().mockResolvedValue({ transactionId: 'tx-1' })
const deleteMock = vi.fn()

// Ordered record of every op staged on the transaction, so tests can assert
// not just WHAT was staged but the ORDER (delete must come last).
const txOrder: Array<'patch' | 'delete' | 'create'> = []

// Each `.patch(id, fn)` invokes `fn` with a fake, chainable patch builder whose
// `.set()`/`.unset()`/`.ifRevisionId()` record their arguments, so tests can
// assert the exact ops AND that each referencing-doc patch is revision-guarded.
const patchOps: Array<{
  id: string
  set: Record<string, unknown>
  unset?: string[]
  rev?: string
}> = []
const patchMock = vi.fn(
  (
    id: string,
    fn: (p: {
      set: (o: Record<string, unknown>) => unknown
      unset: (keys: string[]) => unknown
    }) => unknown,
  ) => {
    const op = { id, set: {} as Record<string, unknown> } as {
      id: string
      set: Record<string, unknown>
      unset?: string[]
      rev?: string
    }
    const builder = {
      set: (o: Record<string, unknown>) => {
        op.set = o
        return builder
      },
      unset: (keys: string[]) => {
        op.unset = keys
        return builder
      },
      ifRevisionId: (rev: string) => {
        op.rev = rev
        return builder
      },
    }
    fn(builder)
    patchOps.push(op)
    txOrder.push('patch')
    return transactionApi
  },
)

const createdDocs: Array<Record<string, unknown>> = []
const deletedIds: string[] = []
const transactionApi = {
  patch: patchMock,
  create: (doc: Record<string, unknown>) => {
    createdDocs.push(doc)
    txOrder.push('create')
    return transactionApi
  },
  delete: (id: string) => {
    deletedIds.push(id)
    deleteMock(id)
    txOrder.push('delete')
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
    _rev: 'rev-talk-1',
    speakers: [ref('other', 'k0'), ref(LOSER, 'k1')],
  },
  {
    _id: 'conf-1',
    _type: 'conference',
    _rev: 'rev-conf-1',
    organizers: [ref(LOSER, 'k2')],
  },
  // A reference nested inside an object inside an array — the deep walk must
  // still repoint it.
  {
    _id: 'review-1',
    _type: 'review',
    _rev: 'rev-review-1',
    entries: [{ note: 'x', by: ref(LOSER) }],
  },
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
  createdDocs.length = 0
  txOrder.length = 0
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
    expect(preview?.referenceRepointsByType).toEqual({
      talk: 1,
      conference: 1,
      review: 1,
    })
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

    // Reference nested in an object inside an array is repointed too.
    const reviewPatch = patchOps.find((p) => p.id === 'review-1')!
    expect(reviewPatch.set.entries).toEqual([
      { note: 'x', by: { _type: 'reference', _ref: SURVIVOR } },
    ])

    // Survivor identity union patch.
    const survivorPatch = patchOps.find((p) => p.id === SURVIVOR)!
    expect(survivorPatch.set.providers).toEqual(['github:1', 'linkedin:2'])
    expect(survivorPatch.set.knownEmails).toEqual([
      'ada@example.com',
      'ada.l@work.io',
    ])

    // Referencing-doc repoints are revision-guarded so a concurrent edit aborts
    // the whole transaction instead of being clobbered.
    expect(talkPatch.rev).toBeTruthy()
    expect(confPatch.rev).toBeTruthy()

    // Loser deleted, and deletion is the LAST op — after every patch was staged.
    expect(deletedIds).toEqual([LOSER])
    expect(deleteMock).toHaveBeenCalledWith(LOSER)
    expect(txOrder[txOrder.length - 1]).toBe('delete')
    expect(txOrder.slice(0, -1).every((op) => op === 'patch')).toBe(true)
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

describe('mergeSpeakers — deterministic-doc reconciliation (M4)', () => {
  const CONVPREF_LOSER = `convpref.conv-1.${LOSER}`
  const CONVPREF_SURVIVOR = `convpref.conv-1.${SURVIVOR}`
  const NOTIF_LOSER = `notification.message.conv-1.${LOSER}`
  const NOTIF_SURVIVOR = `notification.message.conv-1.${SURVIVOR}`

  // The loser's deterministic docs, repointed-in-place by the generic path would
  // strand them under the loser key. One MERGES (survivor pref exists), one
  // RECREATEs (no survivor notification yet).
  const collisionDocs = [
    {
      _id: CONVPREF_LOSER,
      _type: 'conversationPreference',
      _rev: 'rev-cp-loser',
      conversation: ref('conv-1'),
      speaker: ref(LOSER),
      muted: true,
    },
    {
      _id: NOTIF_LOSER,
      _type: 'notification',
      _rev: 'rev-nt-loser',
      conversation: ref('conv-1'),
      recipient: ref(LOSER),
      notificationType: 'message_received',
      count: 2,
    },
  ]

  // The survivor's canonical pref exists (NOT muted) → MERGE to muted. The
  // survivor has NO canonical notification → the loser's is RECREATED.
  const survivorCanonicalDocs = [
    {
      _id: CONVPREF_SURVIVOR,
      _type: 'conversationPreference',
      _rev: 'rev-cp-surv',
      conversation: ref('conv-1'),
      speaker: ref(SURVIVOR),
      muted: false,
    },
  ]

  beforeEach(() => {
    fetchMock.mockImplementation(
      (query: string, params: Record<string, unknown> = {}) => {
        if (query.includes('_id == $id')) {
          if (params.id === SURVIVOR) return Promise.resolve(survivorDoc)
          if (params.id === LOSER) return Promise.resolve(loserDoc)
          return Promise.resolve(null)
        }
        if (query.includes('references($loserId)')) {
          return Promise.resolve(collisionDocs)
        }
        if (query.includes('_id in $ids')) {
          return Promise.resolve(survivorCanonicalDocs)
        }
        return Promise.resolve(null)
      },
    )
  })

  it('MERGEs the loser pref onto the canonical id (more-restrictive mute wins) and deletes the loser doc', async () => {
    const { committed, err } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
    })
    expect(err).toBeNull()
    expect(committed).toBe(true)

    // The canonical survivor pref is patched to muted; NO patch keyed by the
    // loser-suffixed id survives.
    const prefPatch = patchOps.find((p) => p.id === CONVPREF_SURVIVOR)!
    expect(prefPatch.set.muted).toBe(true)
    expect(patchOps.some((p) => p.id === CONVPREF_LOSER)).toBe(false)

    // The loser-suffixed pref doc is deleted (never left repointed-but-stranded).
    expect(deletedIds).toContain(CONVPREF_LOSER)
  })

  it('RECREATEs a loser notification under the canonical id with the recipient repointed, and deletes the loser doc', async () => {
    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
    })

    const recreated = createdDocs.find((d) => d._id === NOTIF_SURVIVOR)!
    expect(recreated).toBeDefined()
    // Recipient ref now points at the survivor; system meta is stripped.
    expect(recreated.recipient).toEqual({ _type: 'reference', _ref: SURVIVOR })
    expect(recreated._rev).toBeUndefined()
    expect(recreated.count).toBe(2)

    expect(deletedIds).toContain(NOTIF_LOSER)
    // The loser SPEAKER doc is still deleted LAST.
    expect(txOrder[txOrder.length - 1]).toBe('delete')
    expect(deletedIds[deletedIds.length - 1]).toBe(LOSER)
  })
})
