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

import {
  mergeSpeakers,
  MergeValidationError,
  MERGE_HISTORY_MAX_ENTRIES,
} from './merge'

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
  _rev: 'rev-survivor',
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

    // …and so is the SURVIVOR patch. Its fields were read at plan time and the
    // operator's per-field choices were made against that snapshot, so a profile
    // edit landing in between must 409 the transaction, not be clobbered.
    expect(survivorPatch.rev).toBe('rev-survivor')

    // Loser deleted, and deletion is the LAST op — after every patch was staged.
    expect(deletedIds).toEqual([LOSER])
    expect(deleteMock).toHaveBeenCalledWith(LOSER)
    expect(txOrder[txOrder.length - 1]).toBe('delete')
    expect(txOrder.slice(0, -1).every((op) => op === 'patch')).toBe(true)
  })

  it('applies an operator field selection, and the dry run predicts it exactly', async () => {
    // The survivor's address is the organizer-typed one and would be kept by the
    // recommendation here (both sides verified); the operator flips it.
    const { preview } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
      dryRun: true,
      fieldSelections: { email: 'loser' },
    })
    expect(preview?.fields.find((f) => f.field === 'email')?.selected).toBe(
      'loser',
    )

    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
      fieldSelections: { email: 'loser' },
    })
    const survivorPatch = patchOps.find((p) => p.id === SURVIVOR)!
    expect(survivorPatch.set.email).toBe('ada.l@work.io')
    expect(
      preview?.fields.find((f) => f.field === 'email')?.survivorValue,
    ).toBe('ada@example.com')
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

// --- Issue #1027 items 1-3, in the ONE transaction -------------------------

describe('mergeSpeakers — unreconciled reference sites (#1027 items 1-3)', () => {
  const REMINDER_LOSER = `reminder.cfp-open.conf-1.${LOSER}`
  const REMINDER_SURVIVOR = `reminder.cfp-open.conf-1.${SURVIVOR}`

  // Every collision case at once: both speakers hold a speaker-ticket marker on
  // the same talk, both participate in the same conversation, and both have a
  // marker for the same reminder + conference.
  const docs = [
    {
      _id: 'talk-1',
      _type: 'talk',
      _rev: 'rev-talk-1',
      speakers: [ref(SURVIVOR, 'k1'), ref(LOSER, 'k2')],
      issuedSpeakerTickets: [
        {
          _key: `speaker-ticket-${LOSER}`,
          speakerId: LOSER,
          email: 'ada.l@work.io',
          emailedAt: '2026-05-01T10:00:00Z',
        },
        {
          _key: `speaker-ticket-${SURVIVOR}`,
          speakerId: SURVIVOR,
          email: 'ada@example.com',
          emailedAt: '2026-06-01T10:00:00Z',
        },
      ],
    },
    {
      _id: 'conv-1',
      _type: 'conversation',
      _rev: 'rev-conv-1',
      participants: [
        { _key: 'p1', partyType: 'speaker', speaker: ref(SURVIVOR) },
        { _key: 'g', partyType: 'group', group: 'organizers' },
        { _key: 'p2', partyType: 'speaker', speaker: ref(LOSER) },
      ],
    },
    {
      _id: REMINDER_LOSER,
      _type: 'scheduledReminderLog',
      _rev: 'rev-rem-loser',
      key: 'cfp-open',
      speaker: ref(LOSER),
      count: 2,
      lastSentAt: '2026-05-10T00:00:00Z',
    },
  ]

  const survivorCanonicalDocs = [
    {
      _id: REMINDER_SURVIVOR,
      _type: 'scheduledReminderLog',
      _rev: 'rev-rem-surv',
      key: 'cfp-open',
      speaker: ref(SURVIVOR),
      count: 1,
      lastSentAt: '2026-05-01T00:00:00Z',
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
        if (query.includes('references($loserId)')) return Promise.resolve(docs)
        if (query.includes('_id in $ids')) {
          return Promise.resolve(survivorCanonicalDocs)
        }
        return Promise.resolve(null)
      },
    )
  })

  it('also sweeps talks that name the loser ONLY in issuedSpeakerTickets', async () => {
    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
      dryRun: true,
    })
    const query = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .find((q) => q.includes('references($loserId)'))!
    // A plain string is invisible to `references()`, so the predicate must name
    // the field explicitly or a talk the loser was removed from keeps the dead id.
    expect(query).toContain('issuedSpeakerTickets[].speakerId')
  })

  it('repoints the ticket marker, dedups the participants and reconciles the reminder in ONE transaction', async () => {
    const { preview, committed, err } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
    })
    expect(err).toBeNull()
    expect(committed).toBe(true)
    expect(commitMock).toHaveBeenCalledTimes(1)

    // 1. Both ticket markers collapse into ONE survivor-keyed entry.
    const talkPatch = patchOps.find((p) => p.id === 'talk-1')!
    expect(talkPatch.set.issuedSpeakerTickets).toEqual([
      {
        _key: `speaker-ticket-${SURVIVOR}`,
        speakerId: SURVIVOR,
        email: 'ada.l@work.io',
        emailedAt: '2026-05-01T10:00:00Z',
      },
    ])
    expect(talkPatch.rev).toBe('rev-talk-1')

    // 3. The conversation keeps ONE survivor party (first `_key`) + the group.
    const convPatch = patchOps.find((p) => p.id === 'conv-1')!
    expect(convPatch.set.participants).toEqual([
      { _key: 'p1', partyType: 'speaker', speaker: ref(SURVIVOR) },
      { _key: 'g', partyType: 'group', group: 'organizers' },
    ])
    expect(convPatch.rev).toBe('rev-conv-1')

    // 2. The reminder marker is MERGED onto the survivor-keyed id (counts summed,
    // later lastSentAt kept) and the loser-keyed marker is deleted — never left
    // repointed-but-loser-keyed for the cron to miss.
    const reminderPatch = patchOps.find((p) => p.id === REMINDER_SURVIVOR)!
    expect(reminderPatch.set).toEqual({
      count: 3,
      lastSentAt: '2026-05-10T00:00:00Z',
    })
    expect(patchOps.some((p) => p.id === REMINDER_LOSER)).toBe(false)
    expect(deletedIds).toContain(REMINDER_LOSER)

    // Still one transaction, loser deleted LAST.
    expect(deletedIds[deletedIds.length - 1]).toBe(LOSER)
    expect(txOrder[txOrder.length - 1]).toBe('delete')

    // The dry run predicts exactly this.
    expect(preview?.referenceRepointsByType).toEqual({
      talk: 2,
      conversation: 1,
    })
    expect(preview?.reconciledDeterministicDocCount).toBe(1)
  })

  it('dry run writes nothing and returns the same plan', async () => {
    const { preview } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
      dryRun: true,
    })
    expect(commitMock).not.toHaveBeenCalled()
    expect(preview?.referenceRepointsByType).toEqual({
      talk: 2,
      conversation: 1,
    })
    expect(preview?.reconciledDeterministicDocCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Merge recovery trail (#1027 item 9)
//
// The merge is irreversible and there is deliberately NO undo, so the entry the
// survivor keeps is the only artifact a human can recover from. These pin the
// properties that make it worth having: it rides the survivor's OWN patch (so a
// failed merge leaves none), it carries the COMPLETE deleted document, a chain
// of merges keeps its whole trail, and the trail is bounded.
// ---------------------------------------------------------------------------

type MergeEntry = {
  _key: string
  mergedAt: string
  actorId: string
  actorName?: string
  survivorId: string
  loserId: string
  snapshot: string
}

describe('mergeSpeakers — merge recovery trail', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(routeFetch)
  })

  /** The `mergedWith` array staged onto the survivor. */
  function trail(): MergeEntry[] {
    const survivorPatch = patchOps.find((p) => p.id === SURVIVOR)
    return (survivorPatch?.set.mergedWith ?? []) as MergeEntry[]
  }

  it('rides the SURVIVOR patch in the merge transaction, delete still last', async () => {
    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1', name: 'Admin' },
    })

    expect(trail()).toHaveLength(1)
    expect(trail()[0]._key).toBe(`merge-${LOSER}`)
    // ONE transaction, no separate audit document, delete last.
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(createdDocs).toEqual([])
    expect(txOrder[txOrder.length - 1]).toBe('delete')
    expect(deletedIds).toEqual([LOSER])
    // The survivor patch is still revision-guarded, so a concurrent profile
    // edit 409s the transaction rather than being clobbered by the trail write.
    expect(patchOps.find((p) => p.id === SURVIVOR)?.rev).toBe('rev-survivor')
  })

  it('carries the COMPLETE deleted document, the overwritten survivor values and the choices', async () => {
    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1', name: 'Admin' },
      fieldSelections: { email: 'loser' },
    })

    const entry = trail()[0]
    expect(entry.actorId).toBe('admin-1')
    expect(entry.actorName).toBe('Admin')
    expect(entry.survivorId).toBe(SURVIVOR)
    expect(entry.loserId).toBe(LOSER)

    const snapshot = JSON.parse(entry.snapshot)
    // EVERY field of the loser, as stored — the recovery artifact.
    expect(snapshot.loser).toEqual(loserDoc)
    // The survivor values this merge overwrote.
    expect(snapshot.survivorBefore.email).toBe(survivorDoc.email)
    // The resolved choices, including that the operator overrode the server.
    expect(
      snapshot.fields.find((f: { field: string }) => f.field === 'email'),
    ).toMatchObject({
      selected: 'loser',
      recommended: 'survivor',
      overridden: true,
    })
    // The reference-repoint summary already computed for the plan.
    expect(snapshot.references.referenceRepointsByType).toEqual({
      talk: 1,
      conference: 1,
      review: 1,
    })
  })

  // THE CHAIN CASE. A → B then B → C: B is deleted by the second merge, so its
  // trail has to move onto C or A's record is lost with it.
  it('carries the LOSER trail forward so a chain of merges keeps its history', async () => {
    const olderEntry = {
      _key: 'merge-speaker-first',
      _type: 'speakerMergeRecord',
      mergedAt: '2026-01-01T00:00:00.000Z',
      actorId: 'admin-0',
      survivorId: LOSER,
      loserId: 'speaker-first',
      snapshot: '{"loser":{"_id":"speaker-first"}}',
    }
    fetchMock.mockImplementation(
      (query: string, params: Record<string, unknown> = {}) => {
        if (query.includes('_id == $id') && params.id === LOSER) {
          return Promise.resolve({ ...loserDoc, mergedWith: [olderEntry] })
        }
        return routeFetch(query, params)
      },
    )

    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
    })

    const entries = trail()
    expect(entries.map((e) => e.loserId)).toEqual([LOSER, 'speaker-first'])
    // The carried-forward entry keeps the survivor it was ORIGINALLY folded
    // into, so the chain is readable rather than rewritten.
    expect(entries[1].survivorId).toBe(LOSER)
    // …and the new entry's snapshot does NOT nest the trail it just copied out,
    // or a chain of merges would grow quadratically.
    expect(JSON.parse(entries[0].snapshot).loser.mergedWith).toBeUndefined()
  })

  it('caps the trail, dropping the globally oldest entries', async () => {
    const survivorEntries = Array.from({ length: 8 }, (_, i) => ({
      _key: `merge-old-${i}`,
      _type: 'speakerMergeRecord',
      // `old-7` is the newest of these, `old-0` the oldest.
      mergedAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      actorId: 'admin-0',
      survivorId: SURVIVOR,
      loserId: `speaker-old-${i}`,
      snapshot: '{}',
    }))
    const carried = Array.from({ length: 5 }, (_, i) => ({
      ...survivorEntries[0],
      _key: `merge-carried-${i}`,
      mergedAt: `2025-0${i + 1}-01T00:00:00.000Z`,
      loserId: `speaker-carried-${i}`,
    }))
    fetchMock.mockImplementation(
      (query: string, params: Record<string, unknown> = {}) => {
        if (query.includes('_id == $id') && params.id === SURVIVOR) {
          return Promise.resolve({
            ...survivorDoc,
            mergedWith: survivorEntries,
          })
        }
        if (query.includes('_id == $id') && params.id === LOSER) {
          return Promise.resolve({ ...loserDoc, mergedWith: carried })
        }
        return routeFetch(query, params)
      },
    )

    await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
    })

    const entries = trail()
    expect(entries).toHaveLength(MERGE_HISTORY_MAX_ENTRIES)
    // Newest first: this merge, the survivor's eight (2026), then the NEWEST of
    // the carried-forward 2025 entries — which is the point of carrying forward
    // FIRST and capping second. The four older carried entries are the globally
    // oldest and are what the cap drops; a naive "survivor wins" truncation
    // would have dropped all five.
    expect(entries.map((e) => e.loserId)).toEqual([
      LOSER,
      'speaker-old-7',
      'speaker-old-6',
      'speaker-old-5',
      'speaker-old-4',
      'speaker-old-3',
      'speaker-old-2',
      'speaker-old-1',
      'speaker-old-0',
      'speaker-carried-4',
    ])
    // Every `_key` is unique, or Sanity rejects the array.
    expect(new Set(entries.map((e) => e._key)).size).toBe(entries.length)
  })

  it('writes NO trail when the merge fails before the transaction', async () => {
    const { committed, err } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: 'speaker-missing',
      actor: { _id: 'admin-1' },
    })

    expect(committed).toBe(false)
    expect(err).toBeInstanceOf(MergeValidationError)
    expect(patchOps).toEqual([])
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('writes NO trail when the transaction itself fails', async () => {
    commitMock.mockRejectedValueOnce(new Error('409 conflict'))

    const { committed, err } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
    })

    // The trail rides the SAME transaction, so a rejected commit lands nothing
    // at all — no trail, no delete, no repoint.
    expect(committed).toBe(false)
    expect(err).toBeTruthy()
  })

  it('a DRY RUN plans no trail and writes nothing', async () => {
    const { preview, committed } = await mergeSpeakers({
      survivorId: SURVIVOR,
      loserId: LOSER,
      actor: { _id: 'admin-1' },
      dryRun: true,
    })

    expect(committed).toBe(false)
    expect(preview).toBeTruthy()
    expect(patchOps).toEqual([])
    expect(commitMock).not.toHaveBeenCalled()
  })
})
