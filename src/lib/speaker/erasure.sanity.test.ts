/**
 * Transaction-boundary tests for right-to-erasure Phase 1.
 *
 * These pin what {@link eraseSpeakerInPlace} actually STAGES against Sanity —
 * the ordering, the revision guards, the image-asset delete happening AFTER the
 * transaction and only when the asset is orphaned, and the two refusals that
 * must write nothing at all.
 *
 * Shape follows `merge.sanity.test.ts`: a hand-built chainable fake so the test
 * can assert the exact ops and the order they were staged in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Sanity client mock (transaction boundary) -----------------------------

const fetchMock = vi.fn()
const commitMock = vi.fn().mockResolvedValue({ transactionId: 'tx-1' })
const clientDeleteMock = vi.fn().mockResolvedValue({})

const txOrder: Array<'patch' | 'delete'> = []

interface RecordedPatch {
  id: string
  set?: Record<string, unknown>
  setIfMissing?: Record<string, unknown>
  unset?: string[]
  insert?: { at: string; selector: string; items: unknown[] }
  rev?: string
}

const patchOps: RecordedPatch[] = []
const deletedIds: string[] = []

const patchMock = vi.fn((id: string, fn: (p: unknown) => unknown) => {
  const op: RecordedPatch = { id }
  const builder = {
    set: (o: Record<string, unknown>) => {
      op.set = o
      return builder
    },
    setIfMissing: (o: Record<string, unknown>) => {
      op.setIfMissing = o
      return builder
    },
    unset: (keys: string[]) => {
      op.unset = keys
      return builder
    },
    insert: (at: string, selector: string, items: unknown[]) => {
      op.insert = { at, selector, items }
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
})

const transactionApi = {
  patch: patchMock,
  delete: (id: string) => {
    deletedIds.push(id)
    txOrder.push('delete')
    return transactionApi
  },
  commit: commitMock,
}

const transactionMock = vi.fn(() => transactionApi)

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    transaction: () => transactionMock(),
    delete: (...args: unknown[]) => clientDeleteMock(...args),
  },
}))

import { eraseSpeakerInPlace, verifySpeakerErasure } from './erasure'

const SPEAKER = 'abcd1234efgh5678ijkl90'
const ASSET = 'image-abc-500x500-png'

function ref(id: string, key?: string) {
  return key
    ? { _type: 'reference', _ref: id, _key: key }
    : { _type: 'reference', _ref: id }
}

/** Mutable per-test world the fetch router serves from. */
let world: {
  speaker: Record<string, unknown> | null
  referencing: Array<Record<string, unknown>>
  ticketTalks: Array<Record<string, unknown>>
  emailKeyedDocs: Array<{ _id: string; _type: string }>
  slugConflicts: Array<{ _id: string }>
  assetReferences: number
}

function resetWorld() {
  world = {
    speaker: {
      _id: SPEAKER,
      _type: 'speaker',
      _rev: 'rev-speaker',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      knownEmails: ['ada@example.com'],
      slug: { _type: 'slug', current: 'ada-lovelace' },
      bio: 'Writes programs.',
      image: { asset: ref(ASSET) },
    },
    referencing: [],
    ticketTalks: [],
    emailKeyedDocs: [],
    slugConflicts: [],
    assetReferences: 0,
  }
}

function routeFetch(query: string) {
  if (query.includes('references($assetId)')) {
    return Promise.resolve({ n: world.assetReferences })
  }
  if (query.includes('_id == $speakerId')) return Promise.resolve(world.speaker)
  if (query.includes('references($speakerId)')) {
    return Promise.resolve(world.referencing)
  }
  if (query.includes('issuedSpeakerTickets')) {
    return Promise.resolve(world.ticketTalks)
  }
  if (query.includes('lower(invitedEmail)')) {
    return Promise.resolve(world.emailKeyedDocs)
  }
  if (query.includes('slug.current == $targetSlug')) {
    return Promise.resolve(world.slugConflicts)
  }
  return Promise.resolve(null)
}

beforeEach(() => {
  vi.clearAllMocks()
  patchOps.length = 0
  deletedIds.length = 0
  txOrder.length = 0
  resetWorld()
  fetchMock.mockImplementation((query: string) => routeFetch(query))
  commitMock.mockResolvedValue({ transactionId: 'tx-1' })
  clientDeleteMock.mockResolvedValue({})
})

// ---------------------------------------------------------------------------

describe('the speaker patch is staged as replace-plus-unset in one transaction', () => {
  it('commits once, sets the placeholder values and unsets the rest', async () => {
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })

    expect(result.err).toBeNull()
    expect(result.committed).toBe(true)
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(transactionMock).toHaveBeenCalledTimes(1)

    const speakerPatch = patchOps.find((p) => p.id === SPEAKER)
    expect(speakerPatch?.set).toEqual({
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
    })
    expect(speakerPatch?.setIfMissing).toHaveProperty('erasedAt')
    expect(speakerPatch?.unset).toContain('knownEmails')
    expect(speakerPatch?.unset).toContain('image')
    expect(speakerPatch?.unset).toContain('bio')
  })

  it('revision-guards the SPEAKER patch itself, not just the dependents', async () => {
    await eraseSpeakerInPlace({ speakerId: SPEAKER, actor: 'op' })
    expect(patchOps.find((p) => p.id === SPEAKER)?.rev).toBe('rev-speaker')
  })

  it('revision-guards every DEPENDENT patch so a concurrent edit 409s the run', async () => {
    world.referencing = [
      {
        _id: 'conf-1',
        _type: 'conference',
        _rev: 'rev-conf',
        organizers: [ref(SPEAKER, 'k1'), ref('other', 'k2')],
      },
    ]
    await eraseSpeakerInPlace({ speakerId: SPEAKER, actor: 'op' })
    expect(patchOps.find((p) => p.id === 'conf-1')?.rev).toBe('rev-conf')
  })

  it('stages the email-keyed deletes in the SAME transaction that destroys the match-set', async () => {
    world.emailKeyedDocs = [{ _id: 'tok-1', _type: 'emailSignInToken' }]
    world.referencing = [
      {
        _id: 'inv-1',
        _type: 'coSpeakerInvitation',
        invitedEmail: 'ada@example.com',
        invitedBy: ref('other'),
      },
    ]
    await eraseSpeakerInPlace({ speakerId: SPEAKER, actor: 'op' })

    // One transaction, one commit: the deletes cannot be orphaned by a speaker
    // patch that lands without them.
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(deletedIds.sort()).toEqual(['inv-1', 'tok-1'])
    expect(patchOps.some((p) => p.id === SPEAKER)).toBe(true)
  })
})

describe('the image asset is deleted AFTER the reference is unset', () => {
  it('deletes the asset when nothing else references it', async () => {
    world.assetReferences = 0
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })

    expect(result.imageAsset).toEqual({
      id: ASSET,
      deleted: true,
      remainingReferences: 0,
    })
    expect(clientDeleteMock).toHaveBeenCalledWith(ASSET)
    // Ordering: the transaction committed before the asset delete was issued.
    expect(commitMock.mock.invocationCallOrder[0]).toBeLessThan(
      clientDeleteMock.mock.invocationCallOrder[0],
    )
  })

  it('KEEPS the asset when another document still references it', async () => {
    world.assetReferences = 1
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })

    expect(clientDeleteMock).not.toHaveBeenCalled()
    expect(result.imageAsset).toEqual({
      id: ASSET,
      deleted: false,
      remainingReferences: 1,
    })
  })

  it('KEEPS the asset when the reference count cannot be read — fails closed', async () => {
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('references($assetId)')) {
        return Promise.reject(new Error('network'))
      }
      return routeFetch(query)
    })

    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })
    expect(clientDeleteMock).not.toHaveBeenCalled()
    expect(result.imageAsset.remainingReferences).toBe(-1)
    expect(result.imageAsset.deleted).toBe(false)
  })

  it('reports the asset id when the delete itself fails, so the operator can finish it', async () => {
    clientDeleteMock.mockRejectedValue(new Error('nope'))
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })
    expect(result.imageAsset.id).toBe(ASSET)
    expect(result.imageAsset.deleted).toBe(false)
    expect(result.committed).toBe(true)
  })

  it('does nothing when the speaker has no uploaded image', async () => {
    world.speaker = { ...world.speaker!, image: undefined }
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })
    expect(result.imageAsset.id).toBeNull()
    expect(clientDeleteMock).not.toHaveBeenCalled()
  })
})

describe('refusals write NOTHING', () => {
  it('refuses the last organizer and never opens a transaction', async () => {
    world.referencing = [
      {
        _id: 'conf-solo',
        _type: 'conference',
        _rev: 'r1',
        organizers: [ref(SPEAKER, 'k1')],
      },
    ]

    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })

    expect(result.committed).toBe(false)
    expect(result.err?.message).toContain('only organizer of conference')
    expect(transactionMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
    expect(clientDeleteMock).not.toHaveBeenCalled()
    // The plan is still returned so the operator can see WHY.
    expect(result.plan?.refusals).toHaveLength(1)
  })

  it('refuses a slug already held by another speaker and writes nothing', async () => {
    world.slugConflicts = [{ _id: 'someone-else' }]
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })
    expect(result.committed).toBe(false)
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('returns an error, not a commit, for a missing speaker', async () => {
    world.speaker = null
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })
    expect(result.err?.message).toContain('not found')
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('dryRun computes the plan and stages nothing', async () => {
    world.referencing = [
      {
        _id: 'ts-1',
        _type: 'travelSupport',
        _rev: 'r1',
        speaker: ref(SPEAKER),
        status: 'draft',
        bankingDetails: { beneficiaryName: 'x' },
      },
    ]
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
      dryRun: true,
    })

    expect(result.plan?.documentPatches).toHaveLength(1)
    expect(result.committed).toBe(false)
    expect(patchMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
    expect(clientDeleteMock).not.toHaveBeenCalled()
  })
})

describe('a PAID travel-support record never reaches the transaction', () => {
  it('stages no patch for it, and stages one for the unpaid sibling', async () => {
    world.referencing = [
      {
        _id: 'ts-paid',
        _type: 'travelSupport',
        _rev: 'r1',
        speaker: ref(SPEAKER),
        status: 'paid',
        bankingDetails: { beneficiaryName: 'x' },
      },
      {
        _id: 'ts-draft',
        _type: 'travelSupport',
        _rev: 'r2',
        speaker: ref(SPEAKER),
        status: 'draft',
        bankingDetails: { beneficiaryName: 'x' },
      },
    ]

    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })

    expect(patchOps.map((p) => p.id)).toContain('ts-draft')
    expect(patchOps.map((p) => p.id)).not.toContain('ts-paid')
    expect(deletedIds).not.toContain('ts-paid')
    expect(result.plan?.retainedBanking).toEqual([
      { id: 'ts-paid', status: 'paid', reason: 'paid' },
    ])
  })
})

describe('idempotency at the transaction boundary', () => {
  it('an already-erased speaker stages nothing and commits nothing', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      _rev: 'rev2',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
      organizations: [ref('org-1')],
    }
    world.slugConflicts = [{ _id: SPEAKER }]

    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })

    expect(result.err).toBeNull()
    expect(result.plan?.noop).toBe(true)
    expect(result.committed).toBe(false)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('cache revalidation is reported honestly', () => {
  it('calls the injected revalidate for each tag', async () => {
    world.referencing = [
      {
        _id: 'conf-1',
        _type: 'conference',
        _rev: 'r1',
        organizers: [ref(SPEAKER, 'k1'), ref('other', 'k2')],
      },
    ]
    const seen: string[] = []
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
      revalidate: (tag) => {
        seen.push(tag)
      },
    })

    expect(seen).toEqual([
      'content:speakers',
      'content:speaker-detail',
      'sanity:conference-conf-1',
    ])
    expect(result.cache.revalidated).toBe(true)
  })

  it('reports revalidated:false with the tags when no revalidate is supplied', async () => {
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
    })
    expect(result.cache.revalidated).toBe(false)
    expect(result.cache.error).toContain('runbook')
    expect(result.cache.tags).toContain('content:speaker-detail')
  })

  it('does not claim success when revalidate throws', async () => {
    const result = await eraseSpeakerInPlace({
      speakerId: SPEAKER,
      actor: 'op',
      revalidate: () => {
        throw new Error('outside a request scope')
      },
    })
    expect(result.cache.revalidated).toBe(false)
    expect(result.cache.error).toContain('outside a request scope')
  })
})

describe('the post-erasure verification query', () => {
  it('reports clean for a fully erased speaker', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
    }
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(true)
  })

  it('is NOT clean when an identifying field survives', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
      bio: 'Writes programs.',
    }
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(false)
    expect(verification?.residual.speakerFields).toEqual(['bio'])
  })

  it('is NOT clean when erasedAt is missing', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
    }
    expect((await verifySpeakerErasure(SPEAKER))?.clean).toBe(false)
  })

  it('is NOT clean when a residual dependent document survives', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
    }
    world.referencing = [
      { _id: 'n-1', _type: 'notification', recipient: ref(SPEAKER) },
      { _id: 'n-2', _type: 'notification', recipient: ref(SPEAKER) },
    ]

    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(false)
    expect(verification?.residual.notifications).toBe(2)
  })

  it('is NOT clean when an unpaid travel record still holds banking details', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
    }
    world.referencing = [
      {
        _id: 'ts-1',
        _type: 'travelSupport',
        speaker: ref(SPEAKER),
        status: 'draft',
        bankingDetails: { beneficiaryName: 'x' },
      },
    ]
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(false)
    expect(verification?.residual.unpaidBankingDetails).toBe(1)
  })

  it('does NOT count a PAID record as residual — it is retained by design', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
    }
    world.referencing = [
      {
        _id: 'ts-paid',
        _type: 'travelSupport',
        speaker: ref(SPEAKER),
        status: 'paid',
        bankingDetails: { beneficiaryName: 'x' },
      },
    ]
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.residual.unpaidBankingDetails).toBe(0)
    expect(verification?.clean).toBe(true)
  })

  it('is NOT clean when the image asset still exists on the CDN', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      erasedAt: '2026-08-14T10:00:00.000Z',
      image: { asset: ref(ASSET) },
    }
    world.assetReferences = 1
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(false)
    // `image` itself is still set, so it also shows up as a residual field.
    expect(verification?.residual.speakerFields).toContain('image')
  })

  it('is NOT clean when an unaccepted invitation survives', async () => {
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      knownEmails: ['ada@example.com'],
      erasedAt: '2026-08-14T10:00:00.000Z',
    }
    world.emailKeyedDocs = [
      { _id: 'inv-pending', _type: 'coSpeakerInvitation' },
    ]
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(false)
    expect(verification?.residual.emailKeyedInvitations).toBe(1)
  })

  it('is NOT clean when an organizerInvitation to the subject survives', async () => {
    // The regression this whole finding is about: before organizerInvitation
    // was swept, verification reported CLEAN over a live invitation carrying
    // the person's address and a bearer token to their mailbox.
    world.speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      name: 'Deleted speaker',
      slug: { _type: 'slug', current: 'deleted-abcd1234' },
      email: 'deleted-abcd1234@anonymous.invalid',
      knownEmails: ['ada@example.com'],
      erasedAt: '2026-08-14T10:00:00.000Z',
    }
    world.emailKeyedDocs = [{ _id: 'orginv-1', _type: 'organizerInvitation' }]
    const verification = await verifySpeakerErasure(SPEAKER)
    expect(verification?.clean).toBe(false)
    expect(verification?.residual.emailKeyedInvitations).toBe(1)
  })

  it('returns null for a speaker that does not exist', async () => {
    world.speaker = null
    expect(await verifySpeakerErasure(SPEAKER)).toBeNull()
  })
})
