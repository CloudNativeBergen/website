/**
 * @vitest-environment node
 *
 * THE `orgId` PASS-THROUGH IS FAIL-CLOSED.
 *
 * The messaging reads used to resolve the request's organization themselves, via
 * `getOrganizerSpeakerIds()` → `getConferenceForCurrentDomain()` — a resolution
 * the tRPC authorization waist has ALREADY done for the request and stashed as
 * `ctx.orgId`. Threading that value through removes the repeat read, and this
 * file pins the three-way distinction that makes it safe:
 *
 *  - `orgId` OMITTED (`undefined`) → "I do not hold the org, resolve it"; the
 *    legacy path, still available to non-tRPC callers.
 *  - `orgId` a string → use exactly that org, resolve nothing.
 *  - `orgId` `null` → the waist could not resolve the request org. That must
 *    yield the EMPTY organizer set (`getOrganizerSpeakerIdsForOrg(null)` warns
 *    and returns `[]`), NOT a fallback to domain resolution.
 *
 * The last one is the guard: collapsing `undefined` and `null` (e.g. writing
 * `!orgId` instead of `orgId === undefined`) would send an unresolvable-org
 * request back through the domain resolver — a second read AND a second, distinct
 * answer to "which org is this?" on a request whose org the waist already
 * declined to resolve.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn(), create: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
}))

vi.mock('@/lib/teams', () => ({
  getViewerTeamKeys: vi.fn(async () => ['cfp']),
}))

vi.mock('@/lib/notification/sanity', () => ({
  // The DOMAIN-RESOLVING variant. Answering with a non-empty set makes the
  // fail-closed assertions below fail on a VALUE (the organizer set the rows
  // were classified against) rather than on an absence.
  getOrganizerSpeakerIds: vi.fn(async () => ['org-from-domain']),
  getOrganizerSpeakerIdsForOrg: vi.fn(async (orgId: string | null) =>
    orgId ? [`organizer-of-${orgId}`] : [],
  ),
}))

import { clientReadUncached } from '@/lib/sanity/client'
import {
  getOrganizerSpeakerIds,
  getOrganizerSpeakerIdsForOrg,
} from '@/lib/notification/sanity'
import {
  listConversationsForSpeaker,
  getConversationViewCounts,
} from '@/lib/messaging/sanity'

type LooseMock = ReturnType<typeof vi.fn>
const readMock = clientReadUncached as unknown as { fetch: LooseMock }
const viaDomain = getOrganizerSpeakerIds as unknown as LooseMock
const viaOrg = getOrganizerSpeakerIdsForOrg as unknown as LooseMock

/** One inbox row; the speaker path classifies its author against the org set. */
const row = {
  _id: 'conversation.gen-1',
  conversationType: 'general',
  subject: 'Hei',
  proposalId: null,
  proposalTitle: null,
  subjectSpeakerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-02T00:00:00.000Z',
  status: 'open',
  assignedTo: null,
  archivedAt: null,
  lastMessage: {
    _id: 'm1',
    authorId: 'org-from-domain',
    authorName: 'Olga Organizer',
    body: 'hei',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  speakerSideName: 'Speaker',
  speakerSideImage: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  readMock.fetch
    .mockResolvedValueOnce([row])
    .mockResolvedValue({ unread: [], prefs: [] })
})

describe('listConversationsForSpeaker — organizer-set resolution', () => {
  it('uses the org it was HANDED and never re-resolves the domain', async () => {
    await listConversationsForSpeaker({
      speakerId: 'org-9',
      isOrganizer: true,
      conferenceId: 'conf-1',
      orgId: 'org-handed',
    })

    expect(viaOrg).toHaveBeenCalledWith('org-handed')
    expect(viaDomain).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED on a null org: empty organizer set, no domain resolution', async () => {
    const rows = await listConversationsForSpeaker({
      speakerId: 'sp-1',
      isOrganizer: false,
      conferenceId: 'conf-1',
      orgId: null,
    })

    expect(viaOrg).toHaveBeenCalledWith(null)
    expect(viaDomain).not.toHaveBeenCalled()
    // The VALUE that proves the empty set was actually USED: a speaker's row
    // names the last author as their counterpart only when that author is IN
    // the organizer set. With `null` nobody is, so the row falls back to the
    // generic team label.
    expect(rows[0].counterpart.name).toBe('Organizers')
  })

  it('resolves from the domain when no org is supplied (legacy callers)', async () => {
    const rows = await listConversationsForSpeaker({
      speakerId: 'sp-1',
      isOrganizer: false,
      conferenceId: 'conf-1',
    })

    expect(viaDomain).toHaveBeenCalledTimes(1)
    expect(viaOrg).not.toHaveBeenCalled()
    // Same VALUE, the other way round: the domain-resolved set DOES contain the
    // author, so the same row now names them.
    expect(rows[0].counterpart.name).toBe('Olga Organizer')
  })
})

describe('getConversationViewCounts — organizer-set resolution', () => {
  beforeEach(() => {
    readMock.fetch.mockReset()
    readMock.fetch.mockResolvedValue({})
  })

  it('uses the org it was handed', async () => {
    await getConversationViewCounts({
      speakerId: 'org-9',
      isOrganizer: true,
      conferenceId: 'conf-1',
      orgId: 'org-handed',
    })

    expect(viaOrg).toHaveBeenCalledWith('org-handed')
    expect(viaDomain).not.toHaveBeenCalled()
    const params = readMock.fetch.mock.calls[0][1] as Record<string, unknown>
    expect(params.organizerIds).toEqual(['organizer-of-org-handed'])
  })

  it('FAILS CLOSED on a null org', async () => {
    await getConversationViewCounts({
      speakerId: 'org-9',
      isOrganizer: true,
      conferenceId: 'conf-1',
      orgId: null,
    })

    expect(viaOrg).toHaveBeenCalledWith(null)
    expect(viaDomain).not.toHaveBeenCalled()
    const params = readMock.fetch.mock.calls[0][1] as Record<string, unknown>
    expect(params.organizerIds).toEqual([])
  })
})
