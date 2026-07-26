import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { Context } from '@/server/trpc'

// --- next/cache: capture every revalidateTag call ---------------------------
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// --- Conference resolution --------------------------------------------------
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

// --- Schedule persistence layer (stubbed — we assert the router, not Sanity) -
const saveScheduleMock = vi.fn()
const getValidTalkIdsMock = vi.fn()
vi.mock('@/lib/schedule/sanity', () => ({
  saveScheduleToSanity: (...args: unknown[]) => saveScheduleMock(...args),
  getValidTalkIds: (...args: unknown[]) => getValidTalkIdsMock(...args),
}))

const validateMock = vi.fn()
vi.mock('@/lib/schedule/validation', () => ({
  validateSchedulePayload: (...args: unknown[]) => validateMock(...args),
}))

import { revalidateTag } from 'next/cache'
import { scheduleRouter } from './schedule'

const revalidateTagMock = revalidateTag as unknown as Mock

const CONFERENCE_ID = 'conf-bergen'
const OTHER_CONFERENCE_ID = 'conf-oslo'

function makeCaller() {
  const speaker = { _id: 'sp-1', name: 'Org', isOrganizer: true }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return scheduleRouter.createCaller(ctx)
}

const validPayload = { _id: '', date: '2026-10-10', tracks: [] }

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: { _id: CONFERENCE_ID },
    error: null,
  })
  getValidTalkIdsMock.mockResolvedValue(new Set<string>())
  validateMock.mockReturnValue(null)
  saveScheduleMock.mockResolvedValue({
    schedule: { _id: 'sched-1' },
    error: null,
    conflict: false,
  })
})

describe('schedule router — tenant-scoped cache invalidation (#618)', () => {
  it('revalidates the publishing conference by its scoped tag', async () => {
    await makeCaller().save(validPayload)
    expect(revalidateTagMock).toHaveBeenCalledWith(
      `sanity:conference-${CONFERENCE_ID}`,
      'default',
    )
  })

  it('does NOT bust other tenants via the generic content tags', async () => {
    await makeCaller().save(validPayload)
    // The old behavior busted EVERY conference's /program via these broad tags.
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      'content:program',
      expect.anything(),
    )
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      'content:conferences',
      expect.anything(),
    )
  })

  it('never revalidates a different conference than the one saved', async () => {
    await makeCaller().save(validPayload)
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      `sanity:conference-${OTHER_CONFERENCE_ID}`,
      expect.anything(),
    )
  })

  it('revalidates exactly once — the scoped tag only', async () => {
    await makeCaller().save(validPayload)
    expect(revalidateTagMock).toHaveBeenCalledTimes(1)
  })

  it('does not revalidate anything when the save fails', async () => {
    saveScheduleMock.mockResolvedValueOnce({
      schedule: null,
      error: 'boom',
      conflict: false,
    })
    await expect(makeCaller().save(validPayload)).rejects.toBeTruthy()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})
