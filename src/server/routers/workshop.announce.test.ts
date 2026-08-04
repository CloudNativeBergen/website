import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

// --- next/cache -------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// --- Conference resolution (drives resolveConferenceId) ---------------------
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

// Organizer authorization runs through the REAL `isOrganizerForCurrentOrg`
// (session `organizerOrgIds` × the domain-resolved org). Its org resolution goes
// through `getConferenceForCurrentDomain`, mocked above.
//
// TRIPWIRE (#723): the organizer-ID readers select message RECIPIENTS and must
// never be consulted for an access decision in this router — one of them used to
// be this gate, and returned every tenant's organizers. Any call from a workshop
// code path fails the suite loudly rather than silently widening a gate.
function organizerIdTripwire(): never {
  throw new Error(
    'workshop authz must not consult the organizer-id set (#723): use isOrganizerForCurrentOrg',
  )
}
vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: organizerIdTripwire,
  getOrganizerSpeakerIdsForOrg: organizerIdTripwire,
  getAllOrganizerSpeakerIdsAcrossOrgs: organizerIdTripwire,
  createNotifications: vi.fn(async () => {}),
}))

// --- Announcements data layer (keep isWorkshopFormat real) ------------------
const getWorkshopForAnnouncementMock = vi.fn()
const getConfirmedRecipientsMock = vi.fn()
const createAnnouncementMock = vi.fn()
const getAnnouncementsMock = vi.fn()
const fanOutMock = vi.fn()
const getAnnouncementForAuthzMock = vi.fn()
const updateAnnouncementBodyMock = vi.fn()
const deleteAnnouncementMock = vi.fn()
vi.mock('@/lib/workshop/announcements', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/workshop/announcements')>()
  return {
    ...actual,
    getWorkshopForAnnouncement: (...a: unknown[]) =>
      getWorkshopForAnnouncementMock(...a),
    getConfirmedAnnouncementRecipients: (...a: unknown[]) =>
      getConfirmedRecipientsMock(...a),
    createWorkshopAnnouncement: (...a: unknown[]) =>
      createAnnouncementMock(...a),
    getWorkshopAnnouncements: (...a: unknown[]) => getAnnouncementsMock(...a),
    getWorkshopAnnouncementForAuthz: (...a: unknown[]) =>
      getAnnouncementForAuthzMock(...a),
    updateWorkshopAnnouncementBody: (...a: unknown[]) =>
      updateAnnouncementBodyMock(...a),
    deleteWorkshopAnnouncement: (...a: unknown[]) =>
      deleteAnnouncementMock(...a),
    sendAnnouncementToConfirmedParticipants: (...a: unknown[]) =>
      fanOutMock(...a),
  }
})

// --- Rate limit (allow by default; individual tests can block) --------------
const consumeRateLimitMock = vi.fn()
vi.mock('@/lib/workshop/announcementRateLimit', () => ({
  consumeAnnouncementRateLimit: (...a: unknown[]) => consumeRateLimitMock(...a),
}))

import { workshopRouter } from './workshop'

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-A'
const OTHER_ORG_ID = 'org-B'
const OWNER_ID = 'sp-owner'
const ORGANIZER_ID = 'sp-org'
const CROSS_TENANT_ORGANIZER_ID = 'sp-org-other-tenant'
const STRANGER_ID = 'sp-stranger'

/** Which orgs each fixture speaker organizes (the session token's claim). */
const ORGANIZER_ORG_IDS: Record<string, string[]> = {
  [ORGANIZER_ID]: [ORG_ID],
  [CROSS_TENANT_ORGANIZER_ID]: [OTHER_ORG_ID],
}

function makeCaller(speakerId: string | null) {
  const speaker = speakerId
    ? {
        _id: speakerId,
        name: 'Test Speaker',
        organizerOrgIds: ORGANIZER_ORG_IDS[speakerId] ?? [],
      }
    : undefined
  const ctx = {
    session: speaker ? { speaker, user: { name: 'Test Speaker' } } : null,
    speaker,
  } as unknown as Context
  return workshopRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organizer: 'CNB',
      organization: { _ref: ORG_ID },
    },
    error: null,
  })
  getWorkshopForAnnouncementMock.mockResolvedValue({
    _id: 'ws-1',
    title: 'K8s Ops',
    format: 'workshop_120',
    conferenceId: CONFERENCE_ID,
    speakerIds: [OWNER_ID],
  })
  getConfirmedRecipientsMock.mockResolvedValue([
    { userEmail: 'a@example.com', userName: 'A' },
  ])
  createAnnouncementMock.mockResolvedValue({
    _id: 'ann-1',
    body: 'hi',
    createdAt: '2026-09-08T12:00:00Z',
    authorName: null,
  })
  fanOutMock.mockResolvedValue({ sent: 1, failed: 0 })
  consumeRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 })
  getAnnouncementForAuthzMock.mockResolvedValue({
    _id: 'ann-1',
    workshopId: 'ws-1',
    authorId: OWNER_ID,
    conferenceId: CONFERENCE_ID,
  })
  updateAnnouncementBodyMock.mockResolvedValue(undefined)
  deleteAnnouncementMock.mockResolvedValue(undefined)
})

describe('workshop.announce — authorization', () => {
  it('allows the workshop OWNER', async () => {
    const result = await makeCaller(OWNER_ID).announce({
      workshopId: 'ws-1',
      body: 'Bring a laptop',
    })
    expect(result.success).toBe(true)
    expect(result.recipientCount).toBe(1)
    expect(createAnnouncementMock).toHaveBeenCalledOnce()
    expect(fanOutMock).toHaveBeenCalledOnce()
  })

  it('allows an ORGANIZER who is not a workshop speaker', async () => {
    const result = await makeCaller(ORGANIZER_ID).announce({
      workshopId: 'ws-1',
      body: 'Room change',
    })
    expect(result.success).toBe(true)
    expect(createAnnouncementMock).toHaveBeenCalledOnce()
  })

  it('rejects an unrelated speaker (not owner, not organizer)', async () => {
    await expect(
      makeCaller(STRANGER_ID).announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
    expect(fanOutMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller', async () => {
    await expect(
      makeCaller(null).announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
  })
})

// REGRESSION (#723): the organizer arm of these gates used to be
// `getOrganizerSpeakerIds()` — called with NO argument, so on an unresolvable
// org it returned the organizers of EVERY conference in the dataset. An
// organizer of tenant B therefore passed tenant A's gate and could broadcast to
// A's workshop attendees. Authorization is now org-scoped and fails closed.
describe('workshop announcements — CROSS-TENANT organizer is denied (#723)', () => {
  it('announce: FORBIDDEN for an organizer of ANOTHER org', async () => {
    await expect(
      makeCaller(CROSS_TENANT_ORGANIZER_ID).announce({
        workshopId: 'ws-1',
        body: 'Hello other tenant’s attendees',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
    expect(fanOutMock).not.toHaveBeenCalled()
  })

  it('updateAnnouncement: FORBIDDEN for an organizer of ANOTHER org', async () => {
    await expect(
      makeCaller(CROSS_TENANT_ORGANIZER_ID).updateAnnouncement({
        announcementId: 'ann-1',
        body: 'edited',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(updateAnnouncementBodyMock).not.toHaveBeenCalled()
  })

  it('deleteAnnouncement: FORBIDDEN for an organizer of ANOTHER org', async () => {
    await expect(
      makeCaller(CROSS_TENANT_ORGANIZER_ID).deleteAnnouncement({
        announcementId: 'ann-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(deleteAnnouncementMock).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED: even a same-org organizer is denied when the conference has no resolvable org', async () => {
    getConferenceMock.mockResolvedValue({
      conference: { _id: CONFERENCE_ID, organizer: 'CNB' }, // no `organization`
      error: null,
    })
    await expect(
      makeCaller(ORGANIZER_ID).announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
  })

  it('a LEGACY session token with no organizerOrgIds is denied', async () => {
    const ctx = {
      session: { speaker: { _id: 'sp-legacy', name: 'Legacy' } },
      speaker: { _id: 'sp-legacy', name: 'Legacy' },
    } as unknown as Context
    await expect(
      workshopRouter
        .createCaller(ctx)
        .announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
  })

  // Belt-and-braces for the tripwire above: an ALLOWED organizer must also reach
  // success without any organizer-id read (the tripwire would have thrown
  // INTERNAL_SERVER_ERROR instead of returning success).
  it('an allowed organizer is authorized without reading the organizer-id set', async () => {
    const result = await makeCaller(ORGANIZER_ID).announce({
      workshopId: 'ws-1',
      body: 'Room change',
    })
    expect(result.success).toBe(true)
  })
})

describe('workshop.announce — guards', () => {
  it('rejects a workshop in a different conference (multi-tenant isolation)', async () => {
    getWorkshopForAnnouncementMock.mockResolvedValue({
      _id: 'ws-1',
      title: 'Other',
      format: 'workshop_120',
      conferenceId: 'conf-OTHER',
      speakerIds: [OWNER_ID],
    })
    await expect(
      makeCaller(OWNER_ID).announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
  })

  it('rejects a non-workshop talk', async () => {
    getWorkshopForAnnouncementMock.mockResolvedValue({
      _id: 'ws-1',
      title: 'Talk',
      format: 'presentation_25',
      conferenceId: CONFERENCE_ID,
      speakerIds: [OWNER_ID],
    })
    await expect(
      makeCaller(OWNER_ID).announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('enforces the rate limit', async () => {
    consumeRateLimitMock.mockReturnValue({
      allowed: false,
      retryAfterMs: 30 * 60 * 1000,
    })
    await expect(
      makeCaller(OWNER_ID).announce({ workshopId: 'ws-1', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    expect(createAnnouncementMock).not.toHaveBeenCalled()
  })

  it('rejects an empty body via input validation', async () => {
    await expect(
      makeCaller(OWNER_ID).announce({ workshopId: 'ws-1', body: '   ' }),
    ).rejects.toBeTruthy()
    expect(createAnnouncementMock).not.toHaveBeenCalled()
  })
})

describe('workshop.announcements — public query bounds', () => {
  it('returns announcements with the default limit', async () => {
    getAnnouncementsMock.mockResolvedValue([
      { _id: 'a1', body: 'hi', createdAt: 'x', authorName: 'Owner' },
    ])
    const result = await makeCaller(null).announcements({ workshopId: 'ws-1' })
    expect(result.count).toBe(1)
    // Default limit (50) applied by the schema.
    expect(getAnnouncementsMock).toHaveBeenCalledWith('ws-1', 50)
  })

  it('rejects a limit above 50', async () => {
    await expect(
      makeCaller(null).announcements({ workshopId: 'ws-1', limit: 51 }),
    ).rejects.toBeTruthy()
  })
})

describe('workshop.updateAnnouncement — authorization + immutability', () => {
  it('allows the workshop OWNER and patches only the body', async () => {
    const result = await makeCaller(OWNER_ID).updateAnnouncement({
      announcementId: 'ann-1',
      body: 'Corrected copy',
    })
    expect(result.success).toBe(true)
    expect(updateAnnouncementBodyMock).toHaveBeenCalledWith(
      'ann-1',
      'Corrected copy',
    )
  })

  it('allows an ORGANIZER who is not a workshop speaker', async () => {
    const result = await makeCaller(ORGANIZER_ID).updateAnnouncement({
      announcementId: 'ann-1',
      body: 'Room change',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unrelated speaker (FORBIDDEN)', async () => {
    await expect(
      makeCaller(STRANGER_ID).updateAnnouncement({
        announcementId: 'ann-1',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(updateAnnouncementBodyMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller', async () => {
    await expect(
      makeCaller(null).updateAnnouncement({
        announcementId: 'ann-1',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects an announcement in a different conference (multi-tenant)', async () => {
    getAnnouncementForAuthzMock.mockResolvedValue({
      _id: 'ann-1',
      workshopId: 'ws-1',
      authorId: OWNER_ID,
      conferenceId: 'conf-OTHER',
    })
    await expect(
      makeCaller(OWNER_ID).updateAnnouncement({
        announcementId: 'ann-1',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(updateAnnouncementBodyMock).not.toHaveBeenCalled()
  })

  it('rejects a missing announcement', async () => {
    getAnnouncementForAuthzMock.mockResolvedValue(null)
    await expect(
      makeCaller(OWNER_ID).updateAnnouncement({
        announcementId: 'nope',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a blank body (validation)', async () => {
    await expect(
      makeCaller(OWNER_ID).updateAnnouncement({
        announcementId: 'ann-1',
        body: '   ',
      }),
    ).rejects.toBeTruthy()
    expect(updateAnnouncementBodyMock).not.toHaveBeenCalled()
  })
})

describe('workshop.deleteAnnouncement — authorization', () => {
  it('allows the workshop OWNER', async () => {
    const result = await makeCaller(OWNER_ID).deleteAnnouncement({
      announcementId: 'ann-1',
    })
    expect(result.success).toBe(true)
    expect(deleteAnnouncementMock).toHaveBeenCalledWith('ann-1')
  })

  it('allows an ORGANIZER', async () => {
    const result = await makeCaller(ORGANIZER_ID).deleteAnnouncement({
      announcementId: 'ann-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unrelated speaker (FORBIDDEN)', async () => {
    await expect(
      makeCaller(STRANGER_ID).deleteAnnouncement({ announcementId: 'ann-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(deleteAnnouncementMock).not.toHaveBeenCalled()
  })
})
