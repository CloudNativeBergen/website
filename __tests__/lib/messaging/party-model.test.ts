/**
 * @vitest-environment node
 *
 * Party data model (messaging G1) — representation-only foundation.
 *
 * Three concerns, all proving G1's core guarantee: the NEW `participants[]` /
 * `authorParty` representation is BIT-IDENTICAL to what the legacy fields express.
 *
 * 1. RESOLVER EQUIVALENCE MATRIX — `resolveParticipants` yields the SAME party
 *    list whether it derives from the legacy fields (participants absent) or reads
 *    a dual-written `participants[]`, for every thread shape. The "dual-written"
 *    arrays are hand-authored per the locked design (NOT produced by the derive
 *    path), so the test genuinely proves derive-logic and stored-format agree.
 * 2. DUAL-WRITE COVERAGE — both conversation creators and `addMessage` write the
 *    exact party shapes ALONGSIDE the unchanged legacy fields.
 * 3. SCHEMA VALIDATION — the pure `validateConversationParticipant` congruence
 *    rule (partyType ↔ identity field) the `conversationParticipant` object uses.
 *
 * The Sanity clients are mocked so writes are asserted exactly; nanoid is fixed so
 * `_key`s and ids are deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn(), create: vi.fn(), patch: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => [] as string[]),
}))

// Fixed so message ids, general-conversation ids and every array `_key` are
// deterministic ('FIXED').
vi.mock('nanoid', () => ({ nanoid: () => 'FIXED' }))

import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  resolveParticipants,
  resolveParticipantIds,
  resolveRecipients,
  canAccessConversation,
  ensureProposalConversation,
  createGeneralConversation,
  addMessage,
  syncProposalConversationParticipants,
} from '@/lib/messaging/sanity'
import {
  validateConversationParticipant,
  type ConversationParty,
  type ConversationWithContext,
} from '@/lib/messaging/types'

type LooseMock = ReturnType<typeof vi.fn>
const writeMock = clientWrite as unknown as {
  transaction: LooseMock
  create: LooseMock
  patch: LooseMock
}

function installTransaction() {
  const tx = {
    create: vi.fn((_doc?: unknown) => tx),
    createIfNotExists: vi.fn((_doc?: unknown) => tx),
    patch: vi.fn((_id?: string, _ops?: unknown) => tx),
    commit: vi.fn(async () => ({})),
  }
  writeMock.transaction.mockReturnValue(tx)
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// Serialized (stored) party shapes, as the dual-write emits them: array items
// carry a `_key`; speaker refs are WEAK.
const storedSpeaker = (ref: string) => ({
  _key: 'FIXED',
  partyType: 'speaker',
  speaker: { _type: 'reference', _ref: ref, _weak: true },
})
const storedOrganizersGroup = {
  _key: 'FIXED',
  partyType: 'group',
  group: 'organizers',
}

// ---------------------------------------------------------------------------
// 1. Resolver equivalence matrix
// ---------------------------------------------------------------------------

/** A thread-shape case: its legacy fields and the hand-authored dual-written array. */
interface Shape {
  name: string
  legacy: Pick<
    ConversationWithContext,
    | 'conversationType'
    | 'proposalSpeakerIds'
    | 'createdById'
    | 'subjectSpeakerId'
  >
  /** The parties the design specifies for this shape (authored INDEPENDENTLY). */
  expected: ConversationParty[]
}

const ORG: ConversationParty = { partyType: 'group', group: 'organizers' }

const SHAPES: Shape[] = [
  {
    name: 'proposal thread — two speakers',
    legacy: {
      conversationType: 'proposal',
      proposalSpeakerIds: ['sp-1', 'sp-2'],
      createdById: 'sp-1',
    },
    expected: [
      { partyType: 'speaker', speakerId: 'sp-1' },
      { partyType: 'speaker', speakerId: 'sp-2' },
      ORG,
    ],
  },
  {
    name: 'proposal thread — single speaker',
    legacy: {
      conversationType: 'proposal',
      proposalSpeakerIds: ['sp-1'],
      createdById: 'sp-1',
    },
    expected: [{ partyType: 'speaker', speakerId: 'sp-1' }, ORG],
  },
  {
    name: 'proposal thread — no speakers (organizers only)',
    legacy: {
      conversationType: 'proposal',
      proposalSpeakerIds: [],
      createdById: 'sp-1',
    },
    expected: [ORG],
  },
  {
    name: 'general thread — speaker-created (no subject)',
    legacy: {
      conversationType: 'general',
      proposalSpeakerIds: [],
      createdById: 'sp-9',
    },
    expected: [{ partyType: 'speaker', speakerId: 'sp-9' }, ORG],
  },
  {
    name: 'general thread — organizer-initiated (creator + subject)',
    legacy: {
      conversationType: 'general',
      proposalSpeakerIds: [],
      createdById: 'org-1',
      subjectSpeakerId: 'sp-7',
    },
    expected: [
      { partyType: 'speaker', speakerId: 'org-1' },
      { partyType: 'speaker', speakerId: 'sp-7' },
      ORG,
    ],
  },
]

describe('resolveParticipants — legacy-derived === dual-written, every shape', () => {
  for (const shape of SHAPES) {
    describe(shape.name, () => {
      it('DERIVES the design-specified parties from the legacy fields', () => {
        // participants absent → derive branch.
        expect(resolveParticipants(shape.legacy)).toEqual(shape.expected)
      })

      it('PREFERS the dual-written participants[] (returns them verbatim)', () => {
        const dualWritten = { ...shape.legacy, participants: shape.expected }
        expect(resolveParticipants(dualWritten)).toEqual(shape.expected)
      })

      it('resolver(legacy) === resolver(dual-written) — the G1 equivalence guarantee', () => {
        const dualWritten = { ...shape.legacy, participants: shape.expected }
        expect(resolveParticipants(shape.legacy)).toEqual(
          resolveParticipants(dualWritten),
        )
      })
    })
  }

  it('an EMPTY participants[] is not a real party set → falls back to derive', () => {
    const conv = {
      conversationType: 'general' as const,
      proposalSpeakerIds: [],
      createdById: 'sp-9',
      participants: [] as ConversationParty[],
    }
    expect(resolveParticipants(conv)).toEqual([
      { partyType: 'speaker', speakerId: 'sp-9' },
      ORG,
    ])
  })

  it('PREFERS a stored array even when it diverges from the legacy derivation', () => {
    // A backfilled/dual-written array that intentionally differs (a sponsor
    // party the legacy fields could never derive): the resolver returns it
    // verbatim, proving it truly prefers participants[] over re-deriving.
    const stored: ConversationParty[] = [
      { partyType: 'sponsor', sponsorForConferenceId: 'sfc-1' },
      ORG,
    ]
    const conv = {
      conversationType: 'general' as const,
      proposalSpeakerIds: [],
      createdById: 'sp-9',
      participants: stored,
    }
    expect(resolveParticipants(conv)).toBe(stored)
  })
})

// ---------------------------------------------------------------------------
// 1b. READ FLIP (G2a) — the flipped authz/recipient reads over participants[]
//     are equivalent to the legacy derive, for every thread shape.
// ---------------------------------------------------------------------------

describe('READ FLIP (G2a): resolveParticipantIds / resolveRecipients / canAccessConversation', () => {
  const ORGS = ['org-1', 'org-2']

  const speakerPartyIds = (parties: ConversationParty[]): string[] =>
    parties.flatMap((p) => (p.partyType === 'speaker' ? [p.speakerId] : []))

  for (const shape of SHAPES) {
    describe(shape.name, () => {
      const dualWritten = { ...shape.legacy, participants: shape.expected }

      it('resolveParticipantIds: dual-written === legacy-derived, organizers expanded to the live ids', () => {
        const fromStored = resolveParticipantIds(dualWritten, ORGS).sort()
        const fromLegacy = resolveParticipantIds(shape.legacy, ORGS).sort()
        expect(fromStored).toEqual(fromLegacy)
        // The `organizers` group party expands to the caller-supplied id set.
        expect(fromStored).toEqual(expect.arrayContaining(ORGS))
      })

      it('resolveRecipients: dual-written === legacy-derived (actor excluded)', () => {
        const actor = ORGS[0]
        expect(resolveRecipients(dualWritten, actor, ORGS).sort()).toEqual(
          resolveRecipients(shape.legacy, actor, ORGS).sort(),
        )
        expect(resolveRecipients(dualWritten, actor, ORGS)).not.toContain(actor)
      })

      it('canAccessConversation: identical verdict for every member speaker and a stranger', () => {
        for (const id of [...speakerPartyIds(shape.expected), 'stranger-xyz']) {
          const speaker = { _id: id }
          expect(canAccessConversation(dualWritten, speaker)).toBe(
            canAccessConversation(shape.legacy, speaker),
          )
        }
        // An organizer always has access (short-circuits before party membership).
        expect(
          canAccessConversation(dualWritten, { _id: 'o-x', isOrganizer: true }),
        ).toBe(true)
      })
    })
  }

  it('resolveParticipantIds SKIPS a sponsor party (G2b) — it carries no speaker id', () => {
    const conv = {
      conversationType: 'general' as const,
      proposalSpeakerIds: [],
      createdById: 'sp-9',
      participants: [
        { partyType: 'speaker', speakerId: 'sp-9' },
        { partyType: 'sponsor', sponsorForConferenceId: 'sfc-1' },
        ORG,
      ] as ConversationParty[],
    }
    expect(resolveParticipantIds(conv, ['org-1']).sort()).toEqual([
      'org-1',
      'sp-9',
    ])
  })

  it('PREFERS a stored participants[] over STALE legacy proposal fields (the snapshot-sync motivation)', () => {
    // A proposal thread whose stored participants[] (sp-1, sp-3) has diverged
    // from the legacy proposalSpeakerIds snapshot (sp-1, sp-2): the flipped read
    // follows participants[], which is exactly why co-speaker changes MUST resync
    // participants[] (Task 3). sp-3 is granted; sp-2 (only in the stale legacy
    // field) is denied.
    const conv = {
      conversationType: 'proposal' as const,
      proposalSpeakerIds: ['sp-1', 'sp-2'],
      createdById: 'sp-1',
      participants: [
        { partyType: 'speaker', speakerId: 'sp-1' },
        { partyType: 'speaker', speakerId: 'sp-3' },
        ORG,
      ] as ConversationParty[],
    }
    expect(canAccessConversation(conv, { _id: 'sp-3' })).toBe(true)
    expect(canAccessConversation(conv, { _id: 'sp-2' })).toBe(false)
    expect(resolveParticipantIds(conv, ['org-1']).sort()).toEqual([
      'org-1',
      'sp-1',
      'sp-3',
    ])
  })
})

// ---------------------------------------------------------------------------
// 1c. SNAPSHOT SYNC (G2a) — co-speaker add/remove resyncs the thread's
//     participants[]; no-op without a thread; never-fail.
// ---------------------------------------------------------------------------

describe('syncProposalConversationParticipants — co-speaker add/remove resync', () => {
  const readMock = clientReadUncached as unknown as { fetch: LooseMock }

  function installPatch(commit: () => Promise<unknown> = async () => ({})) {
    const patch = {
      set: vi.fn((_ops?: unknown) => patch),
      commit: vi.fn(commit),
    }
    writeMock.patch.mockReturnValue(patch)
    return patch
  }

  it('ADD direction: patches participants[] up to the new speaker set + organizers', async () => {
    readMock.fetch.mockResolvedValueOnce('conversation.proposal.prop-1')
    const patch = installPatch()

    await syncProposalConversationParticipants('prop-1', ['sp-1', 'sp-2'])

    // Only PATCHES an existing thread (probe first, no createIfNotExists).
    expect(writeMock.patch).toHaveBeenCalledWith('conversation.proposal.prop-1')
    expect(patch.set).toHaveBeenCalledWith({
      participants: [
        storedSpeaker('sp-1'),
        storedSpeaker('sp-2'),
        storedOrganizersGroup,
      ],
    })
    expect(patch.commit).toHaveBeenCalledTimes(1)
  })

  it('REMOVE direction: patches participants[] down to the remaining speakers + organizers', async () => {
    readMock.fetch.mockResolvedValueOnce('conversation.proposal.prop-1')
    const patch = installPatch()

    await syncProposalConversationParticipants('prop-1', ['sp-1'])

    expect(patch.set).toHaveBeenCalledWith({
      participants: [storedSpeaker('sp-1'), storedOrganizersGroup],
    })
  })

  it('NO-OP when the proposal has no thread yet (never conjures one)', async () => {
    readMock.fetch.mockResolvedValueOnce(null)
    const patch = installPatch()

    await syncProposalConversationParticipants('prop-x', ['sp-1'])

    expect(writeMock.patch).not.toHaveBeenCalled()
    expect(patch.commit).not.toHaveBeenCalled()
  })

  it('NEVER-FAIL: swallows a patch/commit failure (must not fail the co-speaker mutation)', async () => {
    readMock.fetch.mockResolvedValueOnce('conversation.proposal.prop-1')
    installPatch(async () => {
      throw new Error('boom')
    })

    await expect(
      syncProposalConversationParticipants('prop-1', ['sp-1']),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Dual-write coverage
// ---------------------------------------------------------------------------

describe('dual-write — ensureProposalConversation writes participants[] alongside legacy fields', () => {
  it('one speaker party per proposal speaker, then the organizers group', async () => {
    const tx = installTransaction()

    await ensureProposalConversation({
      conferenceId: 'conf-1',
      proposalId: 'prop-1',
      proposalTitle: 'My Talk',
      createdById: 'sp-1',
      proposalSpeakerIds: ['sp-1', 'sp-2'],
    })

    const doc = tx.createIfNotExists.mock.calls[0][0] as Record<string, unknown>
    // Legacy write-source fields are UNCHANGED (still present).
    expect(doc.createdBy).toEqual({ _type: 'reference', _ref: 'sp-1' })
    expect(doc.proposal).toEqual({
      _type: 'reference',
      _ref: 'prop-1',
      _weak: true,
    })
    // New dual-written representation.
    expect(doc.participants).toEqual([
      storedSpeaker('sp-1'),
      storedSpeaker('sp-2'),
      storedOrganizersGroup,
    ])
  })

  it('a proposal with no speakers writes just the organizers group', async () => {
    const tx = installTransaction()
    await ensureProposalConversation({
      conferenceId: 'conf-1',
      proposalId: 'prop-2',
      proposalTitle: 'Orphan',
      createdById: 'sp-1',
      proposalSpeakerIds: [],
    })
    const doc = tx.createIfNotExists.mock.calls[0][0] as Record<string, unknown>
    expect(doc.participants).toEqual([storedOrganizersGroup])
  })
})

describe('dual-write — createGeneralConversation', () => {
  it('speaker-created thread → creator speaker party + organizers group', async () => {
    await createGeneralConversation({
      conferenceId: 'conf-1',
      createdById: 'sp-9',
      subject: 'A question',
    })
    const doc = writeMock.create.mock.calls[0][0] as Record<string, unknown>
    // Legacy fields unchanged: creator ref present, no subjectSpeaker.
    expect(doc.createdBy).toEqual({ _type: 'reference', _ref: 'sp-9' })
    expect('subjectSpeaker' in doc).toBe(false)
    expect(doc.participants).toEqual([
      storedSpeaker('sp-9'),
      storedOrganizersGroup,
    ])
  })

  it('organizer-initiated thread → creator + subject speaker parties + organizers group', async () => {
    await createGeneralConversation({
      conferenceId: 'conf-1',
      createdById: 'org-1',
      subject: 'About your talk',
      subjectSpeakerId: 'sp-7',
    })
    const doc = writeMock.create.mock.calls[0][0] as Record<string, unknown>
    expect(doc.subjectSpeaker).toEqual({ _type: 'reference', _ref: 'sp-7' })
    expect(doc.participants).toEqual([
      storedSpeaker('org-1'),
      storedSpeaker('sp-7'),
      storedOrganizersGroup,
    ])
  })
})

describe('dual-write — addMessage writes authorParty alongside the author ref', () => {
  it('a single speaker party (weak ref, NO _key — it is an object field, not an array item)', async () => {
    const tx = installTransaction()

    await addMessage({
      conversationId: 'conversation.gen-1',
      authorId: 'sp-9',
      body: 'hello',
    })

    const doc = tx.create.mock.calls[0][0] as Record<string, unknown>
    // Legacy author ref unchanged.
    expect(doc.author).toEqual({ _type: 'reference', _ref: 'sp-9' })
    // Dual-written party form of the author.
    expect(doc.authorParty).toEqual({
      partyType: 'speaker',
      speaker: { _type: 'reference', _ref: 'sp-9', _weak: true },
    })
    // A single-object field carries NO _key (only array items do).
    expect('_key' in (doc.authorParty as object)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Schema validation — partyType ↔ identity-field congruence
// ---------------------------------------------------------------------------

describe('validateConversationParticipant — discriminator congruence', () => {
  it('accepts a well-formed speaker / sponsor / group party', () => {
    expect(
      validateConversationParticipant({
        partyType: 'speaker',
        speaker: { _ref: 'sp-1' },
      }),
    ).toBe(true)
    expect(
      validateConversationParticipant({
        partyType: 'sponsor',
        sponsorForConference: { _ref: 'sfc-1' },
      }),
    ).toBe(true)
    expect(
      validateConversationParticipant({
        partyType: 'group',
        group: 'organizers',
      }),
    ).toBe(true)
  })

  it('accepts an absent partyType (its own required rule reports that)', () => {
    expect(validateConversationParticipant({})).toBe(true)
    expect(validateConversationParticipant(undefined)).toBe(true)
  })

  it('rejects a party with NO identity field (zero present) via the exactly-one rule', () => {
    // Zero identity fields trips the exactly-one check before the per-type
    // messages; an empty/keyless group and an empty ref object both count as zero.
    expect(validateConversationParticipant({ partyType: 'speaker' })).toMatch(
      /exactly one identity field/,
    )
    expect(
      validateConversationParticipant({ partyType: 'speaker', speaker: {} }),
    ).toMatch(/exactly one identity field/)
    expect(validateConversationParticipant({ partyType: 'sponsor' })).toMatch(
      /exactly one identity field/,
    )
    expect(validateConversationParticipant({ partyType: 'group' })).toMatch(
      /exactly one identity field/,
    )
    expect(
      validateConversationParticipant({ partyType: 'group', group: '' }),
    ).toMatch(/exactly one identity field/)
  })

  it('rejects a party carrying exactly one but WRONG identity field for its type', () => {
    // Exactly one field present, but it does not match the discriminator → the
    // per-type congruence message fires.
    expect(
      validateConversationParticipant({
        partyType: 'speaker',
        group: 'organizers',
      }),
    ).toMatch(/speaker party requires a speaker reference/)
    expect(
      validateConversationParticipant({
        partyType: 'sponsor',
        speaker: { _ref: 'sp-1' },
      }),
    ).toMatch(/sponsor party requires a sponsorForConference reference/)
    expect(
      validateConversationParticipant({
        partyType: 'group',
        speaker: { _ref: 'sp-1' },
      }),
    ).toMatch(/group party requires a non-empty group key/)
  })

  it('rejects MORE THAN ONE identity field (must be exactly one)', () => {
    expect(
      validateConversationParticipant({
        partyType: 'speaker',
        speaker: { _ref: 'sp-1' },
        group: 'organizers',
      }),
    ).toMatch(/exactly one identity field/)
  })
})
