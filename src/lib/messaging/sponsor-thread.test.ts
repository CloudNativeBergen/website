import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Sanity client mock (capture writes) -----------------------------------

const fetchMock = vi.fn()
const createdDocs: Record<string, unknown>[] = []
const createIfNotExistsDocs: Record<string, unknown>[] = []
const patchCalls: { id: string }[] = []
const commitMock = vi.fn().mockResolvedValue({ transactionId: 'tx-1' })

const transactionApi = {
  create: (doc: Record<string, unknown>) => {
    createdDocs.push(doc)
    return transactionApi
  },
  createIfNotExists: (doc: Record<string, unknown>) => {
    createIfNotExistsDocs.push(doc)
    return transactionApi
  },
  patch: (id: string) => {
    patchCalls.push({ id })
    return transactionApi
  },
  commit: () => commitMock(),
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { transaction: () => transactionApi },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn().mockResolvedValue(['org-1', 'org-2']),
}))

import {
  canAccessConversation,
  resolveParticipants,
  resolveParticipantIds,
  resolveRecipients,
  SPEAKER_SCOPE_PREDICATE,
  ensureSponsorConversation,
  addMessage,
} from './sanity'
import { sponsorConversationId, conversationLinkPath } from './links'
import type { ConversationWithContext } from './types'

const SFC = 'sfc-42'

function sponsorConversation(): ConversationWithContext {
  return {
    _id: sponsorConversationId(SFC),
    conferenceId: 'conf-1',
    conversationType: 'sponsor',
    proposalSpeakerIds: [],
    createdById: '',
    subject: 'Acme Corp',
    createdAt: '2026-07-01T00:00:00Z',
    lastMessageAt: '2026-07-01T00:00:00Z',
    participants: [
      { partyType: 'sponsor', sponsorForConferenceId: SFC },
      { partyType: 'group', group: 'organizers' },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createdDocs.length = 0
  createIfNotExistsDocs.length = 0
  patchCalls.length = 0
})

describe('sponsor thread — id scheme + links', () => {
  it('derives the deterministic id conversation.sponsor.<sfcId>', () => {
    expect(sponsorConversationId(SFC)).toBe('conversation.sponsor.sfc-42')
  })

  it('links a sponsor thread to the admin thread for BOTH audiences', () => {
    const conv = sponsorConversation()
    expect(conversationLinkPath(conv, true)).toBe(`/admin/messages/${conv._id}`)
    // No speaker/CFP surface — the sponsor reaches it via the portal.
    expect(conversationLinkPath(conv, false)).toBe(
      `/admin/messages/${conv._id}`,
    )
  })
})

describe('sponsor thread — authorization', () => {
  it('lets any organizer access a sponsor thread', () => {
    expect(
      canAccessConversation(sponsorConversation(), {
        _id: 'org-1',
        isOrganizer: true,
      }),
    ).toBe(true)
  })

  it('DENIES a non-organizer speaker (no speaker party exists)', () => {
    expect(
      canAccessConversation(sponsorConversation(), {
        _id: 'sp-1',
        isOrganizer: false,
      }),
    ).toBe(false)
  })

  it('excludes sponsor threads from the speaker scope predicate (defence-in-depth)', () => {
    expect(SPEAKER_SCOPE_PREDICATE).toContain('conversationType != "sponsor"')
  })
})

describe('sponsor thread — participant/recipient resolution', () => {
  it('prefers the stored sponsor participants (no derive)', () => {
    const parties = resolveParticipants(sponsorConversation())
    expect(parties).toEqual([
      { partyType: 'sponsor', sponsorForConferenceId: SFC },
      { partyType: 'group', group: 'organizers' },
    ])
  })

  it('derive-fallback for a participants-less sponsor doc yields ONLY the organizers group (no bogus speaker)', () => {
    const parties = resolveParticipants({
      conversationType: 'sponsor',
      proposalSpeakerIds: [],
      createdById: '',
    })
    expect(parties).toEqual([{ partyType: 'group', group: 'organizers' }])
  })

  it('expands recipients to organizers only — the sponsor party carries no speaker id', () => {
    const ids = resolveParticipantIds(sponsorConversation(), ['org-1', 'org-2'])
    expect(ids.sort()).toEqual(['org-1', 'org-2'])
    // An organizer author is excluded from the recipient set.
    expect(
      resolveRecipients(sponsorConversation(), 'org-1', ['org-1', 'org-2']),
    ).toEqual(['org-2'])
  })
})

describe('ensureSponsorConversation', () => {
  it('creates the deterministic doc with sponsor+organizers participants and NO createdBy (portal)', async () => {
    const id = await ensureSponsorConversation({
      conferenceId: 'conf-1',
      sponsorForConferenceId: SFC,
      sponsorName: 'Acme Corp',
    })
    expect(id).toBe(sponsorConversationId(SFC))
    expect(createIfNotExistsDocs).toHaveLength(1)
    const doc = createIfNotExistsDocs[0] as Record<string, unknown>
    expect(doc._id).toBe(sponsorConversationId(SFC))
    expect(doc.conversationType).toBe('sponsor')
    expect(doc.subject).toBe('Acme Corp')
    expect(doc.createdBy).toBeUndefined()
    const participants = doc.participants as Record<string, unknown>[]
    expect(participants.map((p) => p.partyType)).toEqual(['sponsor', 'group'])
  })

  it('sets createdBy to the acting organizer when org-initiated', async () => {
    await ensureSponsorConversation({
      conferenceId: 'conf-1',
      sponsorForConferenceId: SFC,
      sponsorName: 'Acme Corp',
      createdById: 'org-1',
    })
    const doc = createIfNotExistsDocs[0] as Record<string, unknown>
    expect(doc.createdBy).toBeDefined()
  })

  it('is idempotent — uses createIfNotExists (a second call converges on the same id)', async () => {
    const a = await ensureSponsorConversation({
      conferenceId: 'conf-1',
      sponsorForConferenceId: SFC,
      sponsorName: 'Acme Corp',
    })
    const b = await ensureSponsorConversation({
      conferenceId: 'conf-1',
      sponsorForConferenceId: SFC,
      sponsorName: 'Acme Corp',
    })
    expect(a).toBe(b)
    expect(createIfNotExistsDocs).toHaveLength(2)
    expect(createdDocs).toHaveLength(0) // never a plain create (race-safe)
  })
})

describe('addMessage — sponsor author', () => {
  it('writes a sponsor authorParty + authorName snapshot and NO author ref', async () => {
    const msg = await addMessage({
      conversationId: sponsorConversationId(SFC),
      sponsorAuthor: { sponsorForConferenceId: SFC, authorName: 'Dana Diaz' },
      body: 'Hello from the sponsor',
    })
    expect(createdDocs).toHaveLength(1)
    const doc = createdDocs[0] as Record<string, unknown>
    expect(doc.author).toBeUndefined()
    expect(doc.authorName).toBe('Dana Diaz')
    const party = doc.authorParty as Record<string, unknown>
    expect(party.partyType).toBe('sponsor')
    // Return value carries the snapshot + sponsor id for the thread render.
    expect(msg.authorId).toBe('')
    expect(msg.authorName).toBe('Dana Diaz')
    expect(msg.authorSponsorId).toBe(SFC)
  })

  it('still writes a speaker author ref for an organizer author', async () => {
    await addMessage({
      conversationId: sponsorConversationId(SFC),
      authorId: 'org-1',
      body: 'Organizer reply',
    })
    const doc = createdDocs[0] as Record<string, unknown>
    expect(doc.author).toBeDefined()
    expect(doc.authorName).toBeUndefined()
    const party = doc.authorParty as Record<string, unknown>
    expect(party.partyType).toBe('speaker')
  })
})
