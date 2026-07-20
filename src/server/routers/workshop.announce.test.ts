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

// --- Organizer set ----------------------------------------------------------
const getOrganizerSpeakerIdsMock = vi.fn()
vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: () => getOrganizerSpeakerIdsMock(),
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
const OWNER_ID = 'sp-owner'
const ORGANIZER_ID = 'sp-org'
const STRANGER_ID = 'sp-stranger'

function makeCaller(speakerId: string | null) {
  const speaker = speakerId
    ? { _id: speakerId, name: 'Test Speaker', isOrganizer: false }
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
    conference: { _id: CONFERENCE_ID, organizer: 'CNB' },
    error: null,
  })
  getWorkshopForAnnouncementMock.mockResolvedValue({
    _id: 'ws-1',
    title: 'K8s Ops',
    format: 'workshop_120',
    conferenceId: CONFERENCE_ID,
    speakerIds: [OWNER_ID],
  })
  getOrganizerSpeakerIdsMock.mockResolvedValue([ORGANIZER_ID])
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
    // An owner is authorized without needing the organizer lookup.
    expect(getOrganizerSpeakerIdsMock).not.toHaveBeenCalled()
  })

  it('allows an ORGANIZER who is not a workshop speaker', async () => {
    const result = await makeCaller(ORGANIZER_ID).announce({
      workshopId: 'ws-1',
      body: 'Room change',
    })
    expect(result.success).toBe(true)
    expect(getOrganizerSpeakerIdsMock).toHaveBeenCalledOnce()
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
    // Owner is authorized without the organizer lookup.
    expect(getOrganizerSpeakerIdsMock).not.toHaveBeenCalled()
  })

  it('allows an ORGANIZER who is not a workshop speaker', async () => {
    const result = await makeCaller(ORGANIZER_ID).updateAnnouncement({
      announcementId: 'ann-1',
      body: 'Room change',
    })
    expect(result.success).toBe(true)
    expect(getOrganizerSpeakerIdsMock).toHaveBeenCalledOnce()
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
