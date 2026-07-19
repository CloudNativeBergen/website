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

// --- Sanity write client: capture the patch shape ---------------------------
const commitMock = vi.fn()
let lastPatchId: string | undefined
let lastSet: Record<string, unknown> | undefined
let lastUnset: string[] | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: (id: string) => {
      lastPatchId = id
      const builder = {
        set: (obj: Record<string, unknown>) => {
          lastSet = obj
          return builder
        },
        unset: (keys: string[]) => {
          lastUnset = keys
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
}))

import { conferenceRouter } from './conference'

const CONFERENCE_ID = 'conf-1'

function makeCaller(opts: { isOrganizer?: boolean } | null) {
  const speaker = opts
    ? { _id: 'sp-1', name: 'Org', isOrganizer: opts.isOrganizer ?? false }
    : undefined
  const ctx = {
    session: speaker ? { speaker, user: { name: 'Org' } } : null,
    speaker,
  } as unknown as Context
  return conferenceRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  lastPatchId = undefined
  lastSet = undefined
  lastUnset = undefined
  commitMock.mockResolvedValue({ _id: CONFERENCE_ID })
  getConferenceMock.mockResolvedValue({
    conference: { _id: CONFERENCE_ID },
    error: null,
  })
})

describe('conference router — authorization', () => {
  it('rejects a non-organizer speaker (FORBIDDEN)', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).updateBasicInfo({
        title: 'DevOpsDays',
        organizer: 'CNB',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller (UNAUTHORIZED)', async () => {
    await expect(
      makeCaller(null).updateBasicInfo({ title: 'X', organizer: 'Y' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('allows an organizer', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateBasicInfo({
      title: 'DevOpsDays',
      organizer: 'CNB',
    })
    expect(result.success).toBe(true)
    expect(lastPatchId).toBe(CONFERENCE_ID)
  })
})

describe('conference router — field-scoped patch shape', () => {
  it('only sets the fieldset keys that were provided (⊆ provided)', async () => {
    await makeCaller({ isOrganizer: true }).updateBasicInfo({
      title: 'DevOpsDays',
      organizer: 'CNB',
      city: 'Bergen',
      country: 'Norway',
    })
    const provided = ['title', 'organizer', 'city', 'country']
    expect(lastSet).toBeDefined()
    for (const key of Object.keys(lastSet!)) {
      expect(provided).toContain(key)
    }
    // Never touches fields outside the fieldset.
    expect(lastSet).not.toHaveProperty('venueName')
    expect(lastSet).not.toHaveProperty('cfpEmail')
  })

  it('never derives the conference id from client input', async () => {
    await makeCaller({ isOrganizer: true }).updateVenue({
      venueName: 'Grieghallen',
    })
    // The id is the one resolveConferenceId returned, not anything client-sent.
    expect(lastPatchId).toBe(CONFERENCE_ID)
    expect(getConferenceMock).toHaveBeenCalled()
  })
})

describe('conference router — unset semantics', () => {
  it('routes explicit null to .unset() and omits it from .set()', async () => {
    await makeCaller({ isOrganizer: true }).updateTicketingIds({
      checkinCustomerId: 42,
      checkinEventId: null,
    })
    expect(lastSet).toEqual({ checkinCustomerId: 42 })
    expect(lastUnset).toEqual(['checkinEventId'])
  })

  it('leaves omitted optional fields untouched (neither set nor unset)', async () => {
    await makeCaller({ isOrganizer: true }).updateCfpGoals({
      cfpSubmissionGoal: 100,
    })
    expect(lastSet).toEqual({ cfpSubmissionGoal: 100 })
    expect(lastUnset).toBeUndefined()
  })

  it('rejects an empty input with BAD_REQUEST (nothing to set or unset)', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateCfpGoals({}),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('conference router — validation', () => {
  it('rejects a blank required title', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateBasicInfo({
        title: '   ',
        organizer: 'CNB',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid contact email', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateCommunication({
        contactEmail: 'not-an-email',
        cfpEmail: 'cfp@example.com',
        sponsorEmail: 'sponsor@example.com',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid registration URL', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateRegistration({
        registrationEnabled: true,
        registrationLink: 'notaurl',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects end date before start date', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDates({
        startDate: '2026-10-10',
        endDate: '2026-10-09',
        cfpStartDate: '2026-01-01',
        cfpEndDate: '2026-05-01',
        cfpNotifyDate: '2026-06-01',
        programDate: '2026-07-01',
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects cfp end date before cfp start date', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateDates({
        startDate: '2026-10-10',
        endDate: '2026-10-11',
        cfpStartDate: '2026-05-01',
        cfpEndDate: '2026-01-01',
        cfpNotifyDate: '2026-06-01',
        programDate: '2026-07-01',
      }),
    ).rejects.toBeTruthy()
  })

  it('accepts a valid, correctly-ordered dates payload', async () => {
    const result = await makeCaller({ isOrganizer: true }).updateDates({
      startDate: '2026-10-10',
      endDate: '2026-10-11',
      cfpStartDate: '2026-01-01',
      cfpEndDate: '2026-05-01',
      cfpNotifyDate: '2026-06-01',
      programDate: '2026-07-01',
    })
    expect(result.success).toBe(true)
    expect(lastSet).toMatchObject({ startDate: '2026-10-10' })
  })

  it('rejects a negative goal', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateCfpGoals({
        cfpSubmissionGoal: -5,
      }),
    ).rejects.toBeTruthy()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('rejects a non-integer checkin id', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTicketingIds({
        checkinCustomerId: 3.5,
      }),
    ).rejects.toBeTruthy()
  })

  it('rejects a non-positive checkin id', async () => {
    await expect(
      makeCaller({ isOrganizer: true }).updateTicketingIds({
        checkinEventId: 0,
      }),
    ).rejects.toBeTruthy()
  })
})
