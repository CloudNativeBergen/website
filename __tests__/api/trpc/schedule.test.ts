/**
 * @vitest-environment node
 *
 * Tests for the schedule.save tRPC mutation (src/server/routers/schedule.ts).
 * Guards the two hardening behaviours: the router (1) validates the payload and
 * rejects a malformed/foreign-ref schedule with BAD_REQUEST BEFORE persisting,
 * and (2) maps an optimistic-concurrency `conflict` from the data layer to a
 * 409 CONFLICT. The pure validator is exercised in full in
 * __tests__/lib/schedule/validation.test.ts; here we assert the wiring.
 */
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

vi.mock('@/lib/schedule/sanity', () => ({
  saveScheduleToSanity: vi.fn(),
  getValidTalkIds: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { scheduleRouter } from '@/server/routers/schedule'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { saveScheduleToSanity, getValidTalkIds } from '@/lib/schedule/sanity'

// Build a caller from the schedule router alone (not the full appRouter) so this
// suite does not import unrelated routers — notably the badge router, whose
// `@digitalbazaar/vc` dependency is absent in this environment.
const t = initTRPC.context<Context>().create()
const createCaller = t.createCallerFactory(scheduleRouter)

function baseCtx(): Context {
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: null,
    speaker: undefined,
    user: undefined,
    workosUser: null,
    ipAddress: '',
  }
}

function createAdminCaller() {
  return createCaller({
    ...baseCtx(),
    session: {
      expires: new Date(Date.now() + 86400000).toISOString(),
      user: { email: 'admin@example.com', name: 'Admin' },
      speaker: { _id: 'admin-1', isOrganizer: true },
    } as unknown as Context['session'],
  })
}

function createAuthenticatedCaller() {
  return createCaller({
    ...baseCtx(),
    session: {
      expires: new Date(Date.now() + 86400000).toISOString(),
      user: { email: 'user@example.com', name: 'User' },
      speaker: { _id: 'user-1', isOrganizer: false },
    } as unknown as Context['session'],
  })
}

const conference = { _id: 'conf-1', title: 'CND 2026' }

const validDay = {
  _id: 'sched-1',
  _rev: 'rev-1',
  date: '2026-06-15',
  tracks: [
    {
      trackTitle: 'Track A',
      trackDescription: '',
      talks: [
        { talk: { _id: 'talk-1' }, startTime: '09:00', endTime: '09:30' },
      ],
    },
  ],
}

describe('schedule.save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: conference as never,
      domain: 'localhost',
    } as never)
    vi.mocked(getValidTalkIds).mockResolvedValue(new Set(['talk-1', 'talk-2']))
    vi.mocked(saveScheduleToSanity).mockResolvedValue({
      schedule: { ...validDay, _rev: 'rev-2' } as never,
    })
  })

  it('requires an admin', async () => {
    const caller = createAuthenticatedCaller()
    await expect(caller.save(validDay)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('persists a valid payload and returns the schedule with new _rev', async () => {
    const caller = createAdminCaller()
    const result = await caller.save(validDay)
    expect(result.schedule._rev).toBe('rev-2')
    expect(saveScheduleToSanity).toHaveBeenCalledTimes(1)
  })

  it('rejects a foreign talk ref with BAD_REQUEST before persisting', async () => {
    const caller = createAdminCaller()
    const bad = {
      ...validDay,
      tracks: [
        {
          trackTitle: 'Track A',
          trackDescription: '',
          talks: [
            { talk: { _id: 'not-mine' }, startTime: '09:00', endTime: '09:30' },
          ],
        },
      ],
    }
    await expect(caller.save(bad)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(saveScheduleToSanity).not.toHaveBeenCalled()
  })

  it('rejects overlapping slots with BAD_REQUEST before persisting', async () => {
    const caller = createAdminCaller()
    const bad = {
      ...validDay,
      tracks: [
        {
          trackTitle: 'Track A',
          trackDescription: '',
          talks: [
            { talk: { _id: 'talk-1' }, startTime: '09:00', endTime: '09:45' },
            { talk: { _id: 'talk-2' }, startTime: '09:30', endTime: '10:00' },
          ],
        },
      ],
    }
    await expect(caller.save(bad)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(saveScheduleToSanity).not.toHaveBeenCalled()
  })

  it('rejects a non HH:MM time at the schema boundary', async () => {
    const caller = createAdminCaller()
    const bad = {
      ...validDay,
      tracks: [
        {
          trackTitle: 'Track A',
          trackDescription: '',
          talks: [
            { talk: { _id: 'talk-1' }, startTime: '9:00', endTime: '09:30' },
          ],
        },
      ],
    }
    await expect(caller.save(bad)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('maps a data-layer conflict to CONFLICT', async () => {
    vi.mocked(saveScheduleToSanity).mockResolvedValue({
      conflict: true,
      error: 'This day was changed elsewhere since you loaded it.',
    })
    const caller = createAdminCaller()
    await expect(caller.save(validDay)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})
